/**
 * In-memory IP-based rate limiter for the webhook endpoint.
 * Ported from vendor/global-intel/api/_ip-rate-limit.js.
 *
 * Tracks request counts per IP within a sliding time window.
 * Uses periodic cleanup to prevent memory growth.
 */

interface RateRecord {
  count: number;
  windowStart: number;
}

const records = new Map<string, RateRecord>();

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 30;
const CLEANUP_INTERVAL_MS = 30_000;
const MAX_ENTRIES = 5_000;

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup(windowMs: number): void {
  if (cleanupTimer !== null) return;
  cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [ip, record] of records) {
      if (record.windowStart < cutoff) {
        records.delete(ip);
      }
    }
    // Evict oldest entries if map is too large.
    if (records.size > MAX_ENTRIES) {
      const entries = [...records.entries()].sort(
        (a, b) => a[1].windowStart - b[1].windowStart,
      );
      const excess = records.size - MAX_ENTRIES;
      for (let i = 0; i < excess; i++) {
        records.delete(entries[i]![0]);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // Allow process to exit cleanly.
  if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

/**
 * Check if a request from `ip` is allowed.
 * Returns `true` if under the limit, `false` if rate-limited.
 */
export function checkRateLimit(
  ip: string,
  opts: { windowMs?: number; limit?: number } = {},
): boolean {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const limit = opts.limit ?? DEFAULT_LIMIT;

  ensureCleanup(windowMs);

  const now = Date.now();
  const record = records.get(ip);

  if (!record || now - record.windowStart >= windowMs) {
    records.set(ip, { count: 1, windowStart: now });
    return true;
  }

  record.count += 1;
  return record.count <= limit;
}

/** Get current number of tracked IPs (for monitoring). */
export function rateLimiterSize(): number {
  return records.size;
}
