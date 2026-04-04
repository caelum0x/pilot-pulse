'use client';

import { LineChart } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { usePulseStore } from '@/lib/store';
import { cn } from '@/lib/utils';
import { formatPct, formatPrice, formatUsd } from '@/lib/format';
import type { MarketRow } from '@/lib/pacifica-bridge-types';

interface MarketsOverviewPanelProps {
  markets: MarketRow[];
}

export function MarketsOverviewPanel({ markets }: MarketsOverviewPanelProps): React.JSX.Element {
  const focusedSymbol = usePulseStore((s) => s.focusedSymbol);
  const setFocusedSymbol = usePulseStore((s) => s.setFocusedSymbol);

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader>
        <div className="flex items-center gap-2">
          <LineChart className="h-3.5 w-3.5 text-primary" />
          <CardTitle>Markets</CardTitle>
        </div>
        <Badge variant="muted">{markets.length} pairs</Badge>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-0 scrollbar-thin">
        {markets.length === 0 && (
          <div className="flex h-full min-h-[120px] items-center justify-center px-4 py-8 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Loading markets…
            </div>
          </div>
        )}
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead>Symbol</TableHead>
              <TableHead className="text-right">Mark</TableHead>
              <TableHead className="text-right">24h</TableHead>
              <TableHead className="text-right">Funding</TableHead>
              <TableHead className="text-right">OI</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {markets.map((m) => {
              const isFocused = m.symbol === focusedSymbol;
              const up = m.change24h >= 0;
              return (
                <TableRow
                  key={m.symbol}
                  onClick={() => setFocusedSymbol(m.symbol)}
                  className={cn(
                    'cursor-pointer',
                    isFocused && 'bg-primary/5 shadow-[inset_2px_0_0_0_hsl(var(--primary))]',
                  )}
                >
                  <TableCell className="font-mono font-semibold">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          isFocused ? 'bg-primary animate-pulse-dot' : 'bg-muted-foreground/40',
                        )}
                      />
                      {m.symbol}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {formatPrice(m.price, m.tickSize)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-mono tabular-nums',
                      up ? 'text-long' : 'text-short',
                    )}
                  >
                    {formatPct(m.change24h)}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-mono tabular-nums',
                      m.fundingRate >= 0 ? 'text-long' : 'text-short',
                    )}
                  >
                    {formatPct(m.fundingRate, 4)}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                    {formatUsd(m.openInterestUsd, { decimals: 1 })}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
