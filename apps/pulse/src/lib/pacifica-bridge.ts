/**
 * Live data bridge for PacificaPulse.
 *
 * Wraps the `@pacifica-hack/sdk` REST and WebSocket clients into a
 * single domain-oriented surface that the dashboard hook can consume.
 * Responsibilities:
 *
 *  - Subscribe to the WS `prices`, `orderbook` and `bbo` channels for a
 *    configurable symbol list.
 *  - Poll REST endpoints on an interval: market info + prices every
 *    30s, whale-address positions every `pollIntervalMs`.
 *  - Diff consecutive whale-address position snapshots via the pure
 *    `diffPositions` helper and emit `WhaleEvent`s above a USD floor.
 *  - Forward socket lifecycle to a single `onStatus` callback.
 *
 * Error handling is defensive: every REST poll is wrapped in a
 * try/catch so a single failure never tears down the interval loop,
 * and any WS `error` event is surfaced via `onStatus('error', msg)`
 * rather than thrown. The React hook is free to ignore errors entirely.
 */
import {
  PacificaClient,
  PacificaWsClient,
  type MarketInfo,
  type OrderbookSnapshot,
  type PacificaEnv,
  type Position,
} from '@pacifica-hack/sdk';

import { diffPositions } from './whale-diff';
import type {
  BridgeStatus,
  MarketRow,
  WhaleEvent,
} from './pacifica-bridge-types';

export type {
  BridgeStatus,
  MarketRow,
  WhaleEvent,
} from './pacifica-bridge-types';

// ── Config ────────────────────────────────────────────────────────────────

export interface PacificaBridgeConfig {
  env: PacificaEnv;
  /** Optional account address — not required for public reads. */
  address?: string;
  /** Symbols to subscribe to orderbook/bbo for. */
  focusedSymbols: readonly string[];
  /** Addresses to poll for whale position changes. */
  whaleAddresses: readonly string[];
  /** Whale position poll interval in ms. Defaults to 5000. */
  pollIntervalMs?: number;
  /** Minimum USD size before a whale event is emitted. Defaults to 50k. */
  minWhaleSizeUsd?: number;
  /** Market info refresh interval in ms. Defaults to 30000. */
  marketsRefreshMs?: number;
}

export interface BbosSnapshot {
  bid: string;
  ask: string;
  spread: string;
}

export interface PriceTick {
  mark: string;
  last: string;
  funding: string;
  change24h: string;
  volume24h: string;
  openInterest: string;
}

export interface BridgeCallbacks {
  onMarkets?: (markets: MarketRow[]) => void;
  onOrderbook?: (symbol: string, snapshot: OrderbookSnapshot) => void;
  onBbo?: (symbol: string, bbo: BbosSnapshot) => void;
  onPrices?: (prices: Record<string, PriceTick>) => void;
  onWhaleEvent?: (event: WhaleEvent) => void;
  onStatus?: (status: BridgeStatus, detail?: string) => void;
}

// ── Narrowing helpers for `unknown` WS payloads ───────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function asLevelArray(value: unknown): { price: string; size: string }[] {
  if (!Array.isArray(value)) return [];
  const out: { price: string; size: string }[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const price = asString(entry.price) ?? asString(entry.p);
    const size = asString(entry.size) ?? asString(entry.s) ?? asString(entry.amount);
    if (price !== undefined && size !== undefined) {
      out.push({ price, size });
    }
  }
  return out;
}

function normalizeOrderbook(symbol: string, raw: unknown): OrderbookSnapshot | null {
  if (!isRecord(raw)) return null;
  const bids = asLevelArray(raw.bids ?? raw.b);
  const asks = asLevelArray(raw.asks ?? raw.a);
  if (bids.length === 0 && asks.length === 0) return null;
  const timestamp = asNumber(raw.timestamp ?? raw.t) ?? Date.now();
  return { symbol, bids, asks, timestamp };
}

function normalizeBbo(raw: unknown): BbosSnapshot | null {
  if (!isRecord(raw)) return null;
  const bid = asString(raw.bid) ?? asString(raw.b);
  const ask = asString(raw.ask) ?? asString(raw.a);
  if (bid === undefined || ask === undefined) return null;
  const bidNum = Number.parseFloat(bid);
  const askNum = Number.parseFloat(ask);
  const spreadVal = Number.isFinite(bidNum) && Number.isFinite(askNum) ? askNum - bidNum : 0;
  return { bid, ask, spread: spreadVal.toFixed(8) };
}

