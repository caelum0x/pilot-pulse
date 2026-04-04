/**
 * Tests for PacificaWsClient signed trading methods.
 *
 * Strategy:
 *  - Stub WebSocketImpl with a minimal class that records every `send`
 *    call and exposes the same `OPEN` constant.
 *  - Emit an `open` event so `readyState === OPEN` and `send()` is
 *    allowed. (The production client normally replays subscriptions
 *    on open; here we just want to capture what gets pushed.)
 *  - For each trading method, assert the envelope shape
 *    `{id, params: {[opType]: signedBody}}` and verify the signature
 *    against the known test public key.
 */

import { describe, expect, it } from 'vitest';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

import { PacificaWsClient } from './ws.js';
import { prepareMessage } from './signing.js';

const SEED = new Uint8Array(32).fill(7);
const TEST_KEYPAIR = nacl.sign.keyPair.fromSeed(SEED);
const TEST_PRIVATE_KEY_B58 = bs58.encode(TEST_KEYPAIR.secretKey);
const TEST_PUBLIC_KEY_B58 = bs58.encode(TEST_KEYPAIR.publicKey);

/**
 * Minimal fake ws class that mimics the pieces of `ws.WebSocket` the
 * client touches. We drop the `EventEmitter` pretense and keep handlers
 * in an internal map.
 */
class FakeWebSocket {
  static OPEN = 1;
  readyState = FakeWebSocket.OPEN;

  public readonly sent: string[] = [];
  private readonly handlers = new Map<string, Array<(...args: unknown[]) => void>>();

  constructor(_url: string) {
    void _url;
    // Fire the open event on next tick so the client can finish
    // constructing before any listeners exist.
    queueMicrotask(() => {
      const open = this.handlers.get('open');
      if (open) for (const cb of open) cb();
    });
  }

  on(event: string, cb: (...args: unknown[]) => void): void {
    let arr = this.handlers.get(event);
    if (!arr) {
      arr = [];
      this.handlers.set(event, arr);
    }
    arr.push(cb);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    const closeCbs = this.handlers.get('close');
    if (closeCbs) for (const cb of closeCbs) cb();
  }
}

function assertSignatureValid(
  body: Record<string, unknown>,
  opType: string,
  publicKey: Uint8Array,
): void {
  const {
    account: _account,
    signature,
    timestamp,
    expiry_window,
    agent_wallet: _agentWallet,
    ...payload
  } = body;
  void _account;
  void _agentWallet;

  const message = prepareMessage(
    {
      type: opType,
      timestamp: timestamp as number,
      expiry_window: expiry_window as number,
    },
    payload,
  );
  const ok = nacl.sign.detached.verify(
    new TextEncoder().encode(message),
    bs58.decode(signature as string),
    publicKey,
  );
  expect(ok).toBe(true);
}

async function makeConnectedClient(
  overrides: Partial<ConstructorParameters<typeof PacificaWsClient>[0]> = {},
): Promise<{ client: PacificaWsClient; fake: FakeWebSocket }> {
  let captured: FakeWebSocket | null = null;
  // Capture the FakeWebSocket instance the client constructs so tests
  // can read its `sent` buffer.
  class RecordingFake extends FakeWebSocket {
    constructor(url: string) {
      super(url);
      captured = this;
    }
  }

  const client = new PacificaWsClient({
    env: 'mainnet',
    address: TEST_PUBLIC_KEY_B58,
    privateKey: TEST_PRIVATE_KEY_B58,
    // Cast through unknown — FakeWebSocket matches the minimal surface
    // the client actually uses (on, send, close, readyState, static OPEN).
    WebSocketImpl: RecordingFake as unknown as typeof import('ws').default,
    ...overrides,
  });

  // Wait a microtask so the fake emits `open` and readyState flips.
  await Promise.resolve();
  await Promise.resolve();

  if (!captured) throw new Error('fake WebSocket not created');
  return { client, fake: captured };
}

