import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PlatformBadge } from "@/components/shared/platform-badge"
import { platformMetrics } from "@/lib/mock-data"
import { formatCurrency, formatNumber } from "@/lib/format"

export function PlatformPerformance() {
  const totalLeads = platformMetrics.reduce((s, p) => s + p.leads, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Performance by platform</CardTitle>
        <CardDescription>Where your leads and revenue come from</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {platformMetrics.map((p) => {
          const share = totalLeads ? Math.round((p.leads / totalLeads) * 100) : 0
          return (
            <div
              key={p.platform}
              className="flex items-center gap-4 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
            >
              <div className="w-32 shrink-0">
                <PlatformBadge platform={p.platform} />
              </div>
              <div className="flex flex-1 flex-col gap-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${share}%` }}
                  />
                </div>
              </div>
              <div className="flex w-40 shrink-0 items-center justify-end gap-4 text-sm tabular-nums">
                <span className="text-muted-foreground">{formatNumber(p.leads)} leads</span>
                <span className="font-medium">{formatCurrency(p.cpl)}</span>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
