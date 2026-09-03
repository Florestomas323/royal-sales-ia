"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { DataErrorState } from "@/components/shared/data-error-state"
import { useLeads } from "@/lib/firebase/leads"
import { computeRecruitingMetrics, computeSalesMetrics } from "@/lib/metrics"
import { isOpen, leadTypeOf } from "@/lib/leads"
import { formatNumber } from "@/lib/format"
import { t } from "@/lib/i18n"

/**
 * Real KPI cards computed from the workspace's leads in Firestore.
 * No period comparison is shown: there is no historical snapshot yet, and we
 * do not fabricate trends.
 */
export function KpiCards() {
  const { leads, loading, error } = useLeads("all")

  if (error) return <DataErrorState error={error} />

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="flex flex-col gap-3 p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-16" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const sales = computeSalesMetrics(leads)
  const recruiting = computeRecruitingMetrics(leads)
  const salesOpen = leads.filter((l) => leadTypeOf(l) === "sales" && isOpen(l)).length

  const cards = [
    { label: t.overview.kpis.totalLeads, value: leads.length, sub: t.overview.kpis.totalLeadsSub },
    { label: t.overview.kpis.salesLeads, value: sales.leads, sub: t.overview.kpis.salesLeadsSub(salesOpen) },
    { label: t.overview.kpis.candidates, value: recruiting.candidates, sub: t.overview.kpis.candidatesSub(recruiting.open) },
    { label: t.overview.kpis.closed, value: sales.sales, sub: t.overview.kpis.closedSub(recruiting.hired) },
  ]

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((kpi) => (
        <Card key={kpi.label} className="overflow-hidden">
          <CardContent className="flex flex-col gap-3 p-5">
            <span className="text-sm text-muted-foreground">{kpi.label}</span>
            <span className="font-serif text-3xl font-semibold tracking-tight tabular-nums">
              {formatNumber(kpi.value)}
            </span>
            <span className="text-xs text-muted-foreground">{kpi.sub}</span>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
