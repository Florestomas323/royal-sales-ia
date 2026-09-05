"use client"

import { useEffect, useMemo, useState } from "react"
import { Search, SlidersHorizontal, ArrowUpDown, Inbox, Building2, Archive } from "lucide-react"
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle, EmptyDescription } from "@/components/ui/empty"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { ScoreBadge, StageBadge } from "@/components/shared/score-badge"
import { PlatformMark } from "@/components/shared/platform-badge"
import { LeadTypeBadge } from "@/components/shared/lead-type-badge"
import { LeadDetailSheet } from "@/components/leads/lead-detail-sheet"
import { LeadCard } from "@/components/leads/lead-card"
import {
  STAGE_LABELS,
  PIPELINES,
  PLATFORM_LABELS,
  TEMPERATURE_LABELS,
} from "@/lib/constants"
import { displayStage, leadTypeOf } from "@/lib/leads"
import { t } from "@/lib/i18n"
import { useUsersMap } from "@/lib/firebase/collections"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { formatCurrency, formatRelativeTime, initials } from "@/lib/format"
import { cn } from "@/lib/utils"

type SortKey = "score" | "value" | "recent"

/**
 * Filter trigger: full width and 44px tall on phones (readable, tappable),
 * compact and content-sized from lg where there is room for one row.
 */
const FILTER_TRIGGER =
  "h-11 w-full justify-between text-sm lg:h-8 lg:w-auto lg:min-w-40 [&_[data-slot=select-value]]:truncate"

/** Matches Tailwind's `lg` breakpoint, used only to pick the placeholder copy. */
function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)")
    const update = () => setNarrow(mq.matches)
    update()
    mq.addEventListener("change", update)
    return () => mq.removeEventListener("change", update)
  }, [])
  return narrow
}

