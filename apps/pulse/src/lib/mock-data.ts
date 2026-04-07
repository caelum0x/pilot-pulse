import type { OrderbookSnapshot } from '@pacifica-hack/sdk';
import type {
  FusionSignal,
  MarketRow,
  SignalConfidence,
  WhaleEvent,
  WhaleEventType,
  WhaleSide,
} from './pacifica-bridge-types';

/**
 * Mock data generators for PacificaPulse v1.
 * Deterministic-ish via a seeded PRNG so charts don't flicker chaotically,
 * but with enough randomness to feel "live" when invoked repeatedly.
 *
 * All functions are pure (except the stream starter which owns intervals).
 */

// ── Seedable PRNG ─────────────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = Math.random;

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(rand() * arr.length)]!;
}

function weighted<T>(entries: readonly [T, number][]): T {
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rand() * total;
  for (const [val, w] of entries) {
    r -= w;
    if (r <= 0) return val;
  }
  return entries[0]![0];
}

// ── Markets ───────────────────────────────────────────────────────────────

const MARKET_SEED: Array<Omit<MarketRow, 'change24h' | 'fundingRate' | 'openInterestUsd'>> = [
  { symbol: 'BTC', price: 91842.5, tickSize: '0.1', maxLeverage: 50 },
  { symbol: 'ETH', price: 3342.18, tickSize: '0.01', maxLeverage: 50 },
  { symbol: 'SOL', price: 182.44, tickSize: '0.01', maxLeverage: 25 },
  { symbol: 'HYPE', price: 28.71, tickSize: '0.001', maxLeverage: 20 },
  { symbol: 'DOGE', price: 0.38421, tickSize: '0.00001', maxLeverage: 20 },
  { symbol: 'AVAX', price: 41.22, tickSize: '0.01', maxLeverage: 20 },
  { symbol: 'SUI', price: 4.512, tickSize: '0.001', maxLeverage: 20 },
  { symbol: 'LINK', price: 22.18, tickSize: '0.01', maxLeverage: 20 },
  { symbol: 'ARB', price: 0.8235, tickSize: '0.0001', maxLeverage: 20 },
  { symbol: 'BONK', price: 0.0000285, tickSize: '0.0000001', maxLeverage: 10 },
];

export function generateMockMarkets(): MarketRow[] {
  const seed = Math.floor(Date.now() / 60000); // drift once a minute
  const prng = mulberry32(seed);
  return MARKET_SEED.map((m) => {
    const change24h = (prng() - 0.45) * 12; // -5.4 .. +6.6
    const fundingRate = (prng() - 0.5) * 0.04; // -0.02% .. +0.02%
    const oiScale = prng() * 0.8 + 0.4;
    const openInterestUsd = m.price * 100_000 * oiScale;
    // Jitter the price so numbers look alive on each re-render
    const jitter = 1 + (rand() - 0.5) * 0.0015;
    return {
      ...m,
      price: m.price * jitter,
      change24h,
      fundingRate,
      openInterestUsd,
    };
  });
}

export function getMarketBaseBySymbol(symbol: string): number {
  return MARKET_SEED.find((m) => m.symbol === symbol)?.price ?? 100;
}

export function getTickSizeBySymbol(symbol: string): string {
  return MARKET_SEED.find((m) => m.symbol === symbol)?.tickSize ?? '0.01';
}

// ── Whale events ──────────────────────────────────────────────────────────

const FAKE_ADDRS = [
  '0x8f3a2b1cde4567890abcdef1234567890abcd4c1b',
  '0x1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d',
  '0xdeadbeefcafe0123456789abcdef0123456789ab',
  '0x9876543210fedcba9876543210fedcba98765432',
  '0xabad1deaabad1deaabad1deaabad1deaabad1dea',
  '0xfeedfacefeedfacefeedfacefeedfacefeedface',
  '0xbaadf00dbaadf00dbaadf00dbaadf00dbaadf00d',
];

