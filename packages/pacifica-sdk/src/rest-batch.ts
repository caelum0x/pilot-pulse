/**
 * Batch-order helper — split out of `rest.ts` to keep that file under
 * the soft 800-line cap. Mirrors `vendor/python-sdk/rest/batch_orders.py`.
 *
 * The batch envelope is `{ actions: [{type, data}, ...] }`. Each `data`
 * is a fully-signed flat body for a single `create_order`,
 * `create_market_order`, or `cancel_order` op — the outer envelope itself
 * is NOT signed. All entries in a batch share the same timestamp.
 */

import { PacificaError, PacificaSigningError } from './errors.js';
import { handleResponse, type FetchLike } from './signed-request.js';
import { signMessage } from './signing.js';
import type { BatchOrderAction } from './types.js';

export interface BatchOrdersContext {
  restBase: string;
  fetchImpl: FetchLike;
  account: string;
  privateKey: string;
  /** Optional agent-wallet public key to include in each inner header. */
  agentWallet?: string;
  /** Optional builder code auto-injected into Create/CreateMarket payloads. */
  builderCode?: string;
}

function pruneUndefined<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result as T;
}

function generateClientOrderId(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function withBuilderCode(
  fields: Record<string, unknown>,
  builderCode?: string,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...fields };
  if (out.builder_code === undefined && builderCode) {
    out.builder_code = builderCode;
  }
  return pruneUndefined(out);
}

export async function runBatchOrders(
  ctx: BatchOrdersContext,
  actions: BatchOrderAction[],
): Promise<unknown> {
  if (!ctx.privateKey) {
    throw new PacificaSigningError(
      'batchOrders requires a software privateKey — hardware signing is not supported for batched ops',
    );
  }

  const timestamp = Date.now();
  const expiryWindow = 5000;
  const builtActions: Array<{
    type: 'Create' | 'CreateMarket' | 'Cancel';
    data: Record<string, unknown>;
  }> = [];

  for (const action of actions) {
    let opType: string;
    let wrapperType: 'Create' | 'CreateMarket' | 'Cancel';
    let payload: Record<string, unknown>;

    switch (action.type) {
      case 'Create':
        opType = 'create_order';
        wrapperType = 'Create';
        payload = withBuilderCode(
          {
            symbol: action.params.symbol,
            price: action.params.price,
            reduce_only: action.params.reduce_only ?? false,
            amount: action.params.amount,
            side: action.params.side,
            tif: action.params.tif,
            client_order_id:
              action.params.client_order_id ?? generateClientOrderId(),
            builder_code: action.params.builder_code,
          },
          ctx.builderCode,
        );
        break;
      case 'CreateMarket':
        opType = 'create_market_order';
        wrapperType = 'Create';
        payload = withBuilderCode(
          {
            symbol: action.params.symbol,
            reduce_only: action.params.reduce_only ?? false,
            amount: action.params.amount,
            side: action.params.side,
            slippage_percent: action.params.slippage_percent,
            client_order_id:
              action.params.client_order_id ?? generateClientOrderId(),
            builder_code: action.params.builder_code,
          },
          ctx.builderCode,
        );
        break;
      case 'Cancel':
        opType = 'cancel_order';
        wrapperType = 'Cancel';
        payload = pruneUndefined({
          symbol: action.params.symbol,
          order_id: action.params.order_id,
          client_order_id: action.params.client_order_id,
        });
        break;
      default: {
        const _exhaustive: never = action;
        throw new PacificaError(
          `Unknown batch action: ${JSON.stringify(_exhaustive)}`,
        );
      }
    }

    const header = {
      type: opType,
      timestamp,
      expiry_window: expiryWindow,
    };
    const { signature } = signMessage(header, payload, ctx.privateKey);

    builtActions.push({
      type: wrapperType,
      data: {
        account: ctx.account,
        signature,
        timestamp,
        expiry_window: expiryWindow,
        ...(ctx.agentWallet ? { agent_wallet: ctx.agentWallet } : {}),
        ...payload,
      },
    });
  }

  const response = await ctx.fetchImpl(`${ctx.restBase}/orders/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ actions: builtActions }),
  });
  return handleResponse<unknown>(response);
}
