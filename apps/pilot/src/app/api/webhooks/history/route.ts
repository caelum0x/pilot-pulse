import { NextResponse } from 'next/server';
import { awaitStoreReady, getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  await awaitStoreReady();
  const store = getStore();
  return NextResponse.json({
    events: store.webhookEvents.toArray(),
    feeRevenueUsd: store.getFeeRevenueUsd(),
    feeBySymbol: store.getFeeBySymbol(),
  });
}
