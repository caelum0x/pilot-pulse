import type { Side } from '@pacifica-hack/sdk';
import type { TvAction } from './schemas';

/** Status of a webhook execution attempt. */
export type WebhookStatus = 'success' | 'failed' | 'rejected';

export interface WebhookEvent {
  id: string;
  receivedAt: number;
  action: TvAction;
  symbol: string;
  amountUsd: number;
  strategyId: string;
  status: WebhookStatus;
  orderId?: number;
  managerId?: string;
  filledPrice?: number;
  execTimeMs: number;
  error?: string;
}

export interface PartialTakeProfit {
  /** Percentage move (e.g. 1.5 = +1.5%) at which to trigger. */
  pricePct: number;
  /** Percentage of the original position to close (0..1). */
  sizePct: number;
  /** Whether this level has already been triggered. */
  triggered: boolean;
}

export interface ManagerRules {
  /** Trailing stop distance, in percent. */
  trailPct?: number;
  /** Hard take-profit at entry * (1 ± tpPct/100). */
  tpPct?: number;
  /** Hard stop-loss at entry * (1 ∓ slPct/100). */
  slPct?: number;
  /** Move stop to breakeven once price has moved +breakevenPct% in favor. */
  breakevenPct?: number;
  /** Close position if it is older than this many minutes. */
  timeExitMinutes?: number;
  /** Scale-out ladder. */
  partials?: PartialTakeProfit[];
}

export interface ManagerState {
  /** Current effective stop level in absolute price terms. */
  stopLevel?: number;
  /** Whether breakeven lock has been armed. */
  breakevenArmed: boolean;
  /** Highest (long) / lowest (short) price seen since open. */
  extremePrice: number;
}

export interface ManagerSnapshot {
  id: string;
  symbol: string;
  side: Side;
  entryPrice: number;
  createdAt: number;
  rules: ManagerRules;
  state: ManagerState;
}

/** Decision returned from a single `manager.tick()`. */
export type ManagerDecision =
  | { kind: 'close'; reason: string }
  | { kind: 'partial'; sizePct: number; reason: string };

export interface ExecResult {
  status: WebhookStatus;
  orderId?: number;
  managerId?: string;
  filledPrice?: number;
  execTimeMs: number;
  error?: string;
}

export interface MockPosition {
  symbol: string;
  side: Side;
  /** Base asset size. */
  amount: number;
  entryPrice: number;
  createdAt: number;
}
