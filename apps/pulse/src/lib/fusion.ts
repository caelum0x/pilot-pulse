/**
 * Fusion signal engine.
 *
 * Produces `FusionSignal`s by cross-referencing recent whale events with
 * live orderbook imbalance. The heuristic is deliberately simple for v1:
 *
 *  - For each whale event in the last 5 minutes, look up the current
 *    imbalance for its symbol.
 *  - A LONG whale combined with a bid-skewed book (imbalance >= +0.2)
 *    produces a LONG signal. A SHORT whale combined with an ask-skewed
 *    book (imbalance <= -0.2) produces a SHORT signal.
 *  - Confidence tiers:
 *      HIGH  — |imbalance| >= 0.35 AND sizeUsd >= 500_000
 *      MED   — |imbalance| >= 0.20 AND sizeUsd >= 100_000
 *      LOW   — otherwise (still matches the direction threshold)
 *  - Signals are deduplicated by `${symbol}-${direction}-${confidence}`
 *    within a 2-minute window so the panel doesn't get spammed.
 *
 * Pure function — no side effects, no clocks except the injectable
 * `now`, no randomness. Safe to unit test.
 */
import {
  type FusionSignal,
  type SignalConfidence,
  type WhaleEvent,
  type WhaleSide,
} from './pacifica-bridge-types';

const WHALE_LOOKBACK_MS = 5 * 60 * 1000;
const DEDUPE_WINDOW_MS = 2 * 60 * 1000;
const IMBALANCE_THRESHOLD = 0.2;
const IMBALANCE_HIGH_THRESHOLD = 0.35;
const SIZE_HIGH_USD = 500_000;
const SIZE_MED_USD = 100_000;

function formatUsdShort(n: number): string {
  if (!Number.isFinite(n)) return '$—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

function classifyConfidence(sizeUsd: number, absImbalance: number): SignalConfidence {
  if (absImbalance >= IMBALANCE_HIGH_THRESHOLD && sizeUsd >= SIZE_HIGH_USD) {
    return 'HIGH';
  }
  if (absImbalance >= IMBALANCE_THRESHOLD && sizeUsd >= SIZE_MED_USD) {
    return 'MED';
  }
  return 'LOW';
}

function directionMatchesImbalance(direction: WhaleSide, imbalance: number): boolean {
  if (direction === 'LONG') return imbalance >= IMBALANCE_THRESHOLD;
  return imbalance <= -IMBALANCE_THRESHOLD;
}

function buildHeadline(symbol: string, direction: WhaleSide): string {
  return `${symbol}: ${direction === 'LONG' ? 'Bid-side' : 'Ask-side'} whale ${
    direction === 'LONG' ? 'stacking' : 'unloading'
  }`;
}

function buildDescription(event: WhaleEvent, imbalance: number): string {
  const verb =
    event.eventType === 'OPEN'
      ? 'opened'
      : event.eventType === 'ADD'
      ? 'added to'
      : event.eventType === 'REDUCE'
      ? 'trimmed'
      : 'closed';
  const imbLabel = `${imbalance >= 0 ? '+' : ''}${imbalance.toFixed(2)}`;
  return `Whale ${verb} ${formatUsdShort(event.sizeUsd)} ${event.side} while book imbalance holds ${imbLabel}.`;
}

interface DedupeKey {
  symbol: string;
  direction: WhaleSide;
  confidence: SignalConfidence;
  timestamp: number;
}

function isDuplicate(key: DedupeKey, seen: DedupeKey[]): boolean {
  for (const prior of seen) {
    if (
      prior.symbol === key.symbol &&
      prior.direction === key.direction &&
      prior.confidence === key.confidence &&
      Math.abs(key.timestamp - prior.timestamp) < DEDUPE_WINDOW_MS
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Compute the current list of fusion signals from recent whale activity.
 *
 * The caller owns the whale event ring buffer; this function simply
 * filters, classifies and deduplicates. Returned signals are sorted
 * newest-first.
 */
export function computeFusionSignals(
  recentWhaleEvents: readonly WhaleEvent[],
  recentImbalanceBySymbol: Readonly<Record<string, number>>,
  now: number = Date.now(),
): FusionSignal[] {
  const cutoff = now - WHALE_LOOKBACK_MS;
  const seen: DedupeKey[] = [];
  const signals: FusionSignal[] = [];

  // Walk newest-first so dedupe keeps the freshest signal per key.
  const sorted = [...recentWhaleEvents].sort((a, b) => b.timestamp - a.timestamp);

  for (const event of sorted) {
    if (event.timestamp < cutoff) continue;
    if (event.eventType === 'REDUCE' || event.eventType === 'CLOSE') continue;

    const imbalance = recentImbalanceBySymbol[event.symbol];
    if (imbalance === undefined || Number.isNaN(imbalance)) continue;
    if (!directionMatchesImbalance(event.side, imbalance)) continue;

    const absImbalance = Math.abs(imbalance);
    const confidence = classifyConfidence(event.sizeUsd, absImbalance);

    const key: DedupeKey = {
      symbol: event.symbol,
      direction: event.side,
      confidence,
      timestamp: event.timestamp,
    };
    if (isDuplicate(key, seen)) continue;
    seen.push(key);

    signals.push({
      id: `${event.id}-fusion`,
      timestamp: event.timestamp,
      symbol: event.symbol,
      direction: event.side,
      confidence,
      headline: buildHeadline(event.symbol, event.side),
      description: buildDescription(event, imbalance),
    });
  }

  return signals;
}

export type { FusionSignal, SignalConfidence, WhaleEvent } from './pacifica-bridge-types';
