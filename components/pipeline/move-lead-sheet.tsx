"use client"

import { Check, Loader2 } from "lucide-react"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { PIPELINES, STAGE_LABELS, STAGE_TONE } from "@/lib/constants"
import { displayStage, leadTypeOf } from "@/lib/leads"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { Lead, PipelineStage } from "@/types"

/**
 * Touch-first way to move a lead: a bottom sheet listing ONLY the stages of
 * the lead's own pipeline, with 44px rows. Used on phones (and available on
 * desktop too) instead of HTML5 drag & drop, which Safari iOS does not fire.
 */
export function MoveLeadSheet({
  lead,
  open,
  onOpenChange,
  onMove,
  busy,
}: {
  lead: Lead | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onMove: (lead: Lead, stage: PipelineStage) => Promise<void>
  /** Move in flight for this lead (blocks a second tap). */
  busy: boolean
}) {
  if (!lead) return null
  const type = leadTypeOf(lead)
  const current = displayStage(lead)
  const stages = PIPELINES[type].stages

  return (
    <Sheet open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <SheetContent
        side="bottom"
        className="max-h-[85svh] gap-0 overflow-y-auto rounded-t-2xl p-0 pb-[max(env(safe-area-inset-bottom),0.75rem)]"
      >
        <SheetHeader className="border-b p-4">
          <SheetTitle className="text-base">{t.pipeline.moveToTitle(lead.name)}</SheetTitle>
          <SheetDescription>{t.pipeline.moveToDescription}</SheetDescription>
        </SheetHeader>
        <ul role="listbox" aria-label={t.pipeline.moveTo} className="flex flex-col p-2">
          {stages.map((stage) => {
            const isCurrent = stage === current
            return (
              <li key={stage}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isCurrent}
                  disabled={busy || isCurrent}
                  onClick={() => void onMove(lead, stage)}
                  className={cn(
                    "flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm transition-colors",
                    isCurrent ? "bg-muted font-medium" : "active:bg-muted/70 disabled:opacity-50",
                  )}
                >
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: STAGE_TONE[stage] }} />
                  <span className="flex-1">{STAGE_LABELS[stage]}</span>
                  {isCurrent && (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      {t.pipeline.currentStage}
                      <Check className="size-3.5" />
                    </span>
                  )}
                  {busy && !isCurrent && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                </button>
              </li>
            )
          })}
        </ul>
      </SheetContent>
    </Sheet>
  )
}
