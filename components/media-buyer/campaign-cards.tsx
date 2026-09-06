"use client"

import { Building2, TrendingDown, TrendingUp } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { CampaignMetrics, Health } from "@/lib/media-buyer/analyzer"
import { formatCurrency, formatNumber } from "@/lib/format"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const c = t.modules.mediaBuyer.campaigns

const HEALTH_TONE: Record<Health, string> = {
  excellent: "bg-success/15 text-success",
  healthy: "bg-primary/10 text-primary",
  attention: "bg-warning/15 text-warning",
  critical: "bg-destructive/15 text-destructive",
  insufficient: "bg-muted text-muted-foreground",
}

/**
 * Responsive campaign cards. On a phone each campaign is a card with a 2-col
 * grid of metrics — never a wide horizontal table. `null` renders "Sin datos".
 */
export function CampaignCards({
  campaigns,
  showWorkspace,
  workspaceNames,
  linkedWithoutData,
  unlinked,
  hasPrevious,
}: {
  campaigns: CampaignMetrics[]
  showWorkspace: boolean
  workspaceNames: Record<string, string>
  linkedWithoutData: number
  unlinked: number
  hasPrevious: boolean
}) {
  const noData = t.modules.mediaBuyer.summary.noData
  const money = (v: number | null, compact = false) => (v === null ? noData : formatCurrency(v, compact))
  const num = (v: number | null) => (v === null ? noData : formatNumber(v))
  const pct = (v: number | null) => (v === null ? noData : `${v.toFixed(2)}%`)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{c.title}</CardTitle>
        <CardDescription>{c.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="flex flex-col gap-3">
          {campaigns.map((cp) => (
            <li key={cp.metaCampaignId} className="flex flex-col gap-3 rounded-xl border p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{cp.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">{cp.metaCampaignId}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <Badge variant="secondary" className="text-[10px]">{c.objective[cp.objective]}</Badge>
                    {showWorkspace && (
                      <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                        <Building2 className="size-3" />
                        {workspaceNames[cp.workspaceId] ?? cp.workspaceId}
                      </span>
                    )}
                  </div>
                </div>
                <span className={cn("shrink-0 self-start rounded-full px-2.5 py-1 text-xs font-medium", HEALTH_TONE[cp.health])}>
                  {c.health[cp.health]}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                <Cell label={c.labels.spend} value={money(cp.spend)} delta={hasPrevious ? cp.deltas?.spend ?? null : null} emphasis />
                <Cell label={c.labels.crmLeads} value={formatNumber(cp.crmLeads)} emphasis />
                <Cell label={c.labels.metaLeads} value={num(cp.metaLeads)} />
                <Cell label={c.labels.cplCrm} value={money(cp.cplCrm)} emphasis />
                <Cell label={c.labels.cplMeta} value={money(cp.cplMeta)} />
                <Cell label={c.labels.ctr} value={pct(cp.ctr)} delta={hasPrevious ? cp.deltas?.ctr ?? null : null} />
                <Cell label={c.labels.cpc} value={money(cp.cpc)} />
                <Cell label={c.labels.cpm} value={money(cp.cpm)} />
                <Cell label={c.labels.impressions} value={num(cp.impressions)} />
                <Cell label={c.labels.reach} value={num(cp.reach)} />
                <Cell label={c.labels.frequency} value={cp.frequency === null ? noData : cp.frequency.toFixed(2)} />
                <Cell label={c.labels.leadToSale} value={cp.leadToSaleRate === null ? noData : `${Math.round(cp.leadToSaleRate * 100)}%`} />
                <Cell label={c.labels.sales} value={formatNumber(cp.sales)} emphasis />
                <Cell label={c.labels.revenue} value={money(cp.revenue, true)} emphasis />
                <Cell label={c.labels.roas} value={cp.roas === null ? noData : `${cp.roas.toFixed(2)}x`} emphasis />
              </dl>
            </li>
          ))}
        </ul>
        {(linkedWithoutData > 0 || unlinked > 0) && (
          <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
            {linkedWithoutData > 0 && <li>{c.linkedWithoutData(linkedWithoutData)}</li>}
            {unlinked > 0 && <li>{c.unlinked(unlinked)}</li>}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function Cell({ label, value, delta = null, emphasis = false }: { label: string; value: string; delta?: number | null; emphasis?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("flex items-center gap-1 font-mono tabular-nums", emphasis ? "font-medium text-foreground" : "text-foreground")}>
        <span className="truncate">{value}</span>
        {delta !== null && (
          <span className={cn("flex items-center text-[10px]", delta >= 0 ? "text-success" : "text-destructive")} title={c.labels.vsPrevious}>
            {delta >= 0 ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {Math.abs(Math.round(delta * 100))}%
          </span>
        )}
      </dd>
    </div>
  )
}
