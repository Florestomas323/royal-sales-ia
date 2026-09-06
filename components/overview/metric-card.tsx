import type { ReactNode } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"

/**
 * One KPI. A `null` value renders the provided empty label ("Sin datos" /
 * "—") instead of 0, so a missing source is never read as a real zero.
 */
export function MetricCard({
  label,
  value,
  sub,
  emphasis = false,
  muted = false,
}: {
  label: string
  value: ReactNode
  sub?: ReactNode
  emphasis?: boolean
  muted?: boolean
}) {
  return (
    <Card className="gap-0 py-4">
      <CardContent className="px-4">
        <p className="text-xs text-pretty text-muted-foreground">{label}</p>
        <p
          className={cn(
            "mt-1 font-mono font-semibold tabular-nums",
            emphasis ? "text-2xl" : "text-xl",
            muted && "text-base font-normal text-muted-foreground",
          )}
        >
          {value}
        </p>
        {sub && <p className="mt-0.5 text-xs text-pretty text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
}
