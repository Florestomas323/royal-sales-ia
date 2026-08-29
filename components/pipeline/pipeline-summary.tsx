import type { Lead } from "@/types"
import { formatCurrency } from "@/lib/format"
import { Card, CardContent } from "@/components/ui/card"
import { t } from "@/lib/i18n"

export function PipelineSummary({ leads }: { leads: Lead[] }) {
  const total = leads.length || 1
  const open = leads.filter((l) => l.stage !== "sale")
  const openValue = open.reduce((sum, l) => sum + l.potentialValue, 0)
  const won = leads.filter((l) => l.stage === "sale")
  const wonValue = won.reduce((sum, l) => sum + l.potentialValue, 0)
  const avgScore = Math.round(leads.reduce((sum, l) => sum + l.score, 0) / total)
  const winRate = Math.round((won.length / total) * 100)

  const stats = [
    {
      label: t.pipeline.stats.open,
      value: formatCurrency(openValue, true),
      sub: t.pipeline.stats.openSub(open.length),
    },
    {
      label: t.pipeline.stats.won,
      value: formatCurrency(wonValue, true),
      sub: t.pipeline.stats.wonSub(won.length),
    },
    {
      label: t.pipeline.stats.winRate,
      value: `${winRate}%`,
      sub: t.pipeline.stats.winRateSub,
    },
    {
      label: t.pipeline.stats.avgScore,
      value: `${avgScore}`,
      sub: t.pipeline.stats.avgScoreSub,
    },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} className="gap-0 py-4">
          <CardContent className="px-4">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{s.value}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{s.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
