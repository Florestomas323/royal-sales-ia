"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { CampaignsTable } from "@/components/campaigns/campaigns-table"
import { ConversionFunnelSection } from "@/components/campaigns/conversion-funnel-section"
import { useMemo } from "react"
import { useCampaigns } from "@/lib/firebase/collections"
import { useLeads } from "@/lib/firebase/leads"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { useMediaBuyer } from "@/lib/media-buyer/client"
import { analyzeCampaignPerformance } from "@/lib/media-buyer/analyzer"
import { mergeCampaigns, mergedTotals } from "@/lib/campaigns/merged"
import { CampaignAdsSection } from "@/components/campaigns/campaign-ads-section"
import { resolvePeriod, type PeriodKey } from "@/lib/metrics"
import type { InsightsPeriod } from "@/lib/meta/insights"
import { formatCurrency, formatNumber } from "@/lib/format"
import { t } from "@/lib/i18n"
import { DataErrorState } from "@/components/shared/data-error-state"
import { DemoRowsNotice } from "@/components/shared/demo-data-badge"

/** Period used by Campañas. Same default Media Buyer opens with, so the two
 *  screens never show the same campaign over different date ranges. */
const PERIOD: InsightsPeriod = "30d"

export function CampaignsLive() {
  const { campaigns, loading, error } = useCampaigns()
  const { workspaceId, isSuperAdmin } = useWorkspace()
  // The SAME service Media Buyer uses: one request per screen, already
  // scoped to workspaces this person may see. No second Meta client, and no
  // per-row request.
  const { data } = useMediaBuyer(workspaceId, PERIOD, isSuperAdmin)
  const { leads } = useLeads("all")

  // CRM side honours the period Meta was queried with, through Phase F's
  // resolvePeriod — exactly what Media Buyer does.
  const crmPeriod = useMemo(() => resolvePeriod(PERIOD as PeriodKey), [])
  const metrics = useMemo(
    () => (data ? analyzeCampaignPerformance(data.campaigns, leads, { period: crmPeriod }).campaigns : []),
    [data, leads, crmPeriod],
  )
  const rows = useMemo(() => mergeCampaigns(campaigns, metrics), [campaigns, metrics])
  // Ads come straight from Meta, one card per linked campaign. A campaign
  // with no Meta link has no ads to read and renders nothing.
  const metaCampaigns = useMemo(
    () => campaigns.filter((c) => Boolean(c.externalId)),
    [campaigns],
  )
  const totals = useMemo(() => mergedTotals(rows), [rows])

  const noData = t.overview.noData
  const stats = [
    { label: t.campaigns.stats.spend, value: totals.spend === null ? noData : formatCurrency(totals.spend, true) },
    { label: t.campaigns.stats.leads, value: formatNumber(totals.leads) },
    { label: t.campaigns.stats.revenue, value: totals.revenue === null ? noData : formatCurrency(totals.revenue, true) },
    { label: t.campaigns.stats.roas, value: totals.roas === null ? noData : `${totals.roas.toFixed(1)}x` },
    { label: t.campaigns.stats.active, value: String(totals.active) },
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

      <CampaignsTable campaigns={rows} />

      {metaCampaigns.map((c) => (
        <CampaignAdsSection key={c.id} metaCampaignId={c.externalId ?? null} campaignName={c.name} />
      ))}

      {/* Landing → booking funnel of this workspace. Reads its own events; it
          does not touch the Meta metrics above. */}
      <ConversionFunnelSection />
    </div>
  )
}
