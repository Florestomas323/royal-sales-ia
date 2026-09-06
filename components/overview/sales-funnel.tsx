"use client"

import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { computeMetrics, type Period } from "@/lib/metrics"
import { formatNumber } from "@/lib/format"
import { t } from "@/lib/i18n"
import type { Lead } from "@/types"

/** Real sales funnel: leads → contactados → en etapa de cita → ventas. */
export function SalesFunnel({ leads, period }: { leads: Lead[]; period: Period }) {
  const m = useMemo(() => computeMetrics(leads, { period }), [leads, period])
  const steps = [
    { label: t.overview.kpis.leads, value: m.salesLeads },
    { label: t.overview.kpis.contacted, value: m.contacted },
    { label: t.overview.kpis.appointmentStage, value: m.inAppointmentStage },
    { label: t.overview.kpis.sales, value: m.sales },
  ]
  const top = steps[0].value

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.overview.funnel}</CardTitle>
        <CardDescription>{t.overview.funnelDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {top === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {t.overview.funnelEmpty}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {steps.map((step) => {
              const width = top > 0 ? Math.max((step.value / top) * 100, 2) : 0
              return (
                <li key={step.label} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm text-pretty">{step.label}</span>
                    <span className="font-mono text-sm font-medium tabular-nums">
                      {formatNumber(step.value)}
                    </span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-primary" style={{ width: `${width}%` }} />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
