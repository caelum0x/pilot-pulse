/**
 * Hand-rolled validation for inbound TradingView alerts.
 *
 * We intentionally avoid a runtime schema dependency (like Zod) to keep the
 * pilot bundle tiny. If validation requirements grow, swap this file for a
 * Zod-based version — the `safeParse` interface is designed to be compatible.
 */

export type TvAction = 'buy' | 'sell' | 'close';

export interface TvAlert {
  action: TvAction;
  symbol: string;
  amount_usd: number;
  strategy_id: string;
  tp_pct?: number;
  sl_pct?: number;
  trail_pct?: number;
  breakeven_pct?: number;
  time_exit_minutes?: number;
  timestamp: number;
}

export interface ParseIssue {
  path: string;
  message: string;
}

export type ParseResult<T> =
  | { success: true; data: T }
  | { success: false; error: { issues: ParseIssue[] } };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function requireString(
  obj: Record<string, unknown>,
  key: string,
  issues: ParseIssue[],
): string | undefined {
  const v = obj[key];
  if (typeof v !== 'string' || v.length === 0) {
    issues.push({ path: key, message: `${key} must be a non-empty string` });
    return undefined;
  }
  return v;
}

function requireNumber(
  obj: Record<string, unknown>,
  key: string,
  issues: ParseIssue[],
): number | undefined {
  const v = obj[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    issues.push({ path: key, message: `${key} must be a finite number` });
    return undefined;
  }
  return v;
}

function optionalNumber(
  obj: Record<string, unknown>,
  key: string,
  issues: ParseIssue[],
): number | undefined {
  const v = obj[key];
  if (v === undefined || v === null) return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    issues.push({ path: key, message: `${key} must be a finite number if provided` });
    return undefined;
  }
  if (v < 0) {
    issues.push({ path: key, message: `${key} must be non-negative` });
    return undefined;
  }
  return v;
}

function parseAction(v: unknown, issues: ParseIssue[]): TvAction | undefined {
  if (v === 'buy' || v === 'sell' || v === 'close') return v;
  issues.push({ path: 'action', message: 'action must be "buy" | "sell" | "close"' });
  return undefined;
}

/**
 * Validate an arbitrary value as a `TvAlert`.
 *
 * Mirrors the Zod `safeParse` shape so a future swap is mechanical.
 */
export const alertSchema = {
  safeParse(value: unknown): ParseResult<TvAlert> {
    const issues: ParseIssue[] = [];

    if (!isObject(value)) {
      return { success: false, error: { issues: [{ path: '', message: 'body must be an object' }] } };
    }

    const action = parseAction(value.action, issues);
    const symbol = requireString(value, 'symbol', issues);
    const amount_usd = requireNumber(value, 'amount_usd', issues);
    const strategy_id = requireString(value, 'strategy_id', issues);
    const timestamp = requireNumber(value, 'timestamp', issues);
    const tp_pct = optionalNumber(value, 'tp_pct', issues);
    const sl_pct = optionalNumber(value, 'sl_pct', issues);
    const trail_pct = optionalNumber(value, 'trail_pct', issues);
    const breakeven_pct = optionalNumber(value, 'breakeven_pct', issues);
    const time_exit_minutes = optionalNumber(value, 'time_exit_minutes', issues);

    if (amount_usd !== undefined && amount_usd <= 0) {
      issues.push({ path: 'amount_usd', message: 'amount_usd must be > 0' });
    }

    if (
      issues.length > 0 ||
      action === undefined ||
      symbol === undefined ||
      amount_usd === undefined ||
      strategy_id === undefined ||
      timestamp === undefined
    ) {
      return { success: false, error: { issues } };
    }

    const data: TvAlert = {
      action,
      symbol: symbol.toUpperCase(),
      amount_usd,
      strategy_id,
      timestamp,
    };
    if (tp_pct !== undefined) data.tp_pct = tp_pct;
    if (sl_pct !== undefined) data.sl_pct = sl_pct;
    if (trail_pct !== undefined) data.trail_pct = trail_pct;
    if (breakeven_pct !== undefined) data.breakeven_pct = breakeven_pct;
    if (time_exit_minutes !== undefined) data.time_exit_minutes = time_exit_minutes;

    return { success: true, data };
  },
};
