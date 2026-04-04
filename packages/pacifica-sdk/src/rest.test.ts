/**
 * Tests for the PacificaClient signed and unsigned methods.
 *
 * Strategy:
 *  - Use a deterministic test keypair derived from a fixed seed, so the
 *    test can verify signatures against the known public key.
 *  - Inject a mock `fetch` into the client. Each test asserts the URL,
 *    the body shape (flat, not wrapped in `{data: ...}`), and verifies
 *    the signature cryptographically by reconstructing the canonical
 *    message exactly like the server would.
 *  - Existing 14 signing tests in `signing.test.ts` remain untouched.
 */

import { describe, expect, it, vi } from 'vitest';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

import { PacificaClient } from './rest.js';
import { prepareMessage } from './signing.js';

// A deterministic test keypair. Seed is 32 bytes of 7s — fine for tests.
const SEED = new Uint8Array(32).fill(7);
const TEST_KEYPAIR = nacl.sign.keyPair.fromSeed(SEED);
const TEST_PRIVATE_KEY_B58 = bs58.encode(TEST_KEYPAIR.secretKey);
const TEST_PUBLIC_KEY_B58 = bs58.encode(TEST_KEYPAIR.publicKey);

// Second deterministic keypair — used as subaccount in subaccount tests.
const SEED2 = new Uint8Array(32).fill(11);
const SUB_KEYPAIR = nacl.sign.keyPair.fromSeed(SEED2);
const SUB_PRIVATE_KEY_B58 = bs58.encode(SUB_KEYPAIR.secretKey);
const SUB_PUBLIC_KEY_B58 = bs58.encode(SUB_KEYPAIR.publicKey);

interface CapturedRequest {
  url: string;
  init: RequestInit;
  body: Record<string, unknown>;
}

/**
 * Build a mock fetch that records the last request and returns a stock
 * successful envelope. Each test inspects `captured` afterwards.
 */
