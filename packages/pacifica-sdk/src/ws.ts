/**
 * Pacifica WebSocket client.
 *
 * Wraps the `ws` library with:
 *  - Connection lifecycle (connect, auto-reconnect with capped exponential
 *    backoff + jitter, close)
 *  - 30s `{method:"ping"}` keepalive (server closes idle connections at 60s)
 *  - Subscription tracking so every active subscription is replayed after
 *    reconnect
 *  - A small typed EventEmitter (no Node EventEmitter dependency, so apps
 *    that bundle for the browser still work via a `ws` shim)
 *  - Signed trading actions (`createMarketOrderWs`, `createLimitOrderWs`,
 *    `cancelOrderWs`, `cancelAllOrdersWs`) that mirror the REST signing
 *    scheme but push the signed envelope over the socket.
 *
 * Events:
 *   'open'       ()
 *   'close'      ()
 *   'error'      (err: Error)
 *   'prices'     (data: unknown)
 *   'orderbook'  (symbol: string, snapshot: unknown)
 *   'trades'     (symbol: string, trade: unknown)
 *   'bbo'        (symbol: string, bbo: unknown)
 *   'twap'       (data: unknown)
 *   'message'    (raw: unknown)  // catch-all for anything we didn't route
 */

import WebSocket from 'ws';

import { PacificaEnv, PACIFICA_URLS } from './env.js';
import { PacificaSigningError } from './errors.js';
import { signMessage } from './signing.js';
import type {
  CreateLimitOrderParams,
  CreateMarketOrderParams,
} from './types.js';

export interface PacificaWsClientOptions {
  env: PacificaEnv;
  /** Override the WS URL (defaults to env mapping). */
  url?: string;
  /** Keepalive interval in ms. Defaults to 30_000. Server idle timeout is 60s. */
  pingIntervalMs?: number;
  /** Initial reconnect backoff in ms. Defaults to 100. */
  reconnectInitialMs?: number;
  /** Max reconnect backoff in ms. Defaults to 30_000. */
  reconnectMaxMs?: number;
  /** Injectable WebSocket constructor for tests. */
  WebSocketImpl?: typeof WebSocket;
  /**
   * Main account public key. Required to send signed trading actions
   * over the WebSocket. Used as the `account` field in the request header.
   */
  address?: string;
  /**
   * Base58-encoded Solana secret key (64 bytes). Signs trading actions
   * over the WS. If `agentWallet` is also set, this is the agent key
   * whose pubkey is reported to the server via `agent_wallet`.
   */
  privateKey?: string;
  /**
   * Optional agent-wallet public key — if set, every signed WS request
   * header carries `agent_wallet` (see `ws/create_market_order_agent_wallet.py`).
   */
  agentWallet?: string;
  /**
   * If set, automatically attached to every order payload (before
   * signing). Matches the REST client's builder code behavior.
   */
  builderCode?: string;
}

export type PacificaWsEventMap = {
  open: [];
  close: [];
  error: [Error];
  prices: [unknown];
  orderbook: [string, unknown];
  trades: [string, unknown];
  bbo: [string, unknown];
  twap: [unknown];
  message: [unknown];
};

type Listener<Args extends unknown[]> = (...args: Args) => void;

interface SubscriptionParams {
  source: string;
  [key: string]: unknown;
}

interface PacificaWsFrame {
  channel?: string;
  source?: string;
  symbol?: string;
  data?: unknown;
  [key: string]: unknown;
}

/**
 * A minimal strongly-typed event emitter. Deliberately not Node's
 * EventEmitter so the module can run in environments where `events` is
 * missing or shimmed (e.g. some edge runtimes).
 */
class TypedEmitter<Events extends Record<string, unknown[]>> {
  private readonly listeners = new Map<
    keyof Events,
    Set<Listener<unknown[]>>
  >();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<unknown[]>);
    return this;
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): this {
    const set = this.listeners.get(event);
    if (set) {
      set.delete(listener as Listener<unknown[]>);
    }
    return this;
  }

  protected emit<K extends keyof Events>(event: K, ...args: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      try {
        (listener as Listener<Events[K]>)(...args);
      } catch {
        // Listener exceptions must not break the dispatch loop.
      }
    }
  }
}

export class PacificaWsClient extends TypedEmitter<PacificaWsEventMap> {
  private readonly url: string;
  private readonly pingIntervalMs: number;
  private readonly reconnectInitialMs: number;
  private readonly reconnectMaxMs: number;
  private readonly WebSocketImpl: typeof WebSocket;

  private readonly address?: string;
  private readonly privateKey?: string;
  private readonly agentWallet?: string;
  private readonly builderCode?: string;

  private ws: WebSocket | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private manuallyClosed = false;

  /**
   * Active subscriptions, keyed by a stable string so we can dedupe and
   * replay them after a reconnect.
   */
  private readonly activeSubscriptions = new Map<string, SubscriptionParams>();

