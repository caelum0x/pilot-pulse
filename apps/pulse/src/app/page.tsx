'use client';

import { Suspense, useMemo } from 'react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Header } from '@/components/Header';
import { MarketsOverviewPanel } from '@/components/panels/MarketsOverviewPanel';
import { WhaleWatcherPanel } from '@/components/panels/WhaleWatcherPanel';
import { OrderbookImbalancePanel } from '@/components/panels/OrderbookImbalancePanel';
import { FusionSignalsPanel } from '@/components/panels/FusionSignalsPanel';
import { RecentTradesPanel } from '@/components/panels/RecentTradesPanel';
import { TradeVelocityPanel } from '@/components/panels/TradeVelocityPanel';
import { FundingHeatmapPanel } from '@/components/panels/FundingHeatmapPanel';
import { FundingHistoryPanel } from '@/components/panels/FundingHistoryPanel';
import { DepthChartPanel } from '@/components/panels/DepthChartPanel';
import { OIDeltaPanel } from '@/components/panels/OIDeltaPanel';
import { LiquidationHeatmapPanel } from '@/components/panels/LiquidationHeatmapPanel';
import { DataStatusPanel } from '@/components/panels/DataStatusPanel';
import { TopMoversPanel } from '@/components/panels/TopMoversPanel';
import { SpreadTrackerPanel } from '@/components/panels/SpreadTrackerPanel';
import { UrlStateSync } from '@/components/UrlStateSync';
import { usePulseStream } from '@/hooks/usePulseStream';
import { usePulseStore } from '@/lib/store';

export default function DashboardPage(): React.JSX.Element {
  const focusedSymbol = usePulseStore((s) => s.focusedSymbol);
  const setFocusedSymbol = usePulseStore((s) => s.setFocusedSymbol);
  const { markets, whaleEvents, trades, fusionSignals, orderbook, imbalanceHistory, isLive } = usePulseStream();

  const focusedMaxLeverage = useMemo(
    () => markets.find((m) => m.symbol === focusedSymbol)?.maxLeverage ?? 50,
    [markets, focusedSymbol],
  );

  return (
    <TooltipProvider delayDuration={150}>
      <Suspense fallback={null}>
        <UrlStateSync />
      </Suspense>
      <main className="flex h-screen flex-col">
        <Header />
        <div className="grid flex-1 min-h-0 gap-3 p-3 lg:grid-cols-12 lg:grid-rows-[minmax(0,1fr)]">
          {/* Left column: markets + top movers + funding heatmap + OI delta */}
          <div className="lg:col-span-3 lg:row-span-1 flex min-h-0 flex-col gap-3">
            <div className="flex-[4] min-h-0">
              <MarketsOverviewPanel markets={markets} />
            </div>
            <div className="flex-[2] min-h-0">
              <TopMoversPanel markets={markets} onSelectSymbol={setFocusedSymbol} />
            </div>
            <div className="flex-1 min-h-0">
              <FundingHeatmapPanel markets={markets} />
            </div>
            <div className="flex-[2] min-h-0">
              <OIDeltaPanel markets={markets} symbol={focusedSymbol} />
            </div>
          </div>

          {/* Middle-left: orderbook + depth + spread + funding history */}
          <div className="lg:col-span-3 lg:row-span-1 flex min-h-0 flex-col gap-3">
            <div className="flex-[3] min-h-0">
              <OrderbookImbalancePanel
                symbol={focusedSymbol}
                orderbook={orderbook}
                history={imbalanceHistory}
              />
            </div>
            <div className="flex-[2] min-h-0">
              <DepthChartPanel symbol={focusedSymbol} orderbook={orderbook} />
            </div>
            <div className="flex-[2] min-h-0">
              <SpreadTrackerPanel symbol={focusedSymbol} history={imbalanceHistory} />
            </div>
            <div className="flex-[2] min-h-0">
              <FundingHistoryPanel symbol={focusedSymbol} markets={markets} />
            </div>
          </div>

          {/* Middle-right: trade velocity + fusion signals + liquidation zones */}
          <div className="lg:col-span-3 lg:row-span-1 flex min-h-0 flex-col gap-3">
            <div className="flex-1 min-h-0">
              <TradeVelocityPanel trades={trades} symbol={focusedSymbol} />
            </div>
            <div className="flex-[2] min-h-0">
              <FusionSignalsPanel signals={fusionSignals} />
            </div>
            <div className="flex-[2] min-h-0">
              <LiquidationHeatmapPanel
                symbol={focusedSymbol}
                orderbook={orderbook}
                maxLeverage={focusedMaxLeverage}
              />
            </div>
          </div>

          {/* Right column: whale watcher + recent trades + data status */}
          <div className="lg:col-span-3 lg:row-span-1 flex min-h-0 flex-col gap-3">
            <div className="flex-[3] min-h-0">
              <WhaleWatcherPanel events={whaleEvents} />
            </div>
            <div className="flex-[2] min-h-0">
              <RecentTradesPanel trades={trades} symbol={focusedSymbol} />
            </div>
            <div className="flex-1 min-h-0">
              <DataStatusPanel
                isLive={isLive}
                marketCount={markets.length}
                tradeCount={trades.length}
                whaleEventCount={whaleEvents.length}
                signalCount={fusionSignals.length}
              />
            </div>
          </div>
        </div>
      </main>
    </TooltipProvider>
  );
}
