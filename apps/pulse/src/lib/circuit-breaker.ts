/**
 * Circuit breaker for API/WS connections.
 * Ported from vendor/global-intel/src/utils/circuit-breaker.ts.
 *
 * Prevents hammering failing endpoints — once a resource trips the
 * breaker it enters a cooldown period before retries are allowed.
 */

export interface CircuitBreakerOptions {
  /** Number of consecutive failures before tripping. Default 3. */
  maxFailures?: number;
  /** Cooldown period in ms after tripping. Default 30_000 (30s). */
  cooldownMs?: number;
}

interface BreakerState {
  failures: number;
  cooldownUntil: number;
}

const breakers = new Map<string, BreakerState>();

const DEFAULT_MAX_FAILURES = 3;
const DEFAULT_COOLDOWN_MS = 30_000;

function getOrCreate(id: string): BreakerState {
  let state = breakers.get(id);
  if (!state) {
    state = { failures: 0, cooldownUntil: 0 };
    breakers.set(id, state);
  }
  return state;
}

/** Check if a resource is currently in cooldown. */
export function isOnCooldown(id: string): boolean {
  const state = breakers.get(id);
  if (!state) return false;
  if (Date.now() < state.cooldownUntil) return true;
  // Cooldown expired — reset.
  if (state.cooldownUntil > 0) {
    state.failures = 0;
    state.cooldownUntil = 0;
  }
  return false;
}

/** Record a successful call — resets the failure counter. */
export function recordSuccess(id: string): void {
  const state = breakers.get(id);
  if (state) {
    state.failures = 0;
    state.cooldownUntil = 0;
  }
}

/** Record a failure. Trips the breaker when maxFailures is reached. */
export function recordFailure(
  id: string,
  opts: CircuitBreakerOptions = {},
): void {
  const maxFailures = opts.maxFailures ?? DEFAULT_MAX_FAILURES;
  const cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const state = getOrCreate(id);
  state.failures += 1;
  if (state.failures >= maxFailures) {
    state.cooldownUntil = Date.now() + cooldownMs;
  }
}

/** Get a snapshot of a breaker's status for UI display. */
export function getBreakerStatus(id: string): {
  failures: number;
  onCooldown: boolean;
  cooldownRemainingMs: number;
} {
  const state = breakers.get(id);
  if (!state) {
    return { failures: 0, onCooldown: false, cooldownRemainingMs: 0 };
  }
  const now = Date.now();
  const onCooldown = now < state.cooldownUntil;
  return {
    failures: state.failures,
    onCooldown,
    cooldownRemainingMs: onCooldown ? state.cooldownUntil - now : 0,
  };
}

/** Reset all breakers. Useful in tests. */
export function resetAll(): void {
  breakers.clear();
}
