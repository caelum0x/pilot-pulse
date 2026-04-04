/**
 * Shared signed-request machinery used by every mutating REST call.
 *
 * This module exists so `rest.ts` and the feature-specific sub-modules
 * (rest-twap, rest-subaccount, rest-lake, rest-agent, rest-api-keys) all
 * share the exact same sign/build/send pipeline. Diverging on any of these
 * steps would produce signatures the server rejects.
 */

import { PacificaError, PacificaSigningError, PacificaRateLimitError } from './errors.js';
import { buildHeader, signMessage, type SignedMessage } from './signing.js';

/**
 * NOTE: `signing-hardware.js` is intentionally NOT imported statically here.
 * That module imports `node:child_process`, which would force bundlers to
 * include Node-only code in browser builds even when the hardware signer
 * is never used. Instead, `signPayload` below lazy-imports it via
 * `await import()` only when `creds.ledgerPath` is set — a code path that
 * never executes in a browser.
 */

export type FetchLike = typeof globalThis.fetch;

/**
 * Credentials for signing a request. Exactly one of `privateKey` or
 * `ledgerPath` must be present. `agentWallet`, if set, is the public key
 * of the agent wallet paired with this private key — it's stamped onto
 * the top-level request header as `agent_wallet`.
 */
export interface SigningCredentials {
  /** Account whose assets are being acted on — always the main account. */
  account: string;
  /** Software signer. Mutually exclusive with `ledgerPath`. */
  privateKey?: string;
  /** Hardware signer. Mutually exclusive with `privateKey`. */
  ledgerPath?: string;
  /**
   * Optional agent-wallet public key. When set, this is sent as
   * `agent_wallet` on the top-level request header — which tells the
   * server the signature was produced by the agent key on behalf of
   * `account`.
   */
  agentWallet?: string;
  /** Optional override for the signing window. Defaults to 5000ms. */
  expiryWindowMs?: number;
}

/**
 * Sign a `payload` under operation `type` using the provided credentials.
 * Returns both the signed message string (useful for debugging) and the
 * base58 signature. Timestamp is captured once per call.
 */
export async function signPayload(
  type: string,
  payload: unknown,
  creds: SigningCredentials,
): Promise<SignedMessage & { timestamp: number; expiryWindow: number }> {
  if (!creds.privateKey && !creds.ledgerPath) {
    throw new PacificaSigningError(
      'Signing requires either privateKey or ledgerPath',
    );
  }
  if (creds.privateKey && creds.ledgerPath) {
    throw new PacificaSigningError(
      'privateKey and ledgerPath are mutually exclusive',
    );
  }

  const header = buildHeader(type, creds.expiryWindowMs ?? 5000);

  let signed: SignedMessage;
  if (creds.ledgerPath) {
    // Lazy dynamic import — only loaded when a Ledger path is actually
    // configured. Keeps `node:child_process` out of the static import
    // graph of the default SDK entry point so browser bundlers don't
    // need to polyfill or stub Node built-ins.
    const { signWithHardwareWallet } = await import('./signing-hardware.js');
    signed = await signWithHardwareWallet(header, payload, creds.ledgerPath);
  } else {
    signed = signMessage(header, payload, creds.privateKey!);
  }

  return {
    message: signed.message,
    signature: signed.signature,
    timestamp: header.timestamp,
    expiryWindow: header.expiry_window,
  };
}

/**
 * Top-level request header fields attached to every signed POST body.
 * When `ledgerPath` was used, `signature` is wrapped in
 * `{ type: "hardware", value: <sig> }` exactly matching the Python
 * reference (see `transfer_subaccount_fund_hardware.py`).
 */
export interface SignedRequestHeader {
  account: string;
  signature: string | { type: 'hardware'; value: string };
  timestamp: number;
  expiry_window: number;
  agent_wallet?: string;
}

export function buildSignedRequestHeader(
  creds: SigningCredentials,
  signed: { signature: string; timestamp: number; expiryWindow: number },
): SignedRequestHeader {
  const signatureField: SignedRequestHeader['signature'] = creds.ledgerPath
    ? { type: 'hardware', value: signed.signature }
    : signed.signature;

  const header: SignedRequestHeader = {
    account: creds.account,
    signature: signatureField,
    timestamp: signed.timestamp,
    expiry_window: signed.expiryWindow,
  };
  if (creds.agentWallet) {
    header.agent_wallet = creds.agentWallet;
  }
  return header;
}

/**
 * Normalize a fetch Response into the Pacifica envelope format.
 * Exported so every module handles errors identically.
 */
export async function handleResponse<T>(response: Response): Promise<T> {
  if (response.status === 429) {
    const tHeader = response.headers.get('t');
    const retrySeconds = tHeader ? Number(tHeader) : NaN;
    const retryAfterMs =
      Number.isFinite(retrySeconds) && retrySeconds > 0
        ? retrySeconds * 1000
        : 5000;
    throw new PacificaRateLimitError(retryAfterMs);
  }

  const rawText = await response.text();

  if (!response.ok) {
    throw new PacificaError(
      `HTTP ${response.status}: ${rawText || response.statusText}`,
      undefined,
      response.status,
    );
  }

  let parsed: unknown;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch (err) {
    throw new PacificaError(
      `Failed to parse JSON response: ${(err as Error).message}`,
    );
  }

  if (parsed && typeof parsed === 'object' && 'success' in parsed) {
    const envelope = parsed as {
      success: boolean;
      data?: unknown;
      error?: string;
      code?: string;
    };
    if (envelope.success === false) {
      throw new PacificaError(
        envelope.error ?? 'Pacifica API returned success=false',
        envelope.code,
        response.status,
      );
    }
    return envelope.data as T;
  }

  return parsed as T;
}
