'use client';

import { Activity, Radio, ShieldAlert } from 'lucide-react';
import { usePilotConfig } from '@/hooks/usePilotConfig';
import { usePilotHistory } from '@/hooks/usePilotHistory';
import { formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

function ModePill({ live }: { live: boolean }) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-[11px] font-semibold uppercase tracking-[0.14em]',
        live
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-warning/40 bg-warning/10 text-warning',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full animate-pulse-dot',
          live ? 'bg-destructive' : 'bg-warning',
        )}
      />
      {live ? (
        <span className="flex items-center gap-1">
          <ShieldAlert className="h-3 w-3" />
          LIVE — real funds
        </span>
      ) : (
        <span>MOCK mode</span>
      )}
    </div>
  );
}

export function Header() {
  const { config } = usePilotConfig();
  const { data } = usePilotHistory();
  const feeRevenue = data?.feeRevenueUsd ?? 0;
  const live = config?.live ?? false;
  const env = config?.env ?? 'testnet';
  const builderCode = config?.builderCode ?? '—';
  const balance = config?.balance;

  return (
    <header className="border-b border-border/70 bg-background/60 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/40 bg-primary/10">
            <Radio className="h-4 w-4 text-primary" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="font-mono text-sm font-semibold uppercase tracking-[0.22em] text-foreground">
              PacificaPilot
            </span>
            <span className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              TV Executor · Smart TP/SL
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {balance !== undefined && (
            <div className="hidden flex-col items-end sm:flex">
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                balance
              </span>
              <span className="font-mono text-sm font-semibold text-foreground">
                {formatUsd(balance)}
              </span>
            </div>
          )}
          <div className="hidden flex-col items-end sm:flex">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              fees collected
            </span>
            <span className="font-mono text-sm font-semibold text-primary">
              {formatUsd(feeRevenue)}
            </span>
          </div>
          <div className="hidden flex-col items-end md:flex">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              builder code
            </span>
            <span className="font-mono text-xs text-foreground">{builderCode}</span>
          </div>
          <div className="hidden flex-col items-end md:flex">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              env
            </span>
            <span className="font-mono text-xs text-foreground">{env}</span>
          </div>
          <ModePill live={live} />
          <div className="hidden items-center gap-1 text-muted-foreground sm:flex">
            <Activity className="h-3.5 w-3.5 animate-pulse-dot text-primary" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em]">live feed</span>
          </div>
        </div>
      </div>
    </header>
  );
}
