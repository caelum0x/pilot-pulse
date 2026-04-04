/**
 * Backend-agnostic Pacifica broker interface.
 *
 * The executor, manager loop, and API routes talk to Pacifica exclusively
 * through this interface. Two concrete implementations live here:
 *
 *   - {@link LivePacificaBroker} wraps the real `PacificaClient` from
 *     `@pacifica-hack/sdk`. Every signed call carries the configured
 *     builder code automatically.
 *   - {@link MockPacificaBroker} wraps `mock-backend.ts` so the demo works
 *     offline without testnet credentials.
 *
 * Both return the same normalized shapes so upstream code never has to
 * branch on live vs mock.
 */

import type { PacificaClient, Position, Side } from '@pacifica-hack/sdk';
import { getMockBackend } from './mock-backend';
import type { MockPosition } from './types';

// ============================================================
// Broker contract
// ============================================================

/** Normalized position shape used by the pilot (direction + base-currency size). */
export interface BrokerPosition {
  symbol: string;
  side: 'LONG' | 'SHORT';
  /** Absolute base-asset size. Never negative. */
  amount: number;
  entryPrice: number;
  margin: number;
  isolated: boolean;
  /** Milliseconds since epoch. */
  createdAt: number;
}

export interface BrokerMarketOrderParams {
  symbol: string;
  side: 'LONG' | 'SHORT';
  /** USD notional to trade. We divide by the mark price to get base amount. */
  amountUsd: number;
  /** Slippage tolerance in percent, e.g. 0.5 = 0.5%. */
  slippagePct: number;
  reduceOnly?: boolean;
  clientOrderId?: string;
}

export interface BrokerOrderResult {
  orderId: number | string;
  /** Approximate fill price — mark at submit time. The exchange response
   *  does not return a fill price for market orders. */
  filledAtPrice: number;
  /** Base-asset amount filled. */
  amount: number;
  /** Estimated fee in USD. Placeholder — refine once the API returns real fees. */
  feeUsd: number;
  execTimeMs: number;
}

export interface PacificaBroker {
  /** Fetch open positions for the configured account. */
  getPositions(): Promise<BrokerPosition[]>;
  /** Current mark price for a symbol, in USD. */
  getMarkPrice(symbol: string): Promise<number>;
  /** Place a market order. Builder code is auto-injected by the underlying client. */
  createMarketOrder(params: BrokerMarketOrderParams): Promise<BrokerOrderResult>;
  /**
   * Helper: close some or all of an open position with a reduce-only market order.
   * `sizePct` defaults to 1.0 (full close). Throws if no matching position.
   */
  closePosition(symbol: string, sizePct?: number): Promise<BrokerOrderResult>;
  /** Cancel all open orders for a symbol (or every symbol when omitted). */
  cancelAllOrders(symbol?: string): Promise<void>;
  /** Free collateral available, in USD. */
  getAccountBalance(): Promise<number>;
}

// ============================================================
// Shared helpers
// ============================================================

/** Estimated taker fee as a fraction of notional. Placeholder — ~5 bps. */
const ESTIMATED_TAKER_FEE_FRAC = 0.0005;

const MIN_BASE_AMOUNT = 1e-8;

function sideToSdk(side: 'LONG' | 'SHORT'): Side {
  return side === 'LONG' ? 'bid' : 'ask';
}

function sdkSideToBroker(side: Side): 'LONG' | 'SHORT' {
  return side === 'bid' ? 'LONG' : 'SHORT';
}

function parseFloatOr(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseTimestamp(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const asNum = Number(value);
    if (Number.isFinite(asNum)) return asNum;
    const asDate = Date.parse(value);
    if (Number.isFinite(asDate)) return asDate;
  }
  return Date.now();
}

function roundBaseAmount(amount: number): number {
  // Pacifica tick sizes vary per symbol; the real solution is to fetch
  // /markets/info and quantize. For the hackathon we round to 8 decimals
  // which is finer than any perp tick size in practice.
  return Math.max(0, Math.round(amount * 1e8) / 1e8);
}

// ============================================================
// Live broker (real PacificaClient)
// ============================================================

interface PriceRecord {
  symbol: string;
  mark: number;
}

/**
 * Live broker backed by the real Pacifica REST API via `@pacifica-hack/sdk`.
 *
 * - Positions and orders go through the configured `PacificaClient`.
 * - Builder code is auto-injected by the client constructor (see
 *   `packages/pacifica-sdk/src/rest.ts` → `buildOrderPayload`).
 * - Prices are fetched from `/markets/prices` and cached for 2 s to avoid
 *   hammering the endpoint during tight manager-loop ticks.
 */
export class LivePacificaBroker implements PacificaBroker {
  private readonly client: PacificaClient;
  private priceCache: {
    fetchedAt: number;
    byMarket: Map<string, number>;
  } | null = null;
  private static readonly PRICE_TTL_MS = 2_000;