function normalizePrices(raw: unknown): Record<string, PriceTick> {
  const out: Record<string, PriceTick> = {};
  const list = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.data) ? raw.data : [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const symbol = asString(entry.symbol);
    if (!symbol) continue;
    out[symbol] = {
      mark: asString(entry.mark) ?? asString(entry.mark_price) ?? '0',
      last: asString(entry.last) ?? asString(entry.last_price) ?? '0',
      funding: asString(entry.funding) ?? asString(entry.funding_rate) ?? '0',
      change24h:
        asString(entry.change24h) ??
        asString(entry.price_change_24h) ??
        asString(entry.change) ??
        '0',
      volume24h: asString(entry.volume24h) ?? asString(entry.volume_24h) ?? '0',
      openInterest: asString(entry.open_interest) ?? asString(entry.oi) ?? '0',
    };
  }
  return out;
}

// ── MarketInfo + prices → MarketRow join ──────────────────────────────────

function buildMarketRows(
  markets: readonly MarketInfo[],
  prices: Readonly<Record<string, PriceTick>>,
): MarketRow[] {
  return markets.map((info) => {
    const tick = prices[info.symbol];
    const priceNum = tick ? Number.parseFloat(tick.mark) : 0;
    const change24hNum = tick ? Number.parseFloat(tick.change24h) : 0;
    const fundingFromTick = tick ? Number.parseFloat(tick.funding) : NaN;
    const fundingNum = Number.isFinite(fundingFromTick)
      ? fundingFromTick
      : Number.parseFloat(info.fundingRate);
    const oiNum = tick ? Number.parseFloat(tick.openInterest) : 0;

    return {
      symbol: info.symbol,
      price: Number.isFinite(priceNum) ? priceNum : 0,
      change24h: Number.isFinite(change24hNum) ? change24hNum : 0,
      fundingRate: Number.isFinite(fundingNum) ? fundingNum : 0,
      openInterestUsd: Number.isFinite(oiNum) ? oiNum : 0,
      tickSize: info.tickSize,
      maxLeverage: info.maxLeverage,
    };
  });
}

// ── Bridge class ──────────────────────────────────────────────────────────

const DEFAULT_POLL_INTERVAL_MS = 5_000;
const DEFAULT_MARKETS_REFRESH_MS = 30_000;
const DEFAULT_MIN_WHALE_SIZE_USD = 50_000;

export class PacificaBridge {
  private readonly config: Required<
    Omit<PacificaBridgeConfig, 'address'>
  > & { address?: string };
  private readonly callbacks: BridgeCallbacks;

  private ws: PacificaWsClient | null = null;
  private restClient: PacificaClient;
  private whalePositionSnapshots = new Map<string, Position[]>();
  private latestPrices: Record<string, PriceTick> = {};
  private latestMarkets: MarketInfo[] = [];

  private marketsTimer: ReturnType<typeof setInterval> | null = null;
  private whaleTimer: ReturnType<typeof setInterval> | null = null;
  private started = false;

  constructor(config: PacificaBridgeConfig, callbacks: BridgeCallbacks = {}) {
    this.config = {
      env: config.env,
      address: config.address,
      focusedSymbols: config.focusedSymbols,
      whaleAddresses: config.whaleAddresses,
      pollIntervalMs: config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
      minWhaleSizeUsd: config.minWhaleSizeUsd ?? DEFAULT_MIN_WHALE_SIZE_USD,
      marketsRefreshMs: config.marketsRefreshMs ?? DEFAULT_MARKETS_REFRESH_MS,
    };
    this.callbacks = callbacks;
    this.restClient = new PacificaClient({
      env: this.config.env,
      address: this.config.address,
    });
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.callbacks.onStatus?.('connecting');
    this.connectWs();
    void this.refreshMarkets();
    this.marketsTimer = setInterval(() => {
      void this.refreshMarkets();
    }, this.config.marketsRefreshMs);
    void this.pollWhales();
    this.whaleTimer = setInterval(() => {
      void this.pollWhales();
    }, this.config.pollIntervalMs);
  }

  stop(): void {
    if (!this.started) return;
    this.started = false;
    if (this.marketsTimer !== null) {
      clearInterval(this.marketsTimer);
      this.marketsTimer = null;
    }
    if (this.whaleTimer !== null) {
      clearInterval(this.whaleTimer);
      this.whaleTimer = null;
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch (err: unknown) {
        this.reportError('ws.close failed', err);
      }
      this.ws = null;
    }
    this.callbacks.onStatus?.('closed');
  }

  /** Update the set of focused symbols and re-subscribe. */
  setFocusedSymbols(symbols: readonly string[]): void {
    const next = [...symbols];
    // Replace via spread to preserve immutability of the original array.
    (this.config as { focusedSymbols: readonly string[] }).focusedSymbols = next;
    if (this.ws) {
      for (const symbol of next) {
        this.safeSubscribeSymbol(symbol);
      }
    }
  }

