'use client';

import { useEffect, useState } from 'react';
import { Activity, Radio } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { usePulseStore } from '@/lib/store';
import { cn } from '@/lib/utils';

function formatUtcClock(d: Date): string {
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${hh}:${mm}:${ss} UTC`;
}

export function Header(): React.JSX.Element {
  const env = usePulseStore((s) => s.env);
  const setEnv = usePulseStore((s) => s.setEnv);
  const wsStatus = usePulseStore((s) => s.wsStatus);
  const lastUpdate = usePulseStore((s) => s.lastUpdate);

  const [clock, setClock] = useState<string>('');
  useEffect(() => {
    setClock(formatUtcClock(new Date()));
    const t = setInterval(() => setClock(formatUtcClock(new Date())), 1000);
    return () => clearInterval(t);
  }, []);

  const statusColor: Record<typeof wsStatus, string> = {
    connecting: 'bg-[hsl(var(--warning))]',
    open: 'bg-[hsl(var(--success))]',
    closed: 'bg-muted-foreground',
    error: 'bg-destructive',
  };
  const statusLabel: Record<typeof wsStatus, string> = {
    connecting: 'CONNECTING',
    open: 'LIVE',
    closed: 'OFFLINE',
    error: 'ERROR',
  };

  const ago = Math.max(0, Math.floor((Date.now() - lastUpdate) / 1000));

  return (
    <header className="flex h-14 items-center gap-4 border-b border-border bg-card/60 px-4 backdrop-blur-md">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="relative">
          <Activity className="h-5 w-5 text-primary" />
          <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-primary animate-pulse-dot" />
        </div>
        <div className="flex flex-col leading-none">
          <span className="text-sm font-bold tracking-tight">
            Pacifica<span className="text-primary">Pulse</span>
          </span>
          <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            whale × orderbook fusion
          </span>
        </div>
      </div>

      <Separator orientation="vertical" className="h-8" />

      {/* Env toggle */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'font-mono text-[10px] uppercase tracking-wider',
            env === 'testnet' ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          testnet
        </span>
        <Switch
          checked={env === 'mainnet'}
          onCheckedChange={(checked) => setEnv(checked ? 'mainnet' : 'testnet')}
          aria-label="Toggle environment"
        />
        <span
          className={cn(
            'font-mono text-[10px] uppercase tracking-wider',
            env === 'mainnet' ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          mainnet
        </span>
      </div>

      <div className="flex-1" />

      {/* Connection status pill */}
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1">
        <span className="relative flex h-2 w-2">
          {wsStatus === 'open' && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[hsl(var(--success))] opacity-60" />
          )}
          <span className={cn('relative inline-flex h-2 w-2 rounded-full', statusColor[wsStatus])} />
        </span>
        <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-foreground">
          {statusLabel[wsStatus]}
        </span>
      </div>

      <Separator orientation="vertical" className="h-8" />

      {/* Last update + clock */}
      <div className="flex items-center gap-2">
        <Radio className="h-3 w-3 text-muted-foreground" />
        <span className="font-mono text-[10px] text-muted-foreground">
          last tick <span className="text-foreground">{ago}s</span>
        </span>
      </div>
      <Separator orientation="vertical" className="h-8" />
      <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{clock}</span>
    </header>
  );
}