  constructor(opts: PacificaWsClientOptions) {
    super();
    this.url = opts.url ?? PACIFICA_URLS[opts.env].ws;
    this.pingIntervalMs = opts.pingIntervalMs ?? 30_000;
    this.reconnectInitialMs = opts.reconnectInitialMs ?? 100;
    this.reconnectMaxMs = opts.reconnectMaxMs ?? 30_000;
    this.WebSocketImpl = opts.WebSocketImpl ?? WebSocket;
    this.address = opts.address;
    this.privateKey = opts.privateKey;
    this.agentWallet = opts.agentWallet;
    this.builderCode = opts.builderCode;
    this.connect();
  }

  // ============================================================
  // Public subscription API
  // ============================================================

  subscribePrices(): void {
    this.addSubscription({ source: 'prices' });
  }

  subscribeOrderbook(symbol: string, aggLevel = 0): void {
    this.addSubscription({ source: 'orderbook', symbol, agg_level: aggLevel });
  }

  subscribeBbo(symbol: string): void {
    this.addSubscription({ source: 'bbo', symbol });
  }

  subscribeTrades(symbol: string): void {
    this.addSubscription({ source: 'trades', symbol });
  }

  /**
   * Subscribe to TWAP activity for an account. Sends both
   * `account_twap_orders` and `account_twap_order_updates` sources in
   * one call, matching the Python `ws/subscribe_twap.py` example.
   */
  subscribeTwap(account: string): void {
    this.addSubscription({ source: 'account_twap_orders', account });
    this.addSubscription({ source: 'account_twap_order_updates', account });
  }

  // ============================================================
  // Signed trading actions (push signed envelope over the socket)
  // ============================================================

  /**
   * Send a signed `create_market_order` envelope over the WebSocket.
   * Uses the same canonical JSON signing as the REST path — only the
   * transport differs. See `vendor/python-sdk/ws/create_market_order.py`.
   */
  createMarketOrderWs(params: CreateMarketOrderParams): string {
    const payload = this.buildOrderPayload({
      symbol: params.symbol,
      reduce_only: params.reduce_only ?? false,
      amount: params.amount,
      side: params.side,
      slippage_percent: params.slippage_percent,
      client_order_id: params.client_order_id ?? generateClientOrderId(),
      builder_code: params.builder_code,
    });
    return this.sendSignedAction('create_market_order', payload);
  }

  createLimitOrderWs(params: CreateLimitOrderParams): string {
    const payload = this.buildOrderPayload({
      symbol: params.symbol,
      price: params.price,
      reduce_only: params.reduce_only ?? false,
      amount: params.amount,
      side: params.side,
      tif: params.tif,
      client_order_id: params.client_order_id ?? generateClientOrderId(),
      builder_code: params.builder_code,
    });
    return this.sendSignedAction('create_order', payload);
  }

  cancelOrderWs(params: {
    symbol: string;
    order_id?: number;
    client_order_id?: string;
  }): string {
    const payload = pruneUndefined({
      symbol: params.symbol,
      order_id: params.order_id,
      client_order_id: params.client_order_id,
    });
    return this.sendSignedAction('cancel_order', payload);
  }

  cancelAllOrdersWs(params: {
    symbol?: string;
    all_symbols?: boolean;
    exclude_reduce_only?: boolean;
  }): string {
    const payload = pruneUndefined({
      symbol: params.symbol,
      all_symbols: params.all_symbols,
      exclude_reduce_only: params.exclude_reduce_only,
    });
    return this.sendSignedAction('cancel_all_orders', payload);
  }

  /**
   * Unsubscribe from a previously-subscribed channel. `params` should match
   * whatever was passed at subscribe time (at minimum `source`; plus `symbol`
   * for per-symbol channels).
   */
  unsubscribe(params: SubscriptionParams): void {
    const key = this.subscriptionKey(params);
    this.activeSubscriptions.delete(key);
    this.send({ method: 'unsubscribe', params });
  }

