'use client';

import { useEffect, useRef, useState } from 'react';
import type { MarketRow } from '@/lib/pacifica-bridge-types';

export interface FundingPoint {
  timestamp: number;
  rate: number;
}

const MAX_POINTS = 120;

/**
 * Accumulate funding rate history from the live market stream.
 * No separate API call needed — we extract the rate from each
 * market refresh tick and build a time series locally.
 */
export function useFundingHistory(
  symbol: string,
  markets: MarketRow[],
): {
  data: FundingPoint[];
  isLoading: boolean;
} {
  const [data, setData] = useState<FundingPoint[]>([]);
  const prevSymbolRef = useRef(symbol);

  // Reset history when symbol changes.
  useEffect(() => {
    if (prevSymbolRef.current !== symbol) {
      setData([]);
      prevSymbolRef.current = symbol;
    }
  }, [symbol]);

  // Accumulate a new point whenever markets refresh.
  useEffect(() => {
    const market = markets.find((m) => m.symbol === symbol);
    if (!market || market.fundingRate === 0) return;

    setData((prev) => {
      const now = Date.now();
      // Dedupe: don't add a point if the last one was less than 5s ago.
      if (prev.length > 0 && now - prev[prev.length - 1]!.timestamp < 5_000) {
        return prev;
      }
      const next = [...prev, { timestamp: now, rate: market.fundingRate }];
      if (next.length > MAX_POINTS) next.shift();
      return next;
    });
  }, [markets, symbol]);

  return { data, isLoading: markets.length === 0 };
}
