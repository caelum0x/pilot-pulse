/**
 * Webhook alert executor.
 *
 * Translates a validated TradingView alert into a Pacifica order via the
 * backend-agnostic {@link PacificaBroker}. The executor never talks to
 * `PacificaClient` or the mock backend directly — everything goes through
 * the broker, so the same code path handles live + mock mode.
 *
 * Responsibilities, in order:
 *   1. Resolve the order side from the alert action (and current position
 *      for `close`).
 *   2. Place a market order (builder code is attached inside the broker).
 *   3. Record a webhook event in the ring buffer.
 *   4. Accrue builder-code fee revenue for accounting.
 *   5. Install a TP/SL manager when the alert has any manager rules.
 */

import type { Side } from '@pacifica-hack/sdk';
import { awaitStoreReady, getStore } from './store';
import { getBroker } from './broker-factory';
import { TpSlManager } from './manager';
import { ensureManagerLoop } from './manager-loop';
import type { BrokerOrderResult, BrokerPosition } from './pacifica-broker';
import type { TvAlert } from './schemas';
import type {
  ExecResult,
  ManagerRules,
  PartialTakeProfit,
  WebhookEvent,
} from './types';

function randId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

function brokerSideToSdkSide(side: 'LONG' | 'SHORT'): Side {
  return side === 'LONG' ? 'bid' : 'ask';
}

function buildRules(alert: TvAlert): ManagerRules | undefined {
  const hasAny =
    alert.tp_pct !== undefined ||
    alert.sl_pct !== undefined ||
    alert.trail_pct !== undefined ||
    alert.breakeven_pct !== undefined ||
    alert.time_exit_minutes !== undefined;
  if (!hasAny) return undefined;

  const partials: PartialTakeProfit[] | undefined =
    alert.tp_pct !== undefined
      ? [{ pricePct: alert.tp_pct / 2, sizePct: 0.5, triggered: false }]
      : undefined;

  const rules: ManagerRules = {};
  if (alert.tp_pct !== undefined) rules.tpPct = alert.tp_pct;
  if (alert.sl_pct !== undefined) rules.slPct = alert.sl_pct;
  if (alert.trail_pct !== undefined) rules.trailPct = alert.trail_pct;
  if (alert.breakeven_pct !== undefined) rules.breakevenPct = alert.breakeven_pct;
  if (alert.time_exit_minutes !== undefined) {
    rules.timeExitMinutes = alert.time_exit_minutes;
  }
  if (partials) rules.partials = partials;
  return rules;
}

function recordRejection(
  symbol: string,
  alert: TvAlert,
  startedAt: number,
  error: string,
  status: 'rejected' | 'failed',
): ExecResult {
  const execTimeMs = Date.now() - startedAt;
  const event: WebhookEvent = {
    id: randId('evt'),
    receivedAt: startedAt,
    action: alert.action,
    symbol,
    amountUsd: alert.amount_usd,
    strategyId: alert.strategy_id,
    status,
    execTimeMs,
    error,
  };
  getStore().recordWebhookEvent(event);
  return { status, execTimeMs, error };
}

interface ResolvedIntent {
  side: 'LONG' | 'SHORT';
  amountUsd: number;
  reduceOnly: boolean;
  closingPosition?: BrokerPosition;
}

async function resolveIntent(
  alert: TvAlert,
  symbol: string,
): Promise<ResolvedIntent | { error: string }> {
  if (alert.action === 'buy') {
    return { side: 'LONG', amountUsd: alert.amount_usd, reduceOnly: false };
  }
  if (alert.action === 'sell') {
    return { side: 'SHORT', amountUsd: alert.amount_usd, reduceOnly: false };
  }

  // 'close' — determine direction from the current position.
  const broker = getBroker();
  const positions = await broker.getPositions();
  const current = positions.find((p) => p.symbol === symbol);
  if (!current) {
    return { error: `no open ${symbol} position to close` };
  }
  const side: 'LONG' | 'SHORT' = current.side === 'LONG' ? 'SHORT' : 'LONG';
  // Approximate USD notional at entry price; the broker will re-quote via
  // the current mark anyway.
  const amountUsd = current.amount * current.entryPrice;
  return {
    side,
    amountUsd: amountUsd > 0 ? amountUsd : alert.amount_usd,
    reduceOnly: true,
    closingPosition: current,
  };
}

export async function executeAlert(alert: TvAlert): Promise<ExecResult> {
  const startedAt = Date.now();
  await awaitStoreReady();
  const store = getStore();
  const broker = getBroker();
  const symbol = alert.symbol.toUpperCase();

  const intent = await resolveIntent(alert, symbol);
  if ('error' in intent) {
    return recordRejection(symbol, alert, startedAt, intent.error, 'rejected');
  }

  let result: BrokerOrderResult;
  try {
    result = await broker.createMarketOrder({
      symbol,
      side: intent.side,
      amountUsd: intent.amountUsd,
      slippagePct: 0.5,
      reduceOnly: intent.reduceOnly,
      clientOrderId: randId('cli'),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error('[executor] order failed:', msg);
    return recordRejection(symbol, alert, startedAt, msg, 'failed');
  }

  // Accrue estimated builder-code fee for accounting.
  store.recordFee({ symbol, amountUsd: result.feeUsd });

  // Install a manager for freshly opened positions only.
  let managerId: string | undefined;
  if (!intent.reduceOnly) {
    const rules = buildRules(alert);
    if (rules) {
      const mgrId = randId('mgr');
      const manager = new TpSlManager({
        id: mgrId,
        symbol,
        side: brokerSideToSdkSide(intent.side),
        entryPrice: result.filledAtPrice,
        createdAt: Date.now(),
        rules,
      });
      store.addManager(manager);
      ensureManagerLoop();
      managerId = mgrId;
    }
  } else {
    // On close, drop any managers tied to this symbol.
    for (const [mgrId, m] of store.managers.entries()) {
      if (m.symbol === symbol) store.removeManager(mgrId);
    }
  }

  const execTimeMs = Date.now() - startedAt;
  const event: WebhookEvent = {
    id: randId('evt'),
    receivedAt: startedAt,
    action: alert.action,
    symbol,
    amountUsd: alert.amount_usd,
    strategyId: alert.strategy_id,
    status: 'success',
    execTimeMs,
    filledPrice: result.filledAtPrice,
  };
  // Preserve numeric orderId on the event type (WebhookEvent expects number).
  if (typeof result.orderId === 'number') {
    event.orderId = result.orderId;
  } else {
    const parsed = Number(result.orderId);
    if (Number.isFinite(parsed)) event.orderId = parsed;
  }
  if (managerId) event.managerId = managerId;
  store.recordWebhookEvent(event);

  const execResult: ExecResult = {
    status: 'success',
    execTimeMs,
    filledPrice: result.filledAtPrice,
  };
  if (event.orderId !== undefined) execResult.orderId = event.orderId;
  if (managerId !== undefined) execResult.managerId = managerId;
  return execResult;
}
