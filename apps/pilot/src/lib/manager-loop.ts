/**
 * Background TP/SL manager loop.
 *
 * Ticks every {@link POLL_MS}, advancing every active {@link TpSlManager}
 * with the latest mark price and executing any decisions ("close" or
 * "partial close") against the configured {@link PacificaBroker}.
 *
 * Robustness:
 *   - Lazy start via {@link ensureManagerLoop} (idempotent).
 *   - Failures inside a single tick never crash the loop — they are logged
 *     and we fall back to a short pause if failures accumulate.
 *   - Exponential-ish backoff: after 3 consecutive failed ticks we skip
 *     the loop for {@link BACKOFF_MS}, then retry.
 */

import type { Side } from '@pacifica-hack/sdk';
import { getBroker } from './broker-factory';
import {
  isOnCooldown,
  recordSuccess,
  recordFailure,
} from './circuit-breaker';
import type { BrokerPosition, PacificaBroker } from './pacifica-broker';
import { getStore } from './store';
import type { TpSlManager } from './manager';

const POLL_MS = 3_000;
const BACKOFF_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 3;

interface LoopState {
  started: boolean;
  timer: ReturnType<typeof setInterval> | null;
  consecutiveFailures: number;
  skipUntil: number;
}

declare global {
  // eslint-disable-next-line no-var
  var __pilotManagerLoop: LoopState | undefined;
}

function state(): LoopState {
  if (!globalThis.__pilotManagerLoop) {
    globalThis.__pilotManagerLoop = {
      started: false,
      timer: null,
      consecutiveFailures: 0,
      skipUntil: 0,
    };
  }
  return globalThis.__pilotManagerLoop;
}

export function ensureManagerLoop(): void {
  const s = state();
  if (s.started) return;
  s.started = true;
  s.timer = setInterval(() => {
    void tick();
  }, POLL_MS);
  if (s.timer && typeof s.timer === 'object' && 'unref' in s.timer) {
    (s.timer as { unref?: () => void }).unref?.();
  }
}

export function stopManagerLoop(): void {
  const s = state();
  if (s.timer) clearInterval(s.timer);
  s.timer = null;
  s.started = false;
  s.consecutiveFailures = 0;
  s.skipUntil = 0;
}

function sdkSideToBroker(side: Side): 'LONG' | 'SHORT' {
  return side === 'bid' ? 'LONG' : 'SHORT';
}

async function tick(): Promise<void> {
  const s = state();
  const now = Date.now();
  if (now < s.skipUntil) return;

  const store = getStore();
  if (store.managers.size === 0) return;

  const broker = getBroker();

  if (isOnCooldown('broker:positions')) return;

  try {
    const positions = await broker.getPositions();
    recordSuccess('broker:positions');
    const positionsBySymbol = new Map<string, BrokerPosition>();
    for (const p of positions) positionsBySymbol.set(p.symbol, p);

    const priceCache = new Map<string, number>();
    const getPrice = async (symbol: string): Promise<number | undefined> => {
      const cached = priceCache.get(symbol);
      if (cached !== undefined) return cached;
      try {
        const price = await broker.getMarkPrice(symbol);
        priceCache.set(symbol, price);
        return price;
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[manager-loop] price fetch failed for ${symbol}:`, err);
        return undefined;
      }
    };

    for (const [id, manager] of store.managers.entries()) {
      if (manager.isClosed()) {
        store.removeManager(id);
        continue;
      }
      await processManager(manager, id, positionsBySymbol, getPrice, broker);
    }

    s.consecutiveFailures = 0;
  } catch (err) {
    recordFailure('broker:positions', { maxFailures: 5, cooldownMs: 30_000 });
    s.consecutiveFailures += 1;
    // eslint-disable-next-line no-console
    console.error(
      `[manager-loop] tick error (${s.consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}):`,
      err,
    );
    if (s.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      s.skipUntil = now + BACKOFF_MS;
      s.consecutiveFailures = 0;
      // eslint-disable-next-line no-console
      console.error(
        `[manager-loop] too many consecutive failures — pausing until ${new Date(s.skipUntil).toISOString()}`,
      );
    }
  }
}

async function processManager(
  manager: TpSlManager,
  managerId: string,
  positionsBySymbol: Map<string, BrokerPosition>,
  getPrice: (symbol: string) => Promise<number | undefined>,
  broker: PacificaBroker,
): Promise<void> {
  const store = getStore();
  const position = positionsBySymbol.get(manager.symbol);
  if (!position) {
    // Externally closed — drop the manager silently.
    store.removeManager(managerId);
    return;
  }

  // Sanity check: if the position flipped sides (flash exit + re-open) the
  // old manager is stale.
  const expectedBrokerSide = sdkSideToBroker(manager.side);
  if (position.side !== expectedBrokerSide) {
    store.removeManager(managerId);
    return;
  }

  const currentPrice = await getPrice(manager.symbol);
  if (currentPrice === undefined) return;

  const decisions = manager.tick(currentPrice);
  if (decisions.length === 0) return;

  for (const decision of decisions) {
    try {
      if (decision.kind === 'close') {
        await broker.closePosition(manager.symbol);
        manager.markClosed();
        store.removeManager(managerId);
        return;
      }
      if (decision.kind === 'partial') {
        await broker.closePosition(manager.symbol, decision.sizePct);
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(
        `[manager-loop] decision ${decision.kind} failed for ${manager.symbol}:`,
        err,
      );
      // Don't throw — a bad decision shouldn't kill other managers.
    }
  }
}
