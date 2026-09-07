"use client"

import { useEffect, useState } from "react"
import {
  addDoc, collection, doc, onSnapshot, query, updateDoc, where,
  type DocumentData, type Query,
} from "firebase/firestore"
import { db } from "./client"
import { useWorkspace } from "./workspace-context"
import { sortForAgenda } from "@/lib/appointments"
import type { Appointment, AppointmentStatus, AppointmentType, LeadType } from "@/types"

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
  createdBy: string
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

export async function createAppointment(input: NewAppointment): Promise<string> {
  const now = new Date().toISOString()
  const ref = await addDoc(
    appointmentsCol,
    stripUndefined({ ...input, status: "scheduled" as AppointmentStatus, createdAt: now, updatedAt: now }),
  )
  return ref.id
}

/** Reschedule or edit. `workspaceId`, `leadId` and `createdBy` never change. */
export async function updateAppointment(
  id: string,
  patch: Partial<Pick<Appointment, "scheduledAt" | "durationMinutes" | "type" | "notes" | "assignedToId">>,
): Promise<void> {
  await updateDoc(doc(appointmentsCol, id), stripUndefined({ ...patch, updatedAt: new Date().toISOString() }))
}

export async function setAppointmentStatus(id: string, status: AppointmentStatus): Promise<void> {
  await updateDoc(doc(appointmentsCol, id), { status, updatedAt: new Date().toISOString() })
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
