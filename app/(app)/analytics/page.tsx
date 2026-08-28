import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { PerformanceChart } from "@/components/overview/performance-chart"
import { RevenueChart } from "@/components/analytics/revenue-chart"
import { PlatformPerformance } from "@/components/overview/platform-performance"
import { ConversionFunnel } from "@/components/overview/conversion-funnel"

export const metadata: Metadata = { title: "Analytics" }

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Analytics"
        description="Spend, lead volume, and revenue trends across every connected channel."
      />
      <PerformanceChart />
      <div className="grid gap-6 lg:grid-cols-2">
        <RevenueChart />
        <PlatformPerformance />
      </div>
      <ConversionFunnel />
    </div>
  )
}
