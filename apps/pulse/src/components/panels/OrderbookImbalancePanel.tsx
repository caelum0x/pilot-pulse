'use client';

import { useMemo } from 'react';
import { Layers } from 'lucide-react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import type { OrderbookSnapshot } from '@pacifica-hack/sdk';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { computeImbalance } from '@/lib/mock-data';
import { formatBps, formatPrice, formatSigned } from '@/lib/format';
import type { ImbalancePoint } from '@/hooks/usePulseStream';
import { cn } from '@/lib/utils';

interface OrderbookImbalancePanelProps {
  symbol: string;
  orderbook: OrderbookSnapshot | null;
  history: ImbalancePoint[];
}

export function OrderbookImbalancePanel({
  symbol,
  orderbook,
  history,
}: OrderbookImbalancePanelProps): React.JSX.Element {
  const stats = useMemo(() => {
    if (!orderbook) return null;
    return computeImbalance(orderbook);
  }, [orderbook]);

  const maxLevelSize = useMemo(() => {
    if (!orderbook) return 1;
    const all = [...orderbook.bids, ...orderbook.asks].map((l) => parseFloat(l.size));
    return Math.max(...all, 1);
  }, [orderbook]);

  const imbalance = stats?.imbalance ?? 0;
  const imbalanceColor =
    imbalance > 0.05 ? 'text-long' : imbalance < -0.05 ? 'text-short' : 'text-neutral';
  const imbalanceBg =
    imbalance > 0.05
      ? 'bg-long-soft border-[hsl(var(--success))]/30'
      : imbalance < -0.05
      ? 'bg-short-soft border-[hsl(var(--destructive))]/30'
      : 'bg-neutral-soft border-primary/30';

  const chartColor =
    imbalance >= 0 ? 'hsl(var(--success))' : 'hsl(var(--destructive))';

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-primary" />
          <CardTitle>Orderbook Imbalance</CardTitle>
        </div>
        <Badge variant="default" className="font-mono">
          {symbol}
        </Badge>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3 p-3">
        {/* Symbol + big number row */}
        <div className="flex items-stretch gap-3">
          {/* Big imbalance readout */}
          <div
            className={cn(
              'flex flex-1 flex-col justify-center rounded-md border px-3 py-2',
              imbalanceBg,
            )}
          >
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
              Imbalance
            </div>
            <div className={cn('font-mono text-3xl font-bold tabular-nums', imbalanceColor)}>
              {formatSigned(imbalance)}
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-center rounded-md border border-border bg-muted/20 px-3 py-2">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
              Spread
            </div>
            <div className="font-mono text-xl font-semibold tabular-nums text-foreground">
              {stats ? formatBps(stats.spreadBps) : '—'}
            </div>
            <div className="font-mono text-[10px] text-muted-foreground">
              mid {stats ? formatPrice(stats.midPrice) : '—'}
            </div>
          </div>
        </div>

        {/* Depth bars */}
        <div className="flex flex-1 gap-2 overflow-hidden">
          {/* Bids */}
          <div className="flex flex-1 flex-col gap-[2px]">
            <div className="mb-0.5 flex items-center justify-between text-[9px] uppercase tracking-wider">
              <span className="text-long">Bids</span>
              <span className="text-muted-foreground font-mono">
                {stats ? stats.bidDepth.toFixed(2) : '—'}
              </span>
            </div>
            {orderbook?.bids.slice(0, 10).map((level, i) => {
              const size = parseFloat(level.size);
              const pct = (size / maxLevelSize) * 100;
              return (
                <div key={`b-${i}`} className="relative h-4 overflow-hidden rounded-sm">
                  <div
                    className="absolute inset-y-0 right-0 bg-[hsl(var(--success))]/25 transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative flex h-full items-center justify-between px-1.5 font-mono text-[9px] tabular-nums">
                    <span className="text-long">{parseFloat(level.price).toFixed(2)}</span>
                    <span className="text-foreground/80">{size.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Asks */}
          <div className="flex flex-1 flex-col gap-[2px]">
            <div className="mb-0.5 flex items-center justify-between text-[9px] uppercase tracking-wider">
              <span className="text-muted-foreground font-mono">
                {stats ? stats.askDepth.toFixed(2) : '—'}
              </span>
              <span className="text-short">Asks</span>
            </div>
            {orderbook?.asks.slice(0, 10).map((level, i) => {
              const size = parseFloat(level.size);
              const pct = (size / maxLevelSize) * 100;
              return (
                <div key={`a-${i}`} className="relative h-4 overflow-hidden rounded-sm">
                  <div
                    className="absolute inset-y-0 left-0 bg-[hsl(var(--destructive))]/25 transition-[width] duration-300"
                    style={{ width: `${pct}%` }}
                  />
                  <div className="relative flex h-full items-center justify-between px-1.5 font-mono text-[9px] tabular-nums">
                    <span className="text-foreground/80">{size.toFixed(2)}</span>
                    <span className="text-short">{parseFloat(level.price).toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Sparkline */}
        <div className="h-16 w-full rounded-md border border-border bg-muted/10 p-1">
          <div className="mb-0.5 flex items-center justify-between px-1 text-[9px] uppercase tracking-wider text-muted-foreground">
            <span>Imbalance · 60s</span>
            <span className="font-mono">
              {history.length > 0 ? formatSigned(history[history.length - 1]!.imbalance) : '—'}
            </span>
          </div>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="imbGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartColor} stopOpacity={0.6} />
                  <stop offset="100%" stopColor={chartColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <YAxis domain={[-1, 1]} hide />
              <Area
                type="monotone"
                dataKey="imbalance"
                stroke={chartColor}
                strokeWidth={1.5}
                fill="url(#imbGrad)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
