"use client"

import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { computeCampaignPerformance, type Period } from "@/lib/metrics"
import { formatCurrency, formatNumber } from "@/lib/format"
import { t } from "@/lib/i18n"
import type { Lead } from "@/types"

/**
 * Per-campaign performance, grouped by whatever identifier each lead really
 * carries (campaignId → external campaign id → UTM). No campaign is invented,
 * and CPL / ROAS stay "Sin datos" because there is no executed spend yet.
 */
export function CampaignPerformanceTable({ leads, period }: { leads: Lead[]; period: Period }) {
  const rows = useMemo(() => computeCampaignPerformance(leads, {}, { period }), [leads, period])
  const visible = rows.filter((r) => r.leads > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.overview.campaigns}</CardTitle>
        <CardDescription>{t.overview.campaignsDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {t.overview.campaignsEmpty}
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {visible.map((row) => (
              <li key={row.key} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {row.label || t.overview.noCampaignRow}
                  </span>
                  {row.source === "utm" && (
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      UTM
                    </Badge>
                  )}
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                  <Cell label={t.overview.table.leads} value={formatNumber(row.leads)} />
                  <Cell label={t.overview.table.contacted} value={formatNumber(row.contacted)} />
                  <Cell label={t.overview.table.sales} value={formatNumber(row.sales)} />
                  <Cell
                    label={t.overview.table.revenue}
                    value={row.revenue === null ? t.overview.dash : formatCurrency(row.revenue, true)}
                  />
                  <Cell
                    label={t.overview.table.cpl}
                    value={row.cpl === null ? t.overview.noData : formatCurrency(row.cpl)}
                  />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start sm:justify-start">
      <dt>{label}</dt>
      <dd className="font-mono font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  )
}
