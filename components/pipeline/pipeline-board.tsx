"use client"

import { useMemo, useState } from "react"
import { GripVertical } from "lucide-react"
import { cn } from "@/lib/utils"
import { updateLeadStage } from "@/lib/firebase/leads"
import { STAGE_ORDER, STAGE_LABELS } from "@/lib/constants"
import { formatCurrency } from "@/lib/format"
import type { Lead, PipelineStage } from "@/types"
import { PlatformMark } from "@/components/shared/platform-badge"
import { ScoreBadge, TemperatureDot } from "@/components/shared/score-badge"
import { LeadDetailSheet } from "@/components/leads/lead-detail-sheet"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { t } from "@/lib/i18n"

const STAGE_ACCENT: Record<PipelineStage, string> = {
  new_lead: "var(--chart-1)",
  contact: "var(--chart-2)",
  contacted: "var(--chart-3)",
  interested: "var(--chart-4)",
  appointment: "var(--chart-5)",
  follow_up: "var(--chart-2)",
  sale: "var(--success)",
}

export function PipelineBoard({ leads }: { leads: Lead[] }) {
  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<PipelineStage | null>(null)
  const [selected, setSelected] = useState<Lead | null>(null)

  const byStage = useMemo(() => {
    const map = {} as Record<PipelineStage, Lead[]>
    for (const stage of STAGE_ORDER) map[stage] = []
    for (const lead of leads) {
      if (map[lead.stage]) map[lead.stage].push(lead)
    }
    return map
  }, [leads])

  async function handleDrop(stage: PipelineStage) {
    if (!dragId) return
    const lead = leads.find((l) => l.id === dragId)
    setOverStage(null)
    setDragId(null)
    if (!lead || lead.stage === stage) return
    // Firestore latency compensation updates the live snapshot instantly.
    try {
      await updateLeadStage(lead.id, stage)
      toast.success(`${lead.name} → ${STAGE_LABELS[stage]}`)
    } catch {
      toast.error(t.pipeline.moveError)
    }
  }

  return (
    <>
      <div className="flex gap-4 overflow-x-auto pb-4">
        {STAGE_ORDER.map((stage) => {
          const stageLeads = byStage[stage] ?? []
              const total = stageLeads.reduce((sum, l) => sum + l.potentialValue, 0)
          const isOver = overStage === stage
          return (
            <div
              key={stage}
              className={cn(
                "flex w-72 shrink-0 flex-col rounded-xl border bg-card transition-colors",
                isOver && "border-primary bg-primary/5",
              )}
              onDragOver={(e) => {
                e.preventDefault()
                setOverStage(stage)
              }}
              onDragLeave={(e) => {
                if (e.currentTarget.contains(e.relatedTarget as Node)) return
                setOverStage((s) => (s === stage ? null : s))
              }}
              onDrop={() => handleDrop(stage)}
            >
              <div className="flex items-center justify-between gap-2 border-b px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: STAGE_ACCENT[stage] }}
                    aria-hidden="true"
                  />
                  <span className="text-sm font-medium">{STAGE_LABELS[stage]}</span>
                  <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5 text-xs">
                    {stageLeads.length}
                  </Badge>
                </div>
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  {formatCurrency(total, true)}
                </span>
              </div>

              <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
                {stageLeads.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-6 text-xs text-muted-foreground">
                    {t.pipeline.dropHere}
                  </div>
                ) : (
                  stageLeads.map((lead) => (
                    <button
                      key={lead.id}
                      type="button"
                      draggable
                      onDragStart={() => setDragId(lead.id)}
                      onDragEnd={() => {
                        setDragId(null)
                        setOverStage(null)
                      }}
                      onClick={() => setSelected(lead)}
                      className={cn(
                        "group cursor-grab rounded-lg border bg-background p-3 text-left transition-shadow hover:shadow-md active:cursor-grabbing",
                        dragId === lead.id && "opacity-40",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{lead.name}</p>
                          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <PlatformMark platform={lead.source} className="size-4" />
                            <span className="truncate">{lead.campaignName}</span>
                          </div>
                        </div>
                        <GripVertical className="size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground" />
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ScoreBadge score={lead.score} />
                          <TemperatureDot temperature={lead.temperature} />
                        </div>
                        <span className="font-mono text-xs font-medium tabular-nums">
                          {formatCurrency(lead.potentialValue, true)}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )
        })}
      </div>

      <LeadDetailSheet
        lead={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </>
  )
}
