'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getBreakerStatus } from '@/lib/circuit-breaker';
import { cn } from '@/lib/utils';

interface DataStatusPanelProps {
  isLive: boolean;
  marketCount: number;
  tradeCount: number;
  whaleEventCount: number;
  signalCount: number;
}

interface FeedStatus {
  name: string;
  status: 'ok' | 'warn' | 'error' | 'idle';
  count: number;
}

export function DataStatusPanel({
  isLive,
  marketCount,
  tradeCount,
  whaleEventCount,
  signalCount,
}: DataStatusPanelProps) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 5_000);
    return () => clearInterval(id);
  }, []);

  const marketsBreaker = getBreakerStatus('markets');

  const feeds: FeedStatus[] = [
    {
      name: 'Markets',
      status: marketsBreaker.onCooldown ? 'error' : marketCount > 0 ? 'ok' : 'idle',
      count: marketCount,
    },
    {
      name: 'Trades',
      status: tradeCount > 0 ? 'ok' : 'idle',
      count: tradeCount,
    },
    {
      name: 'Whales',
      status: whaleEventCount > 0 ? 'ok' : 'idle',
      count: whaleEventCount,
    },
    {
      name: 'Signals',
      status: signalCount > 0 ? 'ok' : 'idle',
      count: signalCount,
    },
  ];

  const okCount = feeds.filter((f) => f.status === 'ok').length;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm">Data Status</CardTitle>
        <Badge variant={isLive ? 'default' : 'warning'} className="text-[9px]">
          {isLive ? 'LIVE' : 'MOCK'}
        </Badge>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden pt-0">
        <div className="flex flex-col gap-1.5">
          {feeds.map((feed) => (
            <div
              key={feed.name}
              className="flex items-center justify-between rounded-md bg-muted/20 px-2.5 py-1.5"
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'h-1.5 w-1.5 rounded-full',
                    feed.status === 'ok' && 'bg-emerald-500',
                    feed.status === 'warn' && 'bg-amber-500',
                    feed.status === 'error' && 'bg-destructive',
                    feed.status === 'idle' && 'bg-muted-foreground/30',
                  )}
                />
                <span className="text-[11px] font-medium text-foreground">{feed.name}</span>
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">
                {feed.count}
              </span>
            </div>
          ))}
        </div>
        <div className="mt-3 text-center font-mono text-[10px] text-muted-foreground">
          {okCount}/{feeds.length} feeds active
        </div>
      </CardContent>
    </Card>
  );
}
