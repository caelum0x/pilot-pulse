import type { CreateMarketOrderParams, Side } from '@pacifica-hack/sdk';
import type { MockPosition } from './types';

/**
 * In-memory Pacifica simulator.
 *
 * This is a *pretend* exchange — it lets the app demo the full flow
 * (webhook -> order -> position -> manager -> partial close) without touching
 * mainnet or a real SDK. All state is process-local and resets on restart.
 */

const STARTING_PRICES: Record<string, number> = {
  BTC: 93500,
  ETH: 3420,
  SOL: 215,
  HYPE: 28.4,
  XRP: 2.35,
};

const DRIFT_PCT_PER_TICK = 0.0008; // ~0.08% random walk per tick
const TICK_MS = 400;

class MockBackend {
  private prices = new Map<string, number>();
  private positions = new Map<string, MockPosition>();
  private orderIdSeq = 1000;
  private walkTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    for (const [sym, p] of Object.entries(STARTING_PRICES)) {
      this.prices.set(sym, p);
    }
  }

  /** Lazily start the random-walk loop. Safe to call many times. */
  ensureStarted(): void {
    if (this.walkTimer !== null) return;
    // Next.js dev may re-evaluate modules; guard against double-starts anyway.
    this.walkTimer = setInterval(() => this.step(), TICK_MS);
    // Don't block the event loop at shutdown.
    if (typeof this.walkTimer === 'object' && this.walkTimer && 'unref' in this.walkTimer) {
      (this.walkTimer as { unref?: () => void }).unref?.();
    }
  }

  private step(): void {
    for (const [sym, p] of this.prices.entries()) {
      const delta = (Math.random() * 2 - 1) * DRIFT_PCT_PER_TICK;
      const next = Math.max(0.0001, p * (1 + delta));
      this.prices.set(sym, next);
    }
  }

  getPrice(symbol: string): number {
    const p = this.prices.get(symbol.toUpperCase());
    if (p !== undefined) return p;
    // Unknown symbol — seed a synthetic price so the demo keeps working.
    const seeded = 100;
    this.prices.set(symbol.toUpperCase(), seeded);
    return seeded;
  }

  getAllPrices(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [sym, p] of this.prices.entries()) out[sym] = p;
    return out;
  }

  getPositions(): MockPosition[] {
    return Array.from(this.positions.values()).map((p) => ({ ...p }));
  }

  getPosition(symbol: string): MockPosition | undefined {
    const p = this.positions.get(symbol.toUpperCase());
    return p ? { ...p } : undefined;
  }

  /** Execute a market order and return the fill. Applies a simple slippage. */
  createMarketOrder(params: CreateMarketOrderParams): {
    orderId: number;
    filledPrice: number;
  } {
    const symbol = params.symbol.toUpperCase();
    const price = this.getPrice(symbol);
    const slipPct = parseFloat(params.slippage_percent ?? '0') / 100;
    const directional = params.side === 'bid' ? 1 : -1;
    const filledPrice = price * (1 + directional * slipPct * 0.25);
    const amount = parseFloat(params.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error('invalid order amount');
    }

    const existing = this.positions.get(symbol);
    const reduceOnly = params.reduce_only === true;

    if (!existing) {
      if (reduceOnly) {
        throw new Error('reduce_only order with no existing position');
      }
      this.positions.set(symbol, {
        symbol,
        side: params.side,
        amount,
        entryPrice: filledPrice,
        createdAt: Date.now(),
      });
    } else {
      const isOpposite = existing.side !== params.side;
      if (!isOpposite) {
        // Add to existing position — weighted average entry.
        const totalSize = existing.amount + amount;
        const weightedEntry =
          (existing.entryPrice * existing.amount + filledPrice * amount) / totalSize;
        this.positions.set(symbol, {
          ...existing,
          amount: totalSize,
          entryPrice: weightedEntry,
        });
      } else {
        // Close or flip.
        if (amount >= existing.amount - 1e-12) {
          const remainder = amount - existing.amount;
          this.positions.delete(symbol);
          if (!reduceOnly && remainder > 1e-12) {
            this.positions.set(symbol, {
              symbol,
              side: params.side,
              amount: remainder,
              entryPrice: filledPrice,
              createdAt: Date.now(),
            });
          }
        } else {
          this.positions.set(symbol, {
            ...existing,
            amount: existing.amount - amount,
          });
        }
      }
    }

    const orderId = ++this.orderIdSeq;
    return { orderId, filledPrice };
  }

  /** Close an entire position at market. Returns the fill price. */
  closePosition(symbol: string): { orderId: number; filledPrice: number } | undefined {
    const sym = symbol.toUpperCase();
    const pos = this.positions.get(sym);
    if (!pos) return undefined;
    const oppositeSide: Side = pos.side === 'bid' ? 'ask' : 'bid';
    return this.createMarketOrder({
      symbol: sym,
      side: oppositeSide,
      amount: String(pos.amount),
      slippage_percent: '0.5',
      reduce_only: true,
    });
  }
}

let singleton: MockBackend | null = null;

export function getMockBackend(): MockBackend {
  if (!singleton) {
    singleton = new MockBackend();
  }
  singleton.ensureStarted();
  return singleton;
}
