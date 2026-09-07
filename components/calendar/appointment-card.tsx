"use client"

import { useState } from "react"
import { CalendarClock, CheckCircle2, Clock, ExternalLink, RotateCcw, UserRound, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { setAppointmentStatus } from "@/lib/firebase/appointments"
import { describeError } from "@/lib/firebase/errors"
import { isPast } from "@/lib/appointments"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { Appointment, AppointmentStatus } from "@/types"

const c = t.modules.calendar

const STATUS_TONE: Record<AppointmentStatus, string> = {
  scheduled: "bg-primary/10 text-primary",
  completed: "bg-success/15 text-success",
  no_show: "bg-warning/15 text-warning",
  cancelled: "bg-muted text-muted-foreground",
}

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleString("es-MX", {
    weekday: "short", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit",
  })
}

/**
 * One appointment as a card — never a table row, so a phone reads it without
 * horizontal scrolling. Management actions only render for people the Rules
 * would actually let write.
 */
export function AppointmentCard({
  appointment,
  ownerName,
  canManage,
  leadAccessible,
  onOpenLead,
  onReschedule,
}: {
  appointment: Appointment
  ownerName: string
  canManage: boolean
  /**
   * Whether this person can actually open the associated lead. False when it
   * was archived, deleted or belongs outside what their role may read.
   */
  leadAccessible: boolean
  onOpenLead: (leadId: string) => void
  onReschedule: (appointment: Appointment) => void
}) {
  const [busy, setBusy] = useState(false)
  const past = isPast(appointment)

  async function setStatus(status: AppointmentStatus, message: string) {
    if (busy) return
    setBusy(true)
    try {
      await setAppointmentStatus(appointment.id, status)
      toast.success(message)
    } catch (err) {
      toast.error(c.actionError, { description: describeError(err).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{appointment.leadName}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <CalendarClock className="size-3.5 shrink-0" />
              {formatWhen(appointment.scheduledAt)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3.5 shrink-0" />
              {c.card.duration(appointment.durationMinutes)}
            </span>
            <span className="flex min-w-0 items-center gap-1">
              <UserRound className="size-3.5 shrink-0" />
              <span className="truncate">{ownerName}</span>
            </span>
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_TONE[appointment.status])}>
            {c.status[appointment.status]}
          </span>
          <Badge variant="secondary" className="text-[10px]">{c.types[appointment.type]}</Badge>
        </div>
      </div>

      {appointment.notes && (
        <p className="text-pretty break-words text-xs text-muted-foreground">{appointment.notes}</p>
      )}
      {past && appointment.status === "scheduled" && (
        <p className="text-xs text-warning">{c.card.past}</p>
      )}
      {!leadAccessible && (
        <p className="text-xs text-muted-foreground">{c.card.leadUnavailable}</p>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Never a button that silently does nothing: when the lead is not
            reachable the action is disabled and says why. */}
        <Button
          variant="outline" size="sm" className="h-11 gap-1.5 sm:h-8"
          disabled={!leadAccessible}
          title={leadAccessible ? undefined : c.card.leadUnavailable}
          onClick={() => onOpenLead(appointment.leadId)}
        >
          <ExternalLink className="size-3.5" />
          {c.card.openLead}
        </Button>
        {canManage && appointment.status === "scheduled" && (
          <>
            <Button variant="outline" size="sm" className="h-11 gap-1.5 sm:h-8" disabled={busy} onClick={() => onReschedule(appointment)}>
              <CalendarClock className="size-3.5" />
              {c.card.reschedule}
            </Button>
            <Button variant="outline" size="sm" className="h-11 gap-1.5 sm:h-8" disabled={busy} onClick={() => void setStatus("completed", c.statusUpdated)}>
              <CheckCircle2 className="size-3.5" />
              {c.card.complete}
            </Button>
            <Button variant="outline" size="sm" className="h-11 gap-1.5 sm:h-8" disabled={busy} onClick={() => void setStatus("no_show", c.statusUpdated)}>
              <XCircle className="size-3.5" />
              {c.card.noShow}
            </Button>
            <Button variant="outline" size="sm" className="h-11 gap-1.5 sm:h-8" disabled={busy} onClick={() => void setStatus("cancelled", c.statusUpdated)}>
              <XCircle className="size-3.5" />
              {c.card.cancel}
            </Button>
          </>
        )}
        {canManage && appointment.status !== "scheduled" && (
          <Button variant="outline" size="sm" className="h-11 gap-1.5 sm:h-8" disabled={busy} onClick={() => void setStatus("scheduled", c.statusUpdated)}>
            <RotateCcw className="size-3.5" />
            {c.card.restore}
          </Button>
        )}
      </div>
    </li>
  )
}
