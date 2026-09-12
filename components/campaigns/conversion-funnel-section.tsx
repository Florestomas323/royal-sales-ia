"use client"

import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useFunnelEvents } from "@/lib/firebase/funnel-events"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { buildFunnelReport } from "@/lib/funnel-events"
import { formatNumber, formatPercent } from "@/lib/format"
import { t } from "@/lib/i18n"

const f = t.campaigns.conversionFunnel

/**
 * Landing → booking funnel for the active workspace.
 *
 * Counts DISTINCT sessions per step, so a visitor who reloads is one visit.
 * Percentages are `null` — shown as "Sin datos" — whenever the step before
 * them had nobody: a rate out of zero is not 0 %, it is unknown.
 */
export function ConversionFunnelSection() {
  const { workspaceId } = useWorkspace()
  const { events, loading } = useFunnelEvents(workspaceId)
  const report = useMemo(() => buildFunnelReport(events), [events])

  if (loading) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{f.title}</CardTitle>
        <CardDescription className="text-pretty">{f.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {report.visits === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground text-pretty">
            {f.empty}
          </p>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {report.steps.map((step) => (
                <li key={step.event} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-pretty">{step.label}</span>
                    <span className="font-mono text-sm font-medium tabular-nums">{formatNumber(step.count)}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${step.ofVisits !== null && step.count > 0 ? Math.max(step.ofVisits * 100, 2) : 0}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground tabular-nums">
                    {step.ofPrevious !== null && (
                      <span>{formatPercent(step.ofPrevious * 100)} {f.ofPrevious}</span>
                    )}
                    {step.ofVisits !== null && (
                      <span>{formatPercent(step.ofVisits * 100)} {f.ofVisits}</span>
                    )}
                    {step.dropOff !== null && (
                      <span>{formatPercent(step.dropOff * 100)} {f.dropOff}</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            {report.worstDrop && (
              <p className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-pretty">
                {f.worstDrop(
                  report.worstDrop.from,
                  report.worstDrop.to,
                  formatPercent(report.worstDrop.rate * 100),
                )}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
