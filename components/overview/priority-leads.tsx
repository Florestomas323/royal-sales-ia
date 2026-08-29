import Link from "next/link"
import { ArrowUpRight, Flame } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ScoreBadge } from "@/components/shared/score-badge"
import { PlatformMark } from "@/components/shared/platform-badge"
import { leads } from "@/lib/mock-data"
import { formatCurrency } from "@/lib/format"
import { t } from "@/lib/i18n"

export function PriorityLeads() {
  const priority = [...leads]
    .filter((l) => l.stage !== "sale")
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-2">
        <div className="flex flex-col gap-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Flame className="size-4 text-warning" />
            {t.overview.priorities}
          </CardTitle>
          <CardDescription>{t.overview.prioritiesDescription}</CardDescription>
        </div>
        <Button
          variant="ghost"
          size="sm"
          nativeButton={false}
          className="gap-1 text-xs"
          render={<Link href="/leads" />}
        >
          {t.common.viewAll}
          <ArrowUpRight className="size-3.5" />
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        {priority.map((lead) => (
          <Link
            key={lead.id}
            href={`/leads/${lead.id}`}
            className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
          >
            <PlatformMark platform={lead.source} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-sm font-medium">{lead.name}</span>
              <span className="truncate text-xs text-muted-foreground">
                {lead.nextAction}
              </span>
            </div>
            <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
              {formatCurrency(lead.potentialValue, true)}
            </div>
            <ScoreBadge score={lead.score} temperature={lead.temperature} />
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
