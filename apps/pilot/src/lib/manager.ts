import type { Side } from '@pacifica-hack/sdk';
import type {
  ManagerDecision,
  ManagerRules,
  ManagerSnapshot,
  ManagerState,
  PartialTakeProfit,
} from './types';

export interface TpSlManagerInit {
  id: string;
  symbol: string;
  side: Side;
  entryPrice: number;
  createdAt: number;
  rules: ManagerRules;
}

/**
 * Smart TP/SL manager for a single open position.
 *
 * Core design: `tick(currentPrice)` is a pure-ish function that returns a
 * list of decisions (close / partial close). The caller is responsible for
 * actually executing those decisions against the exchange.
 *
 * We mutate internal state on tick (trailing stop, breakeven, partial
 * trigger flags) — but external objects (rules, snapshots) are treated as
 * immutable via defensive copies.
 */
export class TpSlManager {
  readonly id: string;
  readonly symbol: string;
  readonly side: Side;
  readonly entryPrice: number;
  readonly createdAt: number;
  private rules: ManagerRules;
  private state: ManagerState;
  private closed = false;

  constructor(init: TpSlManagerInit) {
    this.id = init.id;
    this.symbol = init.symbol;
    this.side = init.side;
    this.entryPrice = init.entryPrice;
    this.createdAt = init.createdAt;
    // Clone rules (deep enough for partials) so external edits never affect us.
    this.rules = {
      ...init.rules,
      partials: init.rules.partials?.map((p) => ({ ...p })),
    };
    this.state = {
      extremePrice: init.entryPrice,
      breakevenArmed: false,
    };
    this.primeInitialStop();
  }

  private primeInitialStop(): void {
    const { slPct } = this.rules;
    if (slPct === undefined) return;
    this.state = {
      ...this.state,
      stopLevel: this.side === 'bid'
        ? this.entryPrice * (1 - slPct / 100)
        : this.entryPrice * (1 + slPct / 100),
    };
  }

  isClosed(): boolean {
    return this.closed;
  }

  markClosed(): void {
    this.closed = true;
  }

  snapshot(): ManagerSnapshot {
    return {
      id: this.id,
      symbol: this.symbol,
      side: this.side,
      entryPrice: this.entryPrice,
      createdAt: this.createdAt,
      rules: { ...this.rules, partials: this.rules.partials?.map((p) => ({ ...p })) },
      state: { ...this.state },
      closed: this.closed,
    };
  }

  /**
   * Rehydrate a manager from a persisted snapshot. Preserves the evolved
   * state (trailing stop level, breakeven flag, triggered partials) — we do
   * NOT re-prime the initial stop from rules, because the runtime state
   * already encodes any ratcheting that happened before the restart.
   */
  static fromSnapshot(snap: ManagerSnapshot): TpSlManager {
    const mgr = Object.create(TpSlManager.prototype) as TpSlManager;
    const writable = mgr as unknown as {
      id: string;
      symbol: string;
      side: Side;
      entryPrice: number;
      createdAt: number;
      rules: ManagerRules;
      state: ManagerState;
      closed: boolean;
    };
    writable.id = snap.id;
    writable.symbol = snap.symbol;
    writable.side = snap.side;
    writable.entryPrice = snap.entryPrice;
    writable.createdAt = snap.createdAt;
    writable.rules = {
      ...snap.rules,
      partials: snap.rules.partials?.map((p) => ({ ...p })),
    };
    writable.state = { ...snap.state };
    writable.closed = snap.closed === true;
    return mgr;
  }

  /** Percentage move in the trader's favor (always signed positive = winning). */
  private favorablePct(currentPrice: number): number {
    if (this.side === 'bid') {
      return ((currentPrice - this.entryPrice) / this.entryPrice) * 100;
    }
    return ((this.entryPrice - currentPrice) / this.entryPrice) * 100;
  }

