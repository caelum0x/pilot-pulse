'use client';

import { useMemo } from 'react';
import type { OrderbookSnapshot } from '@pacifica-hack/sdk';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatPrice } from '@/lib/format';
import { cn } from '@/lib/utils';

interface LiquidationHeatmapPanelProps {
  symbol: string;
  orderbook: OrderbookSnapshot | null;
  maxLeverage: number;
}

interface LiqCluster {
  price: number;
  leverage: number;
  side: 'long' | 'short';
  intensity: number;
}

/**
 * Estimate liquidation clusters around the current price.
 * At leverage X, a long position entered at `entry` liquidates around
 * entry * (1 - 1/X), and a short at entry * (1 + 1/X).
 * We project clusters at common leverage levels (5x, 10x, 20x, 50x).
 */
function estimateLiqClusters(
  midPrice: number,
  maxLeverage: number,
): LiqCluster[] {
  if (midPrice <= 0) return [];

  const leverages = [3, 5, 10, 20, 50].filter((l) => l <= maxLeverage);
  const clusters: LiqCluster[] = [];

  for (const lev of leverages) {
    // Longs liquidate below entry
    const longLiqPrice = midPrice * (1 - 1 / lev);
    clusters.push({
      price: longLiqPrice,
      leverage: lev,
      side: 'long',
      intensity: Math.min(1, lev / maxLeverage),
    });

    // Shorts liquidate above entry
    const shortLiqPrice = midPrice * (1 + 1 / lev);
    clusters.push({
      price: shortLiqPrice,
      leverage: lev,
      side: 'short',
      intensity: Math.min(1, lev / maxLeverage),
    });
  }

  return clusters.sort((a, b) => a.price - b.price);
}

export function LiquidationHeatmapPanel({
  symbol,
  orderbook,
  maxLeverage,
}: LiquidationHeatmapPanelProps) {
  const midPrice = useMemo(() => {
    if (!orderbook) return 0;
    const bestBid = orderbook.bids[0] ? parseFloat(orderbook.bids[0].price) : 0;
    const bestAsk = orderbook.asks[0] ? parseFloat(orderbook.asks[0].price) : 0;
    return bestBid && bestAsk ? (bestBid + bestAsk) / 2 : 0;
  }, [orderbook]);

  const clusters = useMemo(
    () => estimateLiqClusters(midPrice, maxLeverage),
    [midPrice, maxLeverage],
  );

  const longClusters = clusters.filter((c) => c.side === 'long');
  const shortClusters = clusters.filter((c) => c.side === 'short');

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">Liquidation Zones</CardTitle>
        <span className="font-mono text-[10px] text-muted-foreground">
          {symbol} · {formatPrice(midPrice)}
        </span>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden pt-0">
        {clusters.length === 0 ? (
          <div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
            waiting for data…
          </div>
        ) : (
          <div className="flex h-full gap-3">
            {/* Long liquidations (below price) */}
            <div className="flex flex-1 flex-col gap-1">
              <div className="text-[9px] uppercase tracking-wider text-long mb-1">
                Long Liqs ↓
              </div>
              {longClusters.map((c) => (
                <Tooltip key={`long-${c.leverage}`}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        'flex items-center justify-between rounded px-2 py-1 transition-colors',
                        c.intensity > 0.7
                          ? 'bg-destructive/30'
                          : c.intensity > 0.3
                          ? 'bg-destructive/15'
                          : 'bg-destructive/5',
                      )}
                    >
                      <Badge variant="muted" className="text-[8px]">
                        {c.leverage}x
                      </Badge>
                      <span className="font-mono text-[10px] text-foreground">
                        {formatPrice(c.price)}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="left" className="text-xs">
                    {c.leverage}x longs liquidate at {formatPrice(c.price)}
                    <br />
                    {((1 - c.price / midPrice) * 100).toFixed(1)}% below current
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>

            {/* Short liquidations (above price) */}
            <div className="flex flex-1 flex-col gap-1">
              <div className="text-[9px] uppercase tracking-wider text-short mb-1">
                Short Liqs ↑
              </div>
              {shortClusters.map((c) => (
                <Tooltip key={`short-${c.leverage}`}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        'flex items-center justify-between rounded px-2 py-1 transition-colors',
                        c.intensity > 0.7
                          ? 'bg-emerald-500/30'
                          : c.intensity > 0.3
                          ? 'bg-emerald-500/15'
                          : 'bg-emerald-500/5',
                      )}
                    >
                      <Badge variant="muted" className="text-[8px]">
                        {c.leverage}x
                      </Badge>
                      <span className="font-mono text-[10px] text-foreground">
                        {formatPrice(c.price)}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    {c.leverage}x shorts liquidate at {formatPrice(c.price)}
                    <br />
                    {((c.price / midPrice - 1) * 100).toFixed(1)}% above current
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
