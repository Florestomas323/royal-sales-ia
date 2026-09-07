"use client"

import { useEffect, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useUsersForWorkspace } from "@/lib/firebase/collections"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { createAppointment, updateAppointment } from "@/lib/firebase/appointments"
import { describeError } from "@/lib/firebase/errors"
import { eligibleAssignees } from "@/lib/leads"
import {
  DURATIONS, defaultScheduledAt, fromLocalInput, hasErrors, toLocalInput, typesFor, validateDraft,
} from "@/lib/appointments"
import { t } from "@/lib/i18n"
import type { Appointment, AppointmentType, LeadType } from "@/types"

const d = t.modules.calendar.dialog
const NO_OWNER = "__none__"

/**
 * The minimum the dialog needs. Deliberately NOT a `Lead`: rescheduling must
 * work from what the appointment already stores, so a meeting whose lead is
 * archived, deleted or unreadable for this person can still be moved without
 * reading — or leaking — anything from that lead.
 */
export interface ScheduleTarget {
  leadId: string
  leadName: string
  workspaceId: string
  leadType: LeadType
  /** Current owner, used only to prefill. May be ''. */
  assignedToId: string
}

/**
 * Schedule or reschedule. Everything is prefilled from REAL data and nothing
 * is invented: with no owner, the meeting is created unassigned rather than
 * guessing one.
 *
 * Scheduling never moves the lead's stage (see lib/appointments.ts).
 */
export function ScheduleDialog({
  target,
  appointment,
  open,
  onOpenChange,
}: {
  /** Where the meeting belongs. Built from a Lead, or from the Appointment. */
  target: ScheduleTarget
  /** When present the dialog reschedules instead of creating. */
  appointment?: Appointment | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { membership, role, isSuperAdmin } = useWorkspace()
  // Owners come from the TARGET's workspace, not the sidebar's.
  const { users } = useUsersForWorkspace(target.workspaceId)
  const leadType = target.leadType
  const types = typesFor(leadType)
  const isEdit = Boolean(appointment)

  const [when, setWhen] = useState("")
  const [duration, setDuration] = useState<number>(60)
  const [type, setType] = useState<AppointmentType>(types[0])
  const [ownerId, setOwnerId] = useState<string>("")
  const [notes, setNotes] = useState("")
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ scheduledAt?: string; type?: string }>({})

  useEffect(() => {
    if (!open) return
    setErrors({})
    setWhen(toLocalInput(appointment?.scheduledAt ?? defaultScheduledAt()))
    setDuration(appointment?.durationMinutes ?? 60)
    setType(appointment?.type ?? types[0])
    // Prefill the owner from the appointment, else from the lead. Never guess.
    setOwnerId(appointment?.assignedToId ?? target.assignedToId ?? "")
    setNotes(appointment?.notes ?? "")
  }, [open, appointment, target.assignedToId, types])

  const owners = eligibleAssignees(users, target.workspaceId)
  // A rep may not reassign; admins and managers may.
  const canReassign = isSuperAdmin || role === "client_admin" || role === "manager"

  async function handleSave() {
    if (saving) return
    const scheduledAt = fromLocalInput(when)
    const problems = validateDraft({ scheduledAt, leadType, type, durationMinutes: duration })
    if (hasErrors(problems)) {
      setErrors({
        scheduledAt: problems.scheduledAt ? d.invalidDate : undefined,
        type: problems.type ? d.invalidType : undefined,
      })
      return
    }
    if (!membership?.userId) return
    setSaving(true)
    try {
      if (appointment) {
        await updateAppointment(appointment.id, {
          scheduledAt: scheduledAt as string,
          durationMinutes: duration,
          type,
          notes: notes.trim() || undefined,
          ...(canReassign ? { assignedToId: ownerId } : {}),
        })
        toast.success(d.updated)
      } else {
        await createAppointment({
          workspaceId: target.workspaceId,
          leadId: target.leadId,
          leadName: target.leadName,
          leadType,
          assignedToId: ownerId,
          scheduledAt: scheduledAt as string,
          durationMinutes: duration,
          type,
          notes: notes.trim() || undefined,
          createdBy: membership.userId,
        })
        toast.success(d.created)
      }
      onOpenChange(false)
    } catch (err) {
      toast.error(d.error, { description: describeError(err).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? d.titleEdit : d.titleNew}</DialogTitle>
          <DialogDescription className="text-pretty">
            {isEdit ? d.descriptionEdit(target.leadName) : d.descriptionNew(target.leadName)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Field data-invalid={!!errors.scheduledAt || undefined}>
            <FieldLabel htmlFor="appt-when">{d.when}</FieldLabel>
            <Input
              id="appt-when"
              type="datetime-local"
              value={when}
              disabled={saving}
              onChange={(e) => {
                setWhen(e.target.value)
                if (errors.scheduledAt) setErrors((p) => ({ ...p, scheduledAt: undefined }))
              }}
              className="h-11 text-base sm:h-9 sm:text-sm"
            />
            {errors.scheduledAt && <FieldError>{errors.scheduledAt}</FieldError>}
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="appt-duration">{d.duration}</FieldLabel>
              <Select value={String(duration)} onValueChange={(v) => v && setDuration(Number(v))}>
                <SelectTrigger id="appt-duration" className="h-11 sm:h-9">
                  <SelectValue>{(v: string) => t.modules.calendar.card.duration(Number(v))}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((m) => (
                    <SelectItem key={m} value={String(m)}>{t.modules.calendar.card.duration(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field data-invalid={!!errors.type || undefined}>
              <FieldLabel htmlFor="appt-type">{d.type}</FieldLabel>
              <Select value={type} onValueChange={(v) => v && setType(v as AppointmentType)}>
                <SelectTrigger id="appt-type" className="h-11 sm:h-9">
                  <SelectValue>{(v: string) => t.modules.calendar.types[v as AppointmentType]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {types.map((x) => (
                    <SelectItem key={x} value={x}>{t.modules.calendar.types[x]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.type && <FieldError>{errors.type}</FieldError>}
            </Field>
          </div>

          <Field>
            <FieldLabel htmlFor="appt-owner">{d.owner}</FieldLabel>
            <Select
              value={ownerId || NO_OWNER}
              disabled={saving || !canReassign}
              onValueChange={(v) => setOwnerId(v === NO_OWNER ? "" : (v ?? ""))}
            >
              <SelectTrigger id="appt-owner" className="h-11 sm:h-9">
                <SelectValue>
                  {(v: string) => (v === NO_OWNER ? d.ownerUnassigned : owners.find((o) => o.id === v)?.name ?? d.ownerUnassigned)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[50svh]">
                <SelectItem value={NO_OWNER}>{d.ownerUnassigned}</SelectItem>
                {owners.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription>{d.ownerHint}</FieldDescription>
          </Field>

          <Field>
            <FieldLabel htmlFor="appt-notes">{d.notes}</FieldLabel>
            <Textarea
              id="appt-notes"
              rows={3}
              value={notes}
              disabled={saving}
              placeholder={d.notesPlaceholder}
              onChange={(e) => setNotes(e.target.value)}
              className="text-base sm:text-sm"
            />
          </Field>

          <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
            {d.pipelineNotice}
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="h-11 sm:h-9" disabled={saving} onClick={() => onOpenChange(false)}>
            {t.common.cancel}
          </Button>
          <Button className="h-11 sm:h-9" disabled={saving} onClick={handleSave}>
            {saving && <Loader2 className="animate-spin" data-icon="inline-start" />}
            {saving ? d.saving : isEdit ? d.saveEdit : d.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
