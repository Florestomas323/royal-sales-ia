"use client"

import { useEffect, useState } from "react"
import {
  deleteField, collection, doc, getDoc, getDocs, onSnapshot, query, updateDoc, where, writeBatch,
  type DocumentData, type Query,
} from "firebase/firestore"
import type { FieldValue } from "firebase/firestore"
import { db } from "./client"
import { useWorkspace } from "./workspace-context"
import { sortForAgenda } from "@/lib/appointments"
import { PIPELINES, STAGE_LABELS } from "@/lib/constants"
import { stageActivity, type ActorContext } from "./activities"
import { MutationError } from "./leads"
import type {
  Appointment, AppointmentLocation, AppointmentStatus, AppointmentType, Lead, LeadType, PipelineStage,
} from "@/types"

/**
 * `appointments` CRUD, same multi-tenant pattern as clients/campaigns.
 * Security Rules are the boundary; these helpers only avoid issuing queries
 * Firestore would reject.
 *
 * Queries use equality filters ONLY (workspaceId, and assignedToId for a
 * rep) and sort in the client, so no composite index is required.
 */

const appointmentsCol = collection(db, "appointments")

export interface NewAppointment {
  workspaceId: string
  leadId: string
  leadName: string
  leadType: LeadType
  assignedToId: string
  scheduledAt: string
  durationMinutes: number
  type: AppointmentType
  notes?: string
  /** Physical address of the meeting; a snapshot, never the lead's own. */
  location?: AppointmentLocation
  createdBy: string
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

/* -------------------------------------------------------------------------- */
/*  Appointment ↔ pipeline stage                                               */
/* -------------------------------------------------------------------------- */

/**
 * `lead.stage` is THE source of truth for the pipeline: the Rules, the
 * Kanban, the funnel and the audit trail all read it. So when a meeting is
 * booked the lead is moved into "Demostración agendada" (or "Entrevista")
 * in the SAME batch, with the same `stage_change` activity a manual move
 * writes — and when the last active meeting is cancelled it moves back to
 * follow-up. Two sources of truth that could disagree were the root cause of
 * a demo visible in the calendar while the funnel showed zero.
 *
 * A lead already past the meeting stage (won, lost, follow-up) is left alone:
 * booking a closing meeting must not drag a won lead backwards.
 */
function meetingStageFor(leadType: LeadType): PipelineStage {
  return leadType === "recruiting" ? "rec_interview" : "appointment"
}

function followUpStageFor(leadType: LeadType): PipelineStage {
  return leadType === "recruiting" ? "rec_follow_up" : "follow_up"
}

/** Stages BEFORE the meeting in each pipeline, from which a booking advances. */
function isBeforeMeetingStage(leadType: LeadType, stage: PipelineStage): boolean {
  const before = PIPELINES[leadType].stages
  const idx = before.indexOf(stage)
  const meetingIdx = before.indexOf(meetingStageFor(leadType))
  return idx !== -1 && meetingIdx !== -1 && idx < meetingIdx
}

/**
 * Adds "move this lead into its meeting stage" to a batch, if it is before
 * that stage. Shared by booking and by the retroactive sync so both write the
 * identical stage change and audit activity. Returns whether anything was
 * staged — the sync counts on that to be idempotent.
 */
function stageMoveIntoMeeting(
  batch: ReturnType<typeof writeBatch>,
  lead: Lead & { id: string },
  actor: ActorContext,
): boolean {
  const leadType: LeadType = lead.leadType ?? "sales"
  if (!isBeforeMeetingStage(leadType, lead.stage)) return false
  const to = meetingStageFor(leadType)
  batch.update(doc(db, "leads", lead.id), { stage: to })
  stageActivity(batch, { id: lead.id, workspaceId: lead.workspaceId }, actor, {
    type: "stage_change",
    payload: { from: lead.stage, to, fromLabel: STAGE_LABELS[lead.stage], toLabel: STAGE_LABELS[to] },
  })
  return true
}

/**
 * Books a meeting and advances the lead into the meeting stage atomically.
 * `actor` is REQUIRED: a meeting must never again be created without its
 * stage following, which is how the funnel and the calendar drifted apart.
 */
export async function createAppointment(input: NewAppointment, actor: ActorContext): Promise<string> {
  const now = new Date().toISOString()
  const ref = doc(appointmentsCol)
  const batch = writeBatch(db)
  batch.set(ref, stripUndefined({ ...input, status: "scheduled" as AppointmentStatus, createdAt: now, updatedAt: now }))

  const leadSnap = await getDoc(doc(db, "leads", input.leadId))
  const lead = leadSnap.exists() ? ({ ...(leadSnap.data() as Lead), id: leadSnap.id }) : null
  if (lead && lead.workspaceId === input.workspaceId) stageMoveIntoMeeting(batch, lead, actor)
  await batch.commit()
  return ref.id
}

/**
 * RETROACTIVE sync for meetings that existed before booking started moving
 * the stage. Idempotent: it only ever advances a lead that is still BEFORE
 * its meeting stage, so a second run finds nothing to do; won, lost and
 * later stages are never touched. One batch per lead, each with its own
 * `stage_change` activity — the same write a booking performs.
 */
export async function syncExistingAppointments(
  workspaceId: string,
  actor: ActorContext,
): Promise<{ examined: number; moved: number }> {
  const snap = await getDocs(
    query(appointmentsCol, where("workspaceId", "==", workspaceId), where("status", "==", "scheduled")),
  )
  const leadIds = [...new Set(snap.docs.map((d) => (d.data() as Appointment).leadId))]
  let moved = 0
  for (const leadId of leadIds) {
    const leadSnap = await getDoc(doc(db, "leads", leadId))
    if (!leadSnap.exists()) continue
    const lead = { ...(leadSnap.data() as Lead), id: leadSnap.id }
    // Never across tenants, never a lead in the trash.
    if (lead.workspaceId !== workspaceId || lead.archived === true) continue
    const batch = writeBatch(db)
    if (!stageMoveIntoMeeting(batch, lead, actor)) continue
    await batch.commit()
    moved += 1
  }
  return { examined: leadIds.length, moved }
}

/** Reschedule or edit. `workspaceId`, `leadId` and `createdBy` never change. */
export async function updateAppointment(
  id: string,
  patch: Partial<Pick<Appointment, "scheduledAt" | "durationMinutes" | "type" | "notes" | "assignedToId">>
    // `undefined` means "leave the stored address alone"; `null` means
    // "remove it". Without that distinction stripUndefined would silently keep
    // the old address whenever somebody cleared the fields.
    & { location?: AppointmentLocation | null },
): Promise<void> {
  const { location, ...rest } = patch
  const payload: Record<string, FieldValue | string | number | AppointmentLocation> =
    stripUndefined({ ...rest, updatedAt: new Date().toISOString() })
  if (location !== undefined) {
    // deleteField() actually removes the key; writing empty strings would
    // leave a fake address behind that the Rules would still accept.
    payload.location = location === null ? deleteField() : location
  }
  await updateDoc(doc(appointmentsCol, id), payload)
}

/**
 * Completes, cancels or marks a no-show. A rescheduled meeting never comes
 * through here (`updateAppointment` keeps its status), so the lead stays in
 * the meeting stage with the new date. When the LAST active meeting of a lead
 * is cancelled or missed, the lead moves back to follow-up in the same batch
 * so a dead appointment cannot keep it in "Demostración agendada".
 */
export async function setAppointmentStatus(
  id: string,
  status: AppointmentStatus,
  actor?: ActorContext,
): Promise<void> {
  const now = new Date().toISOString()
  const batch = writeBatch(db)
  batch.update(doc(appointmentsCol, id), { status, updatedAt: now })

  if (actor && (status === "cancelled" || status === "no_show")) {
    const apptSnap = await getDoc(doc(appointmentsCol, id))
    const appt = apptSnap.exists() ? (apptSnap.data() as Appointment) : null
    if (appt) {
      const others = await getDocs(
        query(
          appointmentsCol,
          where("workspaceId", "==", appt.workspaceId),
          where("leadId", "==", appt.leadId),
          where("status", "==", "scheduled"),
        ),
      )
      const stillActive = others.docs.some((d) => d.id !== id)
      const leadSnap = await getDoc(doc(db, "leads", appt.leadId))
      const lead = leadSnap.exists() ? (leadSnap.data() as Lead) : null
      const leadType: LeadType = lead?.leadType ?? appt.leadType
      if (lead && !stillActive && lead.stage === meetingStageFor(leadType)) {
        const to = followUpStageFor(leadType)
        batch.update(doc(db, "leads", appt.leadId), { stage: to })
        stageActivity(batch, { id: appt.leadId, workspaceId: appt.workspaceId }, actor, {
          type: "stage_change",
          payload: { from: lead.stage, to, fromLabel: STAGE_LABELS[lead.stage], toLabel: STAGE_LABELS[to] },
        })
      }
    }
  }
  await batch.commit()
}

/**
 * Live appointments the caller is allowed to see. A sales_rep query is pinned
 * to their own `assignedToId`, matching the Rules: an unfiltered list from a
 * rep would be denied by Firestore.
 */
export function useAppointments() {
  const { workspaceId, isSuperAdmin, role, membership, status } = useWorkspace()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const ownOnly = role === "sales_rep"
  const ownUserId = membership?.userId ?? null

  useEffect(() => {
    if (status !== "ready") return
    if (!workspaceId && !isSuperAdmin) {
      setAppointments([])
      setLoading(false)
      return
    }
    if (ownOnly && !ownUserId) {
      setAppointments([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    const filters = [
      ...(workspaceId ? [where("workspaceId", "==", workspaceId)] : []),
      ...(ownOnly && ownUserId ? [where("assignedToId", "==", ownUserId)] : []),
    ]
    const q: Query<DocumentData> = filters.length > 0 ? query(appointmentsCol, ...filters) : query(appointmentsCol)

    const unsub = onSnapshot(
      q,
      (snap) => {
        setAppointments(sortForAgenda(snap.docs.map((d) => ({ ...(d.data() as Appointment), id: d.id }))))
        setLoading(false)
      },
      (err) => {
        console.error("[firestore] appointments subscription failed:", err)
        setError(err)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [workspaceId, isSuperAdmin, status, ownOnly, ownUserId])

  return { appointments, loading, error }
}

/**
 * Appointments of one lead, for the detail sheet.
 *
 * Security Rules are NOT filters: a query has to be narrow enough that every
 * document it could return is already permitted, or Firestore denies the whole
 * thing. So this is scoped by the LEAD's real `workspaceId` (not the sidebar's,
 * which may differ for a super admin) and, for a sales_rep, by their own
 * `assignedToId` — exactly the shape the Rules allow.
 */
export function useLeadAppointments(leadId: string | null, workspaceId: string | null) {
  const { status, role, membership } = useWorkspace()
  const [appointments, setAppointments] = useState<Appointment[]>([])
  const [loading, setLoading] = useState(Boolean(leadId))
  const ownOnly = role === "sales_rep"
  const ownUserId = membership?.userId ?? null

  useEffect(() => {
    // Without a workspace the query cannot be scoped, so it is not issued.
    if (status !== "ready" || !leadId || !workspaceId || (ownOnly && !ownUserId)) {
      setAppointments([])
      setLoading(false)
      return
    }
    setLoading(true)
    const filters = [
      where("leadId", "==", leadId),
      where("workspaceId", "==", workspaceId),
      ...(ownOnly && ownUserId ? [where("assignedToId", "==", ownUserId)] : []),
    ]
    const unsub = onSnapshot(
      query(appointmentsCol, ...filters),
      (snap) => {
        setAppointments(sortForAgenda(snap.docs.map((d) => ({ ...(d.data() as Appointment), id: d.id }))))
        setLoading(false)
      },
      (err) => {
        console.error("[firestore] lead appointments failed:", err)
        setAppointments([])
        setLoading(false)
      },
    )
    return () => unsub()
  }, [leadId, workspaceId, status, ownOnly, ownUserId])

  return { appointments, loading }
}

/* ------------------------------------------ booking, via the server route */

/**
 * Books through the authenticated server route.
 *
 * The client batch had to satisfy three rule blocks at once and trusted
 * `workspaceId`, `leadName`, `leadType`, `createdBy` and `actorRole` as sent.
 * The route derives all of those from the lead and the membership, and writes
 * the appointment, the stage change and the audit activity in one
 * transaction.
 */
export async function bookAppointment(input: {
  leadId: string
  scheduledAt: string
  durationMinutes: number
  type: AppointmentType
  notes?: string
  location?: AppointmentLocation
  assignedToId?: string
}): Promise<{ appointmentId: string; stageMoved: boolean }> {
  const { auth } = await import("./client")
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new MutationError("unauthenticated")
  const res = await fetch("/api/appointments", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  })
  const parsed = (await res.json().catch(() => ({}))) as {
    error?: string
    operationId?: string
    appointmentId?: string
    stageMoved?: boolean
  }
  if (!res.ok) throw new MutationError(parsed.error ?? "internal", parsed.operationId)
  return { appointmentId: parsed.appointmentId ?? "", stageMoved: parsed.stageMoved === true }
}
