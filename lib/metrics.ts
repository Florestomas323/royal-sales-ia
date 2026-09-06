import { PIPELINES } from "@/lib/constants"
import { hasClosedAmount, isWon, leadTypeOf } from "@/lib/leads"
import type { Lead, LeadType, PipelineStage } from "@/types"

/**
 * Commercial metrics computed from REAL documents.
 *
 * Sources of truth (Phase F decisions):
 *  - Leads            → `leads` documents, archived excluded.
 *  - Contacted        → `lastContactAt !== null`, written ONLY by a WhatsApp
 *                       or call action (Phase E). A note or a stage change is
 *                       never a contact.
 *  - Appointment      → the lead SITS in the appointment stage. It is not a
 *                       calendar event; the UI labels it accordingly.
 *  - Sales / hires    → `isWon()` (stage `sale` / `rec_hired`).
 *  - Revenue          → sum of `closedValue`, the amount a person confirmed.
 *                       `potentialValue` is NEVER revenue.
 *  - Ad spend         → does not exist yet (Meta insights not integrated).
 *                       Everything derived from it stays `null`.
 *
 * Denormalised counters (`campaign.spend`, `client.leads`, …) are NOT read:
 * nothing keeps them updated, so they would be fabricated numbers.
 *
 * `null` means "no data" and renders as "Sin datos" / "—". It is never 0.
 */

/* -------------------------------------------------------------------------- */
/*  Periods                                                                    */
/* -------------------------------------------------------------------------- */

export type PeriodKey = "today" | "7d" | "30d" | "month" | "all"

export interface Period {
  key: PeriodKey
  /** Inclusive lower bound; null = since the beginning. */
  from: Date | null
}

export function resolvePeriod(key: PeriodKey, now = new Date()): Period {
  switch (key) {
    case "today": {
      const from = new Date(now)
      from.setHours(0, 0, 0, 0)
      return { key, from }
    }
    case "7d":
      return { key, from: new Date(now.getTime() - 7 * 86_400_000) }
    case "30d":
      return { key, from: new Date(now.getTime() - 30 * 86_400_000) }
    case "month":
      return { key, from: new Date(now.getFullYear(), now.getMonth(), 1) }
    default:
      return { key: "all", from: null }
  }
}

function inPeriod(iso: string | null | undefined, period: Period): boolean {
  if (!period.from) return true
  if (!iso) return false
  const time = Date.parse(iso)
  return Number.isFinite(time) && time >= period.from.getTime()
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/** Rate in 0–1, or null when the denominator is 0 (never NaN or Infinity). */
export function rate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null
  if (denominator <= 0) return null
  return numerator / denominator
}

/** Cost per unit; null when there is no spend or no units. */
export function costPer(spend: number | null, units: number): number | null {
  if (spend === null || !Number.isFinite(spend) || spend <= 0) return null
  if (units <= 0) return null
  return spend / units
}

/** Active leads: archived ones never take part in metrics. */
export function activeLeads(leads: Lead[]): Lead[] {
  return leads.filter((l) => l.archived !== true)
}

/** A lead counts as contacted only through a real WhatsApp / call action. */
export function isContacted(lead: Pick<Lead, "lastContactAt">): boolean {
  return typeof lead.lastContactAt === "string" && lead.lastContactAt.length > 0
}

const APPOINTMENT_STAGE: Record<LeadType, PipelineStage> = {
  sales: "appointment",
  recruiting: "rec_interview",
}

/* -------------------------------------------------------------------------- */
/*  Core metrics                                                               */
/* -------------------------------------------------------------------------- */

export interface CommercialMetrics {
  /** Leads created inside the period. */
  leads: number
  salesLeads: number
  recruitingLeads: number
  /** Leads still in the first stage of their pipeline. */
  newLeads: number
  /** Contacted at least once inside the period (by `lastContactAt`). */
  contacted: number
  /** Sales leads currently sitting in the appointment stage. */
  inAppointmentStage: number
  /** Candidates currently in the interview stage. */
  inInterviewStage: number
  /** Closed sales with `closedAt` inside the period. */
  sales: number
  /** Hires with `closedAt` inside the period. */
  hires: number
  /** Won leads with no `closedAt`: they predate Phase F. Never placed in a period. */
  salesWithoutDate: number
  /** Closed sales inside the period with no confirmed amount. */
  salesWithoutAmount: number
  /** Sum of confirmed `closedValue`. `null` when no closed sale carries one. */
  revenue: number | null
  /** Ad spend. Always null until Meta insights exist. */
  spend: number | null
  cpl: number | null
  roas: number | null
  contactRate: number | null
  appointmentRate: number | null
  closeRate: number | null
}

