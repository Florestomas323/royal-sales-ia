import { formatLocation } from "@/lib/appointments"
import type { Appointment } from "@/types"

/**
 * One-off export to the person's own calendar. NOT an integration: no OAuth,
 * no tokens, no background sync. Apple gets a standard .ics file; Google gets
 * its public "create event" form pre-filled. In both cases the person is the
 * one who finally confirms the event, so nothing is ever added silently.
 */

const TYPE_LABEL: Record<string, string> = {
  demo: "Demostración", follow_up: "Seguimiento", closing: "Cierre",
  interview: "Entrevista", orientation: "Orientación", other: "Cita",
}

export function appointmentTitle(appointment: Pick<Appointment, "leadName" | "type">): string {
  return `${TYPE_LABEL[appointment.type] ?? "Cita"} — ${appointment.leadName}`
}

export function endsAt(appointment: Pick<Appointment, "scheduledAt" | "durationMinutes">): Date {
  const start = new Date(appointment.scheduledAt)
  return new Date(start.getTime() + (appointment.durationMinutes || 60) * 60_000)
}

/** UTC basic format required by iCalendar and by Google's form: 20260910T160000Z */
export function toCalendarStamp(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`
}

function describe(appointment: Pick<Appointment, "leadName" | "type" | "notes">): string {
  return [
    `Prospecto: ${appointment.leadName}`,
    `Tipo: ${TYPE_LABEL[appointment.type] ?? "Cita"}`,
    appointment.notes?.trim() ? `Notas: ${appointment.notes.trim()}` : null,
  ].filter((l): l is string => l !== null).join("\n")
}

/** RFC 5545 escaping: backslash, semicolon, comma and newline. */
function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n")
}

/**
 * RFC 5545 folds at 75 OCTETS, not characters, and a multi-byte character may
 * never be split across the fold. Spanish accents are two bytes each, so
 * counting characters would produce lines some calendar apps reject.
 */
const encoder = new TextEncoder()
/** Byte length in UTF-8; the Node-only Buffer API is unavailable in the browser. */
const octets = (value: string) => encoder.encode(value).length

function foldLine(line: string, limit = 75): string {
  if (octets(line) <= limit) return line
  const parts: string[] = []
  let current = ""
  let budget = limit
  for (const char of line) {
    const size = octets(char)
    if (octets(current) + size > budget) {
      parts.push(current)
      current = char
      // Continuation lines start with a space, which eats one octet.
      budget = limit - 1
    } else {
      current += char
    }
  }
  if (current.length > 0) parts.push(current)
  return parts.map((p, i) => (i === 0 ? p : ` ${p}`)).join("\r\n")
}

/**
 * A complete VCALENDAR for one appointment. iOS opens it with the system
 * "Add to Calendar" sheet; it is an export, never an automatic insert.
 */
export function buildIcs(
  appointment: Pick<Appointment, "id" | "leadName" | "type" | "notes" | "scheduledAt" | "durationMinutes" | "location">,
  now = new Date(),
): string {
  const start = new Date(appointment.scheduledAt)
  const address = formatLocation(appointment.location)
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Royal Sales IA//Calendario//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${appointment.id}@royalsalesia.com`,
    `DTSTAMP:${toCalendarStamp(now)}`,
    `DTSTART:${toCalendarStamp(start)}`,
    `DTEND:${toCalendarStamp(endsAt(appointment))}`,
    `SUMMARY:${escapeIcs(appointmentTitle(appointment))}`,
    `DESCRIPTION:${escapeIcs(describe(appointment))}`,
    ...(address ? [`LOCATION:${escapeIcs(address)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ]
  // CRLF endings are mandatory in RFC 5545.
  return `${lines.map((line) => foldLine(line)).join("\r\n")}\r\n`
}

export function icsFileName(appointment: Pick<Appointment, "leadName" | "scheduledAt">): string {
  const day = appointment.scheduledAt.slice(0, 10)
  const name = appointment.leadName.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9]+/g, "-")
  return `cita-${name || "prospecto"}-${day}.ics`.toLowerCase()
}

/**
 * Google's public event form. Only the fields travel in the URL; the person
 * reviews and saves it in Google Calendar. No token is stored anywhere.
 */
export function buildGoogleCalendarUrl(
  appointment: Pick<Appointment, "leadName" | "type" | "notes" | "scheduledAt" | "durationMinutes" | "location">,
): string {
  const start = new Date(appointment.scheduledAt)
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: appointmentTitle(appointment),
    dates: `${toCalendarStamp(start)}/${toCalendarStamp(endsAt(appointment))}`,
    details: describe(appointment),
  })
  const address = formatLocation(appointment.location)
  if (address) params.set("location", address)
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}