describe('PacificaWsClient — signed trading', () => {
  it('createMarketOrderWs sends {id, params: {create_market_order: signedBody}}', async () => {
    const { client, fake } = await makeConnectedClient();
    client.createMarketOrderWs({
      symbol: 'BTC',
      side: 'bid',
      amount: '0.1',
      slippage_percent: '0.5',
      client_order_id: 'co-1',
    });

    // Find the create_market_order frame (there may also be a ping timer).
    const frames = fake.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
    const orderFrame = frames.find(
      (f) => (f.params as Record<string, unknown> | undefined)?.create_market_order,
    );
    expect(orderFrame).toBeDefined();
    expect(typeof orderFrame?.id).toBe('string');
    const signed = (orderFrame!.params as { create_market_order: Record<string, unknown> })
      .create_market_order;
    expect(signed.symbol).toBe('BTC');
    expect(signed.side).toBe('bid');
    expect(signed.account).toBe(TEST_PUBLIC_KEY_B58);
    expect('data' in signed).toBe(false);
    assertSignatureValid(signed, 'create_market_order', TEST_KEYPAIR.publicKey);
  });

  it('createLimitOrderWs signs with type=create_order', async () => {
    const { client, fake } = await makeConnectedClient();
    client.createLimitOrderWs({
      symbol: 'BTC',
      side: 'bid',
      amount: '0.1',
      price: '100000',
      tif: 'GTC',
      client_order_id: 'co-2',
    });

    const frames = fake.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
    const orderFrame = frames.find(
      (f) => (f.params as Record<string, unknown> | undefined)?.create_order,
    );
    expect(orderFrame).toBeDefined();
    const signed = (orderFrame!.params as { create_order: Record<string, unknown> })
      .create_order;
    expect(signed.tif).toBe('GTC');
    assertSignatureValid(signed, 'create_order', TEST_KEYPAIR.publicKey);
  });

  it('cancelOrderWs signs with type=cancel_order', async () => {
    const { client, fake } = await makeConnectedClient();
    client.cancelOrderWs({ symbol: 'BTC', order_id: 42069 });

    const frames = fake.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
    const frame = frames.find(
      (f) => (f.params as Record<string, unknown> | undefined)?.cancel_order,
    );
    expect(frame).toBeDefined();
    const signed = (frame!.params as { cancel_order: Record<string, unknown> })
      .cancel_order;
    expect(signed.order_id).toBe(42069);
    assertSignatureValid(signed, 'cancel_order', TEST_KEYPAIR.publicKey);
  });

  it('cancelAllOrdersWs signs with type=cancel_all_orders', async () => {
    const { client, fake } = await makeConnectedClient();
    client.cancelAllOrdersWs({ all_symbols: true, exclude_reduce_only: false });

    const frames = fake.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
    const frame = frames.find(
      (f) => (f.params as Record<string, unknown> | undefined)?.cancel_all_orders,
    );
    expect(frame).toBeDefined();
    const signed = (frame!.params as { cancel_all_orders: Record<string, unknown> })
      .cancel_all_orders;
    expect(signed.all_symbols).toBe(true);
    assertSignatureValid(signed, 'cancel_all_orders', TEST_KEYPAIR.publicKey);
  });

  it('agentWallet option propagates into WS request header as agent_wallet', async () => {
    const { client, fake } = await makeConnectedClient({
      agentWallet: 'AGENT_PUBKEY',
    });
    client.createMarketOrderWs({
      symbol: 'BTC',
      side: 'bid',
      amount: '0.1',
      slippage_percent: '0.5',
      client_order_id: 'co-3',
    });
    const frames = fake.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
    const frame = frames.find(
      (f) => (f.params as Record<string, unknown> | undefined)?.create_market_order,
    );
    expect(frame).toBeDefined();
    const signed = (frame!.params as { create_market_order: Record<string, unknown> })
      .create_market_order;
    expect(signed.agent_wallet).toBe('AGENT_PUBKEY');
  });

  it('subscribeTwap sends both account_twap_orders and account_twap_order_updates', async () => {
    const { client, fake } = await makeConnectedClient();
    client.subscribeTwap('dev1S2tC8CSZXzTQzVacYvkqWwD37dTqiCKaeJCWhwM');
    const frames = fake.sent.map((s) => JSON.parse(s) as Record<string, unknown>);
    const sources = frames
      .filter((f) => f.method === 'subscribe')
      .map((f) => (f.params as { source: string }).source);
    expect(sources).toContain('account_twap_orders');
    expect(sources).toContain('account_twap_order_updates');
  });

  it('throws if signed methods are called without privateKey', async () => {
    const { client } = await makeConnectedClient({ privateKey: undefined });
    expect(() =>
      client.createMarketOrderWs({
        symbol: 'BTC',
        side: 'bid',
        amount: '0.1',
        slippage_percent: '0.5',
      }),
    ).toThrow();
  });
});
