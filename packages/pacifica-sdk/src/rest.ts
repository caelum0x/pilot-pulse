/**
 * Pacifica REST client.
 *
 * Wraps the HTTPS API described in `docs/pacifica-api.md` with a small,
 * typed surface. Three kinds of calls:
 *
 *  - **Unsigned GETs** — public market data and account-scoped reads that
 *    just need `?account=<pubkey>` as a query parameter.
 *  - **Signed POSTs** — mutating actions (orders, leverage, transfers)
 *    whose body is a canonical-JSON-signed envelope. See `signing.ts`
 *    and `signed-request.ts` for details.
 *  - **Hardware-signed POSTs** — same as above but the signature is
 *    produced by a Ledger via `solana sign-offchain-message`. When the
 *    client is constructed with `ledgerPath`, every signed method takes
 *    this path automatically.
 *
 * The `fetch` implementation is injectable so tests can pass a mock.
 */

import { PacificaEnv, PACIFICA_URLS } from './env.js';
import { PacificaError, PacificaSigningError } from './errors.js';
import { runBatchOrders } from './rest-batch.js';
import { createSubaccountSoftware } from './rest-subaccount.js';
import { createSubaccountHardwareFlow } from './rest-subaccount-hardware.js';
import {
  buildSignedRequestHeader,
  handleResponse,
  signPayload,
  type FetchLike,
  type SigningCredentials,
} from './signed-request.js';

// NOTE: `rest-subaccount-hardware.js` is intentionally NOT imported
// statically. It transitively pulls in `signing-hardware.js` which uses
// `node:child_process`. `createSubaccountHardware` below lazy-imports it
// at call time so the default SDK entry stays browser-safe.
import type {
  AccountInfo,
  BatchOrderAction,
  BindAgentWalletParams,
  CandleInterval,
  CreateLakeParams,
  CreateLimitOrderParams,
  CreateMarketOrderParams,
  CreateOrderResponse,
  CreatePositionTpSlParams,
  CreateSubaccountHardwareParams,
  CreateSubaccountParams,
  CreateTwapOrderParams,
  CancelTwapOrderParams,
  LakeDepositParams,
  LakeWithdrawParams,
  MarketInfo,
  OpenOrder,
  OrderbookSnapshot,
  Position,
  RevokeAgentWalletParams,
  RevokeApiConfigKeyParams,
  AgentIpWhitelistListParams,
  AgentIpWhitelistMutateParams,
  AgentIpWhitelistToggleParams,
  Subaccount,
  TransferSubaccountFundParams,
} from './types.js';

export interface PacificaClientOptions {
  env: PacificaEnv;
  /** Solana public key / account address — required for account-scoped and signed calls. */
  address?: string;
  /** Base58-encoded Solana secret key (64 bytes). Required for software-signed calls. */
  privateKey?: string;
  /**
   * Path understood by the `solana` CLI (e.g. `"usb://ledger?key=1"`).
   * Mutually exclusive with `privateKey`. When set, every signed call
   * shells out to `solana sign-offchain-message` to produce the signature.
   */
  ledgerPath?: string;
  /**
   * Optional agent-wallet public key. When set together with `privateKey`,
   * `privateKey` is assumed to be the agent-key secret; the main account
   * is `address`, and every signed request header carries `agent_wallet`.
   */
  agentWallet?: string;
  /** If set, automatically attached to every order payload (before signing). */
  builderCode?: string;
  /** Injectable fetch for tests. Defaults to `globalThis.fetch`. */
  fetch?: FetchLike;
}

function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}

