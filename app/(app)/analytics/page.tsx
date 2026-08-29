import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { PerformanceChart } from "@/components/overview/performance-chart"
import { RevenueChart } from "@/components/analytics/revenue-chart"
import { PlatformPerformance } from "@/components/overview/platform-performance"
import { ConversionFunnel } from "@/components/overview/conversion-funnel"
import { t } from "@/lib/i18n"

export const metadata: Metadata = { title: t.analytics.title }

export default function AnalyticsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.analytics.title} description={t.analytics.description} />
      <PerformanceChart />
      <div className="grid gap-6 lg:grid-cols-2">
        <RevenueChart />
        <PlatformPerformance />
      </div>
      <ConversionFunnel />
    </div>
  )
}