  // ── WebSocket wiring ────────────────────────────────────────────────────

  private connectWs(): void {
    try {
      const client = new PacificaWsClient({ env: this.config.env });
      this.ws = client;

      client.on('open', () => {
        this.callbacks.onStatus?.('open');
        this.subscribeAll();
      });
      client.on('close', () => {
        this.callbacks.onStatus?.('closed');
      });
      client.on('error', (err: Error) => {
        this.callbacks.onStatus?.('error', err.message);
      });
      client.on('prices', (payload: unknown) => {
        const prices = normalizePrices(payload);
        if (Object.keys(prices).length === 0) return;
        this.latestPrices = { ...this.latestPrices, ...prices };
        this.callbacks.onPrices?.(this.latestPrices);
        // Re-emit markets with the refreshed price data.
        if (this.latestMarkets.length > 0) {
          this.callbacks.onMarkets?.(buildMarketRows(this.latestMarkets, this.latestPrices));
        }
      });
      client.on('orderbook', (symbol: string, snapshot: unknown) => {
        const normalized = normalizeOrderbook(symbol, snapshot);
        if (normalized) {
          this.callbacks.onOrderbook?.(symbol, normalized);
        }
      });
      client.on('bbo', (symbol: string, bboPayload: unknown) => {
        const normalized = normalizeBbo(bboPayload);
        if (normalized) {
          this.callbacks.onBbo?.(symbol, normalized);
        }
      });
    } catch (err: unknown) {
      this.reportError('Failed to construct PacificaWsClient', err);
      this.callbacks.onStatus?.('error', 'ws_construct_failed');
    }
  }

  private subscribeAll(): void {
    if (!this.ws) return;
    try {
      this.ws.subscribePrices();
    } catch (err: unknown) {
      this.reportError('subscribePrices failed', err);
    }
    for (const symbol of this.config.focusedSymbols) {
      this.safeSubscribeSymbol(symbol);
    }
  }

  private safeSubscribeSymbol(symbol: string): void {
    if (!this.ws) return;
    try {
      this.ws.subscribeOrderbook(symbol);
      this.ws.subscribeBbo(symbol);
    } catch (err: unknown) {
      this.reportError(`subscribe(${symbol}) failed`, err);
    }
  }

  // ── REST polling loops ──────────────────────────────────────────────────

  private async refreshMarkets(): Promise<void> {
    try {
      const markets = await this.restClient.getMarketInfo();
      this.latestMarkets = markets;
      // Try to merge with latest prices — if absent, still emit skeleton rows
      // so the UI can render while awaiting the first WS price tick.
      const rows = buildMarketRows(markets, this.latestPrices);
      this.callbacks.onMarkets?.(rows);
    } catch (err: unknown) {
      this.reportError('getMarketInfo failed', err);
    }

    try {
      const pricesRaw = await this.restClient.getPrices();
      const prices = normalizePrices(pricesRaw);
      if (Object.keys(prices).length > 0) {
        this.latestPrices = { ...this.latestPrices, ...prices };
        this.callbacks.onPrices?.(this.latestPrices);
        if (this.latestMarkets.length > 0) {
          this.callbacks.onMarkets?.(
            buildMarketRows(this.latestMarkets, this.latestPrices),
          );
        }
      }
    } catch (err: unknown) {
      this.reportError('getPrices failed', err);
    }
  }

  private async pollWhales(): Promise<void> {
    for (const address of this.config.whaleAddresses) {
      try {
        const readOnlyClient = new PacificaClient({
          env: this.config.env,
          address,
        });
        const positions = await readOnlyClient.getPositions();
        const previous = this.whalePositionSnapshots.get(address) ?? null;
        const events = diffPositions(address, previous, positions, Date.now(), {
          minSizeUsd: this.config.minWhaleSizeUsd,
        });
        for (const event of events) {
          this.callbacks.onWhaleEvent?.(event);
        }
        this.whalePositionSnapshots.set(address, positions);
      } catch (err: unknown) {
        this.reportError(`pollWhales(${address}) failed`, err);
      }
    }
  }

  // ── Error sink ──────────────────────────────────────────────────────────

  private reportError(message: string, err: unknown): void {
    // Browser dashboard: console.error is acceptable because we have no
    // server-side logger, and suppressing errors entirely would mask real
    // SDK regressions during the hackathon demo.
    const detail = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error(`[PacificaBridge] ${message}: ${detail}`);
  }
}