/** Extract an RFC 4122 v4 UUID using whatever API is available on the platform. */
function generateClientOrderId(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Order ops whose payloads get an auto-injected `builder_code` when the
 * client has one configured. Kept as a set so order additions (like TWAP)
 * can opt in without adding more branches.
 */
const ORDER_OPS_WITH_BUILDER_CODE = new Set<string>([
  'create_order',
  'create_market_order',
  'create_twap_order',
]);

export class PacificaClient {
  private readonly env: PacificaEnv;
  private readonly restBase: string;
  private readonly address?: string;
  private readonly privateKey?: string;
  private readonly ledgerPath?: string;
  private readonly agentWallet?: string;
  private readonly builderCode?: string;
  private readonly fetchImpl: FetchLike;

  constructor(opts: PacificaClientOptions) {
    if (opts.privateKey && opts.ledgerPath) {
      throw new PacificaSigningError(
        'privateKey and ledgerPath are mutually exclusive in PacificaClientOptions',
      );
    }

    this.env = opts.env;
    this.restBase = PACIFICA_URLS[opts.env].rest;
    this.address = opts.address;
    this.privateKey = opts.privateKey;
    this.ledgerPath = opts.ledgerPath;
    this.agentWallet = opts.agentWallet;
    this.builderCode = opts.builderCode;

    const fetchImpl = opts.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new PacificaError(
        'No fetch implementation available. Provide `fetch` in options or upgrade to Node 18+.',
      );
    }
    this.fetchImpl = opts.fetch ?? fetchImpl.bind(globalThis);
  }

  /** Which environment this client is pointing at. */
  getEnv(): PacificaEnv {
    return this.env;
  }

  // ============================================================
  // Public market data (unsigned)
  // ============================================================

  getMarketInfo(): Promise<MarketInfo[]> {
    return this.getJson<MarketInfo[]>('/info');
  }

  getPrices(): Promise<unknown> {
    // No standalone prices endpoint — market info includes funding_rate.
    // Live prices come via WebSocket `prices` channel. This falls back to
    // returning market info as-is so callers can extract funding/OI data.
    return this.getJson<unknown>('/info');
  }

  getCandles(
    symbol: string,
    interval: CandleInterval,
    startTime: number,
    endTime?: number,
  ): Promise<unknown> {
    const params: Record<string, string | number> = {
      symbol,
      interval,
      start_time: startTime,
    };
    if (endTime !== undefined) {
      params.end_time = endTime;
    }
    return this.getJson<unknown>('/kline', params);
  }

  /**
   * Fetch orderbook for a symbol. The raw API returns `{ s, l: [bids[], asks[]], t }`
   * which we normalize into the SDK's `OrderbookSnapshot` shape.
   */
  async getOrderbook(symbol: string): Promise<OrderbookSnapshot> {
    const raw = await this.getJson<{
      s: string;
      l: Array<Array<{ p: string; a: string; n: number }>>;
      t: number;
    }>('/book', { symbol });
    const [rawBids = [], rawAsks = []] = raw.l;
    return {
      symbol: raw.s,
      bids: rawBids.map((b) => ({ price: b.p, size: b.a })),
      asks: rawAsks.map((a) => ({ price: a.p, size: a.a })),
      timestamp: raw.t,
    };
  }

  getRecentTrades(symbol: string): Promise<unknown> {
    return this.getJson<unknown>('/trades', { symbol });
  }

  getHistoricalFunding(symbol: string): Promise<unknown> {
    return this.getJson<unknown>('/funding/history', {
      account: this.requireAddress(),
      symbol,
    });
  }

  // ============================================================
  // Account reads (unsigned GET, but require an address)
  // ============================================================

  getAccountInfo(): Promise<AccountInfo> {
    return this.getJson<AccountInfo>('/account', {
      account: this.requireAddress(),
    });
  }

  getPositions(): Promise<Position[]> {
    return this.getJson<Position[]>('/positions', {
      account: this.requireAddress(),
    });
  }

  getOpenOrders(): Promise<OpenOrder[]> {
    return this.getJson<OpenOrder[]>('/orders', {
      account: this.requireAddress(),
    });
  }

  getOrderHistory(
    opts: { limit?: number; offset?: number } = {},
  ): Promise<unknown> {
    return this.getJson<unknown>('/orders/history', {
      account: this.requireAddress(),
      ...pruneUndefined(opts),
    });
  }

  getFundingHistory(
    opts: { limit?: number; offset?: number } = {},
  ): Promise<unknown> {
    return this.getJson<unknown>('/funding/history', {
      account: this.requireAddress(),
      ...pruneUndefined(opts),
    });
  }

  getPortfolio(
    opts: { limit?: number; granularity_in_minutes?: number } = {},
  ): Promise<unknown> {
    return this.getJson<unknown>('/portfolio', {
      account: this.requireAddress(),
      ...pruneUndefined(opts),
    });
  }

  // ============================================================
  // TWAP reads (unsigned GET)
  // ============================================================

  getOpenTwapOrders(): Promise<unknown> {
    return this.getJson<unknown>('/orders/twap', {
      account: this.requireAddress(),
    });
  }

  getTwapOrderHistory(): Promise<unknown> {
    return this.getJson<unknown>('/orders/twap/history', {
      account: this.requireAddress(),
    });
  }

  getTwapOrderHistoryById(orderId: number | string): Promise<unknown> {
    return this.getJson<unknown>('/orders/twap/history_by_id', {
      order_id: orderId,
    });
  }

  // ============================================================
  // Signed order actions
  // ============================================================

  async createMarketOrder(
    params: CreateMarketOrderParams,
  ): Promise<CreateOrderResponse> {
    const payload = this.buildOrderPayload('create_market_order', {
      symbol: params.symbol,
      reduce_only: params.reduce_only ?? false,
      amount: params.amount,
      side: params.side,
      slippage_percent: params.slippage_percent,
      client_order_id: params.client_order_id ?? generateClientOrderId(),
      builder_code: params.builder_code,
    });

    return this.signedPost<CreateOrderResponse>(
      'create_market_order',
      '/orders/create_market',
      payload,
    );
  }

  async createLimitOrder(
    params: CreateLimitOrderParams,
  ): Promise<CreateOrderResponse> {
    const payload = this.buildOrderPayload('create_order', {
      symbol: params.symbol,
      price: params.price,
      reduce_only: params.reduce_only ?? false,
      amount: params.amount,
      side: params.side,
      tif: params.tif,
      client_order_id: params.client_order_id ?? generateClientOrderId(),
      builder_code: params.builder_code,
    });

    return this.signedPost<CreateOrderResponse>(
      'create_order',
      '/orders/create',
      payload,
    );
  }

  /**
   * Attach a take-profit and/or stop-loss to an existing position.
   *
   * Mirrors `vendor/python-sdk/rest/create_position_tpsl.py`. The payload
   * contains nested `take_profit`/`stop_loss` objects whose fields are
   * signed as-is alongside `symbol`/`side`.
   */
  createPositionTpSl(
    params: CreatePositionTpSlParams,
  ): Promise<unknown> {
    const payload: Record<string, unknown> = {
      symbol: params.symbol,
      side: params.side,
    };
    if (params.take_profit) {
      payload.take_profit = pruneUndefined({ ...params.take_profit });
    }
    if (params.stop_loss) {
      payload.stop_loss = pruneUndefined({ ...params.stop_loss });
    }
    return this.signedPost<unknown>(
      'set_position_tpsl',
      '/positions/tpsl',
      payload,
    );
  }

  cancelOrder(params: {
    symbol: string;
    order_id?: number;
    client_order_id?: string;
  }): Promise<unknown> {
    return this.signedPost<unknown>(
      'cancel_order',
      '/orders/cancel',
      pruneUndefined({
        symbol: params.symbol,
        order_id: params.order_id,
        client_order_id: params.client_order_id,
      }),
    );
  }

  cancelAllOrders(params: {
    symbol?: string;
    all_symbols?: boolean;
    exclude_reduce_only?: boolean;
  }): Promise<unknown> {
    return this.signedPost<unknown>(
      'cancel_all_orders',
      '/orders/cancel_all',
      pruneUndefined({
        symbol: params.symbol,
        all_symbols: params.all_symbols,
        exclude_reduce_only: params.exclude_reduce_only,
      }),
    );
  }

  updateLeverage(params: {
    symbol: string;
    leverage: number;
  }): Promise<unknown> {
    return this.signedPost<unknown>('update_leverage', '/account/leverage', {
      symbol: params.symbol,
      leverage: params.leverage,
    });
  }

  // ============================================================
  // TWAP orders (signed)
  // ============================================================

  createTwapOrder(params: CreateTwapOrderParams): Promise<unknown> {
    const payload = this.buildOrderPayload('create_twap_order', {
      symbol: params.symbol,
      reduce_only: params.reduce_only ?? false,
      amount: params.amount,
      side: params.side,
      slippage_percent: params.slippage_percent,
      duration_in_seconds: params.duration_in_seconds,
      client_order_id: params.client_order_id ?? generateClientOrderId(),
      builder_code: params.builder_code,
    });
    return this.signedPost<unknown>(
      'create_twap_order',
      '/orders/twap/create',
      payload,
    );
  }

  cancelTwapOrder(params: CancelTwapOrderParams): Promise<unknown> {
    return this.signedPost<unknown>(
      'cancel_twap_order',
      '/orders/twap/cancel',
      pruneUndefined({
        symbol: params.symbol,
        order_id: params.order_id,
        client_order_id: params.client_order_id,
      }),
    );
  }

  // ============================================================
  // Batch orders
  // ============================================================

  /**
   * Submit a batch of create/cancel actions in a single request.
   *
   * Mirrors `vendor/python-sdk/rest/batch_orders.py`. Each entry in
   * `actions` is individually signed with its own operation-type header
   * (`create_order`, `create_market_order`, or `cancel_order`) and then
   * wrapped into the outer `{actions: [{type, data}, ...]}` envelope.
   *
   * The outer envelope itself is NOT signed — only the per-action `data`
   * objects carry signatures. This matches the Python reference exactly.
   */
  batchOrders(actions: BatchOrderAction[]): Promise<unknown> {
    if (this.ledgerPath) {
      throw new PacificaSigningError(
        'batchOrders does not support hardware-wallet signing',
      );
    }
    const account = this.requireAddress();
    const privateKey = this.requirePrivateKey();
    return runBatchOrders(
      {
        restBase: this.restBase,
        fetchImpl: this.fetchImpl,
        account,
        privateKey,
        agentWallet: this.agentWallet,
        builderCode: this.builderCode,
      },
      actions,
    );
  }

  // ============================================================
  // Subaccounts
  // ============================================================

  /**
   * Two-step signed flow to create a subaccount.
   *
   * 1. Subaccount signs `{account: mainPubkey}` under op
   *    `subaccount_initiate` — this is the `sub_signature`.
   * 2. Main account signs `{signature: <sub_signature>}` under op
   *    `subaccount_confirm` — this is the `main_signature`.
   * 3. Both signatures are sent together with both public keys.
   *
   * Mirrors `vendor/python-sdk/rest/create_subaccount.py`.
   */
  createSubaccount(params: CreateSubaccountParams): Promise<unknown> {
    if (!this.privateKey) {
      throw new PacificaSigningError(
        'createSubaccount requires the client to be configured with privateKey (use createSubaccountHardware for Ledger)',
      );
    }
    return createSubaccountSoftware({
      restBase: this.restBase,
      fetchImpl: this.fetchImpl,
      mainPubkey: this.requireAddress(),
      mainPrivateKey: this.privateKey,
      subaccountPrivateKey: params.subaccountPrivateKey,
      expiryWindowMs: params.expiryWindowMs,
    });
  }

  /**
   * Same flow as {@link createSubaccount}, but the main account leg is
   * signed via a Ledger hardware wallet. The client must have been
   * constructed with `ledgerPath` matching `params.mainHardwarePublicKey`.
   */
  createSubaccountHardware(
    params: CreateSubaccountHardwareParams,
  ): Promise<unknown> {
    if (!this.ledgerPath) {
      throw new PacificaSigningError(
        'createSubaccountHardware requires the client to be configured with ledgerPath',
      );
    }
    return createSubaccountHardwareFlow({
      restBase: this.restBase,
      fetchImpl: this.fetchImpl,
      mainHardwarePublicKey: params.mainHardwarePublicKey,
      ledgerPath: this.ledgerPath,
      subaccountPrivateKey: params.subaccountPrivateKey,
      expiryWindowMs: params.expiryWindowMs,
    });
  }

  /** List all subaccounts for the configured address. */
  listSubaccounts(): Promise<{ subaccounts: Subaccount[] }> {
    return this.signedPost<{ subaccounts: Subaccount[] }>(
      'list_subaccounts',
      '/account/subaccount/list',
      {},
    );
  }

  /**
   * Transfer funds between a main account and one of its subaccounts.
   * The `from` side is whichever account the client was configured with.
   */
  transferSubaccountFund(
    params: TransferSubaccountFundParams,
  ): Promise<unknown> {
    return this.signedPost<unknown>(
      'transfer_funds',
      '/account/subaccount/transfer',
      { to_account: params.to_account, amount: params.amount },
    );
  }

  /**
   * Same as {@link transferSubaccountFund} but signed via Ledger. The
   * client must have been constructed with `ledgerPath`.
   */
  transferSubaccountFundHardware(
    params: TransferSubaccountFundParams,
  ): Promise<unknown> {
    if (!this.ledgerPath) {
      throw new PacificaSigningError(
        'transferSubaccountFundHardware requires ledgerPath',
      );
    }
    return this.signedPost<unknown>(
      'transfer_funds',
      '/account/subaccount/transfer',
      { to_account: params.to_account, amount: params.amount },
      { expiryWindowMs: 200_000 },
    );
  }

  // ============================================================
  // Agent wallets
  // ============================================================

  bindAgentWallet(params: BindAgentWalletParams): Promise<unknown> {
    return this.signedPost<unknown>('bind_agent_wallet', '/agent/bind', {
      agent_wallet: params.agent_wallet,
    });
  }

  listAgentWallets(): Promise<unknown> {
    return this.signedPost<unknown>('list_agent_wallets', '/agent/list', {});
  }

  revokeAgentWallet(params: RevokeAgentWalletParams): Promise<unknown> {
    return this.signedPost<unknown>('revoke_agent_wallet', '/agent/revoke', {
      agent_wallet: params.agent_wallet,
    });
  }

  revokeAllAgentWallets(): Promise<unknown> {
    return this.signedPost<unknown>(
      'revoke_all_agent_wallets',
      '/agent/revoke_all',
      {},
    );
  }

  listAgentIpWhitelist(
    params: AgentIpWhitelistListParams,
  ): Promise<unknown> {
    return this.signedPost<unknown>(
      'list_agent_ip_whitelist',
      '/agent/ip_whitelist/list',
      { api_agent_key: params.api_agent_key },
    );
  }

  addAgentIpWhitelist(
    params: AgentIpWhitelistMutateParams,
  ): Promise<unknown> {
    return this.signedPost<unknown>(
      'add_agent_whitelisted_ip',
      '/agent/ip_whitelist/add',
      { agent_wallet: params.agent_wallet, ip_address: params.ip_address },
    );
  }

  removeAgentIpWhitelist(
    params: AgentIpWhitelistMutateParams,
  ): Promise<unknown> {
    return this.signedPost<unknown>(
      'remove_agent_whitelisted_ip',
      '/agent/ip_whitelist/remove',
      { agent_wallet: params.agent_wallet, ip_address: params.ip_address },
    );
  }

  toggleAgentIpWhitelist(
    params: AgentIpWhitelistToggleParams,
  ): Promise<unknown> {
    return this.signedPost<unknown>(
      'set_agent_ip_whitelist_enabled',
      '/agent/ip_whitelist/toggle',
      { agent_wallet: params.agent_wallet, enabled: params.enabled },
    );
  }

  // ============================================================
  // API config keys
  // ============================================================

  createApiConfigKey(): Promise<{ api_key: string } | unknown> {
    return this.signedPost<{ api_key: string } | unknown>(
      'create_api_key',
      '/account/api_keys/create',
      {},
    );
  }

  listApiConfigKeys(): Promise<unknown> {
    return this.signedPost<unknown>(
      'list_api_keys',
      '/account/api_keys',
      {},
    );
  }

  revokeApiConfigKey(
    params: RevokeApiConfigKeyParams,
  ): Promise<unknown> {
    return this.signedPost<unknown>(
      'revoke_api_key',
      '/account/api_keys/revoke',
      { api_key: params.api_key },
    );
  }

  // ============================================================
  // Lake
  // ============================================================

  createLake(params: CreateLakeParams): Promise<unknown> {
    return this.signedPost<unknown>('create_lake', '/lake/create', {
      manager: params.manager,
      ...(params.nickname !== undefined ? { nickname: params.nickname } : {}),
    });
  }

  lakeDeposit(params: LakeDepositParams): Promise<unknown> {
    return this.signedPost<unknown>('deposit_to_lake', '/lake/deposit', {
      lake: params.lake,
      amount: params.amount,
    });
  }

  lakeWithdraw(params: LakeWithdrawParams): Promise<unknown> {
    return this.signedPost<unknown>('withdraw_from_lake', '/lake/withdraw', {
      lake: params.lake,
      shares: params.shares,
    });
  }

  // ============================================================
  // Internals
  // ============================================================

  private requireAddress(): string {
    if (!this.address) {
      throw new PacificaError(
        'This call requires `address` to be set on the client',
        'MISSING_ADDRESS',
      );
    }
    return this.address;
  }

  private requirePrivateKey(): string {
    if (!this.privateKey) {
      throw new PacificaSigningError(
        'This call requires `privateKey` to be set on the client',
      );
    }
    return this.privateKey;
  }

  /**
   * Build the credentials bundle shared by every signed call. Throws if
   * the client isn't configured with enough to sign anything.
   */
  private requireCreds(
    override: { expiryWindowMs?: number } = {},
  ): SigningCredentials {
    return {
      account: this.requireAddress(),
      privateKey: this.privateKey,
      ledgerPath: this.ledgerPath,
      agentWallet: this.agentWallet,
      expiryWindowMs: override.expiryWindowMs,
    };
  }

  /**
   * Merge caller-provided order fields with the globally configured builder
   * code (if any). Explicit `builder_code` in fields always wins. Undefined
   * values are stripped so they don't end up in the signed canonical JSON.
   * Only applied for ops in {@link ORDER_OPS_WITH_BUILDER_CODE}.
   */
  private buildOrderPayload(
    opType: string,
    fields: Record<string, unknown>,
  ): Record<string, unknown> {
    const withBuilder: Record<string, unknown> = { ...fields };
    if (
      ORDER_OPS_WITH_BUILDER_CODE.has(opType) &&
      withBuilder.builder_code === undefined &&
      this.builderCode
    ) {
      withBuilder.builder_code = this.builderCode;
    }
    return pruneUndefined(withBuilder);
  }

  private buildUrl(
    path: string,
    query?: Record<string, string | number>,
  ): string {
    const url = new URL(this.restBase + path);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private async getJson<T>(
    path: string,
    query?: Record<string, string | number>,
  ): Promise<T> {
    const url = this.buildUrl(path, query);
    const response = await this.fetchImpl(url, { method: 'GET' });
    return handleResponse<T>(response);
  }

  /**
   * Sign + POST pipeline shared by every mutating endpoint.
   *
   * 1. Ensure credentials (privateKey OR ledgerPath) are configured.
   * 2. Build a fresh header for `opType` and sign `{...header, data: payload}`
   *    via software or hardware signer depending on the client config.
   * 3. Build the HTTP body by flattening — account/signature/timestamp/expiry_window
   *    at top level (plus optional agent_wallet), then the original payload
   *    fields. The `data` wrapper is ONLY used during signing, never in the
   *    wire body.
   * 4. POST with JSON content-type and unwrap the standard response envelope.
   */
  private async signedPost<T>(
    opType: string,
    path: string,
    payload: Record<string, unknown>,
    opts: { expiryWindowMs?: number } = {},
  ): Promise<T> {
    const creds = this.requireCreds({ expiryWindowMs: opts.expiryWindowMs });
    const signed = await signPayload(opType, payload, creds);
    const requestHeader = buildSignedRequestHeader(creds, signed);

    const body = {
      ...requestHeader,
      ...payload,
    };

    const response = await this.fetchImpl(this.buildUrl(path), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    return handleResponse<T>(response);
  }
}
