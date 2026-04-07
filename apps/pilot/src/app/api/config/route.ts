import { NextResponse } from 'next/server';
import { getPublicConfig } from '@/lib/config';
import { getBroker, getBrokerStatus } from '@/lib/broker-factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/config
 *
 * Public (non-secret) slice of config for the UI, plus the current broker
 * status and account balance.
 */
export async function GET(): Promise<NextResponse> {
  let balance: number | undefined;
  try {
    balance = await getBroker().getAccountBalance();
  } catch {
    // Balance fetch may fail — surface what we can.
  }

  return NextResponse.json({
    ...getPublicConfig(),
    broker: getBrokerStatus(),
    balance,
  });
}
