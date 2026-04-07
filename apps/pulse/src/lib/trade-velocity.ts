/**
 * Trade velocity computation.
 * Ported from vendor/global-intel/src/services/velocity.ts — adapted
 * for real-time trade flow instead of news clusters.
 *
 * Computes trades-per-second, buy/sell ratio, and volume velocity
 * for the focused symbol over a sliding window.
 */

import type { TradeEvent } from './pacifica-bridge-types';

export type VelocityLevel = 'spike' | 'elevated' | 'normal';
export type FlowBias = 'buy_heavy' | 'sell_heavy' | 'balanced';

export interface TradeVelocityMetrics {
  /** Trades per second over the window. */
  tradesPerSecond: number;
  /** USD volume per second over the window. */
  volumePerSecond: number;
  /** Total USD volume in the window. */
  totalVolume: number;
  /** Buy volume / total volume ratio (0..1). */
  buyRatio: number;
  level: VelocityLevel;
  bias: FlowBias;
  /** Number of trades in the window. */
  tradeCount: number;
}

const WINDOW_MS = 60_000;
const ELEVATED_TPS = 2;
const SPIKE_TPS = 5;
const BIAS_THRESHOLD = 0.6;

export function computeTradeVelocity(
  trades: readonly TradeEvent[],
  symbol: string,
  windowMs: number = WINDOW_MS,
): TradeVelocityMetrics {
  const cutoff = Date.now() - windowMs;
  const recent = trades.filter((t) => t.symbol === symbol && t.timestamp >= cutoff);

  if (recent.length === 0) {
    return {
      tradesPerSecond: 0,
      volumePerSecond: 0,
      totalVolume: 0,
      buyRatio: 0.5,
      level: 'normal',
      bias: 'balanced',
      tradeCount: 0,
    };
  }

  const windowSecs = windowMs / 1000;
  let buyVolume = 0;
  let totalVolume = 0;

  for (const t of recent) {
    const notional = t.price * t.size;
    totalVolume += notional;
    if (t.side === 'bid') buyVolume += notional;
  }

  const tradesPerSecond = Math.round((recent.length / windowSecs) * 10) / 10;
  const volumePerSecond = Math.round(totalVolume / windowSecs);
  const buyRatio = totalVolume > 0 ? buyVolume / totalVolume : 0.5;

  const level: VelocityLevel =
    tradesPerSecond >= SPIKE_TPS ? 'spike' :
    tradesPerSecond >= ELEVATED_TPS ? 'elevated' :
    'normal';

  const bias: FlowBias =
    buyRatio >= BIAS_THRESHOLD ? 'buy_heavy' :
    buyRatio <= (1 - BIAS_THRESHOLD) ? 'sell_heavy' :
    'balanced';

  return {
    tradesPerSecond,
    volumePerSecond,
    totalVolume,
    buyRatio,
    level,
    bias,
    tradeCount: recent.length,
  };
}
