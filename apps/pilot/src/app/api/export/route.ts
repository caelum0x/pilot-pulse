import { NextResponse } from 'next/server';
import { awaitStoreReady, getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/export?format=csv|json
 *
 * Export webhook event history. Inspired by global-intel's exportToCSV
 * utility — provides a downloadable file for trade analysis.
 */
export async function GET(req: Request): Promise<NextResponse> {
  await awaitStoreReady();
  const store = getStore();
  const events = store.webhookEvents.toArray();

  const url = new URL(req.url);
  const format = url.searchParams.get('format') ?? 'csv';

  if (format === 'json') {
    return new NextResponse(JSON.stringify(events, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="pilot-history.json"',
      },
    });
  }

  const header = 'id,receivedAt,action,symbol,amountUsd,strategyId,status,orderId,filledPrice,execTimeMs,error';
  const rows = events.map((e) =>
    [
      e.id,
      new Date(e.receivedAt).toISOString(),
      e.action,
      e.symbol,
      e.amountUsd,
      e.strategyId,
      e.status,
      e.orderId ?? '',
      e.filledPrice ?? '',
      e.execTimeMs,
      e.error ? `"${e.error.replace(/"/g, '""')}"` : '',
    ].join(','),
  );

  const csv = [header, ...rows].join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="pilot-history.csv"',
    },
  });
}
