/**
 * Circuit breaker for broker API calls.
 * Ported from vendor/global-intel/src/utils/circuit-breaker.ts.
 *
 * Prevents cascading failures when the Pacifica API is down — once a
 * resource trips the breaker, retries are blocked during cooldown.
 */

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

export function isOnCooldown(id: string): boolean {
  const state = breakers.get(id);
  if (!state) return false;
  if (Date.now() < state.cooldownUntil) return true;
  if (state.cooldownUntil > 0) {
    state.failures = 0;
    state.cooldownUntil = 0;
  }
  return false;
}

export function recordSuccess(id: string): void {
  const state = breakers.get(id);
  if (state) {
    state.failures = 0;
    state.cooldownUntil = 0;
  }
}

export function recordFailure(
  id: string,
  opts: { maxFailures?: number; cooldownMs?: number } = {},
): void {
  const maxFailures = opts.maxFailures ?? DEFAULT_MAX_FAILURES;
  const cooldownMs = opts.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const state = getOrCreate(id);
  state.failures += 1;
  if (state.failures >= maxFailures) {
    state.cooldownUntil = Date.now() + cooldownMs;
  }
}

export function getBreakerStatus(id: string): {
  failures: number;
  onCooldown: boolean;
  cooldownRemainingMs: number;
} {
  const state = breakers.get(id);
  if (!state) return { failures: 0, onCooldown: false, cooldownRemainingMs: 0 };
  const now = Date.now();
  const onCooldown = now < state.cooldownUntil;
  return {
    failures: state.failures,
    onCooldown,
    cooldownRemainingMs: onCooldown ? state.cooldownUntil - now : 0,
  };
}
