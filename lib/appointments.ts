import { PIPELINES } from "@/lib/constants"
import type { Appointment, AppointmentStatus, AppointmentType, LeadType, UserRole } from "@/types"

/**
 * Pure helpers for the operational calendar. No Firestore, no React.
 */

/** Meeting types offered per pipeline: sales and recruiting never mix. */
export const APPOINTMENT_TYPES: Record<LeadType, AppointmentType[]> = {
  sales: ["demo", "follow_up", "closing", "other"],
  recruiting: ["interview", "orientation", "follow_up", "other"],
}

export const DURATIONS = [15, 30, 45, 60, 90] as const

export function typesFor(leadType: LeadType): AppointmentType[] {
  return APPOINTMENT_TYPES[leadType] ?? APPOINTMENT_TYPES.sales
}

export function isValidType(leadType: LeadType, type: AppointmentType): boolean {
  return typesFor(leadType).includes(type)
}

/** An appointment is only open while it is still `scheduled`. */
export function isOpen(appointment: Pick<Appointment, "status">): boolean {
  return appointment.status === "scheduled"
}

export function isPast(appointment: Pick<Appointment, "scheduledAt">, now = new Date()): boolean {
  const at = Date.parse(appointment.scheduledAt)
  return Number.isFinite(at) && at < now.getTime()
}

/**
 * Who may create, reschedule, cancel or complete an appointment.
 * Mirrors the lead permissions: admins and managers act on their whole
 * workspace, a rep only on meetings assigned to them, a viewer never writes.
 */
export interface CalendarActor {
  role: UserRole | null
  userId: string | null
  workspaceId: string | null
  isSuperAdmin: boolean
}

export function canManageAppointment(
  actor: CalendarActor,
  appointment: Pick<Appointment, "workspaceId" | "assignedToId">,
): boolean {
  if (actor.isSuperAdmin) return true
  if (!actor.workspaceId || actor.workspaceId !== appointment.workspaceId) return false
  if (actor.role === "client_admin" || actor.role === "manager") return true
  if (actor.role === "sales_rep") return !!actor.userId && appointment.assignedToId === actor.userId
  return false // viewer: read-only
}

/** Whether this person may schedule at all (viewer cannot). */
export function canSchedule(actor: CalendarActor): boolean {
  return (
    actor.isSuperAdmin ||
    actor.role === "client_admin" ||
    actor.role === "manager" ||
    actor.role === "sales_rep"
  )
}

/** Local <input type="datetime-local"> value → ISO, and back. */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ""
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

/** Default: next full hour, so the form never opens on a past minute. */
export function defaultScheduledAt(now = new Date()): string {
  const d = new Date(now)
  d.setMinutes(0, 0, 0)
  d.setHours(d.getHours() + 1)
  return d.toISOString()
}

export interface AppointmentDraftErrors {
  scheduledAt?: string
  type?: string
  duration?: string
}

/** Validation shared by create and reschedule. */
export function validateDraft(input: {
  scheduledAt: string | null
  leadType: LeadType
  type: AppointmentType
  durationMinutes: number
}): AppointmentDraftErrors {
  const errors: AppointmentDraftErrors = {}
  if (!input.scheduledAt || Number.isNaN(Date.parse(input.scheduledAt))) {
    errors.scheduledAt = "invalid_date"
  }
  if (!isValidType(input.leadType, input.type)) errors.type = "invalid_type"
  if (!Number.isFinite(input.durationMinutes) || input.durationMinutes <= 0) {
    errors.duration = "invalid_duration"
  }
  return errors
}

export function hasErrors(errors: AppointmentDraftErrors): boolean {
  return Object.keys(errors).length > 0
}

/** Upcoming first, then past ones newest-first — the useful order on a phone. */
export function sortForAgenda(appointments: Appointment[], now = new Date()): Appointment[] {
  const time = (a: Appointment) => Date.parse(a.scheduledAt) || 0
  const upcoming = appointments.filter((a) => time(a) >= now.getTime()).sort((a, b) => time(a) - time(b))
  const past = appointments.filter((a) => time(a) < now.getTime()).sort((a, b) => time(b) - time(a))
  return [...upcoming, ...past]
}

export type DateFilter = "upcoming" | "today" | "week" | "past" | "all"

export function matchesDateFilter(
  appointment: Pick<Appointment, "scheduledAt">,
  filter: DateFilter,
  now = new Date(),
): boolean {
  const at = Date.parse(appointment.scheduledAt)
  if (!Number.isFinite(at)) return filter === "all"
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  switch (filter) {
    case "today": {
      const end = new Date(start)
      end.setDate(end.getDate() + 1)
      return at >= start.getTime() && at < end.getTime()
    }
    case "week": {
      const end = new Date(start)
      end.setDate(end.getDate() + 7)
      return at >= start.getTime() && at < end.getTime()
    }
    case "upcoming":
      return at >= now.getTime()
    case "past":
      return at < now.getTime()
    default:
      return true
  }
}

/**
 * The stage a lead would sit in for this pipeline's meeting stage. EXPOSED
 * BUT NOT APPLIED: Phase I never moves a lead automatically, because the
 * model has no explicit, audited "appointment scheduled" transition.
 */
export function meetingStageFor(leadType: LeadType): string {
  return leadType === "sales" ? "appointment" : "rec_interview"
}

export { PIPELINES }
export type { AppointmentStatus, AppointmentType }
