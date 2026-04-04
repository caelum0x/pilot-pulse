import crypto from 'node:crypto';

/**
 * HMAC-SHA256 signing helpers for the TradingView webhook channel.
 *
 * Signatures are hex-encoded. Verification is constant-time (timingSafeEqual).
 */
export function signHmac(body: string, secret: string): string {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

export function verifyHmac(body: string, sig: string, secret: string): boolean {
  if (!sig || typeof sig !== 'string') return false;
  const expected = signHmac(body, secret);
  let a: Buffer;
  let b: Buffer;
  try {
    a = Buffer.from(expected, 'hex');
    b = Buffer.from(sig, 'hex');
  } catch {
    return false;
  }
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
