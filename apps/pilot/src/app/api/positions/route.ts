import { NextResponse } from 'next/server';
import { getBroker } from '@/lib/broker-factory';
import { getStore } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export interface PositionRow {
  symbol: string;
  side: 'LONG' | 'SHORT';
  amount: number;
  entryPrice: number;
  markPrice: number;
  pnlUsd: number;
  pnlPct: number;
  createdAt: number;
  managerId?: string;
}

/**
 * GET /api/positions
 *
 * Returns live (or mock) positions from the configured broker, annotated
 * with the managerId of any attached TP/SL manager. Fails soft with an
 * empty list and a warning on upstream errors so the dashboard stays
 * responsive even when Pacifica is flaky.
 */
export async function GET(): Promise<NextResponse> {
  try {
    const broker = getBroker();
    const store = getStore();

    const managerBySymbol = new Map<string, string>();
    for (const [id, mgr] of store.managers.entries()) {
      managerBySymbol.set(mgr.symbol, id);
    }

    const positions = await broker.getPositions();

    const rows: PositionRow[] = [];
    for (const p of positions) {
      let markPrice = p.entryPrice;
      try {
        markPrice = await broker.getMarkPrice(p.symbol);
      } catch {
        // Fall back to entry price when the mark fetch fails; better than
        // omitting the row entirely.
      }
      const directional = p.side === 'LONG' ? 1 : -1;
      const pnlUsd = directional * (markPrice - p.entryPrice) * p.amount;
      const pnlPct =
        p.entryPrice > 0
          ? (directional * (markPrice - p.entryPrice) / p.entryPrice) * 100
          : 0;
      const row: PositionRow = {
        symbol: p.symbol,
        side: p.side,
        amount: p.amount,
        entryPrice: p.entryPrice,
        markPrice,
        pnlUsd,
        pnlPct,
        createdAt: p.createdAt,
      };
      const mgrId = managerBySymbol.get(p.symbol);
      if (mgrId) row.managerId = mgrId;
      rows.push(row);
    }

    return NextResponse.json({ positions: rows });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // eslint-disable-next-line no-console
    console.error('[api/positions] failed to load positions:', msg);
    return NextResponse.json(
      { positions: [], warning: msg },
      { status: 200 },
    );
  }
}
