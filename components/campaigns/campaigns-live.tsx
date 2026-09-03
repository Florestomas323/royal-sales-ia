"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { CampaignsTable } from "@/components/campaigns/campaigns-table"
import { useCampaigns } from "@/lib/firebase/collections"
import { formatCurrency, formatNumber } from "@/lib/format"
import { t } from "@/lib/i18n"
import { DataErrorState } from "@/components/shared/data-error-state"
import { DemoRowsNotice } from "@/components/shared/demo-data-badge"

export function CampaignsLive() {
  const { campaigns, loading, error } = useCampaigns()

  const totalSpend = campaigns.reduce((s, c) => s + c.spend, 0)
  const totalLeads = campaigns.reduce((s, c) => s + c.leads, 0)
  const totalRevenue = campaigns.reduce((s, c) => s + c.revenue, 0)
  const blendedRoas = totalSpend > 0 ? totalRevenue / totalSpend : 0
  const activeCount = campaigns.filter((c) => c.status === "active").length

  const stats = [
    { label: t.campaigns.stats.spend, value: formatCurrency(totalSpend, true) },
    { label: t.campaigns.stats.leads, value: formatNumber(totalLeads) },
    { label: t.campaigns.stats.revenue, value: formatCurrency(totalRevenue, true) },
    { label: t.campaigns.stats.roas, value: `${blendedRoas.toFixed(1)}x` },
    { label: t.campaigns.stats.active, value: String(activeCount) },
  ]

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="flex flex-col gap-2 p-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card>
          <CardContent className="flex flex-col gap-4 p-4">
            <Skeleton className="h-9 w-full max-w-xs" />
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="size-8 rounded-md" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <DataErrorState error={error} />}
      <DemoRowsNotice rows={campaigns} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="flex flex-col gap-1 p-4">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <span className="font-mono text-xl font-semibold tabular-nums">{s.value}</span>
            </CardContent>
          </Card>
        ))}
      </div>

      <CampaignsTable campaigns={campaigns} />
    </div>
  )
}
