"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import { ArrowRightLeft, Building2, GripVertical, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { updateLead } from "@/lib/firebase/leads"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { describeError } from "@/lib/firebase/errors"
import { PIPELINES, STAGE_LABELS, STAGE_TONE } from "@/lib/constants"
import { canMoveLeadTo, canEditLead, groupLeadsByStage } from "@/lib/leads"
import { formatCurrency } from "@/lib/format"
import type { Lead, LeadType, PipelineStage } from "@/types"
import { PlatformMark } from "@/components/shared/platform-badge"
import { ScoreBadge, TemperatureDot } from "@/components/shared/score-badge"
import { LeadDetailSheet } from "@/components/leads/lead-detail-sheet"
import { MoveLeadSheet } from "@/components/pipeline/move-lead-sheet"
import { Badge } from "@/components/ui/badge"
import { t } from "@/lib/i18n"

/**
 * Kanban for ONE pipeline.
 *
 * Moving a card — two inputs, one persistence path:
 *   - desktop: HTML5 drag & drop between columns (mouse);
 *   - phone / tablet / anyone: the "Mover a" button on each card opens a
 *     bottom sheet with the stages of that pipeline. Safari iOS never fires
 *     HTML5 drag events, so touch never depends on them.
 * Both call `moveLead`, which: refuses moves the person may not make
 * (mirror of Rules), refuses stages of the other pipeline, blocks a second
 * move of the same card while one is saving, shows the card in the target
 * column optimistically, and reverts it if Firestore rejects the write.
 *
 * Archived leads are never rendered; a restored lead reappears in its column.
 */
