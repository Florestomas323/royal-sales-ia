"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Loader2 } from "lucide-react"
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
import { AddressFields } from "@/components/appointments/address-fields"
import { AddToCalendar } from "@/components/appointments/add-to-calendar"
import {
  DURATIONS, EMPTY_LOCATION, defaultScheduledAt, fromLocalInput, hasErrors, isBlankLocation,
  normalizeLocation, requiresLocation, toLocalInput, typesFor, validateDraft, type LocationErrors,
} from "@/lib/appointments"
import { memberLabel } from "@/lib/team"
import { t } from "@/lib/i18n"
import type { Appointment, AppointmentLocation, AppointmentType, LeadType } from "@/types"

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
  const [location, setLocation] = useState<AppointmentLocation>(EMPTY_LOCATION)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ scheduledAt?: string; type?: string; location?: LocationErrors }>({})
  /** Set once the appointment exists, so the export button has real data. */
  const [saved, setSaved] = useState<Appointment | null>(null)
  const locationRequired = requiresLocation(leadType, type)

  useEffect(() => {
    if (!open) return
    setErrors({})
    setWhen(toLocalInput(appointment?.scheduledAt ?? defaultScheduledAt()))
    setDuration(appointment?.durationMinutes ?? 60)
    setType(appointment?.type ?? types[0])
    // Prefill the owner from the appointment, else from the lead. Never guess.
    setOwnerId(appointment?.assignedToId ?? target.assignedToId ?? "")
    setNotes(appointment?.notes ?? "")
    // Rescheduling loads the address stored ON THE APPOINTMENT, so it can be
    // edited here without ever touching the lead's own address.
    setLocation(appointment?.location ?? EMPTY_LOCATION)
    setSaved(null)
  }, [open, appointment, target.assignedToId, types])

  const owners = eligibleAssignees(users, target.workspaceId)
  // A rep may not reassign; admins and managers may.
  const canReassign = isSuperAdmin || role === "client_admin" || role === "manager"

  async function handleSave() {
    if (saving) return
    const scheduledAt = fromLocalInput(when)
    const problems = validateDraft({ scheduledAt, leadType, type, durationMinutes: duration, location })
    if (hasErrors(problems)) {
      setErrors({
        scheduledAt: problems.scheduledAt ? d.invalidDate : undefined,
        type: problems.type ? d.invalidType : undefined,
        location: problems.location,
      })
      if (problems.location) {
        toast.error(locationRequired ? t.modules.calendar.address.incomplete : t.modules.calendar.address.incompletePartial)
      }
      return
    }
    if (!membership?.userId) return
    // A blank optional address is stored as absent, never as empty strings.
    const blank = isBlankLocation(location)
    const storedLocation = blank ? undefined : normalizeLocation(location)
    // On update, `null` tells the data layer to REMOVE a previously stored
    // address; `undefined` would just leave the old one in place. A sales demo
    // never reaches this point blank: validateDraft already stopped it.
    const locationPatch = blank ? null : normalizeLocation(location)
    setSaving(true)
    try {
      if (appointment) {
        await updateAppointment(appointment.id, {
          scheduledAt: scheduledAt as string,
          durationMinutes: duration,
          type,
          notes: notes.trim() || undefined,
          location: locationPatch,
          ...(canReassign ? { assignedToId: ownerId } : {}),
        })
        toast.success(d.updated)
        onOpenChange(false)
      } else {
        const id = await createAppointment({
          workspaceId: target.workspaceId,
          leadId: target.leadId,
          leadName: target.leadName,
          leadType,
          assignedToId: ownerId,
          scheduledAt: scheduledAt as string,
          durationMinutes: duration,
          type,
          notes: notes.trim() || undefined,
          location: storedLocation,
          createdBy: membership.userId,
        })
        toast.success(d.created)
        // The dialog switches to a success step offering the export. The
        // appointment already exists: this step can be dismissed freely.
        setSaved({
          id,
          workspaceId: target.workspaceId,
          leadId: target.leadId,
          leadName: target.leadName,
          leadType,
          assignedToId: ownerId,
          scheduledAt: scheduledAt as string,
          durationMinutes: duration,
          type,
          status: "scheduled",
          notes: notes.trim() || undefined,
          location: storedLocation,
          createdBy: membership.userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      }
    } catch (err) {
      toast.error(d.error, { description: describeError(err).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        {saved ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-success" />
                {t.modules.calendar.created.title}
              </DialogTitle>
              <DialogDescription className="text-pretty">
                {t.modules.calendar.created.description}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-3">
              <AddToCalendar appointment={saved} className="h-12 w-full justify-center gap-1.5 sm:h-10" />
            </div>
            <DialogFooter>
              <Button className="h-11 w-full sm:h-9 sm:w-auto" onClick={() => onOpenChange(false)}>
                {t.modules.calendar.created.close}
              </Button>
            </DialogFooter>
          </>
        ) : (
        <>
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
                  {(v: string) => {
                    if (v === NO_OWNER) return d.ownerUnassigned
                    const owner = owners.find((o) => o.id === v)
                    return owner ? memberLabel(owner) : d.ownerUnassigned
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[50svh]">
                <SelectItem value={NO_OWNER}>{d.ownerUnassigned}</SelectItem>
                {owners.map((o) => (
                  <SelectItem key={o.id} value={o.id}>{memberLabel(o)}</SelectItem>
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

          <AddressFields
            value={location}
            errors={errors.location}
            required={locationRequired}
            disabled={saving}
            onChange={(next) => {
              setLocation(next)
              if (errors.location) setErrors((p) => ({ ...p, location: undefined }))
            }}
          />

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
        </>
        )}
      </DialogContent>
    </Dialog>
  )
}
