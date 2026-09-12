"use client"

import { useEffect, useState } from "react"
import { collection, onSnapshot, query, where } from "firebase/firestore"
import { db } from "./client"
import { FUNNEL_EVENTS } from "@/lib/funnel-events"
import type { FunnelEvent } from "@/types"

/**
 * Funnel events of ONE workspace, live.
 *
 * A single equality filter on `workspaceId` — the same shape the Rules allow —
 * so no composite index is needed and no other distributor's sessions can
 * arrive. Without a workspace selected nothing is queried at all, which keeps
 * a super admin from pulling every workspace's events by accident.
 */
export function useFunnelEvents(workspaceId: string | null) {
  const [events, setEvents] = useState<FunnelEvent[]>([])
  const [loading, setLoading] = useState(Boolean(workspaceId))
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!workspaceId) {
      setEvents([]); setLoading(false)
      return
    }
    setLoading(true)
    return onSnapshot(
      query(collection(db, FUNNEL_EVENTS), where("workspaceId", "==", workspaceId)),
      (snap) => {
        setEvents(snap.docs.map((d) => ({ ...(d.data() as Omit<FunnelEvent, "id">), id: d.id })))
        setLoading(false); setError(null)
      },
      (err) => { setError(err); setLoading(false) },
    )
  }, [workspaceId])

  return { events, loading, error }
}
