/**
 * Pure position-diff engine for the whale watcher.
 *
 * Given the previous and current `getPositions()` snapshots for a single
 * address, emit a list of `WhaleEvent`s describing what changed. The
 * function is deterministic and side-effect-free so it can be unit
 * tested and replayed inside the bridge without touching any sockets.
 *
 * Semantics:
 *  - A symbol that appears for the first time in `next` → OPEN.
 *  - A symbol in both snapshots whose absolute amount grew → ADD.
 *  - A symbol in both snapshots whose absolute amount shrank → REDUCE.
 *  - A symbol present in `prev` but absent in `next`         → CLOSE.
 *  - Unchanged rows are ignored.
 *
 * Whale size is expressed in USD notional and computed from
 * `|amount| * entryPrice` using the position snapshot itself. Consumers
 * can filter by a minimum USD threshold before surfacing events.
 */
import type { Position } from '@pacifica-hack/sdk';
import type { WhaleEvent, WhaleEventType, WhaleSide } from './pacifica-bridge-types';

export interface DiffOptions {
  /** Minimum size in USD below which events are ignored. Defaults to 0. */
  minSizeUsd?: number;
}

function parseAmount(amount: string): number {
  const parsed = Number.parseFloat(amount);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePrice(price: string): number {
  const parsed = Number.parseFloat(price);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function sideToWhaleSide(side: Position['side']): WhaleSide {
  return side === 'bid' ? 'LONG' : 'SHORT';
}

function sizeUsdFrom(position: Position): number {
  return Math.abs(parseAmount(position.amount)) * parsePrice(position.entryPrice);
}

function indexBySymbol(positions: Position[]): Map<string, Position> {
  const out = new Map<string, Position>();
  for (const pos of positions) {
    out.set(pos.symbol, pos);
  }
  return out;
}

function makeEvent(
  address: string,
  position: Position,
  eventType: WhaleEventType,
  sizeUsd: number,
  now: number,
  idx: number,
): WhaleEvent {
  return {
    id: `${address}-${position.symbol}-${eventType}-${now}-${idx}`,
    timestamp: now,
    address,
    symbol: position.symbol,
    side: sideToWhaleSide(position.side),
    eventType,
    sizeUsd,
    entryPrice: position.entryPrice,
  };
}

/**
 * Diff two position snapshots for a single address.
 *
 * When `prev` is `null` (first poll), no events are emitted — we can't
 * distinguish "this is a brand-new position" from "we just started
 * watching", and spamming the feed with every pre-existing position on
 * startup would drown out live activity.
 */
export function diffPositions(
  address: string,
  prev: Position[] | null,
  next: Position[],
  now: number = Date.now(),
  options: DiffOptions = {},
): WhaleEvent[] {
  if (prev === null) return [];
  const { minSizeUsd = 0 } = options;

  const prevBySymbol = indexBySymbol(prev);
  const nextBySymbol = indexBySymbol(next);
  const events: WhaleEvent[] = [];
  let idx = 0;

  // OPEN / ADD / REDUCE
  for (const [symbol, current] of nextBySymbol) {
    const previous = prevBySymbol.get(symbol);
    const currentAbs = Math.abs(parseAmount(current.amount));

    if (!previous) {
      const sizeUsd = sizeUsdFrom(current);
      if (sizeUsd >= minSizeUsd) {
        events.push(makeEvent(address, current, 'OPEN', sizeUsd, now, idx++));
      }
      continue;
    }

    const previousAbs = Math.abs(parseAmount(previous.amount));
    if (currentAbs === previousAbs) continue;

    const delta = Math.abs(currentAbs - previousAbs);
    const deltaSizeUsd = delta * parsePrice(current.entryPrice);
    if (deltaSizeUsd < minSizeUsd) continue;

    const eventType: WhaleEventType = currentAbs > previousAbs ? 'ADD' : 'REDUCE';
    events.push(makeEvent(address, current, eventType, deltaSizeUsd, now, idx++));
  }

  // CLOSE
  for (const [symbol, previous] of prevBySymbol) {
    if (nextBySymbol.has(symbol)) continue;
    const sizeUsd = sizeUsdFrom(previous);
    if (sizeUsd < minSizeUsd) continue;
    events.push(makeEvent(address, previous, 'CLOSE', sizeUsd, now, idx++));
  }

  return events;
}
