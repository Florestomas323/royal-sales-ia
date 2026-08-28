import { ArrowDownRight, ArrowUpRight } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { kpis } from "@/lib/mock-data"
import { formatKpi, percentChange } from "@/lib/format"
import { cn } from "@/lib/utils"

export function KpiCards() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {kpis.map((kpi) => {
        const change = percentChange(kpi.value, kpi.previousValue)
        const positive = kpi.invertedTrend ? change < 0 : change >= 0
        const Arrow = change >= 0 ? ArrowUpRight : ArrowDownRight
        return (
          <Card key={kpi.id} className="overflow-hidden">
            <CardContent className="flex flex-col gap-3 p-5">
              <span className="text-sm text-muted-foreground">{kpi.label}</span>
              <span className="font-serif text-3xl font-semibold tracking-tight tabular-nums">
                {formatKpi(kpi.value, kpi.format)}
              </span>
              <div className="flex items-center gap-1.5 text-xs">
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular-nums",
                    positive
                      ? "bg-success/10 text-success"
                      : "bg-destructive/10 text-destructive",
                  )}
                >
                  <Arrow className="size-3" />
                  {Math.abs(change).toFixed(1)}%
                </span>
                <span className="text-muted-foreground">vs. previous</span>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
