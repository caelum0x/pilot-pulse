'use client';

import { ArrowDownRight, ArrowUpRight, Download, Inbox, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePilotHistory } from '@/hooks/usePilotHistory';
import { formatTime, formatUsd, timeAgo } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { WebhookEvent } from '@/lib/types';

function statusBadge(status: WebhookEvent['status']) {
  if (status === 'success') return <Badge variant="success">OK</Badge>;
  if (status === 'rejected') return <Badge variant="warning">REJECTED</Badge>;
  return <Badge variant="destructive">FAILED</Badge>;
}

function actionIcon(action: WebhookEvent['action']) {
  if (action === 'buy') return <ArrowUpRight className="h-3 w-3 text-success" />;
  if (action === 'sell') return <ArrowDownRight className="h-3 w-3 text-destructive" />;
  return <XCircle className="h-3 w-3 text-warning" />;
}

export function WebhookActivityPanel() {
  const { data, isLoading } = usePilotHistory();
  const events = data?.events ?? [];

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Webhook Activity</CardTitle>
        <div className="flex items-center gap-2">
          {events.length > 0 && (
            <a
              href="/api/export?format=csv"
              download="pilot-history.csv"
              className="flex items-center gap-1 rounded border border-border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Download className="h-3 w-3" />
              CSV
            </a>
          )}
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            last {events.length}
          </span>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="scrollbar-thin max-h-[520px] overflow-y-auto">
          {isLoading && events.length === 0 ? (
            <div className="px-4 py-8 text-center font-mono text-xs text-muted-foreground">
              loading…
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-muted-foreground">
              <Inbox className="h-5 w-5" />
              <span className="font-mono text-xs">waiting for first webhook</span>
            </div>
          ) : (
            <ul className="divide-y divide-border/50">
              {events.map((evt) => (
                <li
                  key={evt.id}
                  className={cn(
                    'flex items-center gap-3 px-4 py-2 animate-slide-in-top hover:bg-muted/30',
                  )}
                >
                  <span className="w-20 shrink-0 font-mono text-[11px] text-muted-foreground">
                    {formatTime(evt.receivedAt)}
                  </span>
                  <span className="flex w-5 shrink-0 justify-center">{actionIcon(evt.action)}</span>
                  <span className="w-14 shrink-0 font-mono text-xs font-semibold text-foreground">
                    {evt.symbol}
                  </span>
                  <span className="w-20 shrink-0 truncate font-mono text-[11px] text-muted-foreground">
                    {evt.strategyId}
                  </span>
                  <span className="w-20 shrink-0 font-mono text-xs text-foreground">
                    {formatUsd(evt.amountUsd)}
                  </span>
                  <span className="w-16 shrink-0 font-mono text-[10px] text-muted-foreground">
                    {evt.execTimeMs}ms
                  </span>
                  <span className="flex-1 truncate font-mono text-[11px] text-muted-foreground">
                    {evt.error ?? (evt.orderId ? `order#${evt.orderId}` : '')}
                  </span>
                  <span className="shrink-0">{statusBadge(evt.status)}</span>
                  <span className="w-10 shrink-0 text-right font-mono text-[10px] text-muted-foreground">
                    {timeAgo(evt.receivedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
