import { FUNNEL_STEPS_ORDER, type FunnelEvent, type FunnelEventName } from "@/types"

/**
 * Pure logic for the landing → booking funnel. No I/O: the ingestion route,
 * the dashboard and the tests all share these rules.
 */

export const FUNNEL_EVENTS = "funnelEvents"

const NAMES = new Set<string>(FUNNEL_STEPS_ORDER)

export function isFunnelEventName(v: unknown): v is FunnelEventName {
  return typeof v === "string" && NAMES.has(v)
}

/**
 * The six steps the dashboard reports. `prize_revealed` and `roulette_viewed`
 * are recorded but not shown as their own bars: they duplicate the step
 * before them in practice, and a funnel with redundant rungs reads as if
 * people dropped off where they did not.
 */
export const REPORTED_STEPS: { event: FunnelEventName; label: string }[] = [
  { event: "landing_view", label: "Visitas" },
  { event: "form_started", label: "Formulario iniciado" },
  { event: "lead_captured", label: "Prospectos capturados" },
  { event: "roulette_spun", label: "Ruleta girada" },
  { event: "booking_started", label: "Agenda iniciada" },
  { event: "booking_completed", label: "Agenda completada" },
]

export interface ValidationError {
  field: string
  reason: "required" | "invalid" | "too_long"
}

const MAX = { id: 200, url: 2048, text: 200 }

function str(v: unknown, max: number): string | null | undefined {
  if (v === undefined || v === null || v === "") return undefined
  if (typeof v !== "string") return null
  const s = v.trim()
  return s.length > max ? null : s
}

export interface ParsedFunnelEvent {
  sessionId: string
  eventName: FunnelEventName
  campaignId?: string
  campaignSource?: string
  prospectId?: string
  pageUrl?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  utmTerm?: string
  clickId?: string
  prize?: string
}

/** Turns an untrusted body into a clean event, or a list of errors. */
export function parseFunnelEvent(
  body: unknown,
): { ok: true; event: ParsedFunnelEvent } | { ok: false; errors: ValidationError[] } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: [{ field: "body", reason: "invalid" }] }
  }
  const b = body as Record<string, unknown>
  const errors: ValidationError[] = []

  const sessionId = str(b.sessionId, MAX.id)
  if (sessionId === null) errors.push({ field: "sessionId", reason: "too_long" })
  else if (!sessionId) errors.push({ field: "sessionId", reason: "required" })

  const eventName = b.eventName ?? b.event
  if (!isFunnelEventName(eventName)) errors.push({ field: "eventName", reason: "invalid" })

  // A landing may send the nested shape it already uses for the lead payload.
  const utmObj = b.utm && typeof b.utm === "object" && !Array.isArray(b.utm) ? (b.utm as Record<string, unknown>) : {}
  const pick = (...v: unknown[]) => v.find((x) => x !== undefined && x !== null && x !== "")

  const fields: Record<string, string | null | undefined> = {
    campaignId: str(b.campaignId, MAX.id),
    campaignSource: str(pick(b.campaignSource, b.form, b.source), MAX.text),
    prospectId: str(pick(b.prospectId, b.leadId), MAX.id),
    pageUrl: str(pick(b.pageUrl, b.url), MAX.url),
    utmSource: str(pick(b.utmSource, utmObj.source), MAX.text),
    utmMedium: str(pick(b.utmMedium, utmObj.medium), MAX.text),
    utmCampaign: str(pick(b.utmCampaign, utmObj.campaign), MAX.text),
    utmContent: str(pick(b.utmContent, utmObj.content), MAX.text),
    utmTerm: str(pick(b.utmTerm, utmObj.term), MAX.text),
    clickId: str(pick(b.clickId, b.fbclid, b.gclid), MAX.text),
    prize: str(b.prize, MAX.text),
  }
  for (const [k, v] of Object.entries(fields)) {
    if (v === null) errors.push({ field: k, reason: "too_long" })
  }
  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    event: {
      sessionId: sessionId as string,
      eventName: eventName as FunnelEventName,
      ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
    },
  }
}

