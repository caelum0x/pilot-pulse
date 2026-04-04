'use client';

import { useEffect, useState } from 'react';
import { Zap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { timeAgo } from '@/lib/format';
import type { FusionSignal, SignalConfidence } from '@/lib/pacifica-bridge-types';

interface FusionSignalsPanelProps {
  signals: FusionSignal[];
}

const confidenceStyle: Record<SignalConfidence, { badge: 'default' | 'warning' | 'muted'; label: string }> = {
  HIGH: { badge: 'default', label: 'HIGH' },
  MED: { badge: 'warning', label: 'MED' },
  LOW: { badge: 'muted', label: 'LOW' },
};

export function FusionSignalsPanel({ signals }: FusionSignalsPanelProps): React.JSX.Element {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((x) => x + 1), 5000);
    return () => clearInterval(t);
  }, []);

  const sorted = [...signals].sort((a, b) => b.timestamp - a.timestamp);

  return (
    <Card className="flex h-full flex-col overflow-hidden">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <CardTitle>Fusion Signals</CardTitle>
        </div>
        <Badge variant="default">whale × orderbook</Badge>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-0 scrollbar-thin">
        {sorted.length === 0 && (
          <div className="flex h-full min-h-[100px] items-center justify-center px-4 py-6 text-center">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Awaiting signal…
            </div>
          </div>
        )}
        <ul className="divide-y divide-border/50">
          {sorted.map((sig, idx) => {
            const isLong = sig.direction === 'LONG';
            const conf = confidenceStyle[sig.confidence];
            return (
              <li
                key={sig.id}
                className={cn(
                  'flex flex-col gap-1 px-3 py-2.5 text-xs transition-colors hover:bg-muted/30',
                  idx === 0 && 'animate-slide-in-top',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        'h-1.5 w-1.5 shrink-0 rounded-full',
                        isLong ? 'bg-[hsl(var(--success))]' : 'bg-[hsl(var(--destructive))]',
                      )}
                    />
                    <span
                      className={cn(
                        'text-[11px] font-semibold',
                        isLong ? 'text-long' : 'text-short',
                      )}
                    >
                      {sig.headline}
                    </span>
                  </div>
                  <Badge variant={conf.badge}>{conf.label}</Badge>
                </div>
                <p className="pl-3 text-[10px] leading-snug text-muted-foreground">
                  {sig.description}
                </p>
                <div className="pl-3 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70">
                  {timeAgo(sig.timestamp)} ago
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
