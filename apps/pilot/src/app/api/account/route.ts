import { NextResponse } from 'next/server';
import { getBroker } from '@/lib/broker-factory';
import { getStore, awaitStoreReady } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/account
 *
 * Returns account-level summary: balance, position count, manager count,
 * total fee revenue, and total trade volume from history.
 */
export async function GET(): Promise<NextResponse> {
  await awaitStoreReady();
  const store = getStore();
  const broker = getBroker();

  let balance = 0;
  let positionCount = 0;
  let partial = false;

  try {
    balance = await broker.getAccountBalance();
    const positions = await broker.getPositions();
    positionCount = positions.length;
  } catch {
    partial = true;
  }

  const events = store.webhookEvents.toArray();
  const totalVolume = events.reduce((s, e) => s + e.amountUsd, 0);
  const tradeCount = events.length;

  return NextResponse.json({
    balance,
    positionCount,
    managerCount: store.managers.size,
    feeRevenueUsd: store.getFeeRevenueUsd(),
    feeBySymbol: store.getFeeBySymbol(),
    totalVolume,
    tradeCount,
    partial,
  });
}
