"use client"

import { useEffect, useState } from "react"
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type DocumentData,
  type WriteBatch,
} from "firebase/firestore"
import { db } from "./client"
import type { Activity, ActivityPayload, ActivityType, Lead, UserRole } from "@/types"

/**
 * Immutable audit trail at `leads/{leadId}/activities/{activityId}`.
 *
 * An activity is NEVER written on its own (except `note`): it always travels
 * in the same `writeBatch` as the change it describes, so either both land or
 * neither does. Security Rules re-check the transition server-side, comparing
 * the lead before (`get`) and after (`getAfter`) the batch.
 *
 * `actorId` must be the caller's `users.id`; the actor's NAME is not stored —
 * it is resolved when rendering.
 */

export const ACTIVITIES_SUBCOLLECTION = "activities"

export function activitiesCollection(leadId: string) {
  return collection(db, "leads", leadId, ACTIVITIES_SUBCOLLECTION)
}

/**
 * Identity of whoever performs the action. Only `userId` (= `users.id`, from
 * `memberships/{uid}.userId`) is needed: the activity's workspace always comes
 * from the LEAD, never from the caller's active workspace.
 */
export interface ActorContext {
  userId: string
  /** Real role from `memberships/{uid}`. Rules reject any other value. */
  role: UserRole
}

export interface NewActivity {
  type: ActivityType
  payload?: ActivityPayload
}

function cleanPayload(payload?: ActivityPayload): ActivityPayload | undefined {
  if (!payload) return undefined
  const entries = Object.entries(payload).filter(([, v]) => v !== undefined && v !== null)
  return entries.length > 0 ? (Object.fromEntries(entries) as ActivityPayload) : undefined
}

/**
 * Adds the activity document to an existing batch. The caller is responsible
 * for adding the lead mutation to the SAME batch.
 */
export function stageActivity(
  batch: WriteBatch,
  lead: Pick<Lead, "id" | "workspaceId">,
  actor: ActorContext,
  activity: NewActivity,
): void {
  const ref = doc(activitiesCollection(lead.id))
  const payload = cleanPayload(activity.payload)
  const data: DocumentData = {
    // workspaceId comes from the LEAD, never from the browser's active workspace.
    workspaceId: lead.workspaceId,
    leadId: lead.id,
    type: activity.type,
    actorId: actor.userId,
    // Snapshot of the caller's real role; Rules check it against role().
    actorRole: actor.role,
    createdAt: new Date().toISOString(),
    createdAtServer: serverTimestamp(),
    ...(payload ? { payload } : {}),
  }
  batch.set(ref, data)
}

/** Convenience for the only activity that does not modify the lead. */
export async function addNote(
  lead: Pick<Lead, "id" | "workspaceId">,
  actor: ActorContext,
  note: string,
): Promise<void> {
  const text = note.trim()
  if (!text) throw new Error("empty_note")
  const batch = writeBatch(db)
  stageActivity(batch, lead, actor, { type: "note", payload: { note: text } })
  await batch.commit()
}

/**
 * Live history of one lead, newest first.
 *
 * Ordered by `createdAtServer` — the server-signed timestamp — so the browser
 * clock cannot alter the audit order. Single field: no composite index needed.
 * Documents whose server timestamp has not resolved yet (optimistic local
 * snapshot) sort last in Firestore; the UI falls back to `createdAt` for the
 * label until it resolves.
 */
export function useLeadActivities(leadId: string | null, max = 100) {
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(Boolean(leadId))
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!leadId) {
      setActivities([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const q = query(activitiesCollection(leadId), orderBy("createdAtServer", "desc"), limit(max))
    const unsub = onSnapshot(
      q,
      (snap) => {
        setActivities(snap.docs.map((d) => ({ ...(d.data() as Activity), id: d.id })))
        setLoading(false)
      },
      (err) => {
        console.error("[firestore] activities subscription failed:", err)
        setError(err)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [leadId, max])

  return { activities, loading, error }
}

/** Millis for display/ordering: server value wins, ISO is the fallback. */
export function activityTime(activity: Pick<Activity, "createdAt" | "createdAtServer">): number {
  const server = activity.createdAtServer
  if (server && typeof server.toDate === "function") return server.toDate().getTime()
  const parsed = Date.parse(activity.createdAt)
  return Number.isFinite(parsed) ? parsed : 0
}

/** Defensive re-sort: pending server timestamps must not jump the queue. */
export function sortActivities(activities: Activity[]): Activity[] {
  return [...activities].sort((a, b) => activityTime(b) - activityTime(a))
}
