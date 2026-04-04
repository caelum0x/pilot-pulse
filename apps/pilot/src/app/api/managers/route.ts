import { NextRequest, NextResponse } from 'next/server';
import { awaitStoreReady, getStore } from '@/lib/store';
import type { ManagerSnapshot } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/managers       -> list active TP/SL managers
 * DELETE /api/managers?id -> remove a manager (does NOT close its position)
 */
export async function GET(): Promise<NextResponse> {
  await awaitStoreReady();
  const store = getStore();
  const managers: ManagerSnapshot[] = Array.from(store.managers.values()).map((m) => m.snapshot());
  return NextResponse.json({ managers });
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');
  if (!id) {
    return NextResponse.json({ error: 'missing id' }, { status: 400 });
  }
  const store = getStore();
  const removed = store.deleteManager(id);
  if (!removed) {
    return NextResponse.json({ error: 'manager not found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, id });
}
