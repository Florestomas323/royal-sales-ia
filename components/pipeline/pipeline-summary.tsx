import type { Lead, LeadType } from "@/types"
import { formatCurrency } from "@/lib/format"
import { computeMetrics } from "@/lib/metrics"
import { PIPELINES } from "@/lib/constants"
import { Card, CardContent } from "@/components/ui/card"
import { t } from "@/lib/i18n"

interface Stat {
  label: string
  value: string
  sub: string
}

/**
 * Funnel summary. `Ganado` shows REAL closed revenue (confirmed amounts), not
 * potential value — the previous version summed `potentialValue` of won leads
 * and presented it as income, which it never was.
 */
function salesStats(leads: Lead[]): Stat[] {
  const m = computeMetrics(leads)
  const open = leads.filter((l) => l.stage !== "sale" && l.stage !== "not_interested")
  const openValue = open.reduce((sum, l) => sum + l.potentialValue, 0)
  const wonTotal = leads.filter((l) => l.stage === PIPELINES.sales.won).length
  return [
    { label: t.pipeline.stats.open, value: formatCurrency(openValue, true), sub: t.pipeline.stats.openSub(open.length) },
    {
      label: t.pipeline.stats.won,
      value: m.revenue === null ? t.overview.dash : formatCurrency(m.revenue, true),
      sub: t.pipeline.stats.wonSub(wonTotal),
    },
    {
      label: t.pipeline.stats.winRate,
      value: m.leads > 0 ? `${Math.round((wonTotal / m.leads) * 100)}%` : t.overview.dash,
      sub: t.pipeline.stats.winRateSub,
    },
    {
      label: t.pipeline.stats.avgScore,
      value: `${avgScore(leads)}`,
      sub: t.pipeline.stats.avgScoreSub,
    },
  ]
}

function recruitingStats(leads: Lead[]): Stat[] {
  const m = computeMetrics(leads)
  const hiredTotal = leads.filter((l) => l.stage === PIPELINES.recruiting.won).length
  const open = leads.filter((l) => l.stage !== PIPELINES.recruiting.won && l.stage !== PIPELINES.recruiting.lost)
  return [
    { label: t.pipeline.recruitingStats.open, value: `${open.length}`, sub: t.pipeline.recruitingStats.openSub },
    { label: t.pipeline.recruitingStats.interviews, value: `${m.inInterviewStage}`, sub: t.pipeline.recruitingStats.interviewsSub },
    { label: t.pipeline.recruitingStats.hired, value: `${hiredTotal}`, sub: t.pipeline.recruitingStats.hiredSub },
    {
      label: t.pipeline.recruitingStats.conversion,
      value: m.recruitingLeads > 0 ? `${Math.round((hiredTotal / m.recruitingLeads) * 100)}%` : t.overview.dash,
      sub: t.pipeline.recruitingStats.conversionSub,
    },
  ]
}

function avgScore(leads: Lead[]): number {
  if (leads.length === 0) return 0
  return Math.round(leads.reduce((sum, l) => sum + l.score, 0) / leads.length)
}

export function PipelineSummary({ leads, leadType }: { leads: Lead[]; leadType: LeadType }) {
  const stats = leadType === "recruiting" ? recruitingStats(leads) : salesStats(leads)
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
