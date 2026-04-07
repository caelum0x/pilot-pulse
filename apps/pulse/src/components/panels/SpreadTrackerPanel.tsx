'use client';

import { useMemo } from 'react';
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
import type { ImbalancePoint } from '@/hooks/usePulseStream';

interface SpreadTrackerPanelProps {
  symbol: string;
  history: ImbalancePoint[];
}

export function SpreadTrackerPanel({ symbol, history }: SpreadTrackerPanelProps) {
  const spreadData = useMemo(
    () => history.map((p) => ({ t: p.t, spread: p.spreadBps })),
    [history],
  );

  const currentSpread = spreadData.length > 0 ? spreadData[spreadData.length - 1]!.spread : 0;
  const avgSpread = spreadData.length > 0
    ? spreadData.reduce((s, p) => s + p.spread, 0) / spreadData.length
    : 0;
  const isWide = currentSpread > avgSpread * 1.5;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-1">
        <CardTitle className="text-sm">Spread Tracker</CardTitle>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">{symbol}</span>
          {spreadData.length > 1 && (
            <Badge
              variant={isWide ? 'warning' : 'muted'}
              className="text-[9px]"
            >
              {isWide ? 'WIDE' : 'NORMAL'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-1 overflow-hidden p-3 pt-0">
        <div className="flex items-baseline gap-3">
          <div>
            <span className="font-mono text-lg font-bold text-foreground">
              {currentSpread.toFixed(1)}
            </span>
            <span className="ml-1 text-[10px] text-muted-foreground">bps</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            avg {avgSpread.toFixed(1)} bps
          </div>
        </div>
        <div className="flex-1 min-h-0">
          {spreadData.length < 2 ? (
            <div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
              accumulating…
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spreadData} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="spreadGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
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
                  formatter={(v: number) => [`${v.toFixed(2)} bps`, 'Spread']}
                />
                <Area
                  type="monotone"
                  dataKey="spread"
                  stroke="hsl(var(--primary))"
                  strokeWidth={1.5}
                  fill="url(#spreadGrad)"
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
