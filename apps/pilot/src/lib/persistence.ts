/**
 * Process-local JSON persistence for the pilot store.
 *
 * Next.js dev server + brief production restarts wipe in-memory state. We
 * dump the store to a single JSON file (`.pilot-state.json`) on every
 * mutation (debounced) and reload it on module init so webhook history,
 * active managers, and fee accounting survive restarts.
 *
 * Deliberately simple: no SQLite, no locking. If two processes write
 * concurrently, last-write-wins — acceptable for a single-instance demo.
 * Missing file on first run is a non-event.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ManagerSnapshot, WebhookEvent } from './types';

const STATE_FILE = path.join(process.cwd(), '.pilot-state.json');
const STATE_VERSION = 1;

export interface PersistedState {
  version: number;
  webhookEvents: WebhookEvent[];
  managers: ManagerSnapshot[];
  feeRevenueUsd: number;
  feeBySymbol: Record<string, number>;
  savedAt: number;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function parseNumber(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function parseFeeMap(v: unknown): Record<string, number> {
  if (!isObject(v)) return {};
  const out: Record<string, number> = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val === 'number' && Number.isFinite(val)) out[k] = val;
  }
  return out;
}

/**
 * Attempt to load persisted state. Returns null on missing file, parse
 * error, or version mismatch — none of those should be fatal.
 */
export async function loadState(): Promise<PersistedState | null> {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (!isObject(parsed)) return null;
    if (parsed.version !== STATE_VERSION) return null;

    const events = Array.isArray(parsed.webhookEvents)
      ? (parsed.webhookEvents as WebhookEvent[])
      : [];
    const managers = Array.isArray(parsed.managers)
      ? (parsed.managers as ManagerSnapshot[])
      : [];
    return {
      version: STATE_VERSION,
      webhookEvents: events,
      managers,
      feeRevenueUsd: parseNumber(parsed.feeRevenueUsd, 0),
      feeBySymbol: parseFeeMap(parsed.feeBySymbol),
      savedAt: parseNumber(parsed.savedAt, 0),
    };
  } catch (err) {
    const isNotFound =
      err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'ENOENT';
    if (!isNotFound) {
      // eslint-disable-next-line no-console
      console.error('[persistence] failed to load state:', err);
    }
    return null;
  }
}

/** Atomically write state to disk. */
export async function saveState(state: PersistedState): Promise<void> {
  const payload: PersistedState = { ...state, version: STATE_VERSION, savedAt: Date.now() };
  const tmpFile = `${STATE_FILE}.tmp`;
  try {
    await fs.writeFile(tmpFile, JSON.stringify(payload, null, 2), 'utf8');
    await fs.rename(tmpFile, STATE_FILE);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[persistence] failed to save state:', err);
  }
}

export function getStateFilePath(): string {
  return STATE_FILE;
}

export const STATE_VERSION_CURRENT = STATE_VERSION;
