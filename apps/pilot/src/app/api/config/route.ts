import { NextResponse } from 'next/server';
import { getPublicConfig } from '@/lib/config';
import { getBrokerStatus } from '@/lib/broker-factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/config
 *
 * Public (non-secret) slice of config for the UI, plus the current broker
 * status so the mode pill can show "LIVE" / "MOCK" / "LIVE MODE UNAVAILABLE".
 */
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    ...getPublicConfig(),
    broker: getBrokerStatus(),
  });
}