function uid(): string {
  return `${Date.now().toString(36)}-${Math.floor(rand() * 1e9).toString(36)}`;
}

export function generateMockWhaleEvent(): WhaleEvent {
  const market = pick(MARKET_SEED);
  const side: WhaleSide = rand() > 0.48 ? 'LONG' : 'SHORT';
  const eventType: WhaleEventType = weighted<WhaleEventType>([
    ['OPEN', 5],
    ['ADD', 3],
    ['REDUCE', 2],
    ['CLOSE', 2],
  ]);
  // Log-uniform size 100k .. 8M
  const sizeUsd = Math.exp(Math.log(100_000) + rand() * Math.log(80));
  const price = market.price * (1 + (rand() - 0.5) * 0.003);
  return {
    id: uid(),
    timestamp: Date.now(),
    symbol: market.symbol,
    side,
    sizeUsd,
    eventType,
    address: pick(FAKE_ADDRS),
    entryPrice: price.toFixed(8),
  };
}

export function generateInitialWhaleEvents(count = 12): WhaleEvent[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const ev = generateMockWhaleEvent();
    return { ...ev, timestamp: now - (i + 1) * (15_000 + rand() * 45_000) };
  });
}

// ── Orderbook ─────────────────────────────────────────────────────────────

export function generateMockOrderbook(symbol: string): OrderbookSnapshot {
  const mid = getMarketBaseBySymbol(symbol) * (1 + (rand() - 0.5) * 0.0015);
  const tick = parseFloat(getTickSizeBySymbol(symbol)) || mid * 0.00005;
  const spread = tick * (2 + Math.floor(rand() * 4));

  // Bias depth randomly so the imbalance ratio swings
  const bidBias = 0.8 + rand() * 0.6; // 0.8 .. 1.4
  const askBias = 0.8 + rand() * 0.6;

  const bids = Array.from({ length: 10 }, (_, i) => {
    const price = mid - spread / 2 - tick * i * (1 + rand() * 0.3);
    const size = (0.5 + rand() * 3.5) * bidBias * (1 - i * 0.05);
    return { price: price.toFixed(8), size: size.toFixed(4) };
  });

  const asks = Array.from({ length: 10 }, (_, i) => {
    const price = mid + spread / 2 + tick * i * (1 + rand() * 0.3);
    const size = (0.5 + rand() * 3.5) * askBias * (1 - i * 0.05);
    return { price: price.toFixed(8), size: size.toFixed(4) };
  });

  return {
    symbol,
    bids,
    asks,
    timestamp: Date.now(),
  };
}

/** Pre-computed imbalance for an orderbook snapshot. */
export function computeImbalance(ob: OrderbookSnapshot): {
  bidDepth: number;
  askDepth: number;
  imbalance: number;
  spreadBps: number;
  midPrice: number;
} {
  const bidDepth = ob.bids.reduce((s, l) => s + parseFloat(l.size), 0);
  const askDepth = ob.asks.reduce((s, l) => s + parseFloat(l.size), 0);
  const denom = bidDepth + askDepth;
  const imbalance = denom > 0 ? (bidDepth - askDepth) / denom : 0;
  const bestBid = ob.bids[0] ? parseFloat(ob.bids[0].price) : 0;
  const bestAsk = ob.asks[0] ? parseFloat(ob.asks[0].price) : 0;
  const midPrice = bestBid && bestAsk ? (bestBid + bestAsk) / 2 : 0;
  const spreadBps = midPrice > 0 ? ((bestAsk - bestBid) / midPrice) * 10_000 : 0;
  return { bidDepth, askDepth, imbalance, spreadBps, midPrice };
}

// ── Fusion signals ────────────────────────────────────────────────────────