  constructor(client: PacificaClient) {
    this.client = client;
  }

  async getPositions(): Promise<BrokerPosition[]> {
    const raw = await this.client.getPositions();
    return raw.map((p) => this.mapPosition(p));
  }

  async getMarkPrice(symbol: string): Promise<number> {
    const sym = symbol.toUpperCase();
    const prices = await this.loadPrices();
    const mark = prices.get(sym);
    if (mark === undefined) {
      throw new Error(`no mark price available for symbol ${sym}`);
    }
    return mark;
  }

  async createMarketOrder(
    params: BrokerMarketOrderParams,
  ): Promise<BrokerOrderResult> {
    const symbol = params.symbol.toUpperCase();
    const markPrice = await this.getMarkPrice(symbol);
    if (markPrice <= 0) {
      throw new Error(`invalid mark price (${markPrice}) for ${symbol}`);
    }

    const baseAmount = roundBaseAmount(params.amountUsd / markPrice);
    if (baseAmount < MIN_BASE_AMOUNT) {
      throw new Error(
        `computed base amount too small: amountUsd=${params.amountUsd}, markPrice=${markPrice}`,
      );
    }

    const started = Date.now();
    const response = await this.client.createMarketOrder({
      symbol,
      side: sideToSdk(params.side),
      amount: String(baseAmount),
      slippage_percent: String(params.slippagePct),
      reduce_only: params.reduceOnly === true,
      ...(params.clientOrderId ? { client_order_id: params.clientOrderId } : {}),
      // builder_code is auto-attached by the SDK client.
    });
    const execTimeMs = Date.now() - started;

    // The REST API does not return a fill price for market orders — use the
    // mark at submit time as an approximation. Good enough for accounting;
    // the manager loop relies on live mark prices anyway.
    return {
      orderId: response.orderId,
      filledAtPrice: markPrice,
      amount: baseAmount,
      feeUsd: params.amountUsd * ESTIMATED_TAKER_FEE_FRAC,
      execTimeMs,
    };
  }

  async closePosition(
    symbol: string,
    sizePct: number = 1.0,
  ): Promise<BrokerOrderResult> {
    const sym = symbol.toUpperCase();
    const positions = await this.getPositions();
    const current = positions.find((p) => p.symbol === sym);
    if (!current) {
      throw new Error(`no open position to close for ${sym}`);
    }
    const clampedPct = Math.max(0, Math.min(1, sizePct));
    const closeAmount = current.amount * clampedPct;
    if (closeAmount < MIN_BASE_AMOUNT) {
      throw new Error(
        `close size too small: currentAmount=${current.amount}, sizePct=${clampedPct}`,
      );
    }
    const oppositeSide: 'LONG' | 'SHORT' =
      current.side === 'LONG' ? 'SHORT' : 'LONG';
    const notionalUsd = closeAmount * current.entryPrice;

    return this.createMarketOrder({
      symbol: sym,
      side: oppositeSide,
      amountUsd: notionalUsd,
      slippagePct: 0.5,
      reduceOnly: true,
    });
  }

  async cancelAllOrders(symbol?: string): Promise<void> {
    if (symbol) {
      await this.client.cancelAllOrders({ symbol: symbol.toUpperCase() });
      return;
    }
    await this.client.cancelAllOrders({ all_symbols: true });
  }

  async getAccountBalance(): Promise<number> {
    const info = await this.client.getAccountInfo();
    return parseFloatOr(info.balance, 0);
  }

  // ----------------------------------------------------------

  /**
   * Map the SDK `Position` shape (strings, snake_case on the wire) into the
   * broker's normalized numeric form. Defensive to both the declared
   * camelCase interface and raw snake_case JSON from the API.
   */
  private mapPosition(p: Position): BrokerPosition {
    const raw = p as unknown as Record<string, unknown>;
    const entryPrice = parseFloatOr(
      raw.entryPrice ?? raw.entry_price,
      0,
    );
    const amount = Math.abs(parseFloatOr(raw.amount, 0));
    const margin = parseFloatOr(raw.margin, 0);
    const isolated =
      typeof raw.isolated === 'boolean' ? raw.isolated : false;
    const createdAt = parseTimestamp(raw.createdAt ?? raw.created_at);
    const side = raw.side === 'bid' ? 'bid' : 'ask';
    return {
      symbol: String(raw.symbol ?? '').toUpperCase(),
      side: sdkSideToBroker(side),
      amount,
      entryPrice,
      margin,
      isolated,
      createdAt,
    };
  }

