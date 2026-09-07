"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Lock } from "lucide-react"
import { AppointmentCard } from "@/components/calendar/appointment-card"
import { ScheduleDialog } from "@/components/appointments/schedule-dialog"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { DataErrorState } from "@/components/shared/data-error-state"
import { useAppointments } from "@/lib/firebase/appointments"
import { useLeads } from "@/lib/firebase/leads"
import { useUsersForWorkspace, useUsers } from "@/lib/firebase/collections"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { APPOINTMENT_TYPES, canManageAppointment, canSchedule, matchesDateFilter, type DateFilter } from "@/lib/appointments"
import { t } from "@/lib/i18n"
import type { Appointment, AppointmentType } from "@/types"

const c = t.modules.calendar
const DATE_FILTERS: DateFilter[] = ["upcoming", "today", "week", "past", "all"]
const ALL_TYPES: AppointmentType[] = [...new Set([...APPOINTMENT_TYPES.sales, ...APPOINTMENT_TYPES.recruiting])]
const ANY = "__any__"

/**
 * Agenda list — enough for the MVP and far more usable on a phone than a grid.
 * Every appointment shown came from Firestore already filtered by the Rules.
 */
export function CalendarView() {
  const router = useRouter()
  const { workspaceId, isSuperAdmin, role, membership } = useWorkspace()
  const { appointments, loading, error } = useAppointments()
  const { leads } = useLeads("all")
  const scoped = useUsersForWorkspace(workspaceId)
  const ambient = useUsers()
  const users = workspaceId ? scoped.users : ambient.users

  const [dateFilter, setDateFilter] = useState<DateFilter>("upcoming")
  const [ownerFilter, setOwnerFilter] = useState<string>(ANY)
  const [typeFilter, setTypeFilter] = useState<string>(ANY)
  const [editing, setEditing] = useState<Appointment | null>(null)

  const actor = useMemo(
    () => ({ role, userId: membership?.userId ?? null, workspaceId: membership?.workspaceId ?? null, isSuperAdmin }),
    [role, membership, isSuperAdmin],
  )
  const names = useMemo(() => {
    const map: Record<string, string> = {}
    for (const u of users) map[u.id] = u.name
    return map
  }, [users])

  const visible = useMemo(
    () =>
      appointments.filter(
        (a) =>
          matchesDateFilter(a, dateFilter) &&
          (ownerFilter === ANY || (a.assignedToId || "") === (ownerFilter === "" ? "" : ownerFilter)) &&
          (typeFilter === ANY || a.type === typeFilter),
      ),
    [appointments, dateFilter, ownerFilter, typeFilter],
  )

  /**
   * Leads this person can actually open. An appointment whose lead was
   * archived, deleted or simply not readable for this role stays visible and
   * reschedulable — only the "Ver prospecto" link is withheld, because
   * following it would land on a lead they cannot read.
   */
  const readableLeadIds = useMemo(() => new Set(leads.map((l) => l.id)), [leads])

  if (error) return <DataErrorState error={error} />
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    )
  }

  const owners = users.filter((u) => appointments.some((a) => a.assignedToId === u.id))

  return (
    <div className="flex flex-col gap-4">
      {!canSchedule(actor) && (
        <p className="flex items-start gap-2 rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" />
          {c.readOnly}
        </p>
      )}

      {/* Filters: one column on a phone, a row from sm. Never a wide toolbar. */}
      <Card>
        <CardContent className="grid grid-cols-1 gap-3 pt-6 sm:grid-cols-3">
          <Picker
            id="cal-date" label={c.filters.date} value={dateFilter}
            options={DATE_FILTERS}
            labelFor={(v) => c.filters[v as Exclude<DateFilter, "all">] ?? c.filters.allDates}
            onChange={(v) => setDateFilter(v as DateFilter)}
          />
          <Picker
            id="cal-owner" label={c.filters.owner} value={ownerFilter}
            options={[ANY, "", ...owners.map((o) => o.id)]}
            labelFor={(v) => (v === ANY ? c.filters.all : v === "" ? c.filters.unassigned : names[v] ?? v)}
            onChange={setOwnerFilter}
          />
          <Picker
            id="cal-type" label={c.filters.type} value={typeFilter}
            options={[ANY, ...ALL_TYPES]}
            labelFor={(v) => (v === ANY ? c.filters.all : c.types[v as AppointmentType])}
            onChange={setTypeFilter}
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">{c.count(visible.length)}</p>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          {appointments.length === 0 ? c.empty : c.emptyFiltered}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((a) => (
            <AppointmentCard
              key={a.id}
              appointment={a}
              ownerName={names[a.assignedToId] ?? c.filters.unassigned}
              canManage={canManageAppointment(actor, a)}
              leadAccessible={readableLeadIds.has(a.leadId)}
              onOpenLead={(leadId) => router.push(`/leads?lead=${encodeURIComponent(leadId)}`)}
              onReschedule={setEditing}
            />
          ))}
        </ul>
      )}

      {editing && (
        // Built from the appointment itself: no lead read, nothing leaked.
        <ScheduleDialog
          target={{
            leadId: editing.leadId,
            leadName: editing.leadName,
            workspaceId: editing.workspaceId,
            leadType: editing.leadType,
            assignedToId: editing.assignedToId,
          }}
          appointment={editing}
          open
          onOpenChange={(open) => !open && setEditing(null)}
        />
      )}
    </div>
  )
}

function Picker({
  id, label, value, options, labelFor, onChange,
}: {
  id: string
  label: string
  value: string
  options: readonly string[]
  labelFor: (value: string) => string
  onChange: (value: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs text-muted-foreground">{label}</label>
      <Select value={value === "" ? "__unassigned__" : value} onValueChange={(v) => v && onChange(v === "__unassigned__" ? "" : v)}>
        <SelectTrigger id={id} className="h-11 w-full sm:h-9">
          <SelectValue>{(v: string) => labelFor(v === "__unassigned__" ? "" : v)}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[50svh]">
          {options.map((o) => (
            <SelectItem key={o || "__unassigned__"} value={o === "" ? "__unassigned__" : o}>
              {labelFor(o)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
