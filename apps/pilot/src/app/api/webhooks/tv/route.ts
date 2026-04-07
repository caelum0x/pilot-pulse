import { NextRequest, NextResponse } from 'next/server';
import { verifyHmac } from '@/lib/hmac';
import { executeAlert } from '@/lib/executor';
import { alertSchema } from '@/lib/schemas';
import { config } from '@/lib/config';
import { checkRateLimit } from '@/lib/rate-limiter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * TradingView -> PacificaPilot webhook.
 *
 * Expects:
 *   POST /api/webhooks/tv
 *   Header: x-pilot-signature: <hex hmac-sha256 of raw body>
 *   Body:   JSON matching `TvAlert`
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  if (!checkRateLimit(ip, { windowMs: 60_000, limit: 30 })) {
    return NextResponse.json({ error: 'rate limited' }, { status: 429 });
  }

  const raw = await req.text();
  const sig = req.headers.get('x-pilot-signature');

  if (!sig || !verifyHmac(raw, sig, config.webhookSecret)) {
    return NextResponse.json({ error: 'invalid signature' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'bad json' }, { status: 400 });
  }

  const parsed = alertSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid alert', details: parsed.error.issues },
      { status: 400 },
    );
  }

  const result = await executeAlert(parsed.data);
  const httpStatus = result.status === 'success' ? 200 : result.status === 'rejected' ? 422 : 500;
  return NextResponse.json(result, { status: httpStatus });
}
