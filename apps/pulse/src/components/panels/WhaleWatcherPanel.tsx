'use client';

import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Fish } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatAddr, formatUsd, timeAgo } from '@/lib/format';
import type { WhaleEvent, WhaleEventType } from '@/lib/pacifica-bridge-types';

interface WhaleWatcherPanelProps {
  events: WhaleEvent[];
}

const eventTypeStyle: Record<WhaleEventType, string> = {
  OPEN: 'text-primary',
  ADD: 'text-[hsl(var(--warning))]',
  REDUCE: 'text-muted-foreground',
  CLOSE: 'text-muted-foreground',
};

export function WhaleWatcherPanel({ events }: WhaleWatcherPanelProps): React.JSX.Element {
  // Re-render every 5s so the "time ago" labels keep ticking
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Fish className="h-3.5 w-3.5 text-primary" />
          <CardTitle>Whale Watcher</CardTitle>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--success))] opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[hsl(var(--success))]" />
          </span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
            live
          </span>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-0 scrollbar-thin">
        {events.length === 0 && (
          <div className="flex h-full min-h-[120px] items-center justify-center px-4 py-8 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Waiting for whale activity…
            </div>
          </div>
        )}
        <ul className="divide-y divide-border/50">
          {events.map((ev, idx) => {
            const isLong = ev.side === 'LONG';
            return (
              <li
                key={ev.id}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-xs transition-colors hover:bg-muted/30',
                  idx === 0 && 'animate-slide-in-top',
                )}
              >
                {/* Direction indicator */}
                <div
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded border',
                    isLong
                      ? 'border-[hsl(var(--success))]/40 bg-long-soft'
                      : 'border-[hsl(var(--destructive))]/40 bg-short-soft',
                  )}
                >
                  {isLong ? (
                    <ArrowUpRight className="h-4 w-4 text-long" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4 text-short" />
                  )}
                </div>

                {/* Main info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="outline" className="font-mono">
                      {ev.symbol}
                    </Badge>
                    <Badge variant={isLong ? 'long' : 'short'}>{ev.side}</Badge>
                    <span
                      className={cn(
                        'font-mono text-[9px] font-semibold uppercase tracking-wider',
                        eventTypeStyle[ev.eventType],
                      )}
                    >
                      {ev.eventType}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="font-mono">{formatAddr(ev.address)}</span>
                    <span>·</span>
                    <span className="font-mono">{timeAgo(ev.timestamp)}</span>
                  </div>
                </div>

                {/* Size */}
                <div className="shrink-0 text-right">
                  <div
                    className={cn(
                      'font-mono text-sm font-bold tabular-nums',
                      isLong ? 'text-long' : 'text-short',
                    )}
                  >
                    {formatUsd(ev.sizeUsd, { decimals: 1 })}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
