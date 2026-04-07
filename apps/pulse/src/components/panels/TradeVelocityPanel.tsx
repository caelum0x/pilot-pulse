'use client';

import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatUsd } from '@/lib/format';
import type { TradeEvent } from '@/lib/pacifica-bridge-types';
import { computeTradeVelocity } from '@/lib/trade-velocity';
import { cn } from '@/lib/utils';

interface TradeVelocityPanelProps {
  trades: TradeEvent[];
  symbol: string;
}

export function TradeVelocityPanel({ trades, symbol }: TradeVelocityPanelProps) {
  // Re-compute every second so the velocity feels live.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1_000);
    return () => clearInterval(id);
  }, []);

  const metrics = useMemo(
    () => computeTradeVelocity(trades, symbol),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [trades, symbol, Math.floor(Date.now() / 1000)],
  );

  const levelColor =
    metrics.level === 'spike' ? 'text-destructive' :
    metrics.level === 'elevated' ? 'text-warning' :
    'text-muted-foreground';

  const biasColor =
    metrics.bias === 'buy_heavy' ? 'text-long' :
    metrics.bias === 'sell_heavy' ? 'text-short' :
    'text-muted-foreground';

  const buyPct = Math.round(metrics.buyRatio * 100);
  const sellPct = 100 - buyPct;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">Trade Velocity</CardTitle>
        <Badge
          variant={
            metrics.level === 'spike' ? 'short' :
            metrics.level === 'elevated' ? 'warning' :
            'muted'
          }
          className="text-[9px]"
        >
          {metrics.level.toUpperCase()}
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3 pt-0">
        {/* Main velocity readout */}
        <div className="flex items-baseline gap-2">
          <span className={cn('font-mono text-2xl font-bold', levelColor)}>
            {metrics.tradesPerSecond}
          </span>
          <span className="text-xs text-muted-foreground">trades/s</span>
        </div>

        {/* Volume rate */}
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-lg font-semibold text-foreground">
            {formatUsd(metrics.volumePerSecond)}/s
          </span>
          <span className="text-[10px] text-muted-foreground">
            ({formatUsd(metrics.totalVolume)} total · {metrics.tradeCount} trades)
          </span>
        </div>

        {/* Buy/sell ratio bar */}
        <div>
          <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Buy {buyPct}%</span>
            <span className={biasColor}>{metrics.bias.replace('_', ' ')}</span>
            <span>Sell {sellPct}%</span>
          </div>
          <div className="flex h-2 w-full overflow-hidden rounded-full">
            <div
              className="bg-emerald-500 transition-all duration-500"
              style={{ width: `${buyPct}%` }}
            />
            <div
              className="bg-destructive transition-all duration-500"
              style={{ width: `${sellPct}%` }}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