  /** Close the socket and stop reconnecting. */
  close(): void {
    this.manuallyClosed = true;
    this.clearTimers();
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore — we're tearing down.
      }
      this.ws = null;
    }
  }

  // ============================================================
  // Internal connection management
  // ============================================================

  private connect(): void {
    if (this.manuallyClosed) return;

    const ws = new this.WebSocketImpl(this.url);
    this.ws = ws;

    ws.on('open', () => {
      this.reconnectAttempts = 0;
      this.startPinging();
      this.replaySubscriptions();
      this.emit('open');
    });

    ws.on('message', (raw: WebSocket.RawData) => {
      this.handleRawMessage(raw);
    });

    ws.on('error', (err: Error) => {
      this.emit('error', err);
    });

    ws.on('close', () => {
      this.clearTimers();
      this.ws = null;
      this.emit('close');
      if (!this.manuallyClosed) {
        this.scheduleReconnect();
      }
    });
  }

  private scheduleReconnect(): void {
    const attempt = this.reconnectAttempts++;
    const base = Math.min(
      this.reconnectInitialMs * 2 ** attempt,
      this.reconnectMaxMs,
    );
    const jitter = Math.random() * base * 0.2;
    const delay = base + jitter;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private startPinging(): void {
    this.stopPinging();
    this.pingTimer = setInterval(() => {
      this.send({ method: 'ping' });
    }, this.pingIntervalMs);
  }

  private stopPinging(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private clearTimers(): void {
    this.stopPinging();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  // ============================================================
  // Message routing
  // ============================================================

  private handleRawMessage(raw: WebSocket.RawData): void {
    let text: string;
    if (typeof raw === 'string') {
      text = raw;
    } else if (raw instanceof Buffer) {
      text = raw.toString('utf-8');
    } else if (Array.isArray(raw)) {
      text = Buffer.concat(raw).toString('utf-8');
    } else {
      text = Buffer.from(raw as ArrayBuffer).toString('utf-8');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return;
    }

    this.emit('message', parsed);
    this.routeFrame(parsed);
  }

  private routeFrame(frame: unknown): void {
    if (!frame || typeof frame !== 'object') return;
    const f = frame as PacificaWsFrame;

    // Pong replies — ignore, they just keep the connection alive.
    if (f.channel === 'pong') return;

    // Server tags pushes with either `channel` or `source` depending on feed;
    // we normalize by taking whichever is present.
    const channel = (f.channel ?? f.source) as string | undefined;
    if (!channel) return;

    switch (channel) {
      case 'prices':
        this.emit('prices', f.data ?? f);
        return;
      case 'orderbook':
        if (typeof f.symbol === 'string') {
          this.emit('orderbook', f.symbol, f.data ?? f);
        }
        return;
      case 'trades':
        if (typeof f.symbol === 'string') {
          this.emit('trades', f.symbol, f.data ?? f);
        }
        return;
      case 'bbo':
        if (typeof f.symbol === 'string') {
          this.emit('bbo', f.symbol, f.data ?? f);
        }
        return;
      case 'account_twap_orders':
      case 'account_twap_order_updates':
        this.emit('twap', f.data ?? f);
        return;
      default:
        // Unknown channel — already emitted as generic 'message'.
        return;
    }
  }

  // ============================================================
  // Subscription bookkeeping
  // ============================================================

  private addSubscription(params: SubscriptionParams): void {
    const key = this.subscriptionKey(params);
    this.activeSubscriptions.set(key, params);
    this.send({ method: 'subscribe', params });
  }

  private replaySubscriptions(): void {
    for (const params of this.activeSubscriptions.values()) {
      this.send({ method: 'subscribe', params });
    }
  }

  private subscriptionKey(params: SubscriptionParams): string {
    // Stable key: source + sorted rest of the params.
    const rest = Object.keys(params)
      .filter((k) => k !== 'source')
      .sort()
      .map((k) => `${k}=${String(params[k])}`)
      .join('&');
    return rest ? `${params.source}?${rest}` : params.source;
  }

  private send(obj: unknown): void {
    const ws = this.ws;
    if (!ws || ws.readyState !== this.WebSocketImpl.OPEN) return;
    try {
      ws.send(JSON.stringify(obj));
    } catch (err) {
      this.emit('error', err as Error);
    }
  }

  // ============================================================
  // Signed-action helpers
  // ============================================================

  /**
   * Sign `payload` under operation `opType`, wrap it in the WS
   * envelope (`{id, params: {[opType]: signed}}`), and push it over
   * the socket. Returns the envelope's `id` so callers can correlate
   * responses if they want.
   *
   * Mirrors `vendor/python-sdk/ws/create_market_order.py` and friends.
   */
  private sendSignedAction(
    opType: string,
    payload: Record<string, unknown>,
  ): string {
    if (!this.address) {
      throw new PacificaSigningError(
        'Signed WS actions require `address` to be set on the client',
      );
    }
    if (!this.privateKey) {
      throw new PacificaSigningError(
        'Signed WS actions require `privateKey` to be set on the client',
      );
    }

    const timestamp = Date.now();
    const expiryWindow = 5000;
    const header = {
      type: opType,
      timestamp,
      expiry_window: expiryWindow,
    };
    const { signature } = signMessage(header, payload, this.privateKey);

    const requestHeader: Record<string, unknown> = {
      account: this.address,
      signature,
      timestamp,
      expiry_window: expiryWindow,
    };
    if (this.agentWallet) {
      requestHeader.agent_wallet = this.agentWallet;
    }

    const messageToSend = { ...requestHeader, ...payload };
    const id = generateClientOrderId();
    const wsMessage = {
      id,
      params: { [opType]: messageToSend },
    };
    this.send(wsMessage);
    return id;
  }

  /**
   * Auto-inject the configured builder code into order payloads. Explicit
   * `builder_code` in fields always wins. Undefined values are stripped
   * so they don't end up in the signed canonical JSON.
   */
  private buildOrderPayload(
    fields: Record<string, unknown>,
  ): Record<string, unknown> {
    const withBuilder: Record<string, unknown> = { ...fields };
    if (withBuilder.builder_code === undefined && this.builderCode) {
      withBuilder.builder_code = this.builderCode;
    }
    return pruneUndefined(withBuilder);
  }
}

// ============================================================
// Module-level helpers
// ============================================================

function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}

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
