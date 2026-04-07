import { Header } from '@/components/Header';
import { ManagersPanel } from '@/components/panels/ManagersPanel';
import { PerformancePanel } from '@/components/panels/PerformancePanel';
import { PositionsPanel } from '@/components/panels/PositionsPanel';
import { RiskOverviewPanel } from '@/components/panels/RiskOverviewPanel';
import { SetupGuidePanel } from '@/components/panels/SetupGuidePanel';
import { TradeTimelinePanel } from '@/components/panels/TradeTimelinePanel';
import { WebhookActivityPanel } from '@/components/panels/WebhookActivityPanel';

export default function DashboardPage() {
  return (
    <>
      <Header />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-6">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="flex flex-col gap-4 lg:col-span-3">
            <WebhookActivityPanel />
            <PerformancePanel />
            <TradeTimelinePanel />
          </div>
          <div className="flex flex-col gap-4 lg:col-span-2">
            <RiskOverviewPanel />
            <PositionsPanel />
            <ManagersPanel />
          </div>
        </div>
        <SetupGuidePanel />
      </main>
    </>
  );
}
