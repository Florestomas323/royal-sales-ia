import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { funnel } from "@/lib/mock-data"
import { formatNumber } from "@/lib/format"

export function ConversionFunnel() {
  const max = funnel[0]?.count ?? 1

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Conversion funnel</CardTitle>
        <CardDescription>Lead journey across the pipeline</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3.5">
        {funnel.map((step, i) => {
          const width = Math.max((step.count / max) * 100, 6)
          return (
            <div key={step.stage} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between text-sm">
                <span className="font-medium">{step.stage}</span>
                <span className="flex items-center gap-2 text-muted-foreground tabular-nums">
                  <span className="text-foreground">{formatNumber(step.count)}</span>
                  {i > 0 && <span className="text-xs">{step.conversion}%</span>}
                </span>
              </div>
              <div className="h-8 w-full overflow-hidden rounded-md bg-muted/60">
                <div
                  className="flex h-full items-center rounded-md bg-gradient-to-r from-primary to-accent transition-all"
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
