"use client"

import { useMemo } from "react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { computeLeadTrend, type Period } from "@/lib/metrics"
import { t } from "@/lib/i18n"
import type { Lead } from "@/types"

/** Leads created per day, straight from `createdAt`. No mock series. */
export function LeadTrendChart({ leads, period }: { leads: Lead[]; period: Period }) {
  const data = useMemo(() => computeLeadTrend(leads, period), [leads, period])
  const total = data.reduce((sum, d) => sum + d.leads, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.overview.trend}</CardTitle>
        <CardDescription>{t.overview.trendDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {t.overview.trendEmpty}
          </p>
        ) : (
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => v.slice(5)}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--popover)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                    fontSize: "0.8rem",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="leads"
                  stroke="var(--chart-1)"
                  fill="var(--chart-1)"
                  fillOpacity={0.15}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
