import { PageHeader } from "@/components/shared/page-header"
import { KpiCards } from "@/components/overview/kpi-cards"
import { AiInsights } from "@/components/overview/ai-insights"
import { ConversionFunnel } from "@/components/overview/conversion-funnel"
import { PerformanceChart } from "@/components/overview/performance-chart"
import { PlatformPerformance } from "@/components/overview/platform-performance"
import { PriorityLeads } from "@/components/overview/priority-leads"
import { currentUser } from "@/lib/mock-data"

export default function OverviewPage() {
  const firstName = currentUser.name.split(" ")[0]

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Here's what's happening across your campaigns and pipeline today."
      />

      <KpiCards />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <PerformanceChart />
          <PlatformPerformance />
          <ConversionFunnel />
          <PriorityLeads />
        </div>
        <div className="lg:col-span-1">
          <div className="lg:sticky lg:top-24">
            <AiInsights />
          </div>
        </div>
      </div>
    </div>
  )
}