const SIGNAL_TEMPLATES: Array<(sym: string, dir: WhaleSide, usd: number, imb: number) => {
  headline: string;
  description: string;
}> = [
  (sym, dir, usd, imb) => ({
    headline: `${sym}: High-conviction ${dir}`,
    description: `Whale ${dir === 'LONG' ? 'opened' : 'shorted'} ${formatUsdShort(usd)} + ${
      imb > 0 ? 'bid' : 'ask'
    } imbalance ${imb.toFixed(2)} sustained 6m`,
  }),
  (sym, dir, usd) => ({
    headline: `${sym}: Momentum ${dir === 'LONG' ? 'buildup' : 'breakdown'}`,
    description: `3 whales stacked ${dir} totalling ${formatUsdShort(usd)} in 4-minute window`,
  }),
  (sym, dir, _usd, imb) => ({
    headline: `${sym}: Orderbook drift ${dir === 'LONG' ? 'bullish' : 'bearish'}`,
    description: `Imbalance ${imb >= 0 ? '+' : ''}${imb.toFixed(
      2,
    )} persisted 3m with rising funding`,
  }),
  (sym, dir, usd) => ({
    headline: `${sym}: Liquidation hunt likely`,
    description: `Large ${dir} ${formatUsdShort(usd)} near a known liquidation cluster`,
  }),
];

function formatUsdShort(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function generateMockFusionSignal(): FusionSignal {
  const market = pick(MARKET_SEED);
  const direction: WhaleSide = rand() > 0.5 ? 'LONG' : 'SHORT';
  const usd = Math.exp(Math.log(300_000) + rand() * Math.log(30));
  const imb = (rand() - 0.5) * 1.4; // -0.7 .. +0.7
  const confidence: SignalConfidence = weighted<SignalConfidence>([
    ['HIGH', 2],
    ['MED', 3],
    ['LOW', 2],
  ]);
  const tpl = pick(SIGNAL_TEMPLATES)(market.symbol, direction, usd, imb);
  return {
    id: uid(),
    timestamp: Date.now(),
    symbol: market.symbol,
    direction,
    confidence,
    ...tpl,
  };
}

export function generateInitialFusionSignals(count = 6): FusionSignal[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => {
    const sig = generateMockFusionSignal();
    return { ...sig, timestamp: now - (i + 1) * (45_000 + rand() * 90_000) };
  });
}

// ── Stream orchestrator ───────────────────────────────────────────────────

export interface MockStreamHandlers {
  onWhaleEvent?: (ev: WhaleEvent) => void;
  onOrderbook?: (ob: OrderbookSnapshot) => void;
  onFusionSignal?: (sig: FusionSignal) => void;
  onMarkets?: (rows: MarketRow[]) => void;
  getFocusedSymbol?: () => string;
}

/**
 * Start a mock data stream. Returns a cleanup function that clears
 * all intervals. Intended for use inside a React effect.
 */
export function startMockStream(handlers: MockStreamHandlers): () => void {
  const {
    onWhaleEvent,
    onOrderbook,
    onFusionSignal,
    onMarkets,
    getFocusedSymbol = () => 'BTC',
  } = handlers;

  const whaleTimer = setInterval(() => {
    onWhaleEvent?.(generateMockWhaleEvent());
  }, 3500);

  const orderbookTimer = setInterval(() => {
    onOrderbook?.(generateMockOrderbook(getFocusedSymbol()));
  }, 900);

  const signalTimer = setInterval(() => {
    // Signals are rarer
    if (rand() < 0.4) onFusionSignal?.(generateMockFusionSignal());
  }, 8000);

  const marketsTimer = setInterval(() => {
    onMarkets?.(generateMockMarkets());
  }, 2000);

  // Seed an immediate tick so the UI doesn't wait for the first interval
  onOrderbook?.(generateMockOrderbook(getFocusedSymbol()));
  onMarkets?.(generateMockMarkets());

  return () => {
    clearInterval(whaleTimer);
    clearInterval(orderbookTimer);
    clearInterval(signalTimer);
    clearInterval(marketsTimer);
  };
}
