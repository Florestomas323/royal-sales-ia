import { createHash } from "node:crypto"
import { PIPELINES } from "@/lib/constants"
import type { AppointmentLocation, AppointmentStatus, AppointmentType, LeadType, PipelineStage } from "@/types"

/**
 * Pure logic for status updates a workspace's integration (the WhatsApp
 * appointment bot) reports about a prospect it already sent through
 * /api/website/leads. No I/O here, so the route and the tests share it.
 *
 * What an integration may do is deliberately small:
 *  - keep its own answers on the prospect up to date (`webForm.answers`),
 *  - book, move, confirm or cancel the meeting IT booked (its own
 *    appointments, identified by its own reference),
 *  - move the stage FORWARD into the meeting stage, back to follow-up when
 *    its last meeting is cancelled, or to "not interested" while the lead is
 *    still new.
 * It can never touch a lead that is won, lost or archived, never closes a
 * sale and never reassigns anybody: those are decisions made in the app.
 */

export const LEAD_STATUS_EVENTS = [
  "progress",
  "appointment_scheduled",
  "appointment_rescheduled",
  "appointment_confirmed",
  "appointment_cancelled",
  "not_interested",
] as const
export type LeadStatusEvent = (typeof LEAD_STATUS_EVENTS)[number]

export interface LeadStatusAppointment {
  /** The integration's own id for this meeting. */
  ref: string
  scheduledAt: string
  durationMinutes: number
  mode: "in_person" | "video"
  location?: AppointmentLocation
  notes?: string
}

export interface LeadStatusPayload {
  prospectId?: string
  externalId?: string
  event: LeadStatusEvent
  appointment?: LeadStatusAppointment
  /** Rescheduling: the integration's id of the meeting being replaced. */
  previousRef?: string
  answers?: Record<string, string>
  gift?: string
  schedulePreference?: string
}

export interface StatusValidationError {
  field: string
  reason: "required" | "invalid" | "too_long"
}

const MAX = { id: 200, ref: 120, notes: 1500, gift: 160, schedule: 240, answerKey: 80, answerValue: 500, address: 200, city: 80, state: 64, zip: 16 }
const MAX_ANSWERS = 40

function str(v: unknown, max: number): string | null | undefined {
  if (v === undefined || v === null || v === "") return undefined
  if (typeof v !== "string") return null
  const s = v.trim()
  if (!s) return undefined
  return s.length > max ? null : s
}

function isIsoDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v) && !Number.isNaN(Date.parse(v))
}

function parseLocation(raw: unknown, errors: StatusValidationError[]): AppointmentLocation | undefined {
  if (raw === undefined || raw === null) return undefined
  if (typeof raw !== "object" || Array.isArray(raw)) {
    errors.push({ field: "appointment.location", reason: "invalid" })
    return undefined
  }
  const l = raw as Record<string, unknown>
  const addressLine1 = str(l.addressLine1, MAX.address)
  const city = str(l.city, MAX.city)
  const state = str(l.state, MAX.state)
  const postalCode = str(l.postalCode, MAX.zip)
  if ([addressLine1, city, state, postalCode].some((v) => v === null)) {
    errors.push({ field: "appointment.location", reason: "too_long" })
    return undefined
  }
  // Complete or not at all: half an address helps nobody find the house.
  if (!addressLine1 || !city || !state || !postalCode) return undefined
  return { addressLine1, city, state, postalCode }
}