  private async loadPrices(): Promise<Map<string, number>> {
    const now = Date.now();
    if (
      this.priceCache &&
      now - this.priceCache.fetchedAt < LivePacificaBroker.PRICE_TTL_MS
    ) {
      return this.priceCache.byMarket;
    }
    const raw = await this.client.getPrices();
    const parsed = this.parsePricesResponse(raw);
    this.priceCache = { fetchedAt: now, byMarket: parsed };
    return parsed;
  }

  private parsePricesResponse(raw: unknown): Map<string, number> {
    const out = new Map<string, number>();
    const records = this.extractPriceRecords(raw);
    for (const rec of records) {
      out.set(rec.symbol.toUpperCase(), rec.mark);
    }
    return out;
  }

  private extractPriceRecords(raw: unknown): PriceRecord[] {
    if (!Array.isArray(raw)) return [];
    const records: PriceRecord[] = [];
    for (const entry of raw) {
      if (typeof entry !== 'object' || entry === null) continue;
      const obj = entry as Record<string, unknown>;
      const symbol =
        typeof obj.symbol === 'string'
          ? obj.symbol
          : typeof obj.market === 'string'
            ? obj.market
            : undefined;
      if (!symbol) continue;
      const mark = parseFloatOr(
        obj.mark ?? obj.mark_price ?? obj.oracle ?? obj.mid ?? obj.price,
        Number.NaN,
      );
      if (!Number.isFinite(mark) || mark <= 0) continue;
      records.push({ symbol, mark });
    }
    return records;
  }
}

// ============================================================
// Mock broker (random-walk in-process simulator)
// ============================================================

/**
 * Mock broker for offline demos and tests. Wraps the existing
 * `mock-backend.ts` random-walk exchange so the pilot keeps working
 * without testnet credentials.
 */
export class MockPacificaBroker implements PacificaBroker {
  async getPositions(): Promise<BrokerPosition[]> {
    const mock = getMockBackend();
    return mock.getPositions().map(mockPositionToBroker);
  }

  async getMarkPrice(symbol: string): Promise<number> {
    const mock = getMockBackend();
    return mock.getPrice(symbol);
  }

  async createMarketOrder(
    params: BrokerMarketOrderParams,
  ): Promise<BrokerOrderResult> {
    const mock = getMockBackend();
    const symbol = params.symbol.toUpperCase();
    const markPrice = mock.getPrice(symbol);
    if (markPrice <= 0) {
      throw new Error(`invalid mock mark price for ${symbol}`);
    }
    const baseAmount = roundBaseAmount(params.amountUsd / markPrice);
    if (baseAmount < MIN_BASE_AMOUNT) {
      throw new Error('computed base amount too small for mock order');
    }
    const started = Date.now();
    const fill = mock.createMarketOrder({
      symbol,
      side: sideToSdk(params.side),
      amount: String(baseAmount),
      slippage_percent: String(params.slippagePct),
      reduce_only: params.reduceOnly === true,
      ...(params.clientOrderId ? { client_order_id: params.clientOrderId } : {}),
    });
    const execTimeMs = Date.now() - started;
    return {
      orderId: fill.orderId,
      filledAtPrice: fill.filledPrice,
      amount: baseAmount,
      feeUsd: params.amountUsd * ESTIMATED_TAKER_FEE_FRAC,
      execTimeMs,
    };
  }

  async closePosition(
    symbol: string,
    sizePct: number = 1.0,
  ): Promise<BrokerOrderResult> {
    const mock = getMockBackend();
    const sym = symbol.toUpperCase();
    const existing = mock.getPosition(sym);
    if (!existing) {
      throw new Error(`no mock position to close for ${sym}`);
    }
    const clampedPct = Math.max(0, Math.min(1, sizePct));
    const closeAmount = existing.amount * clampedPct;
    if (closeAmount < MIN_BASE_AMOUNT) {
      throw new Error('mock close size too small');
    }
    const oppositeSide: 'LONG' | 'SHORT' =
      existing.side === 'bid' ? 'SHORT' : 'LONG';
    const notionalUsd = closeAmount * existing.entryPrice;
    return this.createMarketOrder({
      symbol: sym,
      side: oppositeSide,
      amountUsd: notionalUsd,
      slippagePct: 0.5,
      reduceOnly: true,
    });
  }

  async cancelAllOrders(_symbol?: string): Promise<void> {
    // Mock backend has no resting limit orders — nothing to cancel. Silent
    // no-op keeps the interface contract honest.
  }

  async getAccountBalance(): Promise<number> {
    // Mock has no balance concept; advertise a fixed demo number so the UI
    // can still show something meaningful.
    return 10_000;
  }
}

function mockPositionToBroker(p: MockPosition): BrokerPosition {
  return {
    symbol: p.symbol.toUpperCase(),
    side: sdkSideToBroker(p.side),
    amount: p.amount,
    entryPrice: p.entryPrice,
    margin: 0,
    isolated: false,
    createdAt: p.createdAt,
  };
}