  /**
   * Advance manager state by one tick and return any decisions.
   *
   * Decisions are the desired *actions* (close / partial close) — the
   * caller must translate them into real orders via the SDK or mock backend.
   */
  tick(currentPrice: number, now: number = Date.now()): ManagerDecision[] {
    if (this.closed || !Number.isFinite(currentPrice)) return [];

    const decisions: ManagerDecision[] = [];

    // Track extreme price for trailing stop.
    if (this.side === 'bid') {
      if (currentPrice > this.state.extremePrice) {
        this.state = { ...this.state, extremePrice: currentPrice };
      }
    } else if (currentPrice < this.state.extremePrice) {
      this.state = { ...this.state, extremePrice: currentPrice };
    }

    // Trailing stop: ratchet stop level up (long) / down (short), never back.
    if (this.rules.trailPct !== undefined) {
      const trailDistance = this.state.extremePrice * (this.rules.trailPct / 100);
      const candidateStop = this.side === 'bid'
        ? this.state.extremePrice - trailDistance
        : this.state.extremePrice + trailDistance;
      const currentStop = this.state.stopLevel;
      const shouldUpdate =
        currentStop === undefined ||
        (this.side === 'bid' && candidateStop > currentStop) ||
        (this.side === 'ask' && candidateStop < currentStop);
      if (shouldUpdate) {
        this.state = { ...this.state, stopLevel: candidateStop };
      }
    }

    // Breakeven lock: once in profit by breakevenPct, pull stop to entry.
    if (!this.state.breakevenArmed && this.rules.breakevenPct !== undefined) {
      if (this.favorablePct(currentPrice) >= this.rules.breakevenPct) {
        const currentStop = this.state.stopLevel;
        const shouldLift =
          currentStop === undefined ||
          (this.side === 'bid' && currentStop < this.entryPrice) ||
          (this.side === 'ask' && currentStop > this.entryPrice);
        this.state = {
          ...this.state,
          breakevenArmed: true,
          stopLevel: shouldLift ? this.entryPrice : currentStop,
        };
      }
    }

    // Hard take-profit.
    if (this.rules.tpPct !== undefined) {
      const tpLevel = this.side === 'bid'
        ? this.entryPrice * (1 + this.rules.tpPct / 100)
        : this.entryPrice * (1 - this.rules.tpPct / 100);
      const hit =
        (this.side === 'bid' && currentPrice >= tpLevel) ||
        (this.side === 'ask' && currentPrice <= tpLevel);
      if (hit) {
        decisions.push({ kind: 'close', reason: `TP hit at ${tpLevel.toFixed(4)}` });
        this.closed = true;
        return decisions;
      }
    }

    // Stop (hard SL or trailing).
    if (this.state.stopLevel !== undefined) {
      const stop = this.state.stopLevel;
      const hit =
        (this.side === 'bid' && currentPrice <= stop) ||
        (this.side === 'ask' && currentPrice >= stop);
      if (hit) {
        decisions.push({ kind: 'close', reason: `Stop hit at ${stop.toFixed(4)}` });
        this.closed = true;
        return decisions;
      }
    }

    // Time exit.
    if (this.rules.timeExitMinutes !== undefined) {
      const ageMs = now - this.createdAt;
      if (ageMs >= this.rules.timeExitMinutes * 60_000) {
        decisions.push({
          kind: 'close',
          reason: `time exit after ${this.rules.timeExitMinutes}m`,
        });
        this.closed = true;
        return decisions;
      }
    }

    // Partial take-profits.
    if (this.rules.partials && this.rules.partials.length > 0) {
      const nextPartials: PartialTakeProfit[] = this.rules.partials.map((p) => {
        if (p.triggered) return p;
        const hit = this.favorablePct(currentPrice) >= p.pricePct;
        if (!hit) return p;
        decisions.push({
          kind: 'partial',
          sizePct: p.sizePct,
          reason: `partial TP at +${p.pricePct}%`,
        });
        return { ...p, triggered: true };
      });
      this.rules = { ...this.rules, partials: nextPartials };
    }

    return decisions;
  }
}
