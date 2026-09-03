import { OverviewHeader } from "@/components/overview/overview-header"
import { KpiCards } from "@/components/overview/kpi-cards"
import { AiInsights } from "@/components/overview/ai-insights"
import { ConversionFunnel } from "@/components/overview/conversion-funnel"
import { PerformanceChart } from "@/components/overview/performance-chart"
import { PlatformPerformance } from "@/components/overview/platform-performance"
import { PriorityLeads } from "@/components/overview/priority-leads"
import { MockWidget } from "@/components/shared/mock-widget"

export default function OverviewPage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <OverviewHeader />

      <KpiCards />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <PriorityLeads />
          <MockWidget>
            <PerformanceChart />
          </MockWidget>
          <MockWidget>
            <PlatformPerformance />
          </MockWidget>
          <MockWidget>
            <ConversionFunnel />
          </MockWidget>
        </div>
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <MockWidget>
              <AiInsights />
            </MockWidget>
          </div>
        </div>
      </div>
    </div>
  )
}
