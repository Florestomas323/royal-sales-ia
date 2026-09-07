"use client"

import { CalendarClock } from "lucide-react"
import { useLeadAppointments } from "@/lib/firebase/appointments"
import { t } from "@/lib/i18n"
import type { Appointment } from "@/types"

const c = t.modules.calendar

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("es-MX", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
}

/**
 * Compact list of this lead's meetings, inside the detail sheet.
 * `workspaceId` comes from the LEAD itself so the query is scoped exactly as
 * the Security Rules require, whatever workspace the sidebar is showing.
 */
export function LeadAppointments({ leadId, workspaceId }: { leadId: string; workspaceId: string }) {
  const { appointments, loading } = useLeadAppointments(leadId, workspaceId)
  if (loading) return null

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium">{c.leadSection.title}</p>
      {appointments.length === 0 ? (
        <p className="text-xs text-muted-foreground">{c.leadSection.empty}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {appointments.map((a: Appointment) => (
            <li key={a.id} className="flex items-center justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs">
              <span className="flex min-w-0 items-center gap-1.5">
                <CalendarClock className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{formatWhen(a.scheduledAt)} · {c.types[a.type]}</span>
              </span>
              <span className="shrink-0 text-muted-foreground">{c.status[a.status]}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
