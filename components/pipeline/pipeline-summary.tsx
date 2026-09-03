import type { Lead, LeadType } from "@/types"
import { formatCurrency } from "@/lib/format"
import { computeRecruitingMetrics, computeSalesMetrics } from "@/lib/metrics"
import { Card, CardContent } from "@/components/ui/card"
import { t } from "@/lib/i18n"

interface Stat {
  label: string
  value: string
  sub: string
}

function salesStats(leads: Lead[]): Stat[] {
  const m = computeSalesMetrics(leads)
  const open = leads.filter((l) => l.stage !== "sale" && l.stage !== "not_interested")
  const openValue = open.reduce((sum, l) => sum + l.potentialValue, 0)
  return [
    { label: t.pipeline.stats.open, value: formatCurrency(openValue, true), sub: t.pipeline.stats.openSub(open.length) },
    { label: t.pipeline.stats.won, value: formatCurrency(m.revenue, true), sub: t.pipeline.stats.wonSub(m.sales) },
    { label: t.pipeline.stats.winRate, value: `${Math.round(m.conversion * 100)}%`, sub: t.pipeline.stats.winRateSub },
    { label: t.pipeline.stats.avgScore, value: `${m.avgScore}`, sub: t.pipeline.stats.avgScoreSub },
  ]
}

function recruitingStats(leads: Lead[]): Stat[] {
  const m = computeRecruitingMetrics(leads)
  return [
    { label: t.pipeline.recruitingStats.open, value: `${m.open}`, sub: t.pipeline.recruitingStats.openSub },
    { label: t.pipeline.recruitingStats.interviews, value: `${m.interviews}`, sub: t.pipeline.recruitingStats.interviewsSub },
    { label: t.pipeline.recruitingStats.hired, value: `${m.hired}`, sub: t.pipeline.recruitingStats.hiredSub },
    { label: t.pipeline.recruitingStats.conversion, value: `${Math.round(m.conversion * 100)}%`, sub: t.pipeline.recruitingStats.conversionSub },
  ]
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
