'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePilotHistory } from '@/hooks/usePilotHistory';
import { formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function TradeTimelinePanel() {
  const { data } = usePilotHistory();
  const events = data?.events ?? [];

  const recent = useMemo(
    () => [...events].sort((a, b) => b.receivedAt - a.receivedAt).slice(0, 20),
    [events],
  );

  // Group by hour for the activity bars
  const hourlyBuckets = useMemo(() => {
    const buckets: Record<number, { success: number; failed: number }> = {};
    const now = Date.now();
    const cutoff = now - 24 * 60 * 60 * 1000;
    for (const e of events) {
      if (e.receivedAt < cutoff) continue;
      const hour = new Date(e.receivedAt).getHours();
      const bucket = buckets[hour] ?? { success: 0, failed: 0 };
      if (e.status === 'success') bucket.success++;
      else bucket.failed++;
      buckets[hour] = bucket;
    }
    return Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      success: buckets[i]?.success ?? 0,
      failed: buckets[i]?.failed ?? 0,
    }));
  }, [events]);

  const maxBucket = Math.max(1, ...hourlyBuckets.map((b) => b.success + b.failed));

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Trade Timeline</CardTitle>
        <span className="font-mono text-[10px] text-muted-foreground">
          last 24h · {events.length} total
        </span>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Hourly activity bars */}
          <div>
            <div className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
              Hourly Activity
            </div>
            <div className="flex h-10 items-end gap-[2px]">
              {hourlyBuckets.map((b) => {
                const totalH = b.success + b.failed;
                const pct = (totalH / maxBucket) * 100;
                const failPct = totalH > 0 ? (b.failed / totalH) * 100 : 0;
                return (
                  <div
                    key={b.hour}
                    className="flex-1 relative group"
                    title={`${b.hour}:00 — ${b.success} ok, ${b.failed} fail`}
                  >
                    <div
                      className="w-full rounded-sm bg-emerald-500/60 transition-all"
                      style={{ height: `${Math.max(pct, totalH > 0 ? 8 : 0)}%` }}
                    >
                      {failPct > 0 && (
                        <div
                          className="absolute bottom-0 left-0 w-full rounded-sm bg-destructive/60"
                          style={{ height: `${failPct}%` }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-0.5 flex justify-between text-[8px] text-muted-foreground/50">
              <span>0h</span>
              <span>6h</span>
              <span>12h</span>
              <span>18h</span>
              <span>24h</span>
            </div>
          </div>

          {/* Recent events list */}
          <div>
            <div className="mb-1 text-[9px] uppercase tracking-wider text-muted-foreground">
              Recent Events
            </div>
            {recent.length === 0 ? (
              <div className="py-3 text-center font-mono text-xs text-muted-foreground">
                no events yet
              </div>
            ) : (
              <div className="max-h-[180px] space-y-1 overflow-y-auto scrollbar-thin">
                {recent.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center gap-2 rounded bg-muted/20 px-2 py-1"
                  >
                    <span
                      className={cn(
                        'h-1.5 w-1.5 rounded-full',
                        e.status === 'success' && 'bg-emerald-500',
                        e.status === 'failed' && 'bg-destructive',
                        e.status === 'rejected' && 'bg-warning',
                      )}
                    />
                    <Badge variant="muted" className="text-[8px]">
                      {e.action}
                    </Badge>
                    <span className="font-mono text-[10px] font-semibold">{e.symbol}</span>
                    <span className="font-mono text-[9px] text-muted-foreground">
                      {formatUsd(e.amountUsd)}
                    </span>
                    <span className="ml-auto font-mono text-[9px] text-muted-foreground">
                      {timeAgo(e.receivedAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
