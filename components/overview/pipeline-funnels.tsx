"use client"

import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { computeFunnel, type FunnelResult } from "@/lib/funnels"
import { formatNumber, formatPercent } from "@/lib/format"
import { type Period } from "@/lib/metrics"
import { t } from "@/lib/i18n"
import type { Lead } from "@/types"

const f = t.overview.funnels

/**
 * The two conversion funnels, computed from real leads of the active
 * workspace and the selected period. Sales and recruiting never share a card:
 * a demo and an interview are different work with different meaning.
 *
 * No money here on purpose — a funnel counts people, and an estimated amount
 * beside a real one reads as if it had already been earned.
 */
export function PipelineFunnels({ leads, period }: { leads: Lead[]; period: Period }) {
  const sales = useMemo(() => computeFunnel(leads, "sales", period), [leads, period])
  const recruiting = useMemo(() => computeFunnel(leads, "recruiting", period), [leads, period])

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <FunnelCard result={sales} title={f.salesTitle} description={f.salesDescription} lostLabel={f.lostSales} />
      <FunnelCard
        result={recruiting}
        title={f.recruitingTitle}
        description={f.recruitingDescription}
        lostLabel={f.lostRecruiting}
      />
    </div>
  )
}

function FunnelCard({
  result,
  title,
  description,
  lostLabel,
}: {
  result: FunnelResult
  title: string
  description: string
  lostLabel: string
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription className="text-pretty">{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {result.entered === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground text-pretty">
            {f.empty}
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {result.steps.map((step) => (
                <li key={step.stage} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-pretty">{step.label}</span>
                    <span className="font-mono text-sm font-medium tabular-nums">
                      {formatNumber(step.count)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      // A step with real leads always shows a sliver, so an
                      // almost-empty stage is not mistaken for zero.
                      style={{ width: `${step.count > 0 ? Math.max(step.shareOfEntry * 100, 2) : 0}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>

            <div className="grid grid-cols-3 gap-2 border-t pt-3">
              <Figure label={f.entered} value={formatNumber(result.entered)} />
              <Figure
                label={f.conversion}
                value={result.conversion === null ? "—" : formatPercent(result.conversion * 100)}
              />
              {/* Exit state: counted, but never a step inside the funnel. */}
              <Figure label={lostLabel} value={formatNumber(result.lost)} />
            </div>

            <p className="text-xs text-muted-foreground text-pretty">{f.note}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm font-semibold tabular-nums">{value}</span>
    </div>
  )
}
