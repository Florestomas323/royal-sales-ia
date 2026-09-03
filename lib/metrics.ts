import { isOpen, isWon, leadTypeOf } from "@/lib/leads"
import type { Lead } from "@/types"

/**
 * Funnel metrics computed from REAL leads. Cost-based metrics (CPL, CAC,
 * ROAS, cost per candidate…) need ad spend, which is not tracked per lead
 * yet: they are `null` until a spend source exists (Meta / Indeed phases).
 * Never fabricate a number: `null` renders as "—" in the UI.
 */

export interface SalesMetrics {
  leads: number
  contacted: number
  demos: number
  sales: number
  /** sales / leads (0–1). */
  conversion: number
  revenue: number
  avgScore: number
  cpl: number | null
  cac: number | null
  roas: number | null
}

export interface RecruitingMetrics {
  candidates: number
  contacted: number
  qualified: number
  interviews: number
  orientations: number
  hired: number
  open: number
  /** hired / candidates (0–1). */
  conversion: number
  costPerCandidate: number | null
  costPerInterview: number | null
  costPerHire: number | null
}

const SALES_CONTACTED = new Set(["contacted", "interested", "appointment", "follow_up", "sale"])
const SALES_DEMO = new Set(["appointment", "follow_up", "sale"])

const REC_CONTACTED = new Set([
  "rec_contacted",
  "rec_qualified",
  "rec_interview",
  "rec_orientation",
  "rec_follow_up",
  "rec_hired",
])
const REC_QUALIFIED = new Set(["rec_qualified", "rec_interview", "rec_orientation", "rec_follow_up", "rec_hired"])
const REC_INTERVIEW = new Set(["rec_interview", "rec_orientation", "rec_follow_up", "rec_hired"])
const REC_ORIENTATION = new Set(["rec_orientation", "rec_follow_up", "rec_hired"])

function ratio(num: number, den: number): number {
  return den > 0 ? num / den : 0
}

function perUnit(spend: number | undefined, units: number): number | null {
  if (spend === undefined || units === 0) return null
  return spend / units
}

export function computeSalesMetrics(input: Lead[], spend?: number): SalesMetrics {
  const leads = input.filter((l) => leadTypeOf(l) === "sales")
  const won = leads.filter(isWon)
  const revenue = won.reduce((s, l) => s + l.potentialValue, 0)
  return {
    leads: leads.length,
    contacted: leads.filter((l) => SALES_CONTACTED.has(l.stage)).length,
    demos: leads.filter((l) => SALES_DEMO.has(l.stage)).length,
    sales: won.length,
    conversion: ratio(won.length, leads.length),
    revenue,
    avgScore: leads.length ? Math.round(leads.reduce((s, l) => s + l.score, 0) / leads.length) : 0,
    cpl: perUnit(spend, leads.length),
    cac: perUnit(spend, won.length),
    roas: spend !== undefined && spend > 0 ? revenue / spend : null,
  }
}

export function computeRecruitingMetrics(input: Lead[], spend?: number): RecruitingMetrics {
  const candidates = input.filter((l) => leadTypeOf(l) === "recruiting")
  const hired = candidates.filter(isWon)
  const interviews = candidates.filter((l) => REC_INTERVIEW.has(l.stage))
  return {
    candidates: candidates.length,
    contacted: candidates.filter((l) => REC_CONTACTED.has(l.stage)).length,
    qualified: candidates.filter((l) => REC_QUALIFIED.has(l.stage)).length,
    interviews: interviews.length,
    orientations: candidates.filter((l) => REC_ORIENTATION.has(l.stage)).length,
    hired: hired.length,
    open: candidates.filter(isOpen).length,
    conversion: ratio(hired.length, candidates.length),
    costPerCandidate: perUnit(spend, candidates.length),
    costPerInterview: perUnit(spend, interviews.length),
    costPerHire: perUnit(spend, hired.length),
  }
}
