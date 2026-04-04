/**
 * Hardware-signed subaccount creation flow.
 *
 * Split out of `rest-subaccount.ts` so the isomorphic SDK surface
 * (`@pacifica-hack/sdk`) does not statically pull in `signing-hardware.ts`,
 * which imports `node:child_process`. Consumers that need the hardware
 * subaccount flow directly should import from `@pacifica-hack/sdk/node`.
 *
 * `PacificaClient.createSubaccountHardware` reaches this module via a lazy
 * `await import('./rest-subaccount-hardware.js')` at runtime, so the static
 * import graph from the default entry stays free of Node-only modules.
 */

import { handleResponse, type FetchLike } from './signed-request.js';
import { signMessage } from './signing.js';
import { signWithHardwareWallet } from './signing-hardware.js';
import { derivePublicKey } from './rest-subaccount.js';

export interface CreateSubaccountHardwareContext {
  restBase: string;
  fetchImpl: FetchLike;
  /** Hardware wallet public key that owns the main account. */
  mainHardwarePublicKey: string;
  /** Ledger path for the main account (e.g. `usb://ledger?key=1`). */
  ledgerPath: string;
  /** Subaccount's private key — signs the initiate leg via software. */
  subaccountPrivateKey: string;
  expiryWindowMs?: number;
}

/**
 * Two-step subaccount creation where the main-account leg is signed via
 * `solana sign-offchain-message`. Uses a longer default expiry window (200s)
 * to account for the human confirmation step on the Ledger device.
 */
export async function createSubaccountHardwareFlow(
  ctx: CreateSubaccountHardwareContext,
): Promise<unknown> {
  const subPubkey = derivePublicKey(ctx.subaccountPrivateKey);
  const timestamp = Date.now();
  const expiryWindow = ctx.expiryWindowMs ?? 200_000;

  const subHeader = {
    type: 'subaccount_initiate',
    timestamp,
    expiry_window: expiryWindow,
  };
  const { signature: subSignature } = signMessage(
    subHeader,
    { account: ctx.mainHardwarePublicKey },
    ctx.subaccountPrivateKey,
  );

  const mainHeader = {
    type: 'subaccount_confirm',
    timestamp,
    expiry_window: expiryWindow,
  };
  const { signature: mainSignature } = await signWithHardwareWallet(
    mainHeader,
    { signature: subSignature },
    ctx.ledgerPath,
  );

  const body = {
    main_account: ctx.mainHardwarePublicKey,
    subaccount: subPubkey,
    main_signature: { type: 'hardware', value: mainSignature },
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
