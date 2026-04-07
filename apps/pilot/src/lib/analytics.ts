/**
 * Performance analytics computed from webhook event history.
 * Inspired by global-intel's temporal-baseline scoring — adapted
 * for trade performance analysis.
 *
 * All functions are pure.
 */

import type { WebhookEvent } from './types';

export interface PerformanceMetrics {
  totalTrades: number;
  successCount: number;
  failedCount: number;
  rejectedCount: number;
  successRate: number;
  totalVolumeUsd: number;
  avgExecTimeMs: number;
  fastestExecMs: number;
  slowestExecMs: number;
  /** Distinct symbols traded. */
  symbolCount: number;
  /** Trades per symbol breakdown. */
  bySymbol: Record<string, { count: number; volumeUsd: number }>;
  /** Trades per strategy breakdown. */
  byStrategy: Record<string, { count: number; successRate: number }>;
  /** Hourly trade distribution (0-23). */
  hourlyDistribution: number[];
  /** Recent trade velocity — trades in last 5 minutes. */
  recentVelocity: number;
}

export function computePerformance(events: readonly WebhookEvent[]): PerformanceMetrics {
  const totalTrades = events.length;
  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      successCount: 0,
      failedCount: 0,
      rejectedCount: 0,
      successRate: 0,
      totalVolumeUsd: 0,
      avgExecTimeMs: 0,
      fastestExecMs: 0,
      slowestExecMs: 0,
      symbolCount: 0,
      bySymbol: {},
      byStrategy: {},
      hourlyDistribution: Array(24).fill(0) as number[],
      recentVelocity: 0,
    };
  }

  let successCount = 0;
  let failedCount = 0;
  let rejectedCount = 0;
  let totalVolumeUsd = 0;
  let totalExecMs = 0;
  let fastestExecMs = Infinity;
  let slowestExecMs = 0;

  const symbols = new Set<string>();
  const bySymbol: Record<string, { count: number; volumeUsd: number }> = {};
  const strategySuccess: Record<string, { total: number; success: number }> = {};
  const hourly: number[] = Array(24).fill(0) as number[];

  const fiveMinAgo = Date.now() - 5 * 60_000;
  let recentVelocity = 0;

  for (const e of events) {
    if (e.status === 'success') successCount++;
    else if (e.status === 'failed') failedCount++;
    else rejectedCount++;

    totalVolumeUsd += e.amountUsd;
    totalExecMs += e.execTimeMs;
    if (e.execTimeMs < fastestExecMs) fastestExecMs = e.execTimeMs;
    if (e.execTimeMs > slowestExecMs) slowestExecMs = e.execTimeMs;

    symbols.add(e.symbol);

    const sym = bySymbol[e.symbol];
    if (sym) {
      sym.count++;
      sym.volumeUsd += e.amountUsd;
    } else {
      bySymbol[e.symbol] = { count: 1, volumeUsd: e.amountUsd };
    }

    const strat = strategySuccess[e.strategyId];
    if (strat) {
      strat.total++;
      if (e.status === 'success') strat.success++;
    } else {
      strategySuccess[e.strategyId] = {
        total: 1,
        success: e.status === 'success' ? 1 : 0,
      };
    }

    const hour = new Date(e.receivedAt).getHours();
    hourly[hour]!++;

    if (e.receivedAt >= fiveMinAgo) recentVelocity++;
  }

  const byStrategy: Record<string, { count: number; successRate: number }> = {};
  for (const [id, s] of Object.entries(strategySuccess)) {
    byStrategy[id] = {
      count: s.total,
      successRate: s.total > 0 ? s.success / s.total : 0,
    };
  }

  return {
    totalTrades,
    successCount,
    failedCount,
    rejectedCount,
    successRate: totalTrades > 0 ? successCount / totalTrades : 0,
    totalVolumeUsd,
    avgExecTimeMs: Math.round(totalExecMs / totalTrades),
    fastestExecMs: fastestExecMs === Infinity ? 0 : fastestExecMs,
    slowestExecMs,
    symbolCount: symbols.size,
    bySymbol,
    byStrategy,
    hourlyDistribution: hourly,
    recentVelocity,
  };
}