export function PipelineBoard({ leads, leadType }: { leads: Lead[]; leadType: LeadType }) {
  const { role, membership, isSuperAdmin, workspaceId, workspaces } = useWorkspace()
  const editor = useMemo(
    () => ({
      role,
      userId: membership?.userId ?? null,
      workspaceId: membership?.workspaceId ?? null,
      isSuperAdmin,
    }),
    [role, membership, isSuperAdmin],
  )

  const [dragId, setDragId] = useState<string | null>(null)
  const [overStage, setOverStage] = useState<PipelineStage | null>(null)
  const [selected, setSelected] = useState<Lead | null>(null)
  const [moving, setMoving] = useState<Lead | null>(null)
  /** Optimistic stage per lead while its write is in flight. */
  const [pending, setPending] = useState<Record<string, PipelineStage>>({})
  const inFlight = useRef(new Set<string>())

  const pipeline = PIPELINES[leadType]
  const showValue = leadType === "sales"
  // Super admin viewing every workspace: label each card with its workspace.
  const showWorkspace = isSuperAdmin && workspaceId === null
  const workspaceNames = useMemo(() => {
    const map: Record<string, string> = {}
    for (const w of workspaces) map[w.id] = w.name
    return map
  }, [workspaces])

  const byStage = useMemo(() => groupLeadsByStage(leads, leadType, pending), [leads, leadType, pending])

  const moveLead = useCallback(
    async (lead: Lead, stage: PipelineStage) => {
      if (inFlight.current.has(lead.id)) return // double-move guard
      if (!canMoveLeadTo(editor, lead, stage)) {
        if (!canEditLead(editor, lead)) toast.error(t.pipeline.readOnly)
        return
      }
      inFlight.current.add(lead.id)
      setPending((p) => ({ ...p, [lead.id]: stage }))
      try {
        // updateLead re-validates stage ∈ pipeline; Rules validate it again.
        await updateLead(lead.id, lead, { stage })
        toast.success(t.pipeline.moved(lead.name, STAGE_LABELS[stage]))
        setMoving(null)
      } catch (err) {
        // Firestore rejected it: the card goes back to its real column.
        toast.error(t.pipeline.moveError, { description: describeError(err).message })
      } finally {
        inFlight.current.delete(lead.id)
        setPending((p) => {
          const next = { ...p }
          delete next[lead.id]
          return next
        })
      }
    },
    [editor],
  )

  function handleDrop(stage: PipelineStage) {
    const id = dragId
    setOverStage(null)
    setDragId(null)
    if (!id) return
    const lead = leads.find((l) => l.id === id)
    if (lead) void moveLead(lead, stage)
  }

  return (
    <>
      <p className="text-xs text-muted-foreground lg:hidden">{t.pipeline.dragHint}</p>

      {/*
        Horizontal scroller: columns snap on phones (one column ≈ 85vw) so
        swiping feels natural, overscroll stays inside the board, and the page
        keeps its own vertical scroll.
      */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain px-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:mx-0 sm:snap-none sm:gap-4 sm:px-0">
        {pipeline.stages.map((stage) => {
          const stageLeads = byStage[stage] ?? []
          const total = stageLeads.reduce((sum, l) => sum + l.potentialValue, 0)
          const isOver = overStage === stage
          return (
            <div
              key={stage}
              className={cn(
                "flex w-[85vw] shrink-0 snap-start flex-col rounded-xl border bg-card transition-colors sm:w-72",
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
                <div className="flex min-w-0 items-center gap-2">
                  <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: STAGE_TONE[stage] }} aria-hidden="true" />
                  <span className="truncate text-sm font-medium">{STAGE_LABELS[stage]}</span>
                  <Badge variant="secondary" className="h-5 min-w-5 justify-center px-1.5 text-xs">
                    {stageLeads.length}
                  </Badge>
                </div>
                {showValue && (
                  <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                    {formatCurrency(total, true)}
                  </span>
                )}
              </div>

              <div className="flex min-h-24 flex-1 flex-col gap-2 p-2">
                {stageLeads.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed py-6 text-xs text-muted-foreground">
                    <span className="sm:hidden">{t.pipeline.emptyColumn}</span>
                    <span className="hidden sm:inline">{t.pipeline.dropHere}</span>
                  </div>
                ) : (
                  stageLeads.map((lead) => {
                    const editable = canEditLead(editor, lead)
                    const saving = pending[lead.id] !== undefined
                    return (
                      <div
                        key={lead.id}
                        draggable={editable && !saving}
                        onDragStart={() => editable && setDragId(lead.id)}
                        onDragEnd={() => {
                          setDragId(null)
                          setOverStage(null)
                        }}
                        className={cn(
                          "group rounded-lg border bg-background p-3 transition-shadow",
                          editable && !saving && "sm:cursor-grab sm:hover:shadow-md sm:active:cursor-grabbing",
                          dragId === lead.id && "opacity-40",
                          saving && "opacity-60",
                        )}
                      >
                        {/* Tapping the body opens the lead; touch-action lets the board scroll. */}
                        <button
                          type="button"
                          onClick={() => setSelected(lead)}
                          className="block w-full text-left [touch-action:pan-x_pan-y]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium">{lead.name}</p>
                              <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                                <PlatformMark platform={lead.source} className="size-4" />
                                <span className="truncate">{lead.campaignName || t.leads.noCampaign}</span>
                              </div>
                              {showWorkspace && (
                                <span className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <Building2 className="size-3" />
                                  <span className="truncate">{workspaceNames[lead.workspaceId] ?? "—"}</span>
                                </span>
                              )}
                            </div>
                            {saving ? (
                              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                            ) : (
                              <GripVertical className="hidden size-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-muted-foreground sm:block" />
                            )}
                          </div>
                          <div className="mt-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <ScoreBadge score={lead.score} />
                              <TemperatureDot temperature={lead.temperature} />
                            </div>
                            {showValue ? (
                              <span className="font-mono text-xs font-medium tabular-nums">
                                {formatCurrency(lead.potentialValue, true)}
                              </span>
                            ) : (
                              <span className="truncate text-xs text-muted-foreground">
                                {lead.recruiting?.city ?? lead.recruiting?.jobTitle ?? ""}
                              </span>
                            )}
                          </div>
                        </button>

                        {/* Touch-friendly move: 44px target, no drag needed. */}
                        {editable && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setMoving(lead)
                            }}
                            disabled={saving}
                            className="mt-2 flex h-11 w-full items-center justify-center gap-1.5 rounded-md border text-xs font-medium text-muted-foreground transition-colors active:bg-muted disabled:opacity-50 sm:h-8"
                          >
                            <ArrowRightLeft className="size-3.5" />
                            {saving ? t.pipeline.moving : t.pipeline.moveTo}
                          </button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          )
        })}
      </div>

      <MoveLeadSheet
        lead={moving}
        open={moving !== null}
        onOpenChange={(open) => !open && setMoving(null)}
        onMove={moveLead}
        busy={moving !== null && pending[moving.id] !== undefined}
      />

      <LeadDetailSheet
        lead={selected}
        open={selected !== null}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </>
  )
}
