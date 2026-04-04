/**
 * Process-local stores for PacificaPilot.
 *
 * State lives in memory but is mirrored to a JSON file (`.pilot-state.json`)
 * via the persistence layer so Next.js dev hot reload and brief server
 * restarts don't wipe webhook history, active managers, or fee accounting.
 *
 * All mutations schedule a debounced save (500 ms window). Rehydration is
 * best-effort and runs on first access.
 */

import { RingBuffer } from './ring-buffer';
import { TpSlManager } from './manager';
import { loadState, saveState, type PersistedState } from './persistence';
import type { ManagerSnapshot, WebhookEvent } from './types';

const MAX_WEBHOOK_HISTORY = 200;
const SAVE_DEBOUNCE_MS = 500;

export interface FeeRevenueEntry {
  symbol: string;
  amountUsd: number;
}

class PilotStore {
  readonly webhookEvents = new RingBuffer<WebhookEvent>(MAX_WEBHOOK_HISTORY);
  readonly managers = new Map<string, TpSlManager>();
  private feeRevenueUsd = 0;
  private readonly feeBySymbol = new Map<string, number>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private rehydrated = false;

  /** Idempotent rehydration from the on-disk snapshot. */
  async rehydrate(): Promise<void> {
    if (this.rehydrated) return;
    this.rehydrated = true;
    const snap = await loadState();
    if (!snap) return;

    // Webhook events: persisted newest-first (ring buffer insertion order).
    // To restore the same ordering, push oldest → newest.
    const sorted = [...snap.webhookEvents].sort(
      (a, b) => a.receivedAt - b.receivedAt,
    );
    for (const ev of sorted) this.webhookEvents.push(ev);

    for (const mgrSnap of snap.managers) {
      try {
        const mgr = TpSlManager.fromSnapshot(mgrSnap);
        this.managers.set(mgr.id, mgr);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[store] failed to rehydrate manager', mgrSnap.id, err);
      }
    }

    this.feeRevenueUsd = snap.feeRevenueUsd;
    for (const [sym, amt] of Object.entries(snap.feeBySymbol)) {
      this.feeBySymbol.set(sym, amt);
    }
  }

  recordWebhookEvent(event: WebhookEvent): void {
    this.webhookEvents.push(event);
    this.schedulePersist();
  }

  recordFee(entry: FeeRevenueEntry): void {
    if (!Number.isFinite(entry.amountUsd) || entry.amountUsd <= 0) return;
    this.feeRevenueUsd += entry.amountUsd;
    const prev = this.feeBySymbol.get(entry.symbol) ?? 0;
    this.feeBySymbol.set(entry.symbol, prev + entry.amountUsd);
    this.schedulePersist();
  }

  getFeeRevenueUsd(): number {
    return this.feeRevenueUsd;
  }

  getFeeBySymbol(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.feeBySymbol.entries()) out[k] = v;
    return out;
  }

  addManager(manager: TpSlManager): void {
    this.managers.set(manager.id, manager);
    this.schedulePersist();
  }

  removeManager(id: string): boolean {
    const removed = this.managers.delete(id);
    if (removed) this.schedulePersist();
    return removed;
  }

  /** Deprecated alias — kept for backwards compat with existing API routes. */
  deleteManager(id: string): boolean {
    return this.removeManager(id);
  }

  /** Force-persist the current state to disk. Primarily for tests. */
  async flush(): Promise<void> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    await saveState(this.toPersistedState());
  }

  private schedulePersist(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const snapshot = this.toPersistedState();
      // Fire and forget — errors are logged inside saveState.
      void saveState(snapshot);
    }, SAVE_DEBOUNCE_MS);
    if (this.saveTimer && typeof this.saveTimer === 'object' && 'unref' in this.saveTimer) {
      (this.saveTimer as { unref?: () => void }).unref?.();
    }
  }

  private toPersistedState(): PersistedState {
    const managerSnapshots: ManagerSnapshot[] = [];
    for (const m of this.managers.values()) managerSnapshots.push(m.snapshot());
    return {
      version: 1,
      webhookEvents: this.webhookEvents.toArray(),
      managers: managerSnapshots,
      feeRevenueUsd: this.feeRevenueUsd,
      feeBySymbol: this.getFeeBySymbol(),
      savedAt: Date.now(),
    };
  }
}

// Hot-reload safe singleton for Next.js dev.
declare global {
  // eslint-disable-next-line no-var
  var __pilotStore: PilotStore | undefined;
  // eslint-disable-next-line no-var
  var __pilotStoreRehydrated: Promise<void> | undefined;
}

export function getStore(): PilotStore {
  if (!globalThis.__pilotStore) {
    const store = new PilotStore();
    globalThis.__pilotStore = store;
    // Kick off rehydration once per process. Callers don't need to await
    // this — the store is empty until rehydration finishes and then new
    // events are merged in normally.
    globalThis.__pilotStoreRehydrated = store.rehydrate().catch((err) => {
      // eslint-disable-next-line no-console
      console.error('[store] rehydrate failed:', err);
    });
  }
  return globalThis.__pilotStore;
}

/** Await initial rehydration — useful for route handlers that need consistency. */
export async function awaitStoreReady(): Promise<void> {
  getStore();
  if (globalThis.__pilotStoreRehydrated) {
    await globalThis.__pilotStoreRehydrated;
  }
}
