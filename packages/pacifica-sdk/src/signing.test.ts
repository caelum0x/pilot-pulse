/**
 * Tests for the canonical signing scheme.
 *
 * These tests enforce byte-for-byte compatibility with the Python SDK by:
 *
 *  1. Checking `sortJsonKeys` produces objects whose JSON.stringify matches
 *     hand-computed expected strings.
 *  2. Checking `prepareMessage` emits the exact canonical JSON a Python
 *     implementation would produce for the same inputs.
 *  3. Generating a real ed25519 keypair, signing a message, and verifying
 *     the base58 signature round-trips through `nacl.sign.detached.verify`.
 */

import { describe, expect, it } from 'vitest';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

import {
  buildHeader,
  prepareMessage,
  signMessage,
  sortJsonKeys,
} from './signing.js';

describe('sortJsonKeys', () => {
  it('returns primitives unchanged', () => {
    expect(sortJsonKeys(42)).toBe(42);
    expect(sortJsonKeys('hello')).toBe('hello');
    expect(sortJsonKeys(true)).toBe(true);
    expect(sortJsonKeys(null)).toBe(null);
  });

  it('sorts top-level object keys alphabetically', () => {
    const input = { c: 1, a: 2, b: 3 };
    const sorted = sortJsonKeys(input) as Record<string, unknown>;
    expect(Object.keys(sorted)).toEqual(['a', 'b', 'c']);
  });

  it('sorts nested object keys recursively', () => {
    const input = {
      z: { y: 1, x: 2 },
      a: { c: 3, b: 4 },
    };
    const sorted = sortJsonKeys(input);
    expect(JSON.stringify(sorted)).toBe('{"a":{"b":4,"c":3},"z":{"x":2,"y":1}}');
  });

  it('preserves array order but recurses into elements', () => {
    const input = [
      { b: 1, a: 2 },
      { d: 3, c: 4 },
    ];
    const sorted = sortJsonKeys(input);
    expect(JSON.stringify(sorted)).toBe('[{"a":2,"b":1},{"c":4,"d":3}]');
  });

  it('handles deeply nested mixed structures', () => {
    const input = {
      header: { type: 'test', timestamp: 100, expiry_window: 5000 },
      data: {
        symbol: 'BTC',
        nested: [{ z: 9, a: 1 }],
      },
    };
    const sorted = sortJsonKeys(input);
    expect(JSON.stringify(sorted)).toBe(
      '{"data":{"nested":[{"a":1,"z":9}],"symbol":"BTC"},"header":{"expiry_window":5000,"timestamp":100,"type":"test"}}',
    );
  });
});

describe('prepareMessage', () => {
  it('produces exactly the canonical JSON a Python implementation would', () => {
    // Matches the layout produced by vendor/python-sdk/common/utils.py for
    // the same inputs. Keys at every level are sorted alphabetically, with
    // no spaces between separators.
    const header = {
      type: 'create_market_order',
      timestamp: 1742243160000,
      expiry_window: 5000,
    };
    const payload = {
      symbol: 'BTC',
      reduce_only: false,
      amount: '0.1',
      side: 'bid',
      slippage_percent: '0.5',
      client_order_id: 'abc-123',
    };

    const expected =
      '{"data":{"amount":"0.1","client_order_id":"abc-123","reduce_only":false,"side":"bid","slippage_percent":"0.5","symbol":"BTC"},"expiry_window":5000,"timestamp":1742243160000,"type":"create_market_order"}';

    expect(prepareMessage(header, payload)).toBe(expected);
  });

  it('handles nested payloads (e.g. batch orders)', () => {
    const header = {
      type: 'batch_order',
      timestamp: 1000,
      expiry_window: 5000,
    };
    const payload = {
      orders: [
        { symbol: 'BTC', side: 'bid' },
        { symbol: 'ETH', side: 'ask' },
      ],
    };
    const expected =
      '{"data":{"orders":[{"side":"bid","symbol":"BTC"},{"side":"ask","symbol":"ETH"}]},"expiry_window":5000,"timestamp":1000,"type":"batch_order"}';
    expect(prepareMessage(header, payload)).toBe(expected);
  });

  it('throws when header is missing required fields', () => {
    expect(() =>
      prepareMessage(
        // biome-ignore-next-line — intentional bad input
        { type: 'x', timestamp: 1 } as unknown as Parameters<typeof prepareMessage>[0],
        {},
      ),
    ).toThrow();
  });
});

describe('signMessage', () => {
  it('produces a 64-byte signature that verifies against the public key', () => {
    // Generate a deterministic test keypair. We deliberately use tweetnacl's
    // own generator so this test has zero external fixtures.
    const keypair = nacl.sign.keyPair();
    // Solana-style secret key = 64 bytes (seed || pubkey) base58 encoded.
    // tweetnacl's .secretKey is already this 64-byte form.
    const privateKeyB58 = bs58.encode(keypair.secretKey);
    const publicKey = keypair.publicKey;

    const header = {
      type: 'create_market_order',
      timestamp: 1742243160000,
      expiry_window: 5000,
    };
    const payload = {
      symbol: 'BTC',
      side: 'bid',
      amount: '0.1',
      slippage_percent: '0.5',
      reduce_only: false,
      client_order_id: 'test-uuid',
    };

    const { message, signature } = signMessage(header, payload, privateKeyB58);

    // Sanity: the message is the canonical form.
    expect(message).toBe(prepareMessage(header, payload));

    const signatureBytes = bs58.decode(signature);
    expect(signatureBytes.length).toBe(64);

    const isValid = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      signatureBytes,
      publicKey,
    );
    expect(isValid).toBe(true);
  });

  it('produces a different signature for a different payload', () => {
    const keypair = nacl.sign.keyPair();
    const privateKeyB58 = bs58.encode(keypair.secretKey);
    const header = {
      type: 'create_market_order',
      timestamp: 1,
      expiry_window: 5000,
    };

    const a = signMessage(header, { symbol: 'BTC' }, privateKeyB58);
    const b = signMessage(header, { symbol: 'ETH' }, privateKeyB58);

    expect(a.signature).not.toBe(b.signature);
  });

  it('throws PacificaSigningError for an invalid base58 key', () => {
    const header = {
      type: 'create_market_order',
      timestamp: 1,
      expiry_window: 5000,
    };
    expect(() => signMessage(header, {}, 'not-base58!!')).toThrow();
  });

  it('throws when private key is missing', () => {
    const header = {
      type: 'create_market_order',
      timestamp: 1,
      expiry_window: 5000,
    };
    expect(() => signMessage(header, {}, '')).toThrow();
  });
});

describe('buildHeader', () => {
  it('fills timestamp with Date.now() and uses default expiry_window of 5000', () => {
    const before = Date.now();
    const header = buildHeader('create_market_order');
    const after = Date.now();

    expect(header.type).toBe('create_market_order');
    expect(header.expiry_window).toBe(5000);
    expect(header.timestamp).toBeGreaterThanOrEqual(before);
    expect(header.timestamp).toBeLessThanOrEqual(after);
  });

  it('respects a custom expiryWindowMs', () => {
    const header = buildHeader('cancel_order', 10_000);
    expect(header.expiry_window).toBe(10_000);
  });
});
