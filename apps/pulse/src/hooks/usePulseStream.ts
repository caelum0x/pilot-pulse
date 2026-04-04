'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { OrderbookSnapshot } from '@pacifica-hack/sdk';

import { usePulseStore } from '@/lib/store';
import { PacificaBridge } from '@/lib/pacifica-bridge';
import type {
  BridgeStatus,
  MarketRow,
  WhaleEvent,
} from '@/lib/pacifica-bridge-types';
import { computeFusionSignals } from '@/lib/fusion';
import type { FusionSignal } from '@/lib/pacifica-bridge-types';
import { getWhaleAddresses } from '@/lib/whale-addresses';
import {
  computeImbalance,
  generateInitialFusionSignals,
  generateInitialWhaleEvents,
  generateMockMarkets,
  generateMockOrderbook,
  startMockStream,
} from '@/lib/mock-data';

const FOCUSED_SYMBOLS: readonly string[] = ['BTC', 'ETH', 'SOL', 'HYPE', 'WIF'];
const MAX_WHALE_EVENTS = 100;
const MAX_SIGNALS = 20;
const MAX_IMBALANCE_POINTS = 120;

export interface ImbalancePoint {
  t: number;
  imbalance: number;
  spreadBps: number;
}

export interface PulseStreamState {
  markets: MarketRow[];
  whaleEvents: WhaleEvent[];
  fusionSignals: FusionSignal[];
  orderbook: OrderbookSnapshot | null;
  orderbookBySymbol: Record<string, OrderbookSnapshot>;
  imbalanceHistory: ImbalancePoint[];
  imbalanceBySymbol: Record<string, number>;
  isLive: boolean;
}

function resolveLiveMode(): boolean {
  if (typeof process === 'undefined') return true;
  // Default: live. Only explicit `true` flips to mock.
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'true';
}

function computeImbalanceRatio(snapshot: OrderbookSnapshot): number {
  const { imbalance } = computeImbalance(snapshot);
  return imbalance;
}

/**
 * Live data hook for the PacificaPulse dashboard.
 *
 * Default mode is **live** via `@pacifica-hack/sdk`. Set
 * `NEXT_PUBLIC_USE_MOCK_DATA=true` to force the mock path — useful for
 * demo environments that don't have a testnet account provisioned.
 */
