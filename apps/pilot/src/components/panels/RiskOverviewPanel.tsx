'use client';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { usePositions } from '@/hooks/usePositions';
import { useManagers } from '@/hooks/useManagers';
import { formatPct, formatUsd } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Risk overview panel showing exposure, PnL, and manager coverage.
 * Inspired by vendor/global-intel's StrategicRiskPanel + country
 * instability scoring approach — adapted for trading risk metrics.
 */
export function RiskOverviewPanel() {
  const { data: posData } = usePositions();
  const { data: mgrData } = useManagers();
  const rows = posData?.positions ?? [];
  const managers = mgrData?.managers ?? [];

  // Aggregate metrics
  const totalExposure = rows.reduce((s, r) => s + Math.abs(r.amount * r.markPrice), 0);
  const totalPnl = rows.reduce((s, r) => s + r.pnlUsd, 0);
  const longExposure = rows
    .filter((r) => r.side === 'LONG')
    .reduce((s, r) => s + Math.abs(r.amount * r.markPrice), 0);
  const shortExposure = rows
    .filter((r) => r.side === 'SHORT')
    .reduce((s, r) => s + Math.abs(r.amount * r.markPrice), 0);
  const positionsWithManager = rows.filter((r) => r.managerId).length;
  const unprotected = rows.length - positionsWithManager;

  // Concentration: largest single position as % of total exposure
  const largestPosition = rows.length > 0
    ? Math.max(...rows.map((r) => Math.abs(r.amount * r.markPrice)))
    : 0;
  const concentrationPct = totalExposure > 0 ? (largestPosition / totalExposure) * 100 : 0;

  // Risk score 0-100 (higher = riskier)
  // Factors: concentration, unprotected %, net skew
  const skewRatio = totalExposure > 0
    ? Math.abs(longExposure - shortExposure) / totalExposure
    : 0;
  const unprotectedRatio = rows.length > 0 ? unprotected / rows.length : 0;
  const riskScore = Math.min(
    100,
    Math.round(concentrationPct * 0.4 + skewRatio * 30 + unprotectedRatio * 30),
  );

  const riskLevel: 'LOW' | 'MED' | 'HIGH' =
    riskScore >= 60 ? 'HIGH' : riskScore >= 30 ? 'MED' : 'LOW';
  const riskColor =
    riskLevel === 'HIGH' ? 'text-short' : riskLevel === 'MED' ? 'text-warning' : 'text-long';

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Risk Overview</CardTitle>
        <Badge
          variant={riskLevel === 'HIGH' ? 'destructive' : riskLevel === 'MED' ? 'warning' : 'success'}
        >
          {riskLevel} RISK
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-3">
          <MetricCard
            label="Total Exposure"
            value={formatUsd(totalExposure)}
          />
          <MetricCard
            label="Unrealized PnL"
            value={formatUsd(totalPnl)}
            className={cn(totalPnl >= 0 ? 'text-long' : 'text-short')}
          />
          <MetricCard
            label="Long / Short"
            value={`${formatUsd(longExposure)} / ${formatUsd(shortExposure)}`}
          />
          <MetricCard
            label="Concentration"
            value={formatPct(concentrationPct, 0)}
            className={cn(concentrationPct > 70 ? 'text-short' : '')}
          />
          <MetricCard
            label="Protected"
            value={`${positionsWithManager}/${rows.length} positions`}
            className={cn(unprotected > 0 ? 'text-warning' : 'text-long')}
          />
          <MetricCard
            label="Active Managers"
            value={String(managers.length)}
          />
          <div className="col-span-2">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
              <span>Risk Score</span>
              <span className={cn('font-mono text-sm font-bold', riskColor)}>
                {riskScore}/100
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  riskLevel === 'HIGH'
                    ? 'bg-destructive'
                    : riskLevel === 'MED'
                      ? 'bg-warning'
                      : 'bg-emerald-500',
                )}
                style={{ width: `${riskScore}%` }}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetricCard({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="rounded-md border border-border/40 bg-muted/20 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className={cn('mt-0.5 font-mono text-sm font-semibold text-foreground', className)}>
        {value}
      </div>
    </div>
  );
}
