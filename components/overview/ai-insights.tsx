import Link from "next/link"
import {
  AlertTriangle,
  ArrowRight,
  Lightbulb,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { aiInsights } from "@/lib/mock-data"
import type { InsightType } from "@/types"
import { cn } from "@/lib/utils"

const typeConfig: Record<
  InsightType,
  { icon: typeof Zap; tint: string; ring: string }
> = {
  opportunity: {
    icon: Lightbulb,
    tint: "bg-success/10 text-success",
    ring: "ring-success/20",
  },
  warning: {
    icon: AlertTriangle,
    tint: "bg-warning/10 text-warning",
    ring: "ring-warning/20",
  },
  performance: {
    icon: TrendingUp,
    tint: "bg-primary/10 text-primary",
    ring: "ring-primary/20",
  },
  action: {
    icon: Zap,
    tint: "bg-accent/10 text-accent",
    ring: "ring-accent/20",
  },
}

export function AiInsights() {
  return (
    <Card className="border-primary/20 bg-gradient-to-b from-primary/[0.04] to-card">
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Sparkles className="size-4" />
          </span>
          <div className="flex flex-col">
            <CardTitle className="text-base">Royal AI</CardTitle>
            <span className="text-xs text-muted-foreground">
              Insights refreshed a few minutes ago
            </span>
          </div>
        </div>
        <Badge variant="secondary" className="gap-1">
          <span className="relative flex size-1.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex size-1.5 rounded-full bg-success" />
          </span>
          Live
        </Badge>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {aiInsights.map((insight) => {
          const cfg = typeConfig[insight.type]
          const Icon = cfg.icon
          return (
            <div
              key={insight.id}
              className="flex gap-3 rounded-xl border border-border/70 bg-card/60 p-3.5"
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg ring-1",
                  cfg.tint,
                  cfg.ring,
                )}
              >
                <Icon className="size-4" />
              </span>
              <div className="flex flex-1 flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium leading-snug text-pretty">
                    {insight.title}
                  </p>
                  {insight.priority === "high" && (
                    <Badge variant="outline" className="shrink-0 text-[10px] uppercase">
                      Priority
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {insight.explanation}
                </p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-0.5 h-7 w-fit gap-1 px-2 text-xs text-primary hover:text-primary"
                  render={<Link href={insight.actionHref} />}
                >
                  {insight.actionLabel}
                  <ArrowRight className="size-3" />
                </Button>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
