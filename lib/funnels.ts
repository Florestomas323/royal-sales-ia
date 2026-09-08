import { PIPELINES, STAGE_LABELS } from "@/lib/constants"
import { activeLeads, type Period } from "@/lib/metrics"
import { displayStage, leadTypeOf } from "@/lib/leads"
import type { Lead, LeadType, PipelineStage } from "@/types"

/**
 * Conversion funnels for the command center — one per pipeline, never mixed.
 *
 * The exit stages (`not_interested` / `rec_disqualified`) are NOT steps: a
 * funnel narrows towards a result, and a lost lead is not a later phase of
 * winning one. They are reported separately as a secondary figure.
 */
export const FUNNEL_STEPS: Record<LeadType, PipelineStage[]> = {
  sales: ["new_lead", "appointment", "follow_up", "sale"],
  recruiting: ["rec_new", "rec_interview", "rec_follow_up", "rec_hired"],
}

export interface FunnelStep {
  stage: PipelineStage
  label: string
  count: number
  /** Share of the leads that entered the funnel. */
  shareOfEntry: number
}

export interface FunnelResult {
  leadType: LeadType
  steps: FunnelStep[]
  /** Leads that entered the funnel in this period. */
  entered: number
  /** Leads that reached the final step. */
  won: number
  /** `won / entered`, or null when nobody entered yet. */
  conversion: number | null
  /** Exit state, reported outside the funnel. */
  lost: number
}

/** Same rule the rest of the dashboard uses: created inside the period. */
function inPeriod(iso: string | null | undefined, period: Period | undefined): boolean {
  if (!period?.from) return true
  if (!iso) return false
  const time = Date.parse(iso)
  return Number.isFinite(time) && time >= period.from.getTime()
}

/**
 * A lead counts at a step if it is AT it or has moved past it.
 *
 * Only the current stage is stored, never the path taken, so "reached" is
 * inferred from the order of the funnel. One honest consequence: a lead that
 * was lost is counted only as having entered, because how far it got before
 * being marked as lost is not recorded anywhere.
 */
export function computeFunnel(
  leads: Lead[],
  leadType: LeadType,
  period?: Period,
): FunnelResult {
  const steps = FUNNEL_STEPS[leadType]
  const pipeline = PIPELINES[leadType]

  const scoped = activeLeads(leads).filter(
    (l) => leadTypeOf(l) === leadType && inPeriod(l.createdAt, period),
  )

  const lost = scoped.filter((l) => displayStage(l) === pipeline.lost).length
  const entered = scoped.length

  const reachedIndex = (lead: Lead): number => {
    const stage = displayStage(lead)
    if (stage === pipeline.lost) return 0 // entered only; the path is unknown
    const i = steps.indexOf(stage)
    return i < 0 ? 0 : i
  }

  const counts = steps.map((_, i) => scoped.filter((l) => reachedIndex(l) >= i).length)
  const won = counts[counts.length - 1] ?? 0

  return {
    leadType,
    entered,
    won,
    lost,
    conversion: entered > 0 ? won / entered : null,
    steps: steps.map((stage, i) => ({
      stage,
      label: STAGE_LABELS[stage],
      count: counts[i],
      shareOfEntry: entered > 0 ? counts[i] / entered : 0,
    })),
  }
}
