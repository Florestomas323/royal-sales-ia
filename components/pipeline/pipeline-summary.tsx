import type { Lead } from "@/types"
import { formatCurrency } from "@/lib/format"
import { Card, CardContent } from "@/components/ui/card"

export function PipelineSummary({ leads }: { leads: Lead[] }) {
  const total = leads.length || 1
  const open = leads.filter((l) => l.stage !== "sale")
  const openValue = open.reduce((sum, l) => sum + l.potentialValue, 0)
  const won = leads.filter((l) => l.stage === "sale")
  const wonValue = won.reduce((sum, l) => sum + l.potentialValue, 0)
  const avgScore = Math.round(leads.reduce((sum, l) => sum + l.score, 0) / total)
  const winRate = Math.round((won.length / total) * 100)

  const stats = [
    { label: "Open pipeline", value: formatCurrency(openValue, true), sub: `${open.length} active leads` },
    { label: "Won this period", value: formatCurrency(wonValue, true), sub: `${won.length} closed deals` },
    { label: "Win rate", value: `${winRate}%`, sub: "of all leads" },
    { label: "Avg. lead score", value: `${avgScore}`, sub: "quality index" },
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
