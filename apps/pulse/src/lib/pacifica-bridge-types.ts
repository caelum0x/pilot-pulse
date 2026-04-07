/**
 * Shared types for the Pacifica live data bridge.
 *
 * Kept in a separate file from `pacifica-bridge.ts` so pure modules
 * (`whale-diff`, `fusion`) can consume them without pulling in the
 * stateful bridge class or its WebSocket dependency.
 */

export type WhaleSide = 'LONG' | 'SHORT';

export type WhaleEventType = 'OPEN' | 'ADD' | 'REDUCE' | 'CLOSE';

/**
 * A single position change detected by diffing consecutive `getPositions()`
 * snapshots for a tracked address. `sizeUsd` is the USD notional of the
 * delta (for ADD/REDUCE) or the full position (for OPEN/CLOSE).
 */
export interface WhaleEvent {
  id: string;
  timestamp: number;
  address: string;
  symbol: string;
  side: WhaleSide;
  eventType: WhaleEventType;
  sizeUsd: number;
  entryPrice: string;
}

export type BridgeStatus = 'connecting' | 'open' | 'closed' | 'error';

/**
 * Normalized market row published by the bridge. Merges `MarketInfo`
 * (static spec) with the latest price tick so panels can render a
 * complete row with a single object.
 */
export interface MarketRow {
  symbol: string;
  price: number;
  change24h: number;
  fundingRate: number;
  openInterestUsd: number;
  tickSize: string;
  maxLeverage: number;
}

export type SignalConfidence = 'HIGH' | 'MED' | 'LOW';

export interface FusionSignal {
  id: string;
  timestamp: number;
  symbol: string;
  direction: WhaleSide;
  headline: string;
  description: string;
  confidence: SignalConfidence;
}

/**
 * A single trade event from the Pacifica trades WebSocket channel.
 */
export interface TradeEvent {
  id: string;
  timestamp: number;
  symbol: string;
  side: 'bid' | 'ask';
  price: number;
  size: number;
}
