'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePilotHistory } from '@/hooks/usePilotHistory';
import { computePerformance } from '@/lib/analytics';
import { formatPct, formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

export function PerformancePanel() {
  const { data } = usePilotHistory();
  const events = data?.events ?? [];
  const metrics = computePerformance(events);

  const topSymbols = Object.entries(metrics.bySymbol)
    .sort((a, b) => b[1].volumeUsd - a[1].volumeUsd)
    .slice(0, 5);

  const topStrategies = Object.entries(metrics.byStrategy)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 4);

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Performance</CardTitle>
        {metrics.recentVelocity > 0 && (
          <Badge variant="default">
            {metrics.recentVelocity} in 5m
          </Badge>
        )}
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Top stats row */}
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Trades" value={String(metrics.totalTrades)} />
            <Stat
              label="Success Rate"
              value={formatPct(metrics.successRate * 100, 0)}
              className={cn(
                metrics.successRate >= 0.9 ? 'text-success' :
                metrics.successRate >= 0.7 ? 'text-foreground' :
                'text-destructive',
              )}
            />
            <Stat label="Volume" value={formatUsd(metrics.totalVolumeUsd)} />
          </div>

          {/* Execution stats */}
          <div className="grid grid-cols-3 gap-2">
            <Stat label="Avg Exec" value={`${metrics.avgExecTimeMs}ms`} />
            <Stat label="Fastest" value={`${metrics.fastestExecMs}ms`} />
            <Stat label="Slowest" value={`${metrics.slowestExecMs}ms`} />
          </div>

          {/* Status breakdown */}
          <div className="flex items-center gap-2">
            <StatusBar
              success={metrics.successCount}
              failed={metrics.failedCount}
              rejected={metrics.rejectedCount}
              total={metrics.totalTrades}
            />
          </div>

          {/* Top symbols */}
          {topSymbols.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Top Symbols
              </div>
              <div className="flex flex-wrap gap-1.5">
                {topSymbols.map(([sym, info]) => (
                  <div
                    key={sym}
                    className="flex items-center gap-1 rounded border border-border/40 bg-muted/20 px-2 py-0.5"
                  >
                    <span className="font-mono text-[10px] font-semibold">{sym}</span>
                    <span className="font-mono text-[9px] text-muted-foreground">
                      {info.count}× · {formatUsd(info.volumeUsd, { decimals: 0 })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Strategy stats */}
          {topStrategies.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                Strategies
              </div>
              <div className="space-y-1">
                {topStrategies.map(([id, info]) => (
                  <div
                    key={id}
                    className="flex items-center justify-between rounded border border-border/40 bg-muted/20 px-2 py-1"
                  >
                    <span className="truncate font-mono text-[10px]">{id}</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[9px] text-muted-foreground">
                        {info.count}×
                      </span>
                      <Badge
                        variant={info.successRate >= 0.8 ? 'success' : info.successRate >= 0.5 ? 'warning' : 'destructive'}
                        className="text-[8px]"
                      >
                        {formatPct(info.successRate * 100, 0)}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-md border border-border/40 bg-muted/20 px-2 py-1.5 text-center">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn('mt-0.5 font-mono text-xs font-semibold', className)}>{value}</div>
    </div>
  );
}

function StatusBar({
  success,
  failed,
  rejected,
  total,
}: {
  success: number;
  failed: number;
  rejected: number;
  total: number;
}) {
  if (total === 0) return null;
  const sPct = (success / total) * 100;
  const fPct = (failed / total) * 100;
  const rPct = (rejected / total) * 100;
  return (
    <div className="w-full">
      <div className="mb-0.5 flex justify-between text-[9px] text-muted-foreground">
        <span>{success} ok</span>
        <span>{rejected} rejected</span>
        <span>{failed} failed</span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full">
        <div className="bg-emerald-500" style={{ width: `${sPct}%` }} />
        <div className="bg-warning" style={{ width: `${rPct}%` }} />
        <div className="bg-destructive" style={{ width: `${fPct}%` }} />
      </div>
    </div>
  );
}
