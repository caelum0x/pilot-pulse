'use client';

import { TooltipProvider } from '@/components/ui/tooltip';
import { Header } from '@/components/Header';
import { MarketsOverviewPanel } from '@/components/panels/MarketsOverviewPanel';
import { WhaleWatcherPanel } from '@/components/panels/WhaleWatcherPanel';
import { OrderbookImbalancePanel } from '@/components/panels/OrderbookImbalancePanel';
import { FusionSignalsPanel } from '@/components/panels/FusionSignalsPanel';
import { usePulseStream } from '@/hooks/usePulseStream';
import { usePulseStore } from '@/lib/store';

export default function DashboardPage(): React.JSX.Element {
  const focusedSymbol = usePulseStore((s) => s.focusedSymbol);
  const { markets, whaleEvents, fusionSignals, orderbook, imbalanceHistory } = usePulseStream();

  return (
    <TooltipProvider delayDuration={150}>
      <main className="flex h-screen flex-col">
        <Header />
        <div className="grid flex-1 min-h-0 gap-3 p-3 lg:grid-cols-12 lg:grid-rows-[minmax(0,1fr)]">
          {/* Markets (left column) */}
          <div className="lg:col-span-4 lg:row-span-1 min-h-0">
            <MarketsOverviewPanel markets={markets} />
          </div>

          {/* Middle column: orderbook + fusion signals */}
          <div className="lg:col-span-4 lg:row-span-1 flex min-h-0 flex-col gap-3">
            <div className="flex-[3] min-h-0">
              <OrderbookImbalancePanel
                symbol={focusedSymbol}
                orderbook={orderbook}
                history={imbalanceHistory}
              />
            </div>
            <div className="flex-[2] min-h-0">
              <FusionSignalsPanel signals={fusionSignals} />
            </div>
          </div>

          {/* Whale watcher (right column) */}
          <div className="lg:col-span-4 lg:row-span-1 min-h-0">
            <WhaleWatcherPanel events={whaleEvents} />
          </div>
        </div>
      </main>
    </TooltipProvider>
  );
}
