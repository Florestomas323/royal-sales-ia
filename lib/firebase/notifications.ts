"use client"

import { useEffect, useState } from "react"
import { collection, doc, onSnapshot, query, where, writeBatch } from "firebase/firestore"
import { db } from "./client"
import { NOTIFICATIONS, notificationsQueryKey, selectNotifications, sortNotifications } from "@/lib/notifications"
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
  /**
   * The documents are stored together with the query they came from, and what
   * the hook exposes is DERIVED from comparing that key with the one being
   * asked for right now. Clearing state inside the effect was not enough: an
   * effect runs after the render, so a workspace switch still had one render
   * exposing the previous listener's items with loading already false.
   */
  const key = notificationsQueryKey(input)
  const [loaded, setLoaded] = useState<{ key: string; items: AppNotification[] }>({ key: "", items: [] })
  const [failure, setFailure] = useState<{ key: string; error: Error } | null>(null)

  useEffect(() => {
    const filters = input.isSuperAdmin
      ? (input.workspaceId ? [where("workspaceId", "==", input.workspaceId)] : [])
      : input.userId ? [where("userId", "==", input.userId)] : null
    // Nothing to listen to (no identity yet): that IS the answer for this key.
    if (!filters) {
      setLoaded({ key, items: [] })
      return
    }
    return onSnapshot(
      query(col, ...filters),
      (snap) => {
        setLoaded({
          key,
          items: sortNotifications(snap.docs.map((d) => ({ ...(d.data() as Omit<AppNotification, "id">), id: d.id }))),
        })
        setFailure(null)
      },
      // A failed query answers the key too: empty, with the error surfaced —
      // never the previous query's documents.
      (err) => { setFailure({ key, error: err }); setLoaded({ key, items: [] }) },
    )
  }, [key, input.userId, input.isSuperAdmin, input.workspaceId])

  const { items, loading } = selectNotifications(loaded, key)
  return { items, loading, error: failure?.key === key ? failure.error : null }
}

/**
 * Marks a logical notification read — EVERY historical copy of it.
 *
 * Before the deterministic id existed, one event could produce several
 * documents. Marking only the one on screen would leave a twin unread and the
 * badge lit with nothing left to open, so all the ids behind the row are
 * updated together.
 */
export async function markNotificationRead(id: string | string[]): Promise<void> {
  const ids = [...new Set(Array.isArray(id) ? id : [id])]
  if (ids.length === 0) return
  const now = new Date().toISOString()
  const batch = writeBatch(db)
  for (const one of ids) batch.update(doc(col, one), { read: true, readAt: now })
  await batch.commit()
}

/**
 * "Marcar todas como leídas". Accepts logical rows, so every historical copy
 * behind an unread row is updated — not just the one that was displayed.
 */
export async function markAllNotificationsRead(
  items: (Pick<AppNotification, "id" | "read"> & { copies?: string[] })[],
): Promise<void> {
  const ids = [...new Set(items.filter((n) => !n.read).flatMap((n) => n.copies ?? [n.id]))]
  if (ids.length === 0) return
  const now = new Date().toISOString()
  const batch = writeBatch(db)
  for (const id of ids) batch.update(doc(col, id), { read: true, readAt: now })
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

/* ------------------------------------------------ super admin read receipts */

/**
 * A super admin cannot write on other people's notifications (the Rule only
 * allows it on your own), so their read state lives in a server-side receipt
 * collection reachable through /api/notifications/receipts. These two helpers
 * are the only client access to it.
 *
 * Both fail soft: a receipt that cannot be fetched or stored leaves the event
 * showing as unread, which is visible and harmless.
 */
/** Same pattern the email helper uses: the person's Firebase ID token. */
async function authHeader(): Promise<Record<string, string>> {
  const { auth } = await import("./client")
  const token = await auth.currentUser?.getIdToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function fetchReadReceipts(): Promise<Set<string>> {
  try {
    const res = await fetch("/api/notifications/receipts", {
      headers: await authHeader(),
      cache: "no-store",
    })
    const body = (await res.json().catch(() => ({}))) as { keys?: string[] }
    return new Set(body.keys ?? [])
  } catch {
    return new Set()
  }
}

export async function markReadReceipts(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const res = await fetch("/api/notifications/receipts", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ keys }),
  })
  if (!res.ok) throw new Error(`receipts_failed_${res.status}`)
}
