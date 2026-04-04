'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePositions } from '@/hooks/usePositions';
import { formatPct, formatPrice, formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

export function PositionsPanel() {
  const { data, isLoading } = usePositions();
  const rows = data?.positions ?? [];

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Active Positions</CardTitle>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {rows.length} open
        </span>
      </CardHeader>
      <CardContent className="p-0">
        <div className="scrollbar-thin max-h-[260px] overflow-y-auto">
          {isLoading && rows.length === 0 ? (
            <div className="px-4 py-6 text-center font-mono text-xs text-muted-foreground">
              loading…
            </div>
          ) : rows.length === 0 ? (
            <div className="px-4 py-6 text-center font-mono text-xs text-muted-foreground">
              no open positions
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Symbol</TableHead>
                  <TableHead>Side</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Entry</TableHead>
                  <TableHead>Mark</TableHead>
                  <TableHead>PnL</TableHead>
                  <TableHead>Mgr</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const pnlPositive = row.pnlUsd >= 0;
                  return (
                    <TableRow key={row.symbol}>
                      <TableCell className="font-semibold text-foreground">{row.symbol}</TableCell>
                      <TableCell>
                        <Badge variant={row.side === 'LONG' ? 'success' : 'destructive'}>
                          {row.side}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.amount.toFixed(4)}</TableCell>
                      <TableCell>{formatPrice(row.entryPrice)}</TableCell>
                      <TableCell>{formatPrice(row.markPrice)}</TableCell>
                      <TableCell
                        className={cn(pnlPositive ? 'text-long' : 'text-short')}
                      >
                        {formatUsd(row.pnlUsd)}
                        <span className="ml-1 text-[10px] opacity-70">
                          ({formatPct(row.pnlPct)})
                        </span>
                      </TableCell>
                      <TableCell>
                        {row.managerId ? (
                          <Badge variant="default">ACTIVE</Badge>
                        ) : (
                          <Badge variant="muted">—</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
