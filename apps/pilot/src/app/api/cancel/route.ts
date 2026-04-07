import { NextRequest, NextResponse } from 'next/server';
import { getBroker } from '@/lib/broker-factory';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/cancel
 * Body: { symbol?: string }
 *
 * Cancel all open orders for a symbol (or all symbols if omitted).
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    // Empty body is fine — means cancel all.
  }

  const symbol = typeof body.symbol === 'string' ? body.symbol.toUpperCase() : undefined;

  try {
    const broker = getBroker();
    await broker.cancelAllOrders(symbol);
    return NextResponse.json({
      ok: true,
      cancelled: symbol ? `all orders for ${symbol}` : 'all orders',
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
