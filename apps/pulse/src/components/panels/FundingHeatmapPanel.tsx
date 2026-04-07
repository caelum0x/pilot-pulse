'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { formatPct } from '@/lib/format';
import type { MarketRow } from '@/lib/pacifica-bridge-types';
import { cn } from '@/lib/utils';

interface FundingHeatmapPanelProps {
  markets: MarketRow[];
}

/**
 * Funding rate heatmap inspired by global-intel's getHeatmapClass pattern.
 * Shows all markets as colored tiles — green for negative funding (shorts pay),
 * red for positive funding (longs pay). Intensity scales with magnitude.
 */
export function FundingHeatmapPanel({ markets }: FundingHeatmapPanelProps) {
  const sorted = [...markets].sort(
    (a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate),
  );

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Funding Heatmap</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden pt-0">
        {sorted.length === 0 ? (
          <div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
            waiting for data…
          </div>
        ) : (
          <div className="grid grid-cols-5 gap-1.5">
            {sorted.map((m) => {
              const isNeg = m.fundingRate < 0;
              const abs = Math.abs(m.fundingRate * 100);
              const intensity = getIntensity(abs);
              return (
                <Tooltip key={m.symbol}>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        'flex flex-col items-center justify-center rounded-md px-1 py-2 transition-colors',
                        isNeg ? negClasses[intensity] : posClasses[intensity],
                      )}
                    >
                      <span className="text-[10px] font-bold leading-none text-foreground">
                        {m.symbol}
                      </span>
                      <span className="mt-0.5 font-mono text-[9px] leading-none">
                        {formatPct(m.fundingRate * 100, 4)}
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <div>{m.symbol} funding: {formatPct(m.fundingRate * 100, 4)}</div>
                    <div className="text-muted-foreground">
                      {isNeg ? 'Shorts pay longs' : 'Longs pay shorts'}
                    </div>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type Intensity = 0 | 1 | 2 | 3;

function getIntensity(absPct: number): Intensity {
  if (absPct >= 0.02) return 3;
  if (absPct >= 0.01) return 2;
  if (absPct >= 0.005) return 1;
  return 0;
}

const negClasses: Record<Intensity, string> = {
  0: 'bg-emerald-500/10',
  1: 'bg-emerald-500/20',
  2: 'bg-emerald-500/35',
  3: 'bg-emerald-500/50',
};

const posClasses: Record<Intensity, string> = {
  0: 'bg-destructive/10',
  1: 'bg-destructive/20',
  2: 'bg-destructive/35',
  3: 'bg-destructive/50',
};
