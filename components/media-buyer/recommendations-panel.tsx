"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import type { Finding, Recommendation } from "@/lib/media-buyer/analyzer"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const r = t.modules.mediaBuyer.recommendations
const f = t.modules.mediaBuyer.findings

const PRIORITY_TONE = {
  high: "bg-destructive/15 text-destructive",
  medium: "bg-warning/15 text-warning",
  low: "bg-muted text-muted-foreground",
} as const

export function RecommendationsPanel({ recommendations, findings }: { recommendations: Recommendation[]; findings: Finding[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{r.title}</CardTitle>
        <CardDescription>{r.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {recommendations.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{r.empty}</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {recommendations.map((rec, i) => (
              <li key={i} className="flex flex-col gap-2 rounded-xl border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", PRIORITY_TONE[rec.priority])}>{r.priority[rec.priority]}</span>
                  {rec.campaignName && <Badge variant="secondary" className="max-w-full truncate text-[10px]">{rec.campaignName}</Badge>}
                  <span className="ml-auto text-[11px] text-muted-foreground">{r.confidence[rec.confidence]}</span>
                </div>
                <dl className="flex flex-col gap-1.5 text-sm">
                  <Row label={r.finding} value={rec.finding} />
                  <Row label={r.evidence} value={rec.evidence} mono />
                  <Row label={r.recommendation} value={rec.recommendation} strong />
                  <Row label={r.impact} value={rec.expectedImpact} />
                </dl>
              </li>
            ))}
          </ul>
        )}

        {findings.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer text-sm font-medium">{f.title} ({findings.length})</summary>
            <ul className="mt-2 flex flex-col gap-2 text-xs">
              {findings.map((fi, i) => (
                <li key={i} className="flex flex-col gap-0.5 rounded-lg bg-muted/60 px-3 py-2">
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    {f.categories[fi.category]}{fi.campaignName ? ` · ${fi.campaignName}` : ""}
                  </span>
                  <span className="text-pretty">{fi.observation}</span>
                  <span className="font-mono text-muted-foreground">{fi.evidence}</span>
                </li>
              ))}
            </ul>
          </details>
        )}
        <p className="text-[11px] text-muted-foreground">{r.engine}</p>
      </CardContent>
    </Card>
  )
}

function Row({ label, value, mono = false, strong = false }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground sm:w-32">{label}</dt>
      <dd className={cn("text-pretty break-words", mono && "font-mono text-xs", strong && "font-medium")}>{value}</dd>
    </div>
  )
}