/** Untrusted JSON → clean payload, or the list of what is wrong. Unknown fields are dropped. */
export function parseLeadStatus(body: unknown):
  | { ok: true; payload: LeadStatusPayload }
  | { ok: false; errors: StatusValidationError[] } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: [{ field: "body", reason: "invalid" }] }
  }
  const b = body as Record<string, unknown>
  const errors: StatusValidationError[] = []

  const prospectId = str(b.prospectId, MAX.id)
  const externalId = str(b.externalId, MAX.id)
  if (prospectId === null) errors.push({ field: "prospectId", reason: "too_long" })
  if (externalId === null) errors.push({ field: "externalId", reason: "too_long" })
  if (!prospectId && !externalId) errors.push({ field: "externalId", reason: "required" })
  if (prospectId && !/^[A-Za-z0-9_-]+$/.test(prospectId)) errors.push({ field: "prospectId", reason: "invalid" })

  const event = b.event
  if (typeof event !== "string" || !(LEAD_STATUS_EVENTS as readonly string[]).includes(event)) {
    errors.push({ field: "event", reason: "invalid" })
  }

  let appointment: LeadStatusAppointment | undefined
  const needsAppointment = typeof event === "string" && event.startsWith("appointment_")
  if (b.appointment !== undefined && b.appointment !== null) {
    if (typeof b.appointment !== "object" || Array.isArray(b.appointment)) {
      errors.push({ field: "appointment", reason: "invalid" })
    } else {
      const a = b.appointment as Record<string, unknown>
      const ref = str(a.ref, MAX.ref)
      const scheduledAt = str(a.scheduledAt, 64)
      const notes = str(a.notes, MAX.notes)
      const duration = typeof a.durationMinutes === "number" && Number.isFinite(a.durationMinutes) ? Math.round(a.durationMinutes) : NaN
      const mode = a.mode === "video" ? "video" : a.mode === "in_person" ? "in_person" : null
      if (!ref) errors.push({ field: "appointment.ref", reason: ref === null ? "too_long" : "required" })
      else if (!/^[A-Za-z0-9_.:-]+$/.test(ref)) errors.push({ field: "appointment.ref", reason: "invalid" })
      if (!scheduledAt || !isIsoDate(scheduledAt)) errors.push({ field: "appointment.scheduledAt", reason: "invalid" })
      if (!(duration > 0 && duration <= 600)) errors.push({ field: "appointment.durationMinutes", reason: "invalid" })
      if (!mode) errors.push({ field: "appointment.mode", reason: "invalid" })
      if (notes === null) errors.push({ field: "appointment.notes", reason: "too_long" })
      const location = parseLocation(a.location, errors)
      if (ref && scheduledAt && mode && duration > 0) {
        appointment = {
          ref,
          scheduledAt: new Date(scheduledAt).toISOString(),
          durationMinutes: duration,
          mode,
          ...(location ? { location } : {}),
          ...(notes ? { notes } : {}),
        }
      }
    }
  }
  if (needsAppointment && !appointment && !errors.some((e) => e.field.startsWith("appointment"))) {
    errors.push({ field: "appointment", reason: "required" })
  }

  const previousRef = str(b.previousRef, MAX.ref)
  if (previousRef === null || (previousRef && !/^[A-Za-z0-9_.:-]+$/.test(previousRef))) errors.push({ field: "previousRef", reason: "invalid" })
  const gift = str(b.gift, MAX.gift)
  if (gift === null) errors.push({ field: "gift", reason: "too_long" })
  const schedulePreference = str(b.schedulePreference, MAX.schedule)
  if (schedulePreference === null) errors.push({ field: "schedulePreference", reason: "too_long" })

  let answers: Record<string, string> | undefined
  if (b.answers && typeof b.answers === "object" && !Array.isArray(b.answers)) {
    const entries = Object.entries(b.answers as Record<string, unknown>)
      .filter(([k, v]) => k.length > 0 && k.length <= MAX.answerKey && !["__proto__", "prototype", "constructor"].includes(k)
        && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"))
      .slice(0, MAX_ANSWERS)
      .map(([k, v]) => [k, String(v).slice(0, MAX.answerValue)] as const)
    if (entries.length > 0) answers = Object.fromEntries(entries)
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    payload: {
      ...(prospectId ? { prospectId } : {}),
      ...(externalId ? { externalId } : {}),
      event: event as LeadStatusEvent,
      ...(appointment ? { appointment } : {}),
      ...(previousRef ? { previousRef } : {}),
      ...(answers ? { answers } : {}),
      ...(gift ? { gift } : {}),
      ...(schedulePreference ? { schedulePreference } : {}),
    },
  }
}

/**
 * Deterministic appointment id for an integration's meeting, so a retry of
 * the same report rewrites the same document instead of creating another.
 */
export function integrationAppointmentId(workspaceId: string, ref: string): string {
  return "int_" + createHash("sha256").update(`${workspaceId}:${ref}`).digest("hex").slice(0, 28)
}

/**
 * A sales demo needs a physical address (Security Rules and requiresLocation
 * agree on that). A video demo, or an in-person one whose address is not
 * complete yet, is stored as "other" with everything in the notes.
 */
export function appointmentTypeFor(a: LeadStatusAppointment): AppointmentType {
  return a.mode === "in_person" && a.location ? "demo" : "other"
}

export function appointmentNotesFor(a: LeadStatusAppointment, confirmed: boolean): string {
  const head = a.mode === "video" ? "Demostración por Google Meet." : a.location ? "" : "Demostración presencial (dirección por completar)."
  return [head, a.notes ?? "", confirmed ? "✅ Confirmada por el cliente." : ""].filter(Boolean).join("\n").slice(0, 2000)
}

function meetingStage(leadType: LeadType): PipelineStage {
  return leadType === "recruiting" ? "rec_interview" : "appointment"
}

function followUpStage(leadType: LeadType): PipelineStage {
  return leadType === "recruiting" ? "rec_follow_up" : "follow_up"
}

/** Stages from which an integration may move the lead at all (never won/lost). */
function isOpenStage(leadType: LeadType, stage: PipelineStage): boolean {
  const p = PIPELINES[leadType]
  return stage !== p.won && stage !== p.lost
}

/** Before the meeting stage: the initial stage and the retired pre-meeting ones. */
function isBeforeMeeting(leadType: LeadType, stage: PipelineStage): boolean {
  if (leadType === "recruiting") return ["rec_new", "rec_contact", "rec_contacted", "rec_qualified"].includes(stage)
  return ["new_lead", "contact", "contacted", "interested"].includes(stage)
}

/**
 * Which stage the lead should end in after this event, or null to leave it.
 * `otherScheduled` = the lead still has another scheduled meeting after this
 * write (only relevant to cancellations).
 */
export function nextStageFor(
  leadType: LeadType,
  current: PipelineStage,
  event: LeadStatusEvent,
  otherScheduled: boolean,
): PipelineStage | null {
  if (!isOpenStage(leadType, current)) return null
  switch (event) {
    case "appointment_scheduled":
    case "appointment_rescheduled":
    case "appointment_confirmed":
      return isBeforeMeeting(leadType, current) || current === followUpStage(leadType) ? meetingStage(leadType) : null
    case "appointment_cancelled":
      return current === meetingStage(leadType) && !otherScheduled ? followUpStage(leadType) : null
    case "not_interested":
      return isBeforeMeeting(leadType, current) ? PIPELINES[leadType].lost : null
    default:
      return null
  }
}

export function appointmentStatusFor(event: LeadStatusEvent): AppointmentStatus | null {
  if (event === "appointment_cancelled") return "cancelled"
  if (event === "appointment_scheduled" || event === "appointment_rescheduled" || event === "appointment_confirmed") return "scheduled"
  return null
}
