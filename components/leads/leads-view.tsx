"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, SlidersHorizontal, ArrowUpDown, Inbox } from "lucide-react"
import type { Lead, LeadType, PipelineStage, Platform, LeadTemperature } from "@/types"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { ScoreBadge, StageBadge } from "@/components/shared/score-badge"
import { PlatformMark } from "@/components/shared/platform-badge"
import { LeadTypeBadge } from "@/components/shared/lead-type-badge"
import { LeadDetailSheet } from "@/components/leads/lead-detail-sheet"
import {
  STAGE_LABELS,
  PIPELINES,
  PLATFORM_LABELS,
  TEMPERATURE_LABELS,
} from "@/lib/constants"
import { leadTypeOf } from "@/lib/leads"
import { t } from "@/lib/i18n"
import { useUsersMap } from "@/lib/firebase/collections"
import { formatCurrency, formatRelativeTime, initials } from "@/lib/format"
import { cn } from "@/lib/utils"

type SortKey = "score" | "value" | "recent"

export function LeadsView({
  leads,
  leadType = "all",
}: {
  leads: Lead[]
  /** Active type filter; drives which stages are offered and whether the Tipo column shows. */
  leadType?: LeadType | "all"
}) {
  const usersMap = useUsersMap()
  const stageOptions: PipelineStage[] =
    leadType === "all"
      ? [...PIPELINES.sales.stages, ...PIPELINES.recruiting.stages]
      : PIPELINES[leadType].stages
  const [query, setQuery] = useState("")
  const [stage, setStage] = useState<PipelineStage | "all">("all")
  const [platform, setPlatform] = useState<Platform | "all">("all")
  const [temp, setTemp] = useState<LeadTemperature | "all">("all")
  const [sort, setSort] = useState<SortKey>("score")
  const [selected, setSelected] = useState<Lead | null>(null)
  const [open, setOpen] = useState(false)

  // Stage filter must belong to the visible pipeline(s).
  useEffect(() => {
    if (stage !== "all" && !stageOptions.includes(stage)) setStage("all")
  }, [stageOptions, stage])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = leads.filter((l) => {
      if (stage !== "all" && l.stage !== stage) return false
      if (platform !== "all" && l.source !== platform) return false
      if (temp !== "all" && l.temperature !== temp) return false
      if (q && !`${l.name} ${l.email} ${l.phone} ${l.campaignName}`.toLowerCase().includes(q))
        return false
      return true
    })
    return rows.sort((a, b) => {
      if (sort === "score") return b.score - a.score
      if (sort === "value") return b.potentialValue - a.potentialValue
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    })
  }, [leads, query, stage, platform, temp, sort])

  function openLead(lead: Lead) {
    setSelected(lead)
    setOpen(true)
  }

  const platforms = Array.from(new Set(leads.map((l) => l.source)))

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.leads.searchPlaceholder}
            className="h-9 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={stage} onValueChange={(v) => setStage(v as PipelineStage | "all")}>
            <SelectTrigger size="sm" className="w-[130px]">
              <SelectValue>
                {(value: string) =>
                  value === "all" ? t.leads.allStages : STAGE_LABELS[value as PipelineStage]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.leads.allStages}</SelectItem>
              {stageOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {STAGE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={platform} onValueChange={(v) => setPlatform(v as Platform | "all")}>
            <SelectTrigger size="sm" className="w-[130px]">
              <SelectValue>
                {(value: string) =>
                  value === "all" ? t.leads.allSources : PLATFORM_LABELS[value as Platform]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.leads.allSources}</SelectItem>
              {platforms.map((p) => (
                <SelectItem key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={temp} onValueChange={(v) => setTemp(v as LeadTemperature | "all")}>
            <SelectTrigger size="sm" className="w-[120px]">
              <SlidersHorizontal className="size-3.5" data-icon="inline-start" />
              <SelectValue>
                {(value: string) =>
                  value === "all"
                    ? t.leads.allTemperatures
                    : TEMPERATURE_LABELS[value as LeadTemperature]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.leads.allTemperatures}</SelectItem>
              <SelectItem value="hot">{TEMPERATURE_LABELS.hot}</SelectItem>
              <SelectItem value="warm">{TEMPERATURE_LABELS.warm}</SelectItem>
              <SelectItem value="cold">{TEMPERATURE_LABELS.cold}</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger size="sm" className="w-[130px]">
              <ArrowUpDown className="size-3.5" data-icon="inline-start" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">{t.leads.sortByScore}</SelectItem>
              <SelectItem value="value">{t.leads.sortByValue}</SelectItem>
              <SelectItem value="recent">{t.leads.sortByRecent}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{filtered.length}</span>{" "}
          {t.leads.count(filtered.length, leads.length)}
        </p>
      </div>

      {filtered.length === 0 ? (
        <Empty className="rounded-xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox />
            </EmptyMedia>
            <EmptyTitle>{t.leads.emptyTitle}</EmptyTitle>
            <EmptyDescription>{t.leads.emptyDescription}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t.leads.table.lead}</TableHead>
                {leadType === "all" && (
                  <TableHead className="hidden sm:table-cell">{t.leads.table.type}</TableHead>
                )}
                <TableHead>{t.leads.table.source}</TableHead>
                <TableHead>{t.leads.table.stage}</TableHead>
                <TableHead className="text-right">{t.leads.table.score}</TableHead>
                <TableHead className="hidden text-right md:table-cell">
                  {t.leads.table.value}
                </TableHead>
                <TableHead className="hidden lg:table-cell">{t.leads.table.owner}</TableHead>
                <TableHead className="hidden text-right sm:table-cell">
                  {t.leads.table.received}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((lead) => {
                const rep = usersMap[lead.assignedToId]
                return (
                  <TableRow
                    key={lead.id}
                    onClick={() => openLead(lead)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{lead.name}</span>
                        <span className="text-xs text-muted-foreground">{lead.phone}</span>
                      </div>
                    </TableCell>
                    {leadType === "all" && (
                      <TableCell className="hidden sm:table-cell">
                        <LeadTypeBadge type={leadTypeOf(lead)} />
                      </TableCell>
                    )}
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <PlatformMark platform={lead.source} />
                        <span className="hidden text-xs text-muted-foreground xl:inline">
                          {lead.campaignName}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell>
                      <StageBadge stage={lead.stage} />
                    </TableCell>
                    <TableCell className="text-right">
                      <ScoreBadge score={lead.score} temperature={lead.temperature} className="justify-end" />
                    </TableCell>
                    <TableCell className="hidden text-right font-medium tabular-nums md:table-cell">
                      {leadTypeOf(lead) === "sales"
                        ? formatCurrency(lead.potentialValue)
                        : t.leads.detail.notAvailable}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {rep && (
                        <span className="flex items-center gap-2">
                          <span
                            className="flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                            style={{ backgroundColor: rep.avatarColor }}
                          >
                            {initials(rep.name)}
                          </span>
                          <span className="text-xs text-muted-foreground">{rep.name.split(" ")[0]}</span>
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="hidden text-right text-xs text-muted-foreground sm:table-cell">
                      {formatRelativeTime(lead.createdAt)}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <LeadDetailSheet lead={selected} open={open} onOpenChange={setOpen} />
    </div>
  )
}
