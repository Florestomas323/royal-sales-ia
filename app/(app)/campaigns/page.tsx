import type { Metadata } from "next"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { PageHeader } from "@/components/shared/page-header"
import { CampaignsTable } from "@/components/campaigns/campaigns-table"
import { campaigns } from "@/lib/mock-data"
import { formatCurrency, formatNumber } from "@/lib/format"

export const metadata: Metadata = { title: "Campaigns" }

export default function CampaignsPage() {
  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0)
  const totalLeads = campaigns.reduce((s, c) => s + c.leads, 0)
  const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0)
  const blendedRoas = totalRevenue / totalSpend
  const activeCount = campaigns.filter((c) => c.status === "active").length

  const stats = [
    { label: "Ad spend", value: formatCurrency(totalSpend, true) },
    { label: "Leads generated", value: formatNumber(totalLeads) },
    { label: "Revenue", value: formatCurrency(totalRevenue, true) },
    { label: "Blended ROAS", value: `${blendedRoas.toFixed(1)}x` },
    { label: "Active campaigns", value: String(activeCount) },
  ]

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Campaigns"
        description="Cross-platform ad performance across Meta, Google, and TikTok."
        actions={<Button size="sm">New campaign</Button>}
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex flex-col gap-1 p-4">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <span className="font-mono text-xl font-semibold tabular-nums">
                {s.value}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      <CampaignsTable />
    </div>
  )
}
