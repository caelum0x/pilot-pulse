/**
 * Seed list of addresses to track for whale events.
 *
 * For v1 these are curated/hardcoded. In v2 we'll scrape the Pacifica
 * leaderboard or an on-chain volume query and refresh the list
 * periodically so the dashboard follows the actual top traders.
 *
 * Override at runtime via `NEXT_PUBLIC_WHALE_ADDRESSES` (comma-separated
 * Solana pubkeys) so demo environments can bring their own list without
 * shipping a new build.
 */

const SEED_WHALE_ADDRESSES: readonly string[] = [
  // TODO(v2): replace with real top-trader discovery via the Pacifica
  // leaderboard endpoint. The placeholder below is the demo address used
  // by the SDK examples so local dev has something to poll.
  'HEQ3kHCavWvgFtmBLNaFbDyBrVn9bU4CKctnRhxfrRVS',
];

/**
 * Resolve the effective list of whale addresses to poll.
 *
 * Precedence:
 *  1. `NEXT_PUBLIC_WHALE_ADDRESSES` env var (comma-separated).
 *  2. Hardcoded {@link SEED_WHALE_ADDRESSES}.
 *
 * Empty strings are filtered out and all entries are trimmed so
 * `"addr1, addr2 , addr3"` parses cleanly.
 */
export function getWhaleAddresses(): string[] {
  const fromEnv =
    typeof process !== 'undefined' ? process.env.NEXT_PUBLIC_WHALE_ADDRESSES : undefined;
  if (fromEnv && fromEnv.trim().length > 0) {
    return fromEnv
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
  }
  return [...SEED_WHALE_ADDRESSES];
}
