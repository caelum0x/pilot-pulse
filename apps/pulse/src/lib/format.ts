/**
 * Formatting utilities for the PacificaPulse dashboard.
 * Pure functions, no side effects — safe for SSR and client.
 */

/** Format a USD number with compact suffixes ($2.4M, $850K, $12.50). */
export function formatUsd(n: number, opts: { decimals?: number } = {}): string {
  const { decimals = 2 } = opts;
  if (!Number.isFinite(n)) return '$—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(decimals)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(decimals)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(decimals)}K`;
  return `${sign}$${abs.toFixed(decimals)}`;
}

/** Format a basis-points value (e.g. 3.2 bps). */
export function formatBps(n: number, decimals = 1): string {
  if (!Number.isFinite(n)) return '— bps';
  return `${n.toFixed(decimals)} bps`;
}

/** Truncate an address: 0x8f3a...4c1b. */
export function formatAddr(a: string): string {
  if (!a) return '—';
  if (a.length <= 10) return a;
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Human-friendly "time ago" — "just now", "12s", "3m", "1h", "2d". */
export function timeAgo(ts: number, now: number = Date.now()): string {
  const diffMs = now - ts;
  if (diffMs < 0) return 'now';
  const s = Math.floor(diffMs / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return `${d}d`;
}

/** Format price with sensible tick-aware precision. */
export function formatPrice(p: number, tickSize?: string): string {
  if (!Number.isFinite(p)) return '—';
  let decimals = 2;
  if (tickSize) {
    const parsed = parseFloat(tickSize);
    if (Number.isFinite(parsed) && parsed > 0) {
      decimals = Math.max(0, Math.min(8, -Math.floor(Math.log10(parsed))));
    }
  } else {
    if (p >= 10000) decimals = 1;
    else if (p >= 100) decimals = 2;
    else if (p >= 1) decimals = 3;
    else decimals = 5;
  }
  return p.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Signed percentage: +2.45% or -1.20% */
export function formatPct(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)}%`;
}

/** Signed number for imbalance: +0.31 */
export function formatSigned(n: number, decimals = 2): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)}`;
}
