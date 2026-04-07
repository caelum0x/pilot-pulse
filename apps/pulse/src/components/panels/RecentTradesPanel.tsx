'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatPrice, formatUsd, timeAgo } from '@/lib/format';
import type { TradeEvent } from '@/lib/pacifica-bridge-types';
import { cn } from '@/lib/utils';

interface RecentTradesPanelProps {
  trades: TradeEvent[];
  symbol: string;
}

export function RecentTradesPanel({ trades, symbol }: RecentTradesPanelProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  const prevCountRef = useRef(trades.length);
  const isNew = trades.length > prevCountRef.current;
  useEffect(() => {
    prevCountRef.current = trades.length;
  }, [trades.length]);

  const filtered = trades.filter((t) => t.symbol === symbol).slice(0, 50);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Recent Trades</CardTitle>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {symbol} · {filtered.length} trades
        </span>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden p-0">
        <div className="scrollbar-thin h-full overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">
              waiting for trades…
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card">
                <tr className="border-b border-border/40 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-1.5 text-left font-medium">Time</th>
                  <th className="px-3 py-1.5 text-left font-medium">Side</th>
                  <th className="px-3 py-1.5 text-right font-medium">Price</th>
                  <th className="px-3 py-1.5 text-right font-medium">Size</th>
                  <th className="px-3 py-1.5 text-right font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((trade, i) => {
                  const isBuy = trade.side === 'bid';
                  return (
                    <tr
                      key={trade.id}
                      className={cn(
                        'border-b border-border/20 transition-colors hover:bg-muted/30',
                        i === 0 && isNew && 'animate-slide-in-top',
                      )}
                    >
                      <td className="px-3 py-1 font-mono text-muted-foreground">
                        {timeAgo(trade.timestamp)}
                      </td>
                      <td className="px-3 py-1">
                        <Badge
                          variant={isBuy ? 'long' : 'short'}
                          className="text-[9px]"
                        >
                          {isBuy ? 'BUY' : 'SELL'}
                        </Badge>
                      </td>
                      <td className="px-3 py-1 text-right font-mono text-foreground">
                        {formatPrice(trade.price)}
                      </td>
                      <td className="px-3 py-1 text-right font-mono text-muted-foreground">
                        {trade.size.toFixed(4)}
                      </td>
                      <td className="px-3 py-1 text-right font-mono font-semibold text-foreground">
                        {formatUsd(trade.price * trade.size)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
