/**
 * Canonical JSON signing for Pacifica.
 *
 * This module is a faithful port of the Python reference implementation in
 * `vendor/python-sdk/common/utils.py`. Any deviation would produce signatures
 * the API will reject, so the invariants below must be preserved:
 *
 *  1. Merge header with `{ data: payload }` under a `data` key.
 *  2. Recursively sort object keys alphabetically at every nesting level.
 *     Arrays keep their order but their contents are sorted recursively.
 *  3. Serialize with compact JSON — no spaces, no trailing newlines.
 *     `JSON.stringify(x)` (no space arg) matches Python's
 *     `json.dumps(x, separators=(",", ":"))` byte-for-byte.
 *  4. Sign the UTF-8 bytes with ed25519 (Solana keypair).
 *  5. Base58-encode the raw 64-byte signature.
 */

import bs58 from 'bs58';
import nacl from 'tweetnacl';

import { PacificaSigningError } from './errors.js';

export interface SignHeader {
  /** Operation identifier, e.g. `create_market_order`. */
  type: string;
  /** Milliseconds since Unix epoch. */
  timestamp: number;
  /** Window (ms) during which the signature is valid. */
  expiry_window: number;
}

export interface SignedMessage {
  /** The exact canonical JSON string that was signed (useful for debugging). */
  message: string;
  /** Base58-encoded ed25519 signature. */
  signature: string;
}

/**
 * Recursively sort object keys alphabetically.
 *
 * - Plain objects: keys are sorted, values recursed.
 * - Arrays: order is preserved, elements recursed.
 * - Primitives (string, number, boolean, null): returned as-is.
 *
 * Does not attempt to handle Date, Map, Set, BigInt, or class instances —
 * the signing payload is expected to be plain JSON data.
 */
export function sortJsonKeys(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sortJsonKeys);
  }
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sortedKeys = Object.keys(source).sort();
    const result: Record<string, unknown> = {};
    for (const key of sortedKeys) {
      result[key] = sortJsonKeys(source[key]);
    }
    return result;
  }
  return value;
}

/**
 * Build the canonical JSON string that will be signed.
 *
 * Merges the header with the payload under a `data` key, sorts all keys
 * recursively, and serializes with compact JSON (no spaces). This exactly
 * mirrors the Python reference:
 *
 * ```python
 * data = {**header, "data": payload}
 * message = sort_json_keys(data)
 * json.dumps(message, separators=(",", ":"))
 * ```
 */
export function prepareMessage(header: SignHeader, payload: unknown): string {
  if (
    typeof header.type !== 'string' ||
    typeof header.timestamp !== 'number' ||
    typeof header.expiry_window !== 'number'
  ) {
    throw new PacificaSigningError(
      'Header must have type (string), timestamp (number), and expiry_window (number)',
    );
  }

  const merged = {
    type: header.type,
    timestamp: header.timestamp,
    expiry_window: header.expiry_window,
    data: payload,
  };

  const sorted = sortJsonKeys(merged);
  // JSON.stringify with no space argument emits compact output
  // (no spaces between separators) — matches Python's (",", ":") mode.
  return JSON.stringify(sorted);
}

/**
 * Sign a Pacifica message with a base58-encoded Solana secret key.
 *
 * The secret key is a 64-byte Solana keypair (seed || pubkey), base58 encoded.
 * tweetnacl's `sign.detached` expects this full 64-byte secret, which is
 * exactly what `bs58.decode` returns.
 *
 * Returns both the canonical message string (for debugging) and the base58
 * encoded detached signature.
 */
export function signMessage(
  header: SignHeader,
  payload: unknown,
  privateKeyB58: string,
): SignedMessage {
  if (!privateKeyB58) {
    throw new PacificaSigningError('privateKey is required to sign messages');
  }

  const message = prepareMessage(header, payload);
  const messageBytes = new TextEncoder().encode(message);

  let secretKey: Uint8Array;
  try {
    secretKey = bs58.decode(privateKeyB58);
  } catch (err) {
    throw new PacificaSigningError(
      `Failed to decode base58 private key: ${(err as Error).message}`,
    );
  }

  if (secretKey.length !== 64) {
    throw new PacificaSigningError(
      `Invalid Solana secret key length: expected 64 bytes, got ${secretKey.length}`,
    );
  }

  let signatureBytes: Uint8Array;
  try {
    signatureBytes = nacl.sign.detached(messageBytes, secretKey);
  } catch (err) {
    throw new PacificaSigningError(
      `ed25519 signing failed: ${(err as Error).message}`,
    );
  }

  const signature = bs58.encode(signatureBytes);
  return { message, signature };
}

/**
 * Build a fresh signing header for `type`, using the current wall-clock time.
 *
 * `expiryWindowMs` defaults to 5000 to match the python-sdk examples. Callers
 * with slow networks or long-running bots may want a larger window.
 */
export function buildHeader(type: string, expiryWindowMs = 5000): SignHeader {
  return {
    type,
    timestamp: Date.now(),
    expiry_window: expiryWindowMs,
  };
}
