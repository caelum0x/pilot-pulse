'use client';

import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { OrderbookSnapshot } from '@pacifica-hack/sdk';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPrice } from '@/lib/format';

interface DepthChartPanelProps {
  symbol: string;
  orderbook: OrderbookSnapshot | null;
}

interface DepthPoint {
  price: number;
  bidDepth: number | null;
  askDepth: number | null;
}

function buildDepthData(ob: OrderbookSnapshot): DepthPoint[] {
  const bidLevels = ob.bids
    .map((b) => ({ price: parseFloat(b.price), size: parseFloat(b.size) }))
    .filter((b) => b.price > 0 && b.size > 0)
    .sort((a, b) => b.price - a.price);

  const askLevels = ob.asks
    .map((a) => ({ price: parseFloat(a.price), size: parseFloat(a.size) }))
    .filter((a) => a.price > 0 && a.size > 0)
    .sort((a, b) => a.price - b.price);

  const bidPoints: DepthPoint[] = [];
  let cumBid = 0;
  for (let i = bidLevels.length - 1; i >= 0; i--) {
    cumBid += bidLevels[i]!.size;
    bidPoints.push({ price: bidLevels[i]!.price, bidDepth: cumBid, askDepth: null });
  }
  bidPoints.sort((a, b) => a.price - b.price);

  const askPoints: DepthPoint[] = [];
  let cumAsk = 0;
  for (const level of askLevels) {
    cumAsk += level.size;
    askPoints.push({ price: level.price, bidDepth: null, askDepth: cumAsk });
  }

  return [...bidPoints, ...askPoints];
}

export function DepthChartPanel({ symbol, orderbook }: DepthChartPanelProps) {
  const depthData = useMemo(
    () => (orderbook ? buildDepthData(orderbook) : []),
    [orderbook],
  );

  const midPrice = useMemo(() => {
    if (!orderbook) return 0;
    const bestBid = orderbook.bids[0] ? parseFloat(orderbook.bids[0].price) : 0;
    const bestAsk = orderbook.asks[0] ? parseFloat(orderbook.asks[0].price) : 0;
    return bestBid && bestAsk ? (bestBid + bestAsk) / 2 : 0;
  }, [orderbook]);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-1">
        <CardTitle className="text-sm">Market Depth</CardTitle>
        <span className="font-mono text-[10px] text-muted-foreground">
          {symbol} · mid {formatPrice(midPrice)}
        </span>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0 pt-1">
        {depthData.length === 0 ? (
          <div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
            waiting for orderbook…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={depthData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="bidDepthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--success))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--success))" stopOpacity={0.05} />
                </linearGradient>
                <linearGradient id="askDepthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--destructive))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--destructive))" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="price"
                type="number"
                domain={['dataMin', 'dataMax']}
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                tickFormatter={(v: number) => formatPrice(v)}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }}
                width={45}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v: number) => v.toFixed(2)}
              />
              {midPrice > 0 && (
                <ReferenceLine
                  x={midPrice}
                  stroke="hsl(var(--primary))"
                  strokeDasharray="3 3"
                  strokeWidth={1}
                />
              )}
              <Tooltip
                contentStyle={{
                  background: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 6,
                  fontSize: 11,
                }}
                formatter={(v: number, name: string) => [
                  v.toFixed(4),
                  name === 'bidDepth' ? 'Bid Depth' : 'Ask Depth',
                ]}
                labelFormatter={(price: number) => `Price: ${formatPrice(price)}`}
              />
              <Area
                type="stepAfter"
                dataKey="bidDepth"
                stroke="hsl(var(--success))"
                strokeWidth={1.5}
                fill="url(#bidDepthGrad)"
                connectNulls={false}
                isAnimationActive={false}
              />
              <Area
                type="stepAfter"
                dataKey="askDepth"
                stroke="hsl(var(--destructive))"
                strokeWidth={1.5}
                fill="url(#askDepthGrad)"
                connectNulls={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