export interface MetricsOptions {
  period?: Period
  /** Executed ad spend for the period. Pass null (default) while unavailable. */
  spend?: number | null
}

export function computeMetrics(input: Lead[], options: MetricsOptions = {}): CommercialMetrics {
  const period = options.period ?? { key: "all" as const, from: null }
  const spend = options.spend ?? null
  const all = activeLeads(input)

  // Leads are attributed to a period by creation date.
  const created = all.filter((l) => inPeriod(l.createdAt, period))
  const sales = created.filter((l) => leadTypeOf(l) === "sales")
  const recruiting = created.filter((l) => leadTypeOf(l) === "recruiting")

  const newLeads = created.filter((l) => l.stage === PIPELINES[leadTypeOf(l)].initial).length
  // Contact is attributed by lastContactAt, not by creation date.
  const contacted = all.filter((l) => isContacted(l) && inPeriod(l.lastContactAt, period)).length

  const inAppointmentStage = sales.filter((l) => l.stage === APPOINTMENT_STAGE.sales).length
  const inInterviewStage = recruiting.filter((l) => l.stage === APPOINTMENT_STAGE.recruiting).length

  // Won leads are attributed by closedAt. Ones without it (pre-Phase F) are
  // reported separately instead of being dropped into an arbitrary period.
  const won = all.filter(isWon)
  const wonDated = won.filter((l) => typeof l.closedAt === "string" && inPeriod(l.closedAt, period))
  const closedSales = wonDated.filter((l) => leadTypeOf(l) === "sales")
  const closedHires = wonDated.filter((l) => leadTypeOf(l) === "recruiting")

  const withAmount = closedSales.filter(hasClosedAmount)
  const revenue = withAmount.length > 0 ? withAmount.reduce((sum, l) => sum + (l.closedValue ?? 0), 0) : null

  return {
    leads: created.length,
    salesLeads: sales.length,
    recruitingLeads: recruiting.length,
    newLeads,
    contacted,
    inAppointmentStage,
    inInterviewStage,
    sales: closedSales.length,
    hires: closedHires.length,
    salesWithoutDate: won.filter((l) => typeof l.closedAt !== "string").length,
    salesWithoutAmount: closedSales.length - withAmount.length,
    revenue,
    spend,
    cpl: costPer(spend, created.length),
    roas: spend !== null && spend > 0 && revenue !== null ? revenue / spend : null,
    contactRate: rate(contacted, created.length),
    appointmentRate: rate(inAppointmentStage, contacted),
    closeRate: rate(closedSales.length, inAppointmentStage),
  }
}

/* -------------------------------------------------------------------------- */
/*  Breakdowns                                                                 */
/* -------------------------------------------------------------------------- */

/** Group key for leads with no owner. Never a real `users.id`. */
export const UNASSIGNED_OWNER = "__unassigned__"

export interface RepPerformance {
  /** `users.id`, or UNASSIGNED_OWNER for every unowned lead. */
  userId: string
  leads: number
  contacted: number
  inAppointmentStage: number
  sales: number
  revenue: number | null
  contactRate: number | null
  closeRate: number | null
}

