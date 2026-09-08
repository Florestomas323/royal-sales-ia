"use client"

import { useMemo, useState } from "react"
import { AlertTriangle } from "lucide-react"
import { PeriodFilter } from "@/components/overview/period-filter"
import { MetricCard } from "@/components/overview/metric-card"
import { LeadTrendChart } from "@/components/overview/lead-trend-chart"
import { PipelineFunnels } from "@/components/overview/pipeline-funnels"
import { RepPerformanceTable } from "@/components/overview/rep-performance-table"
import { CampaignPerformanceTable } from "@/components/overview/campaign-performance-table"
import { PriorityLeads } from "@/components/overview/priority-leads"
import { Skeleton } from "@/components/ui/skeleton"
import { DataErrorState } from "@/components/shared/data-error-state"
import { useLeads } from "@/lib/firebase/leads"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { computeMetrics, resolvePeriod, type PeriodKey } from "@/lib/metrics"
import { formatCurrency, formatNumber } from "@/lib/format"
import { t } from "@/lib/i18n"

/**
 * Command center — every number comes from real `leads` documents.
 *
 * Nothing is derived from the dead denormalised counters (`campaign.spend`,
 * `client.leads`…), and ad spend does not exist yet, so spend / CPL / ROAS
 * render "Sin datos de Meta" instead of a misleading $0.
 */
export function CommandCenter() {
  const { workspaceId, isSuperAdmin } = useWorkspace()
  const [periodKey, setPeriodKey] = useState<PeriodKey>("30d")
  // useLeads is scoped by workspace and role in Firestore: a sales_rep only
  // ever receives their own leads, so every metric respects their isolation.
  const { leads, loading, error } = useLeads("all")

  const period = useMemo(() => resolvePeriod(periodKey), [periodKey])
  const metrics = useMemo(() => computeMetrics(leads, { period }), [leads, period])

  if (error) return <DataErrorState error={error} />

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    )
  }

  const pct = (value: number | null) =>
    value === null ? t.overview.dash : `${Math.round(value * 100)}%`

  return (
    <div className="flex flex-col gap-6">
      {/*
        The page header already renders the description; repeating it here
        duplicated the same sentence on screen. Only the workspace scope note
        (super admin viewing everything) and the period filter stay.
      */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {isSuperAdmin && !workspaceId ? (
          <p className="text-sm text-muted-foreground">{t.leads.allWorkspaces}</p>
        ) : (
          <span aria-hidden="true" />
        )}
        <PeriodFilter value={periodKey} onChange={setPeriodKey} />
      </div>

      {/* Commercial priority order: leads → contacto → cita → venta → dinero. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label={t.overview.kpis.leads}
          value={formatNumber(metrics.leads)}
          sub={t.overview.kpis.leadsSub(metrics.salesLeads, metrics.recruitingLeads)}
          emphasis
        />
        <MetricCard
          label={t.overview.kpis.contacted}
          value={formatNumber(metrics.contacted)}
          sub={t.overview.kpis.contactedSub}
          emphasis
        />
        <MetricCard
          label={t.overview.kpis.appointmentStage}
          value={formatNumber(metrics.inAppointmentStage)}
          sub={t.overview.kpis.appointmentStageSub}
          emphasis
        />
        <MetricCard
          label={t.overview.kpis.sales}
          value={formatNumber(metrics.sales)}
          sub={t.overview.kpis.salesSub(metrics.hires)}
          emphasis
        />

        <MetricCard
          label={t.overview.kpis.spend}
          value={metrics.spend === null ? t.overview.noMetaData : formatCurrency(metrics.spend, true)}
          sub={metrics.spend === null ? t.overview.noMetaHint : undefined}
          muted={metrics.spend === null}
        />
        <MetricCard
          label={t.overview.kpis.cpl}
          value={metrics.cpl === null ? t.overview.noData : formatCurrency(metrics.cpl)}
          muted={metrics.cpl === null}
        />
        <MetricCard
          label={t.overview.kpis.revenue}
          value={metrics.revenue === null ? t.overview.noData : formatCurrency(metrics.revenue, true)}
          sub={t.overview.kpis.revenueSub}
          muted={metrics.revenue === null}
        />
        <MetricCard
          label={t.overview.kpis.roas}
          value={metrics.roas === null ? t.overview.noData : `${metrics.roas.toFixed(2)}x`}
          muted={metrics.roas === null}
        />
      </div>

      {/* Honest notes about sales that cannot join the numbers. */}
      {(metrics.salesWithoutAmount > 0 || metrics.salesWithoutDate > 0) && (
        <ul className="flex flex-col gap-1 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          {metrics.salesWithoutAmount > 0 && (
            <li className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              {t.overview.warnings.salesWithoutAmount(metrics.salesWithoutAmount)}
            </li>
          )}
          {metrics.salesWithoutDate > 0 && (
            <li className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              {t.overview.warnings.salesWithoutDate(metrics.salesWithoutDate)}
            </li>
          )}
        </ul>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard label={t.overview.kpis.contactRate} value={pct(metrics.contactRate)} />
        <MetricCard label={t.overview.kpis.appointmentRate} value={pct(metrics.appointmentRate)} />
        <MetricCard label={t.overview.kpis.closeRate} value={pct(metrics.closeRate)} />
        <MetricCard
          label={t.overview.kpis.interviewStage}
          value={formatNumber(metrics.inInterviewStage)}
        />
      </div>

      <LeadTrendChart leads={leads} period={period} />
      {/* Two independent funnels: sales and recruiting are different work
          and are never averaged together. */}
      <PipelineFunnels leads={leads} period={period} />
      <div className="grid gap-6 xl:grid-cols-2">
        <RepPerformanceTable leads={leads} period={period} />
        <CampaignPerformanceTable leads={leads} period={period} />
      </div>
      <PriorityLeads />
    </div>
  )
}
