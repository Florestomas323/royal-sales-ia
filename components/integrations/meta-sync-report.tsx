import { AlertTriangle, Check, Minus, X } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { t } from "@/lib/i18n"
import type { MetaResourceState, MetaSyncReport, MetaSyncResource } from "@/types"

const r = t.integrations.meta.syncReport

const ORDER: MetaSyncResource[] = [
  "businesses",
  "adAccounts",
  "pages",
  "campaigns",
  "leadForms",
  "leadRetrieval",
]

const ICONS: Record<MetaResourceState, typeof Check> = {
  ok: Check,
  permission_required: AlertTriangle,
  error: X,
  skipped: Minus,
}

const TONES: Record<MetaResourceState, string> = {
  ok: "text-success",
  permission_required: "text-warning",
  error: "text-destructive",
  skipped: "text-muted-foreground",
}

/** Per-resource outcome of the last sync: a missing scope never hides the rest. */
export function MetaSyncReportCard({ report }: { report: MetaSyncReport | null }) {
  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle className="text-base">{r.title}</CardTitle>
        <CardDescription>{r.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {!report ? (
          <p className="text-sm text-muted-foreground">{r.pending}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ORDER.map((key) => {
              const status = report[key]
              const Icon = ICONS[status.state]
              return (
                <li key={key} className="flex items-start gap-2 text-sm">
                  <Icon className={`mt-0.5 size-3.5 shrink-0 ${TONES[status.state]}`} />
                  <span className="flex-1">
                    {r.resources[key]}
                    {status.note && (
                      <span className="block text-xs text-muted-foreground">{status.note}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {status.state === "ok" ? r.items(status.count) : r.states[status.state]}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
