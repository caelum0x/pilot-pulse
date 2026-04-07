/**
 * Persistent localStorage cache with typed envelope pattern.
 * Ported from vendor/global-intel/src/services/persistent-cache.ts.
 *
 * Use for market data so the dashboard shows "last known" data instantly
 * on page load while fresh data is fetched from the API.
 */

interface CacheEnvelope<T> {
  key: string;
  updatedAt: number;
  data: T;
}

const CACHE_PREFIX = 'pacifica-pulse:';

export function getPersistentCache<T>(key: string): CacheEnvelope<T> | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${key}`);
    return raw ? (JSON.parse(raw) as CacheEnvelope<T>) : null;
  } catch {
    return null;
  }
}

export function setPersistentCache<T>(key: string, data: T): void {
  const payload: CacheEnvelope<T> = { key, data, updatedAt: Date.now() };
  try {
    localStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(payload));
  } catch {
    // Ignore quota errors — cache is best-effort.
  }
}

/** Age in ms since the cache entry was written. */
export function cacheAgeMs(updatedAt: number): number {
  return Math.max(0, Date.now() - updatedAt);
}

/** Human-readable freshness label. */
export function describeFreshness(updatedAt: number): string {
  const age = cacheAgeMs(updatedAt);
  const mins = Math.floor(age / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
