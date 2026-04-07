'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPct } from '@/lib/format';
import type { MarketRow } from '@/lib/pacifica-bridge-types';
import { cn } from '@/lib/utils';

interface TopMoversPanelProps {
  markets: MarketRow[];
  onSelectSymbol?: (symbol: string) => void;
}

export function TopMoversPanel({ markets, onSelectSymbol }: TopMoversPanelProps) {
  const { gainers, losers } = useMemo(() => {
    const sorted = [...markets]
      .filter((m) => m.change24h !== 0)
      .sort((a, b) => b.change24h - a.change24h);
    return {
      gainers: sorted.slice(0, 5),
      losers: sorted.slice(-5).reverse(),
    };
  }, [markets]);

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Top Movers · 24h</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 gap-3 overflow-hidden pt-0">
        {markets.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center font-mono text-xs text-muted-foreground">
            waiting for data…
          </div>
        ) : (
          <>
            {/* Gainers */}
            <div className="flex flex-1 flex-col gap-1">
              <div className="text-[9px] uppercase tracking-wider text-long mb-1">Gainers</div>
              {gainers.map((m) => (
                <button
                  key={m.symbol}
                  type="button"
                  onClick={() => onSelectSymbol?.(m.symbol)}
                  className="flex items-center justify-between rounded px-2 py-1 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors text-left"
                >
                  <span className="text-[11px] font-bold text-foreground">{m.symbol}</span>
                  <span className={cn('font-mono text-[10px] font-semibold text-long')}>
                    +{formatPct(m.change24h)}
                  </span>
                </button>
              ))}
            </div>
            {/* Losers */}
            <div className="flex flex-1 flex-col gap-1">
              <div className="text-[9px] uppercase tracking-wider text-short mb-1">Losers</div>
              {losers.map((m) => (
                <button
                  key={m.symbol}
                  type="button"
                  onClick={() => onSelectSymbol?.(m.symbol)}
                  className="flex items-center justify-between rounded px-2 py-1 bg-destructive/10 hover:bg-destructive/20 transition-colors text-left"
                >
                  <span className="text-[11px] font-bold text-foreground">{m.symbol}</span>
                  <span className={cn('font-mono text-[10px] font-semibold text-short')}>
                    {formatPct(m.change24h)}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
