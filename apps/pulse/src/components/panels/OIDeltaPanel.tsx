'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatUsd } from '@/lib/format';
import type { MarketRow } from '@/lib/pacifica-bridge-types';
import { cn } from '@/lib/utils';

interface OIDeltaPanelProps {
  markets: MarketRow[];
  symbol: string;
}

interface OIPoint {
  t: number;
  oi: number;
}

const MAX_POINTS = 120;

/**
 * Tracks Open Interest changes over time for the focused symbol.
 * OI rising + price rising = strong trend (new money entering).
 * OI falling = positions being closed (unwinding).
 */
export function OIDeltaPanel({ markets, symbol }: OIDeltaPanelProps) {
  const [history, setHistory] = useState<OIPoint[]>([]);
  const prevSymbolRef = useRef(symbol);

  // Reset on symbol change.
  useEffect(() => {
    if (prevSymbolRef.current !== symbol) {
      setHistory([]);
      prevSymbolRef.current = symbol;
    }
  }, [symbol]);

  // Accumulate OI data from market refreshes.
  useEffect(() => {
    const market = markets.find((m) => m.symbol === symbol);
    if (!market || market.openInterestUsd === 0) return;

    setHistory((prev) => {
      const now = Date.now();
      if (prev.length > 0 && now - prev[prev.length - 1]!.t < 5_000) return prev;
      const next = [...prev, { t: now, oi: market.openInterestUsd }];
      if (next.length > MAX_POINTS) next.shift();
      return next;
    });
  }, [markets, symbol]);

  const currentOI = history.length > 0 ? history[history.length - 1]!.oi : 0;
  const firstOI = history.length > 1 ? history[0]!.oi : currentOI;
  const deltaUsd = currentOI - firstOI;
  const deltaPct = firstOI > 0 ? (deltaUsd / firstOI) * 100 : 0;
  const isRising = deltaUsd >= 0;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-1">
        <CardTitle className="text-sm">Open Interest</CardTitle>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">{symbol}</span>
          {history.length > 1 && (
            <Badge variant={isRising ? 'long' : 'short'} className="text-[9px]">
              {isRising ? '+' : ''}{deltaPct.toFixed(2)}%
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-2 overflow-hidden p-3 pt-0">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-lg font-bold text-foreground">
            {formatUsd(currentOI)}
          </span>
          {history.length > 1 && (
            <span className={cn('font-mono text-xs', isRising ? 'text-long' : 'text-short')}>
              {isRising ? '+' : ''}{formatUsd(deltaUsd)}
            </span>
          )}
        </div>
        <div className="flex-1 min-h-0">
          {history.length < 2 ? (
            <div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
              accumulating data…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="oiGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop
                      offset="0%"
                      stopColor={isRising ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}
                      stopOpacity={0.3}
                    />
                    <stop
                      offset="100%"
                      stopColor={isRising ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}
                      stopOpacity={0}
                    />
                  </linearGradient>
                </defs>
                <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} hide />
                <YAxis domain={['auto', 'auto']} hide />
                <Tooltip
                  contentStyle={{
                    background: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: 6,
                    fontSize: 11,
                  }}
                  labelFormatter={(t: number) => new Date(t).toLocaleTimeString()}
                  formatter={(v: number) => [formatUsd(v), 'OI']}
                />
                <Area
                  type="monotone"
                  dataKey="oi"
                  stroke={isRising ? 'hsl(var(--success))' : 'hsl(var(--destructive))'}
                  strokeWidth={1.5}
                  fill="url(#oiGrad)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