export function usePulseStream(): PulseStreamState {
  const isLive = useMemo(() => resolveLiveMode(), []);
  const env = usePulseStore((s) => s.env);
  const focusedSymbol = usePulseStore((s) => s.focusedSymbol);
  const setWsStatus = usePulseStore((s) => s.setWsStatus);
  const touchLastUpdate = usePulseStore((s) => s.touchLastUpdate);

  const focusedSymbolRef = useRef(focusedSymbol);
  useEffect(() => {
    focusedSymbolRef.current = focusedSymbol;
  }, [focusedSymbol]);

  // Seeds differ between live and mock modes: in live mode we start empty
  // and let the bridge populate the UI as data arrives; in mock mode we
  // pre-seed so the old demo feel is preserved.
  const [markets, setMarkets] = useState<MarketRow[]>(() =>
    isLive ? [] : generateMockMarkets(),
  );
  const [whaleEvents, setWhaleEvents] = useState<WhaleEvent[]>(() =>
    isLive ? [] : (generateInitialWhaleEvents(14) as unknown as WhaleEvent[]),
  );
  const [fusionSignals, setFusionSignals] = useState<FusionSignal[]>(() =>
    isLive ? [] : (generateInitialFusionSignals(6) as unknown as FusionSignal[]),
  );
  const [orderbookBySymbol, setOrderbookBySymbol] = useState<Record<string, OrderbookSnapshot>>(
    () => {
      if (isLive) return {};
      const seed = generateMockOrderbook(focusedSymbol);
      return { [focusedSymbol]: seed };
    },
  );
  const [imbalanceBySymbol, setImbalanceBySymbol] = useState<Record<string, number>>(() => {
    if (isLive) return {};
    const seed = generateMockOrderbook(focusedSymbol);
    return { [focusedSymbol]: computeImbalanceRatio(seed) };
  });
  const [imbalanceHistory, setImbalanceHistory] = useState<ImbalancePoint[]>(() => {
    if (isLive) return [];
    const now = Date.now();
    return Array.from({ length: 30 }, (_, i) => {
      const ob = generateMockOrderbook(focusedSymbol);
      const { imbalance, spreadBps } = computeImbalance(ob);
      return { t: now - (30 - i) * 1000, imbalance, spreadBps };
    });
  });

  // ── Orderbook handler ───────────────────────────────────────────────────
  const handleOrderbook = useCallback(
    (snapshot: OrderbookSnapshot) => {
      setOrderbookBySymbol((prev) => ({ ...prev, [snapshot.symbol]: snapshot }));
      const { imbalance, spreadBps } = computeImbalance(snapshot);
      setImbalanceBySymbol((prev) => ({ ...prev, [snapshot.symbol]: imbalance }));
      if (snapshot.symbol === focusedSymbolRef.current) {
        setImbalanceHistory((prev) => {
          const next = [...prev, { t: snapshot.timestamp, imbalance, spreadBps }];
          if (next.length > MAX_IMBALANCE_POINTS) next.shift();
          return next;
        });
      }
      touchLastUpdate();
    },
    [touchLastUpdate],
  );

  // Reset per-symbol focus visualisation when focusedSymbol changes.
  useEffect(() => {
    setImbalanceHistory([]);
  }, [focusedSymbol]);

  // ── Live mode effect ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isLive) return;

    setWsStatus('connecting');
    const bridge = new PacificaBridge(
      {
        env,
        focusedSymbols: FOCUSED_SYMBOLS,
        whaleAddresses: getWhaleAddresses(),
      },
      {
        onStatus: (status: BridgeStatus) => {
          setWsStatus(status);
        },
        onMarkets: (rows) => {
          setMarkets(rows);
          touchLastUpdate();
        },
        onOrderbook: (_symbol, snapshot) => {
          handleOrderbook(snapshot);
        },
        onWhaleEvent: (event) => {
          setWhaleEvents((prev) => {
            const next = [event, ...prev];
            if (next.length > MAX_WHALE_EVENTS) next.length = MAX_WHALE_EVENTS;
            return next;
          });
          touchLastUpdate();
        },
      },
    );

    bridge.start();

    return () => {
      bridge.stop();
    };
  }, [isLive, env, handleOrderbook, setWsStatus, touchLastUpdate]);

  // ── Mock mode effect ────────────────────────────────────────────────────
  useEffect(() => {
    if (isLive) return;

    setWsStatus('connecting');
    const openTimer = setTimeout(() => setWsStatus('open'), 400);

    const stop = startMockStream({
      getFocusedSymbol: () => focusedSymbolRef.current,
      onMarkets: (rows) => {
        setMarkets(rows);
        touchLastUpdate();
      },
      onWhaleEvent: (ev) => {
        // The mock module emits its own WhaleEvent shape — map it to the
        // canonical bridge shape so downstream code has one type.
        const mapped: WhaleEvent = {
          id: ev.id,
          timestamp: ev.timestamp,
          address: ev.address,
          symbol: ev.symbol,
          side: ev.direction,
          eventType: ev.eventType,
          sizeUsd: ev.sizeUsd,
          entryPrice: String(ev.price),
        };
        setWhaleEvents((prev) => {
          const next = [mapped, ...prev];
          if (next.length > MAX_WHALE_EVENTS) next.length = MAX_WHALE_EVENTS;
          return next;
        });
        touchLastUpdate();
      },
      onOrderbook: (ob) => {
        handleOrderbook(ob);
      },
      onFusionSignal: (sig) => {
        const mapped: FusionSignal = {
          id: sig.id,
          timestamp: sig.timestamp,
          symbol: sig.symbol,
          direction: sig.direction,
          confidence: sig.confidence,
          headline: sig.headline,
          description: sig.description,
        };
        setFusionSignals((prev) => {
          const next = [mapped, ...prev];
          if (next.length > MAX_SIGNALS) next.length = MAX_SIGNALS;
          return next;
        });
        touchLastUpdate();
      },
    });

    return () => {
      clearTimeout(openTimer);
      stop();
      setWsStatus('closed');
    };
  }, [isLive, handleOrderbook, setWsStatus, touchLastUpdate]);

  // ── Fusion signal computation (live mode only) ──────────────────────────
  useEffect(() => {
    if (!isLive) return;
    const next = computeFusionSignals(whaleEvents, imbalanceBySymbol);
    const trimmed = next.slice(0, MAX_SIGNALS);
    setFusionSignals(trimmed);
  }, [isLive, whaleEvents, imbalanceBySymbol]);

  const orderbook = orderbookBySymbol[focusedSymbol] ?? null;

  return {
    markets,
    whaleEvents,
    fusionSignals,
    orderbook,
    orderbookBySymbol,
    imbalanceHistory,
    imbalanceBySymbol,
    isLive,
  };
}
