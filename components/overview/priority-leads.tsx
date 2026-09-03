"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowUpRight, Flame } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ScoreBadge } from "@/components/shared/score-badge"
import { PlatformMark } from "@/components/shared/platform-badge"
import { LeadTypeBadge } from "@/components/shared/lead-type-badge"
import { LeadDetailSheet } from "@/components/leads/lead-detail-sheet"
import { useLeads } from "@/lib/firebase/leads"
import { isOpen, leadTypeOf } from "@/lib/leads"
import { formatCurrency } from "@/lib/format"
import { t } from "@/lib/i18n"
import type { Lead } from "@/types"

/** Top open leads by score — real data from the active workspace. */
export function PriorityLeads() {
  const { leads, loading } = useLeads("all")
  const [selected, setSelected] = useState<Lead | null>(null)

  const priority = leads
    .filter(isOpen)
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
        {loading &&
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-2 py-2.5">
              <Skeleton className="size-6 rounded-md" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
          ))}
        {!loading && priority.length === 0 && (
          <p className="px-2 py-6 text-center text-sm text-muted-foreground">
            {t.overview.prioritiesEmpty}
          </p>
        )}
        {priority.map((lead) => (
          <button
            key={lead.id}
            type="button"
            onClick={() => setSelected(lead)}
            className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-muted/50"
          >
            <PlatformMark platform={lead.source} />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="flex items-center gap-2 truncate text-sm font-medium">
                {lead.name}
                <LeadTypeBadge type={leadTypeOf(lead)} className="hidden sm:inline-flex" />
              </span>
              <span className="truncate text-xs text-muted-foreground">{lead.nextAction}</span>
            </div>
            {leadTypeOf(lead) === "sales" && (
              <div className="hidden shrink-0 text-right text-xs text-muted-foreground sm:block">
                {formatCurrency(lead.potentialValue, true)}
              </div>
            )}
            <ScoreBadge score={lead.score} temperature={lead.temperature} />
          </button>
        ))}
      </CardContent>
      <LeadDetailSheet
        lead={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </Card>
  )
}