export function LeadsView({
  leads,
  leadType = "all",
  openLeadId = null,
  onOpenedLead,
  workspaceFilter = null,
  onWorkspaceFilterChange,
}: {
  leads: Lead[]
  /** Active type filter; drives which stages are offered and whether the Tipo column shows. */
  leadType?: LeadType | "all"
  /** Lead to open on arrival (e.g. `/leads?lead=<id>` from the global search). */
  openLeadId?: string | null
  /** Called once the requested lead has been opened (or is not in the list). */
  onOpenedLead?: () => void
  /** super_admin only: `null` = all authorized workspaces. */
  workspaceFilter?: string | null
  onWorkspaceFilterChange?: (workspaceId: string | null) => void
}) {
  // Same reason as the assignee picker: when the workspace filter shows another
  // workspace, owner names must be read from that workspace, not the ambient one.
  const usersMap = useUsersMap(workspaceFilter)
  const isNarrow = useIsNarrow()
  const { isSuperAdmin, workspaces } = useWorkspace()
  // The list of workspaces comes from Firestore under Security Rules (see
  // useWorkspaces): it is the SAME authorization source the sidebar uses, so
  // this filter can only narrow what the person may already read.
  const showWorkspaceFilter = isSuperAdmin && workspaces.length > 1
  const workspaceNames = useMemo(() => {
    const map: Record<string, string> = {}
    for (const w of workspaces) map[w.id] = w.name
    return map
  }, [workspaces])
  const showWorkspaceColumn = showWorkspaceFilter && !workspaceFilter
  const stageOptions: PipelineStage[] =
    leadType === "all"
      ? [...PIPELINES.sales.stages, ...PIPELINES.recruiting.stages]
      : PIPELINES[leadType].stages
  const [query, setQuery] = useState("")
  const [stage, setStage] = useState<PipelineStage | "all">("all")
  const [platform, setPlatform] = useState<Platform | "all">("all")
  const [temp, setTemp] = useState<LeadTemperature | "all">("all")
  const [sort, setSort] = useState<SortKey>("score")
  const [showArchived, setShowArchived] = useState(false)
  const [selected, setSelected] = useState<Lead | null>(null)
  const [open, setOpen] = useState(false)

  // Stage filter must belong to the visible pipeline(s).
  useEffect(() => {
    if (stage !== "all" && !stageOptions.includes(stage)) setStage("all")
  }, [stageOptions, stage])

  // Deep link: open the requested lead as soon as it is in the live list.
  useEffect(() => {
    if (!openLeadId || leads.length === 0) return
    const target = leads.find((l) => l.id === openLeadId)
    if (target) {
      setSelected(target)
      setOpen(true)
    }
    onOpenedLead?.()
  }, [openLeadId, leads, onOpenedLead])

  // Keep the open sheet in sync with live updates (stage / type changes).
  useEffect(() => {
    if (!selected) return
    const fresh = leads.find((l) => l.id === selected.id)
    if (fresh && fresh !== selected) setSelected(fresh)
  }, [leads, selected])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = leads.filter((l) => {
      // Archived leads are kept in Firestore but hidden unless asked for.
      if (!showArchived && l.archived === true) return false
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
  }, [leads, query, stage, platform, temp, sort, showArchived])

  const archivedCount = useMemo(() => leads.filter((l) => l.archived === true).length, [leads])

  function openLead(lead: Lead) {
    setSelected(lead)
    setOpen(true)
  }

  const platforms = Array.from(new Set(leads.map((l) => l.source)))

  return (
    <div className="flex flex-col gap-4">
      {/*
        Filters. On phones each control takes the full width (nothing gets
        truncated), on small tablets two per row, and from lg up they sit in a
        single row next to the search box like before. No fixed pixel widths.
      */}
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 lg:flex-row lg:items-center">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isNarrow ? t.leads.searchPlaceholderShort : t.leads.searchPlaceholder}
            aria-label={t.leads.searchPlaceholder}
            className="h-11 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 lg:h-9 lg:text-sm"
          />
        </div>
        <div
          role="group"
          aria-label={t.leads.filtersLabel}
          className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-center"
        >
          <Select value={stage} onValueChange={(v) => setStage(v as PipelineStage | "all")}>
            <SelectTrigger className={FILTER_TRIGGER}>
              <SelectValue>
                {(value: string) =>
                  value === "all" ? t.leads.allStages : STAGE_LABELS[value as PipelineStage]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-[60svh]">
              <SelectItem value="all">{t.leads.allStages}</SelectItem>
              {leadType === "all" ? (
                /* Both pipelines share label text ("Contactar", "Seguimiento"),
                   so they are grouped to avoid an ambiguous flat list. */
                <>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>{t.leads.stageGroupSales}</SelectLabel>
                    {PIPELINES.sales.stages.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                  <SelectSeparator />
                  <SelectGroup>
                    <SelectLabel>{t.leads.stageGroupRecruiting}</SelectLabel>
                    {PIPELINES.recruiting.stages.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </>
              ) : (
                stageOptions.map((s) => (
                  <SelectItem key={s} value={s}>
                    {STAGE_LABELS[s]}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Select value={platform} onValueChange={(v) => setPlatform(v as Platform | "all")}>
            <SelectTrigger className={FILTER_TRIGGER}>
              <SelectValue>
                {(value: string) =>
                  value === "all" ? t.leads.allSources : PLATFORM_LABELS[value as Platform]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-[60svh]">
              <SelectItem value="all">{t.leads.allSources}</SelectItem>
              {platforms.map((p) => (
                <SelectItem key={p} value={p}>
                  {PLATFORM_LABELS[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={temp} onValueChange={(v) => setTemp(v as LeadTemperature | "all")}>
            <SelectTrigger className={FILTER_TRIGGER}>
              <SlidersHorizontal className="size-3.5" data-icon="inline-start" />
              <SelectValue>
                {(value: string) =>
                  value === "all"
                    ? t.leads.allTemperatures
                    : TEMPERATURE_LABELS[value as LeadTemperature]
                }
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="max-h-[60svh]">
              <SelectItem value="all">{t.leads.allTemperatures}</SelectItem>
              <SelectItem value="hot">{TEMPERATURE_LABELS.hot}</SelectItem>
              <SelectItem value="warm">{TEMPERATURE_LABELS.warm}</SelectItem>
              <SelectItem value="cold">{TEMPERATURE_LABELS.cold}</SelectItem>
            </SelectContent>
          </Select>
          {showWorkspaceFilter && (
            <Select
              value={workspaceFilter ?? "all"}
              onValueChange={(v) => {
                // Only ids from the authorized list are ever propagated.
                const next = !v || v === "all" ? null : workspaces.some((w) => w.id === v) ? v : null
                onWorkspaceFilterChange?.(next)
              }}
            >
              <SelectTrigger className={FILTER_TRIGGER} aria-label={t.leads.workspaceFilterLabel}>
                <Building2 className="size-3.5" data-icon="inline-start" />
                <SelectValue>
                  {(value: string) =>
                    value === "all" ? t.leads.allWorkspaces : (workspaceNames[value] ?? t.leads.allWorkspaces)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[60svh]">
                <SelectItem value="all">{t.leads.allWorkspaces}</SelectItem>
                {workspaces.map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className={FILTER_TRIGGER}>
              <ArrowUpDown className="size-3.5" data-icon="inline-start" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-[60svh]">
              <SelectItem value="score">{t.leads.sortByScore}</SelectItem>
              <SelectItem value="value">{t.leads.sortByValue}</SelectItem>
              <SelectItem value="recent">{t.leads.sortByRecent}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{filtered.length}</span>{" "}
          {t.leads.count(filtered.length, leads.length - (showArchived ? 0 : archivedCount))}
        </p>
        {archivedCount > 0 && (
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} />
            {t.leads.showArchived} · {t.leads.archivedCount(archivedCount)}
          </label>
        )}
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
        <>
        {/* Móvil: tarjetas con toda la información y acciones reales */}
        <div className="flex flex-col gap-3 md:hidden">
          {filtered.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              owner={usersMap[lead.assignedToId]}
              showType={leadType === "all"}
              workspaceName={showWorkspaceColumn ? workspaceNames[lead.workspaceId] : undefined}
              onOpen={openLead}
            />
          ))}
        </div>

        {/* Escritorio / tablet: tabla completa */}
        <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>{t.leads.table.lead}</TableHead>
                {leadType === "all" && (
                  <TableHead className="hidden sm:table-cell">{t.leads.table.type}</TableHead>
                )}
                {showWorkspaceColumn && (
                  <TableHead className="hidden lg:table-cell">{t.leads.workspaceColumn}</TableHead>
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
                        <span className="flex items-center gap-2 font-medium">
                          {lead.name}
                          {lead.archived && (
                            <Badge variant="secondary" className="gap-1 text-[10px]">
                              <Archive className="size-3" />
                              {t.leads.detail.archived}
                            </Badge>
                          )}
                        </span>
                        <span className="text-xs text-muted-foreground">{lead.phone}</span>
                      </div>
                    </TableCell>
                    {leadType === "all" && (
                      <TableCell className="hidden sm:table-cell">
                        <LeadTypeBadge type={leadTypeOf(lead)} />
                      </TableCell>
                    )}
                    {showWorkspaceColumn && (
                      <TableCell className="hidden max-w-40 truncate text-xs text-muted-foreground lg:table-cell">
                        {workspaceNames[lead.workspaceId] ?? "—"}
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
                      <StageBadge stage={displayStage(lead)} />
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
        </>
      )}

      <LeadDetailSheet lead={selected} open={open} onOpenChange={setOpen} />
    </div>
  )
}
