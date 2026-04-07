'use client';

import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useFundingHistory } from '@/hooks/useFundingHistory';
import { formatPct } from '@/lib/format';
import type { MarketRow } from '@/lib/pacifica-bridge-types';

interface FundingHistoryPanelProps {
  symbol: string;
  markets: MarketRow[];
}

export function FundingHistoryPanel({ symbol, markets }: FundingHistoryPanelProps) {
  const { data, isLoading } = useFundingHistory(symbol, markets);

  const chartData = data.map((p) => ({
    t: p.timestamp,
    rate: p.rate * 100,
  }));

  const lastRate = chartData.length > 0 ? chartData[chartData.length - 1]!.rate : 0;
  const isPositive = lastRate >= 0;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-1">
        <CardTitle className="text-sm">Funding History</CardTitle>
        <span className="font-mono text-xs text-muted-foreground">
          {symbol} · {formatPct(lastRate, 4)}
        </span>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0 pt-1">
        {isLoading || chartData.length === 0 ? (
          <div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
            {isLoading ? 'loading…' : 'no funding data'}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="fundingGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={isPositive ? 'hsl(var(--destructive))' : 'hsl(var(--success))'}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="100%"
                    stopColor={isPositive ? 'hsl(var(--destructive))' : 'hsl(var(--success))'}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="t"
                type="number"
                domain={['dataMin', 'dataMax']}
                tick={false}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                width={40}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => `${v.toFixed(3)}%`}
              />
              <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="3 3" />
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 6,
                  fontSize: 11,
                }}
                labelFormatter={(t: number) => new Date(t).toLocaleString()}
                formatter={(v: number) => [`${v.toFixed(4)}%`, 'Funding']}
              />
              <Area
                type="monotone"
                dataKey="rate"
                stroke={isPositive ? 'hsl(var(--destructive))' : 'hsl(var(--success))'}
                strokeWidth={1.5}
                fill="url(#fundingGrad)"
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
