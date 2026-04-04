/**
 * Subaccount creation helpers — split out of `rest.ts` to keep that file
 * under the 800-line soft cap. These are free functions rather than
 * methods so they can be unit-tested in isolation.
 *
 * The two-step cross-signature flow for subaccount creation is described
 * in detail in `vendor/python-sdk/rest/create_subaccount.py`. Both legs
 * share a timestamp and expiry window.
 *
 * This module is intentionally isomorphic — only the software signer is
 * imported statically. The Ledger-backed variant lives in
 * `rest-subaccount-hardware.ts`, which `rest.ts` lazy-imports at runtime
 * so browsers never pull `node:child_process` into their bundle graph.
 */

import bs58 from 'bs58';

import { PacificaSigningError } from './errors.js';
import { handleResponse, type FetchLike } from './signed-request.js';
import { signMessage } from './signing.js';

export interface CreateSubaccountContext {
  restBase: string;
  fetchImpl: FetchLike;
  /** Main-account public key. */
  mainPubkey: string;
  /** Main-account private key — software signer. */
  mainPrivateKey: string;
  /** Subaccount's private key — signs the initiate leg. */
  subaccountPrivateKey: string;
  /** Window in ms shared by both legs. Defaults to 5000. */
  expiryWindowMs?: number;
}

/**
 * Derive the Solana public key (base58) from a base58-encoded 64-byte
 * secret key. tweetnacl's secretKey is `seed || pubkey`, so the pubkey
 * is the trailing 32 bytes.
 */
export function derivePublicKey(privateKeyB58: string): string {
  const secretKey = bs58.decode(privateKeyB58);
  if (secretKey.length !== 64) {
    throw new PacificaSigningError(
      `Invalid Solana secret key length: expected 64 bytes, got ${secretKey.length}`,
    );
  }
  const pubkey = secretKey.slice(32);
  return bs58.encode(pubkey);
}

/** Two-step signed subaccount creation using software signers. */
export async function createSubaccountSoftware(
  ctx: CreateSubaccountContext,
): Promise<unknown> {
  const subPubkey = derivePublicKey(ctx.subaccountPrivateKey);
  const timestamp = Date.now();
  const expiryWindow = ctx.expiryWindowMs ?? 5000;

  // Step 1: subaccount signs the main account pubkey.
  const subHeader = {
    type: 'subaccount_initiate',
    timestamp,
    expiry_window: expiryWindow,
  };
  const { signature: subSignature } = signMessage(
    subHeader,
    { account: ctx.mainPubkey },
    ctx.subaccountPrivateKey,
  );

  // Step 2: main account signs the sub_signature.
  const mainHeader = {
    type: 'subaccount_confirm',
    timestamp,
    expiry_window: expiryWindow,
  };
  const { signature: mainSignature } = signMessage(
    mainHeader,
    { signature: subSignature },
    ctx.mainPrivateKey,
  );

  const body = {
    main_account: ctx.mainPubkey,
    subaccount: subPubkey,
    main_signature: mainSignature,
    sub_signature: subSignature,
    timestamp,
    expiry_window: expiryWindow,
  };

  const response = await ctx.fetchImpl(
    `${ctx.restBase}/account/subaccount/create`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  return handleResponse<unknown>(response);
}
