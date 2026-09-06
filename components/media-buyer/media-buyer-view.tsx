"use client"

import { useMemo, useState } from "react"
import { AlertTriangle, Lock, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { PeriodFilter } from "@/components/overview/period-filter"
import { MetricCard } from "@/components/overview/metric-card"
import { CampaignCards } from "@/components/media-buyer/campaign-cards"
import { RecommendationsPanel } from "@/components/media-buyer/recommendations-panel"
import { DataQualityPanel } from "@/components/media-buyer/data-quality-panel"
import { useMediaBuyer } from "@/lib/media-buyer/client"
import { analyzeCampaignPerformance } from "@/lib/media-buyer/analyzer"
import { useLeads } from "@/lib/firebase/leads"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import type { InsightsPeriod } from "@/lib/meta/insights"
import { resolvePeriod, type PeriodKey } from "@/lib/metrics"
import { formatCurrency, formatNumber, formatRelativeTime } from "@/lib/format"
import { t } from "@/lib/i18n"

const m = t.modules.mediaBuyer

/**
 * Media Buyer IA — READ-ONLY analysis of real Meta Insights joined with the
 * CRM's own leads and confirmed revenue. Nothing on this screen can change a
 * campaign; the engine only observes, compares and recommends.
 */
export function MediaBuyerView() {
  const { workspaceId, isSuperAdmin, role, workspaces } = useWorkspace()
  const [period, setPeriod] = useState<PeriodKey>("30d")
  const canAnalyse = isSuperAdmin || role === "client_admin" || role === "manager"

  // Server-side: Meta insights scoped by campaign links and membership.
  const { data, loading, error, refresh } = useMediaBuyer(workspaceId, period as InsightsPeriod, isSuperAdmin)
  // Client-side: CRM leads already authorised by Security Rules for this person.
  const { leads } = useLeads("all")

  // The CRM side must honour the SAME period Meta was queried with: the
  // boundaries come from Phase F's resolvePeriod, so both screens agree.
  const crmPeriod = useMemo(() => resolvePeriod(period), [period])
  const analysis = useMemo(
    () =>
      data
        ? analyzeCampaignPerformance(data.campaigns, leads, {
            period: crmPeriod,
            linkedWithoutData: data.linkedWithoutData.length,
          })
        : null,
    [data, leads, crmPeriod],
  )
  const workspaceNames = useMemo(() => {
    const map: Record<string, string> = {}
    for (const w of workspaces) map[w.id] = w.name
    return map
  }, [workspaces])

  if (!canAnalyse) {
    return (
      <p className="flex items-start gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
        <Lock className="mt-0.5 size-4 shrink-0" />
        {m.states.forbidden}
      </p>
    )
  }

  const noData = (v: number | null) => v === null
  const pctOrNo = (v: number | null) => (v === null ? m.summary.noData : `${v.toFixed(2)}%`)

  return (
    <div className="flex flex-col gap-6">
      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="gap-1">
            <Lock className="size-3" />
            {m.analysisOnly}
          </Badge>
          {isSuperAdmin && !workspaceId && (
            <span className="text-xs text-muted-foreground">{t.leads.allWorkspaces}</span>
          )}
          {data && (
            <span className="text-xs text-muted-foreground">{m.lastUpdated(formatRelativeTime(data.fetchedAt))}</span>
          )}
        </div>
        <div className="flex gap-2">
          <PeriodFilter value={period} onChange={setPeriod} />
          <Button variant="outline" className="h-11 gap-1.5 sm:h-9" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">{loading ? m.refreshing : m.refresh}</span>
          </Button>
        </div>
      </div>

      <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">{m.analysisOnlyNotice}</p>

      {/* States */}
      {loading && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">{m.loading}</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
        </div>
      )}

      {!loading && (error || (data && !data.ok)) && (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error ?? data?.message}</span>
        </p>
      )}

      {!loading && data?.ok && data.campaigns.length === 0 && data.linkedWithoutData.length === 0 && (
        <EmptyState title={m.states.noCampaigns} hint={m.states.noCampaignsHint} />
      )}
      {!loading && data?.ok && data.campaigns.length === 0 && data.linkedWithoutData.length > 0 && (
        <EmptyState title={m.states.noData} hint={m.states.noDataHint} />
      )}

      {/* Summary */}
      {!loading && data?.ok && analysis && data.campaigns.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <MetricCard label={m.summary.spend} value={noData(analysis.totals.spend) ? m.summary.noData : formatCurrency(analysis.totals.spend as number, true)} muted={noData(analysis.totals.spend)} emphasis />
            <MetricCard label={m.summary.crmLeads} value={formatNumber(analysis.totals.crmLeads)} emphasis />
            <MetricCard label={m.summary.metaLeads} value={noData(analysis.totals.metaLeads) ? m.summary.noData : formatNumber(analysis.totals.metaLeads as number)} muted={noData(analysis.totals.metaLeads)} emphasis />
            <MetricCard label={m.summary.cplCrm} value={noData(analysis.totals.cplCrm) ? m.summary.noData : formatCurrency(analysis.totals.cplCrm as number)} muted={noData(analysis.totals.cplCrm)} emphasis />
            <MetricCard label={m.summary.sales} value={formatNumber(analysis.totals.sales)} />
            <MetricCard label={m.summary.revenue} value={noData(analysis.totals.revenue) ? m.summary.noData : formatCurrency(analysis.totals.revenue as number, true)} muted={noData(analysis.totals.revenue)} />
            <MetricCard label={m.summary.roas} value={noData(analysis.totals.roas) ? m.summary.noData : `${(analysis.totals.roas as number).toFixed(2)}x`} muted={noData(analysis.totals.roas)} />
            <MetricCard label={m.summary.ctr} value={pctOrNo(analysis.totals.ctr)} muted={noData(analysis.totals.ctr)} />
          </div>

          {data.message && (
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
              {data.message}
            </p>
          )}

          <CampaignCards
            campaigns={analysis.campaigns}
            showWorkspace={isSuperAdmin && !workspaceId}
            workspaceNames={workspaceNames}
            linkedWithoutData={data.linkedWithoutData.length}
            unlinked={data.unlinkedCount}
            hasPrevious={data.previousRange !== null}
          />
          <RecommendationsPanel recommendations={analysis.recommendations} findings={analysis.findings} />
          <DataQualityPanel issues={analysis.dataQuality} />
        </>
      )}
    </div>
  )
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-dashed px-4 py-8 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-pretty text-muted-foreground">{hint}</p>
    </div>
  )
}