function makeMockFetch(
  responseBody: unknown = { success: true, data: {} },
): {
  fetch: typeof globalThis.fetch;
  captured: CapturedRequest[];
} {
  const captured: CapturedRequest[] = [];
  const fetch = vi
    .fn()
    .mockImplementation(async (url: string | URL, init?: RequestInit) => {
      const bodyText = typeof init?.body === 'string' ? init.body : '';
      captured.push({
        url: String(url),
        init: init ?? {},
        body: bodyText ? JSON.parse(bodyText) : {},
      });
      return new Response(JSON.stringify(responseBody), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  return { fetch: fetch as unknown as typeof globalThis.fetch, captured };
}

/**
 * Verify that `body`'s signature matches the canonical message built by
 * hoisting the payload fields out of `body` (everything except the four
 * request-header fields), then running it through `prepareMessage` with
 * the given op type.
 *
 * NOTE: `agent_wallet` is intentionally NOT stripped — it can appear in
 * EITHER the signed payload (e.g. `bind_agent_wallet`) OR as a top-level
 * request header set by the SDK option (which then DOES take part in the
 * flat body but NOT in signing). Tests that use the `agentWallet` option
 * must pass `stripHeaderAgentWallet: true` to remove it before verifying.
 */
function assertSignatureValid(
  body: Record<string, unknown>,
  opType: string,
  publicKey: Uint8Array,
  opts: { stripHeaderAgentWallet?: boolean } = {},
): void {
  const {
    account: _account,
    signature,
    timestamp,
    expiry_window,
    ...rest
  } = body;
  void _account;
  const payload: Record<string, unknown> = { ...rest };
  if (opts.stripHeaderAgentWallet) {
    delete payload.agent_wallet;
  }
  expect(typeof signature).toBe('string');
  expect(typeof timestamp).toBe('number');
  expect(typeof expiry_window).toBe('number');

  const message = prepareMessage(
    {
      type: opType,
      timestamp: timestamp as number,
      expiry_window: expiry_window as number,
    },
    payload,
  );
  const sigBytes = bs58.decode(signature as string);
  expect(sigBytes.length).toBe(64);
  const ok = nacl.sign.detached.verify(
    new TextEncoder().encode(message),
    sigBytes,
    publicKey,
  );
  expect(ok).toBe(true);
}

function makeClient(
  overrides: Partial<ConstructorParameters<typeof PacificaClient>[0]> = {},
): { client: PacificaClient; captured: CapturedRequest[] } {
  const { fetch, captured } = makeMockFetch();
  const client = new PacificaClient({
    env: 'mainnet',
    address: TEST_PUBLIC_KEY_B58,
    privateKey: TEST_PRIVATE_KEY_B58,
    fetch,
    ...overrides,
  });
  return { client, captured };
}

describe('PacificaClient — existing signed methods still work', () => {
  it('createMarketOrder posts a flat signed body to /orders/create_market', async () => {
    const { client, captured } = makeClient();
    await client.createMarketOrder({
      symbol: 'BTC',
      side: 'bid',
      amount: '0.1',
      slippage_percent: '0.5',
    });

    expect(captured).toHaveLength(1);
    const req = captured[0];
    expect(req.url).toBe(
      'https://api.pacifica.fi/api/v1/orders/create_market',
    );
    expect(req.init.method).toBe('POST');
    expect(req.body.account).toBe(TEST_PUBLIC_KEY_B58);
    expect(req.body.symbol).toBe('BTC');
    expect(req.body.side).toBe('bid');
    expect(req.body.amount).toBe('0.1');
    expect(req.body.slippage_percent).toBe('0.5');
    // Body must be flat — no nested `data` wrapper.
    expect('data' in req.body).toBe(false);

    assertSignatureValid(
      req.body,
      'create_market_order',
      TEST_KEYPAIR.publicKey,
    );
  });

  it('createLimitOrder signs and posts to /orders/create', async () => {
    const { client, captured } = makeClient();
    await client.createLimitOrder({
      symbol: 'BTC',
      side: 'bid',
      amount: '0.1',
      price: '100000',
      tif: 'GTC',
    });
    const req = captured[0];
    expect(req.url).toBe('https://api.pacifica.fi/api/v1/orders/create');
    expect(req.body.tif).toBe('GTC');
    expect(req.body.price).toBe('100000');
    assertSignatureValid(req.body, 'create_order', TEST_KEYPAIR.publicKey);
  });

  it('builderCode is auto-injected into order payloads', async () => {
    const { client, captured } = makeClient({ builderCode: 'BUILDER_X' });
    await client.createMarketOrder({
      symbol: 'BTC',
      side: 'bid',
      amount: '0.1',
      slippage_percent: '0.5',
    });
    expect(captured[0].body.builder_code).toBe('BUILDER_X');
    assertSignatureValid(
      captured[0].body,
      'create_market_order',
      TEST_KEYPAIR.publicKey,
    );
  });
});

describe('PacificaClient — position TP/SL', () => {
  it('createPositionTpSl signs with type=set_position_tpsl and posts nested TP/SL', async () => {
    const { client, captured } = makeClient();
    await client.createPositionTpSl({
      symbol: 'BTC',
      side: 'ask',
      take_profit: {
        stop_price: '120000',
        limit_price: '120300',
        amount: '0.1',
        client_order_id: 'tp-1',
      },
      stop_loss: {
        stop_price: '99800',
      },
    });
    const req = captured[0];
    expect(req.url).toBe('https://api.pacifica.fi/api/v1/positions/tpsl');
    expect(req.body.symbol).toBe('BTC');
    expect(req.body.side).toBe('ask');
    expect(req.body.take_profit).toEqual({
      stop_price: '120000',
      limit_price: '120300',
      amount: '0.1',
      client_order_id: 'tp-1',
    });
    expect(req.body.stop_loss).toEqual({ stop_price: '99800' });
    assertSignatureValid(
      req.body,
      'set_position_tpsl',
      TEST_KEYPAIR.publicKey,
    );
  });
});

describe('PacificaClient — TWAP', () => {
  it('createTwapOrder signs with type=create_twap_order and includes duration_in_seconds', async () => {
    const { client, captured } = makeClient();
    await client.createTwapOrder({
      symbol: 'BTC',
      side: 'bid',
      amount: '1',
      slippage_percent: '0.5',
      duration_in_seconds: 180,
    });
    const req = captured[0];
    expect(req.url).toBe('https://api.pacifica.fi/api/v1/orders/twap/create');
    expect(req.body.duration_in_seconds).toBe(180);
    expect(req.body.reduce_only).toBe(false);
    assertSignatureValid(
      req.body,
      'create_twap_order',
      TEST_KEYPAIR.publicKey,
    );
  });

  it('cancelTwapOrder signs with type=cancel_twap_order', async () => {
    const { client, captured } = makeClient();
    await client.cancelTwapOrder({ symbol: 'BTC', order_id: 3 });
    const req = captured[0];
    expect(req.url).toBe('https://api.pacifica.fi/api/v1/orders/twap/cancel');
    expect(req.body.order_id).toBe(3);
    assertSignatureValid(req.body, 'cancel_twap_order', TEST_KEYPAIR.publicKey);
  });

  it('getOpenTwapOrders makes an unsigned GET with ?account=', async () => {
    const { client, captured } = makeClient();
    await client.getOpenTwapOrders();
    const req = captured[0];
    expect(req.url).toBe(
      `https://api.pacifica.fi/api/v1/orders/twap?account=${TEST_PUBLIC_KEY_B58}`,
    );
    expect(req.init.method).toBe('GET');
  });

  it('getTwapOrderHistory makes an unsigned GET with ?account=', async () => {
    const { client, captured } = makeClient();
    await client.getTwapOrderHistory();
    expect(captured[0].url).toBe(
      `https://api.pacifica.fi/api/v1/orders/twap/history?account=${TEST_PUBLIC_KEY_B58}`,
    );
  });

  it('getTwapOrderHistoryById sends order_id query parameter', async () => {
    const { client, captured } = makeClient();
    await client.getTwapOrderHistoryById(6);
    expect(captured[0].url).toBe(
      'https://api.pacifica.fi/api/v1/orders/twap/history_by_id?order_id=6',
    );
  });
});

describe('PacificaClient — batch orders', () => {
  it('batchOrders wraps each action in {type, data} with its own signed body', async () => {
    const { client, captured } = makeClient();
    await client.batchOrders([
      {
        type: 'Create',
        params: {
          symbol: 'BTC',
          side: 'bid',
          amount: '0.1',
          price: '100000',
          tif: 'GTC',
          client_order_id: 'co-1',
        },
      },
      {
        type: 'Cancel',
        params: { symbol: 'BTC', order_id: 42069 },
      },
    ]);
    const req = captured[0];
    expect(req.url).toBe('https://api.pacifica.fi/api/v1/orders/batch');
    const body = req.body as { actions: Array<{ type: string; data: Record<string, unknown> }> };
    expect(body.actions).toHaveLength(2);
    expect(body.actions[0].type).toBe('Create');
    expect(body.actions[1].type).toBe('Cancel');
    // Each inner entry is itself a flat signed body.
    assertSignatureValid(
      body.actions[0].data,
      'create_order',
      TEST_KEYPAIR.publicKey,
    );
    assertSignatureValid(
      body.actions[1].data,
      'cancel_order',
      TEST_KEYPAIR.publicKey,
    );
    // The inner body carries the payload fields (e.g. symbol).
    expect(body.actions[0].data.symbol).toBe('BTC');
    expect(body.actions[1].data.order_id).toBe(42069);
  });
});

describe('PacificaClient — subaccounts', () => {
  it('createSubaccount signs both legs and sends both signatures', async () => {
    const { fetch, captured } = makeMockFetch();
    const client = new PacificaClient({
      env: 'mainnet',
      address: TEST_PUBLIC_KEY_B58,
      privateKey: TEST_PRIVATE_KEY_B58,
      fetch,
    });
    await client.createSubaccount({
      subaccountPrivateKey: SUB_PRIVATE_KEY_B58,
    });
    const req = captured[0];
    expect(req.url).toBe(
      'https://api.pacifica.fi/api/v1/account/subaccount/create',
    );
    const body = req.body as {
      main_account: string;
      subaccount: string;
      main_signature: string;
      sub_signature: string;
      timestamp: number;
      expiry_window: number;
    };
    expect(body.main_account).toBe(TEST_PUBLIC_KEY_B58);
    expect(body.subaccount).toBe(SUB_PUBLIC_KEY_B58);
    expect(typeof body.main_signature).toBe('string');
    expect(typeof body.sub_signature).toBe('string');

    // Verify sub_signature: subaccount signs {account: main_pubkey}.
    const subMsg = prepareMessage(
      {
        type: 'subaccount_initiate',
        timestamp: body.timestamp,
        expiry_window: body.expiry_window,
      },
      { account: TEST_PUBLIC_KEY_B58 },
    );
    expect(
      nacl.sign.detached.verify(
        new TextEncoder().encode(subMsg),
        bs58.decode(body.sub_signature),
        SUB_KEYPAIR.publicKey,
      ),
    ).toBe(true);

    // Verify main_signature: main account signs {signature: sub_sig}.
    const mainMsg = prepareMessage(
      {
        type: 'subaccount_confirm',
        timestamp: body.timestamp,
        expiry_window: body.expiry_window,
      },
      { signature: body.sub_signature },
    );
    expect(
      nacl.sign.detached.verify(
        new TextEncoder().encode(mainMsg),
        bs58.decode(body.main_signature),
        TEST_KEYPAIR.publicKey,
      ),
    ).toBe(true);
  });

  it('listSubaccounts signs with type=list_subaccounts and empty payload', async () => {
    const { client, captured } = makeClient();
    await client.listSubaccounts();
    const req = captured[0];
    expect(req.url).toBe(
      'https://api.pacifica.fi/api/v1/account/subaccount/list',
    );
    assertSignatureValid(
      req.body,
      'list_subaccounts',
      TEST_KEYPAIR.publicKey,
    );
  });

  it('transferSubaccountFund signs with type=transfer_funds', async () => {
    const { client, captured } = makeClient();
    await client.transferSubaccountFund({
      to_account: SUB_PUBLIC_KEY_B58,
      amount: '420.69',
    });
    const req = captured[0];
    expect(req.url).toBe(
      'https://api.pacifica.fi/api/v1/account/subaccount/transfer',
    );
    expect(req.body.to_account).toBe(SUB_PUBLIC_KEY_B58);
    expect(req.body.amount).toBe('420.69');
    assertSignatureValid(req.body, 'transfer_funds', TEST_KEYPAIR.publicKey);
  });
});

describe('PacificaClient — agent wallets', () => {
  it('bindAgentWallet signs with type=bind_agent_wallet', async () => {
    const { client, captured } = makeClient();
    await client.bindAgentWallet({ agent_wallet: 'AGENT_PUBKEY' });
    const req = captured[0];
    expect(req.url).toBe('https://api.pacifica.fi/api/v1/agent/bind');
    expect(req.body.agent_wallet).toBe('AGENT_PUBKEY');
    assertSignatureValid(
      req.body,
      'bind_agent_wallet',
      TEST_KEYPAIR.publicKey,
    );
  });

  it('listAgentWallets signs with type=list_agent_wallets', async () => {
    const { client, captured } = makeClient();
    await client.listAgentWallets();
    expect(captured[0].url).toBe(
      'https://api.pacifica.fi/api/v1/agent/list',
    );
    assertSignatureValid(
      captured[0].body,
      'list_agent_wallets',
      TEST_KEYPAIR.publicKey,
    );
  });

  it('revokeAgentWallet signs with type=revoke_agent_wallet', async () => {
    const { client, captured } = makeClient();
    await client.revokeAgentWallet({ agent_wallet: 'AGENT_PUBKEY' });
    expect(captured[0].url).toBe(
      'https://api.pacifica.fi/api/v1/agent/revoke',
    );
    assertSignatureValid(
      captured[0].body,
      'revoke_agent_wallet',
      TEST_KEYPAIR.publicKey,
    );
  });

  it('revokeAllAgentWallets signs with type=revoke_all_agent_wallets', async () => {
    const { client, captured } = makeClient();
    await client.revokeAllAgentWallets();
    expect(captured[0].url).toBe(
      'https://api.pacifica.fi/api/v1/agent/revoke_all',
    );
    assertSignatureValid(
      captured[0].body,
      'revoke_all_agent_wallets',
      TEST_KEYPAIR.publicKey,
    );
  });

  it('addAgentIpWhitelist signs with type=add_agent_whitelisted_ip', async () => {
    const { client, captured } = makeClient();
    await client.addAgentIpWhitelist({
      agent_wallet: 'AGENT_PUBKEY',
      ip_address: '1.2.3.4',
    });
    expect(captured[0].url).toBe(
      'https://api.pacifica.fi/api/v1/agent/ip_whitelist/add',
    );
    assertSignatureValid(
      captured[0].body,
      'add_agent_whitelisted_ip',
      TEST_KEYPAIR.publicKey,
    );
    expect(captured[0].body.ip_address).toBe('1.2.3.4');
  });

  it('agentWallet option propagates into top-level request header', async () => {
    const { client, captured } = makeClient({ agentWallet: 'AGENT_PUBKEY' });
    await client.createMarketOrder({
      symbol: 'BTC',
      side: 'bid',
      amount: '0.1',
      slippage_percent: '0.5',
    });
    expect(captured[0].body.agent_wallet).toBe('AGENT_PUBKEY');
  });
});

describe('PacificaClient — API config keys', () => {
  it('createApiConfigKey signs with type=create_api_key', async () => {
    const { client, captured } = makeClient();
    await client.createApiConfigKey();
    expect(captured[0].url).toBe(
      'https://api.pacifica.fi/api/v1/account/api_keys/create',
    );
    assertSignatureValid(
      captured[0].body,
      'create_api_key',
      TEST_KEYPAIR.publicKey,
    );
  });

  it('listApiConfigKeys signs with type=list_api_keys', async () => {
    const { client, captured } = makeClient();
    await client.listApiConfigKeys();
    expect(captured[0].url).toBe(
      'https://api.pacifica.fi/api/v1/account/api_keys',
    );
    assertSignatureValid(
      captured[0].body,
      'list_api_keys',
      TEST_KEYPAIR.publicKey,
    );
  });

  it('revokeApiConfigKey signs with type=revoke_api_key', async () => {
    const { client, captured } = makeClient();
    await client.revokeApiConfigKey({ api_key: 'API_KEY_XYZ' });
    expect(captured[0].url).toBe(
      'https://api.pacifica.fi/api/v1/account/api_keys/revoke',
    );
    expect(captured[0].body.api_key).toBe('API_KEY_XYZ');
    assertSignatureValid(
      captured[0].body,
      'revoke_api_key',
      TEST_KEYPAIR.publicKey,
    );
  });
});

describe('PacificaClient — lake', () => {
  it('createLake signs with type=create_lake and includes nickname if set', async () => {
    const { client, captured } = makeClient();
    await client.createLake({
      manager: TEST_PUBLIC_KEY_B58,
      nickname: 'Moraine Lake',
    });
    expect(captured[0].url).toBe(
      'https://api.pacifica.fi/api/v1/lake/create',
    );
    expect(captured[0].body.manager).toBe(TEST_PUBLIC_KEY_B58);
    expect(captured[0].body.nickname).toBe('Moraine Lake');
    assertSignatureValid(
      captured[0].body,
      'create_lake',
      TEST_KEYPAIR.publicKey,
    );
  });

  it('lakeDeposit signs with type=deposit_to_lake', async () => {
    const { client, captured } = makeClient();
    await client.lakeDeposit({ lake: SUB_PUBLIC_KEY_B58, amount: '100000' });
    expect(captured[0].url).toBe(
      'https://api.pacifica.fi/api/v1/lake/deposit',
    );
    assertSignatureValid(
      captured[0].body,
      'deposit_to_lake',
      TEST_KEYPAIR.publicKey,
    );
  });

  it('lakeWithdraw signs with type=withdraw_from_lake', async () => {
    const { client, captured } = makeClient();
    await client.lakeWithdraw({ lake: SUB_PUBLIC_KEY_B58, shares: '100' });
    expect(captured[0].url).toBe(
      'https://api.pacifica.fi/api/v1/lake/withdraw',
    );
    expect(captured[0].body.shares).toBe('100');
    assertSignatureValid(
      captured[0].body,
      'withdraw_from_lake',
      TEST_KEYPAIR.publicKey,
    );
  });
});

describe('PacificaClient — constructor guards', () => {
  it('rejects privateKey + ledgerPath set together', () => {
    expect(
      () =>
        new PacificaClient({
          env: 'mainnet',
          address: TEST_PUBLIC_KEY_B58,
          privateKey: TEST_PRIVATE_KEY_B58,
          ledgerPath: 'usb://ledger?key=1',
          fetch: makeMockFetch().fetch,
        }),
    ).toThrow();
  });
});
