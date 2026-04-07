import { NextRequest, NextResponse } from 'next/server';
import { PacificaClient } from '@pacifica-hack/sdk';
import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/leverage
 * Body: { symbol: string, leverage: number }
 *
 * Update leverage for a symbol via the Pacifica SDK.
 * Only available in live mode with configured credentials.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  if (!config.live || !config.address || !config.privateKey) {
    return NextResponse.json(
      { error: 'leverage update requires live mode with credentials' },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (
    typeof body !== 'object' || body === null ||
    typeof (body as Record<string, unknown>).symbol !== 'string' ||
    typeof (body as Record<string, unknown>).leverage !== 'number'
  ) {
    return NextResponse.json(
      { error: 'body must have { symbol: string, leverage: number }' },
      { status: 400 },
    );
  }

  const { symbol, leverage } = body as { symbol: string; leverage: number };

  if (leverage < 1 || leverage > 100 || !Number.isFinite(leverage)) {
    return NextResponse.json(
      { error: 'leverage must be between 1 and 100' },
      { status: 400 },
    );
  }

  try {
    const client = new PacificaClient({
      env: config.env,
      address: config.address,
      privateKey: config.privateKey,
    });
    await client.updateLeverage({
      symbol: symbol.toUpperCase(),
      leverage,
    });
    return NextResponse.json({ ok: true, symbol: symbol.toUpperCase(), leverage });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
