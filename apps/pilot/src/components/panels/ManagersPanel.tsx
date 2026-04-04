'use client';

import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useManagers } from '@/hooks/useManagers';
import { formatPrice, timeAgo } from '@/lib/format';
import type { ManagerRules, ManagerSnapshot } from '@/lib/types';

function rulesToChips(rules: ManagerRules): string[] {
  const chips: string[] = [];
  if (rules.tpPct !== undefined) chips.push(`TP +${rules.tpPct}%`);
  if (rules.slPct !== undefined) chips.push(`SL -${rules.slPct}%`);
  if (rules.trailPct !== undefined) chips.push(`TRAIL ${rules.trailPct}%`);
  if (rules.breakevenPct !== undefined) chips.push(`BE @+${rules.breakevenPct}%`);
  if (rules.timeExitMinutes !== undefined) chips.push(`TIME ${rules.timeExitMinutes}m`);
  if (rules.partials && rules.partials.length > 0) {
    const remaining = rules.partials.filter((p) => !p.triggered).length;
    chips.push(`PARTIALS ${remaining}/${rules.partials.length}`);
  }
  return chips;
}

async function deleteManager(id: string): Promise<void> {
  await fetch(`/api/managers?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
}

function ManagerCard({ snapshot, onDelete }: { snapshot: ManagerSnapshot; onDelete: () => void }) {
  const chips = rulesToChips(snapshot.rules);
  const stopLevel = snapshot.state.stopLevel;
  return (
    <div className="rounded-md border border-border/70 bg-background/40 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-semibold text-foreground">{snapshot.symbol}</span>
          <Badge variant={snapshot.side === 'bid' ? 'success' : 'destructive'}>
            {snapshot.side === 'bid' ? 'LONG' : 'SHORT'}
          </Badge>
          {snapshot.state.breakevenArmed && <Badge variant="default">BE ARMED</Badge>}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            {timeAgo(snapshot.createdAt)}
          </span>
          <Button variant="ghost" size="icon" onClick={onDelete} aria-label="remove manager">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <Separator className="my-2" />
      <div className="flex flex-wrap items-center gap-1.5">
        {chips.length === 0 ? (
          <span className="font-mono text-[11px] text-muted-foreground">no rules</span>
        ) : (
          chips.map((c) => (
            <span
              key={c}
              className="rounded border border-border/70 bg-muted/40 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground"
            >
              {c}
            </span>
          ))
        )}
      </div>
      <div className="mt-2 flex justify-between font-mono text-[11px] text-muted-foreground">
        <span>entry {formatPrice(snapshot.entryPrice)}</span>
        <span>
          stop {stopLevel !== undefined ? formatPrice(stopLevel) : '—'}
        </span>
      </div>
    </div>
  );
}

export function ManagersPanel() {
  const { data, isLoading, mutate } = useManagers();
  const managers = data?.managers ?? [];

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>TP/SL Managers</CardTitle>
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          {managers.length} active
        </span>
      </CardHeader>
      <CardContent>
        <div className="scrollbar-thin flex max-h-[260px] flex-col gap-2 overflow-y-auto">
          {isLoading && managers.length === 0 ? (
            <div className="px-1 py-4 text-center font-mono text-xs text-muted-foreground">
              loading…
            </div>
          ) : managers.length === 0 ? (
            <div className="px-1 py-4 text-center font-mono text-xs text-muted-foreground">
              no active managers — send a webhook with tp/sl/trail to install one
            </div>
          ) : (
            managers.map((m) => (
              <ManagerCard
                key={m.id}
                snapshot={m}
                onDelete={async () => {
                  await deleteManager(m.id);
                  await mutate();
                }}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
