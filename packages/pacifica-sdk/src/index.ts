/**
 * Public SDK barrel.
 *
 * Grouped by module for readability. Consumers should only import from
 * `@pacifica-hack/sdk` — internal files like `signed-request.js` are
 * re-exported here as well so callers that need to hand-roll a signed
 * request don't have to reach into the package internals.
 */

// Env + errors
export * from './env.js';
export * from './errors.js';

// Domain types
export * from './types.js';

// Signing primitives
export * from './signing.js';
export * from './signing-hardware.js';
export * from './signed-request.js';

// REST client
export * from './rest.js';

// WebSocket client
export * from './ws.js';

// On-chain USDC deposit (Solana)
export * from './rest-deposit.js';
