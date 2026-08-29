"use client"

import { useMemo, useState } from "react"
import { Search, SlidersHorizontal, ArrowUpDown, Inbox } from "lucide-react"
import type { Lead, PipelineStage, Platform, LeadTemperature } from "@/types"
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
import { LeadDetailSheet } from "@/components/leads/lead-detail-sheet"
import { STAGE_LABELS, STAGE_ORDER, PLATFORM_LABELS } from "@/lib/constants"
import { useUsersMap } from "@/lib/firebase/collections"
import { formatCurrency, formatRelativeTime, initials } from "@/lib/format"
import { cn } from "@/lib/utils"

type SortKey = "score" | "value" | "recent"

export function LeadsView({ leads }: { leads: Lead[] }) {
  const usersMap = useUsersMap()
  const [query, setQuery] = useState("")
  const [stage, setStage] = useState<PipelineStage | "all">("all")
  const [platform, setPlatform] = useState<Platform | "all">("all")
  const [temp, setTemp] = useState<LeadTemperature | "all">("all")
  const [sort, setSort] = useState<SortKey>("score")
  const [selected, setSelected] = useState<Lead | null>(null)
  const [open, setOpen] = useState(false)

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
            placeholder="Search name, email, phone or campaign..."
            className="h-9 w-full rounded-lg border border-input bg-background pr-3 pl-9 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 sm:text-sm"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={stage} onValueChange={(v) => setStage(v as PipelineStage | "all")}>
            <SelectTrigger size="sm" className="w-[130px]">
              <SelectValue>
                {(value: string) => (value === "all" ? "All stages" : STAGE_LABELS[value as PipelineStage])}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stages</SelectItem>
              {STAGE_ORDER.map((s) => (
                <SelectItem key={s} value={s}>
                  {STAGE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={platform} onValueChange={(v) => setPlatform(v as Platform | "all")}>
            <SelectTrigger size="sm" className="w-[130px]">
              <SelectValue>
                {(value: string) => (value === "all" ? "All sources" : PLATFORM_LABELS[value as Platform])}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
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
                {(value: string) => (value === "all" ? "All temps" : value.charAt(0).toUpperCase() + value.slice(1))}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All temps</SelectItem>
              <SelectItem value="hot">Hot</SelectItem>
              <SelectItem value="warm">Warm</SelectItem>
              <SelectItem value="cold">Cold</SelectItem>
            </SelectContent>
          </Select>
          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger size="sm" className="w-[130px]">
              <ArrowUpDown className="size-3.5" data-icon="inline-start" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Top score</SelectItem>
              <SelectItem value="value">Highest value</SelectItem>
              <SelectItem value="recent">Most recent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{filtered.length}</span> of {leads.length} leads
        </p>
      </div>

      {filtered.length === 0 ? (
        <Empty className="rounded-xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Inbox />
            </EmptyMedia>
            <EmptyTitle>No leads match your filters</EmptyTitle>
            <EmptyDescription>Try clearing a filter or adjusting your search.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="overflow-hidden rounded-xl border bg-card">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Lead</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Score</TableHead>
                <TableHead className="hidden text-right md:table-cell">Value</TableHead>
                <TableHead className="hidden lg:table-cell">Owner</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Received</TableHead>
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
                      {formatCurrency(lead.potentialValue)}
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
