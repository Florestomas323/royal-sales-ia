"use client"

import { useEffect, useState } from "react"
import { collection, doc, onSnapshot, query, where, writeBatch } from "firebase/firestore"
import { db } from "./client"
import { NOTIFICATIONS, sortNotifications } from "@/lib/notifications"
import type { AppNotification } from "@/types"

const col = collection(db, NOTIFICATIONS)

/**
 * Live notifications for the signed-in person.
 *
 * A member queries their own (`userId == me`), which is exactly what the
 * Rules allow. The super admin holds no notification documents: they read
 * every workspace's, optionally narrowed to the active one. Sorted here so
 * no composite index is needed.
 */
export function useNotifications(input: {
  userId: string | null
  isSuperAdmin: boolean
  workspaceId: string | null
}) {
  const [items, setItems] = useState<AppNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const filters = input.isSuperAdmin
      ? (input.workspaceId ? [where("workspaceId", "==", input.workspaceId)] : [])
      : input.userId ? [where("userId", "==", input.userId)] : null
    if (!filters) {
      setItems([]); setLoading(false)
      return
    }
    setLoading(true)
    return onSnapshot(
      query(col, ...filters),
      (snap) => {
        setItems(sortNotifications(snap.docs.map((d) => ({ ...(d.data() as Omit<AppNotification, "id">), id: d.id }))))
        setLoading(false); setError(null)
      },
      (err) => { setError(err); setLoading(false) },
    )
  }, [input.userId, input.isSuperAdmin, input.workspaceId])

  return { items, loading, error }
}

export async function markNotificationRead(id: string): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(col, id), { read: true, readAt: new Date().toISOString() })
  await batch.commit()
}

export async function markAllNotificationsRead(items: Pick<AppNotification, "id" | "read">[]): Promise<void> {
  const unread = items.filter((n) => !n.read)
  if (unread.length === 0) return
  const now = new Date().toISOString()
  const batch = writeBatch(db)
  for (const n of unread) batch.update(doc(col, n.id), { read: true, readAt: now })
  await batch.commit()
}

/**
 * Asks the server to send the "new lead" email for a lead this person just
 * created. Fire-and-forget: errors are logged, never surfaced as a failure of
 * the creation itself.
 */
export async function sendNewLeadEmail(leadId: string): Promise<void> {
  try {
    const { auth } = await import("./client")
    const token = await auth.currentUser?.getIdToken()
    if (!token) return
    await fetch("/api/notifications/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ leadId }),
    })
  } catch (err) {
    console.warn("[notifications] email request failed", err)
  }
}