/** The document written. `workspaceId` comes from the key, never from the body. */
export function buildFunnelEvent(
  workspaceId: string,
  e: ParsedFunnelEvent,
  now: string,
): Omit<FunnelEvent, "id"> {
  return {
    workspaceId,
    sessionId: e.sessionId,
    eventName: e.eventName,
    campaignId: e.campaignId ?? null,
    campaignSource: e.campaignSource ?? null,
    prospectId: e.prospectId ?? null,
    pageUrl: e.pageUrl ?? null,
    utmSource: e.utmSource ?? null,
    utmMedium: e.utmMedium ?? null,
    utmCampaign: e.utmCampaign ?? null,
    utmContent: e.utmContent ?? null,
    utmTerm: e.utmTerm ?? null,
    clickId: e.clickId ?? null,
    prize: e.prize ?? null,
    createdAt: now,
  }
}

/* -------------------------------------------------------------------- report */

export interface FunnelStepReport {
  event: FunnelEventName
  label: string
  /** Distinct sessions that reached this step. */
  count: number
  /** Share of the previous step, or null for the first one. */
  ofPrevious: number | null
  /** Share of visits (the first step), or null when there are no visits. */
  ofVisits: number | null
  /** Share of the previous step that did NOT reach this one. */
  dropOff: number | null
}

export interface FunnelReport {
  steps: FunnelStepReport[]
  visits: number
  /** The transition that loses the most people, or null when nothing to compare. */
  worstDrop: { from: string; to: string; rate: number } | null
}

/**
 * Counts DISTINCT sessions per step, not raw events: a visitor who reloads
 * three times is one visit, and one who spins twice is one spin. Without this
 * a noisy page would look like a wider funnel than it is.
 */
export function buildFunnelReport(events: Pick<FunnelEvent, "sessionId" | "eventName">[]): FunnelReport {
  const sessionsBy = new Map<FunnelEventName, Set<string>>()
  for (const e of events) {
    if (!NAMES.has(e.eventName)) continue
    const set = sessionsBy.get(e.eventName) ?? new Set<string>()
    set.add(e.sessionId)
    sessionsBy.set(e.eventName, set)
  }
  const counts = REPORTED_STEPS.map((s) => sessionsBy.get(s.event)?.size ?? 0)
  const visits = counts[0] ?? 0

  const steps: FunnelStepReport[] = REPORTED_STEPS.map((s, i) => {
    const count = counts[i]
    const previous = i === 0 ? null : counts[i - 1]
    const ofPrevious = previous === null ? null : previous > 0 ? count / previous : null
    return {
      event: s.event,
      label: s.label,
      count,
      ofPrevious,
      ofVisits: visits > 0 ? count / visits : null,
      dropOff: ofPrevious === null ? null : 1 - ofPrevious,
    }
  })

  // The trailing steps nobody ever reached are excluded from the comparison.
  // When a landing has not instrumented the last steps yet, they sit at zero
  // and would always win as a "100 % drop-off" — pointing the distributor at
  // a cliff that is really a missing event. A zero in the MIDDLE still counts,
  // because people demonstrably got past it.
  let lastReached = 0
  for (let i = counts.length - 1; i >= 0; i--) {
    if (counts[i] > 0) { lastReached = i; break }
  }

  let worstDrop: FunnelReport["worstDrop"] = null
  for (let i = 1; i <= lastReached; i++) {
    const d = steps[i].dropOff
    if (d === null || counts[i - 1] === 0) continue
    if (!worstDrop || d > worstDrop.rate) {
      worstDrop = { from: REPORTED_STEPS[i - 1].label, to: REPORTED_STEPS[i].label, rate: d }
    }
  }
  return { steps, visits, worstDrop }
}