/** Per-rep performance. Callers pass only leads the viewer may already see. */
export function computeRepPerformance(leads: Lead[], options: MetricsOptions = {}): RepPerformance[] {
  const byRep = new Map<string, Lead[]>()
  for (const lead of activeLeads(leads)) {
    // Every shape of "no owner" collapses into ONE bucket: missing field,
    // null, undefined, empty string or whitespace.
    const raw = typeof lead.assignedToId === "string" ? lead.assignedToId.trim() : ""
    const key = raw.length > 0 ? raw : UNASSIGNED_OWNER
    byRep.set(key, [...(byRep.get(key) ?? []), lead])
  }
  return [...byRep.entries()]
    .map(([userId, rows]) => {
      const m = computeMetrics(rows, options)
      return {
        userId,
        leads: m.leads,
        contacted: m.contacted,
        inAppointmentStage: m.inAppointmentStage,
        sales: m.sales,
        revenue: m.revenue,
        contactRate: m.contactRate,
        closeRate: m.closeRate,
      }
    })
    .sort((a, b) => b.leads - a.leads)
}

export interface CampaignPerformance {
  /** Internal campaign id, external campaign id or UTM — whichever exists. */
  key: string
  label: string
  source: "campaign" | "external" | "utm" | "none"
  leads: number
  contacted: number
  sales: number
  revenue: number | null
  /** Always null in Phase F: no executed spend. */
  spend: number | null
  cpl: number | null
  roas: number | null
}

/**
 * Groups by the best identifier each lead actually carries. Nothing is
 * invented: leads with no campaign data land in a single "sin campaña" row.
 */
export function computeCampaignPerformance(
  leads: Lead[],
  campaignNames: Record<string, string> = {},
  options: MetricsOptions = {},
): CampaignPerformance[] {
  const groups = new Map<string, { label: string; source: CampaignPerformance["source"]; rows: Lead[] }>()
  for (const lead of activeLeads(leads)) {
    let key = ""
    let label = ""
    let source: CampaignPerformance["source"] = "none"
    if (lead.campaignId) {
      key = `c:${lead.campaignId}`
      label = campaignNames[lead.campaignId] ?? lead.campaignName ?? lead.campaignId
      source = "campaign"
    } else if (lead.attribution?.externalCampaignId) {
      key = `x:${lead.attribution.externalCampaignId}`
      label = lead.campaignName || lead.attribution.externalCampaignId
      source = "external"
    } else if (lead.attribution?.utmCampaign) {
      key = `u:${lead.attribution.utmCampaign}`
      label = lead.attribution.utmCampaign
      source = "utm"
    } else {
      key = "none"
      label = ""
      source = "none"
    }
    const existing = groups.get(key)
    groups.set(key, { label, source, rows: [...(existing?.rows ?? []), lead] })
  }

  return [...groups.entries()]
    .map(([key, { label, source, rows }]) => {
      const m = computeMetrics(rows, options)
      return {
        key,
        label,
        source,
        leads: m.leads,
        contacted: m.contacted,
        sales: m.sales,
        revenue: m.revenue,
        spend: m.spend,
        cpl: m.cpl,
        roas: m.roas,
      }
    })
    .sort((a, b) => b.leads - a.leads)
}

/** Leads created per day inside the period, for the trend chart. */
export function computeLeadTrend(leads: Lead[], period: Period, now = new Date()): { date: string; leads: number }[] {
  const from = period.from ?? earliestCreatedAt(leads, now)
  if (!from) return []
  const days: { date: string; leads: number }[] = []
  const cursor = new Date(from)
  cursor.setHours(0, 0, 0, 0)
  const end = new Date(now)
  end.setHours(0, 0, 0, 0)
  // Cap the series so an old workspace does not render thousands of points.
  const maxDays = 90
  while (cursor <= end && days.length < maxDays) {
    days.push({ date: cursor.toISOString().slice(0, 10), leads: 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  const index = new Map(days.map((d, i) => [d.date, i]))
  for (const lead of activeLeads(leads)) {
    const day = lead.createdAt?.slice(0, 10)
    const i = day ? index.get(day) : undefined
    if (i !== undefined) days[i].leads += 1
  }
  return days
}

function earliestCreatedAt(leads: Lead[], now: Date): Date | null {
  let min: number | null = null
  for (const lead of leads) {
    const time = Date.parse(lead.createdAt ?? "")
    if (Number.isFinite(time) && (min === null || time < min)) min = time
  }
  if (min === null) return null
  // Never go further back than the 90-day cap.
  const floor = now.getTime() - 89 * 86_400_000
  return new Date(Math.max(min, floor))
}
