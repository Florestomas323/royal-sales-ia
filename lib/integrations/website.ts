"use client"

import { useCallback, useEffect, useState } from "react"
import { doc, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase/client"
import { auth } from "@/lib/firebase/client"
import type { ConnectionStatus, WebsiteIntegration } from "@/types"

/** What the client may see: everything but the key hash. */
export type WebsiteIntegrationView = Omit<WebsiteIntegration, "keyHash">

export interface WebsiteIntegrationState {
  status: ConnectionStatus
  integration: WebsiteIntegrationView | null
  loading: boolean
  error: string | null
}

/**
 * Live view of `websiteIntegrations/{workspaceId}`. Read-only from the
 * browser by design — Rules deny client writes — so every change goes
 * through the authenticated API route below.
 */
export function useWebsiteIntegration(workspaceId: string | null): WebsiteIntegrationState {
  const [state, setState] = useState<WebsiteIntegrationState>({
    status: "not_connected", integration: null, loading: Boolean(workspaceId), error: null,
  })

  useEffect(() => {
    if (!workspaceId) {
      setState({ status: "not_connected", integration: null, loading: false, error: null })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    return onSnapshot(
      doc(db, "websiteIntegrations", workspaceId),
      (snap) => {
        if (!snap.exists()) {
          setState({ status: "not_connected", integration: null, loading: false, error: null })
          return
        }
        const { keyHash: _hash, ...view } = snap.data() as WebsiteIntegration
        setState({
          status: view.status === "connected" ? "connected" : "not_connected",
          integration: view,
          loading: false,
          error: null,
        })
      },
      (err) => setState({ status: "error", integration: null, loading: false, error: err.message }),
    )
  }, [workspaceId])

  return state
}

export type WebsiteAction = "save" | "rotate" | "enable" | "disable"

/**
 * Calls the management route with the signed-in person's ID token. The
 * server re-checks their membership before touching anything; the client
 * never writes the collection itself.
 */
export function useWebsiteIntegrationActions(workspaceId: string | null) {
  const [busy, setBusy] = useState(false)

  const run = useCallback(
    async (action: WebsiteAction, domain?: string): Promise<{ plainKey: string | null }> => {
      if (!workspaceId) throw new Error("missing_workspace")
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error("not_signed_in")
      setBusy(true)
      try {
        const res = await fetch("/api/website/integration", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ workspaceId, action, ...(domain !== undefined ? { domain } : {}) }),
        })
        const body = (await res.json().catch(() => ({}))) as { error?: string; plainKey?: string | null }
        if (!res.ok) throw new Error(body.error ?? `http_${res.status}`)
        return { plainKey: body.plainKey ?? null }
      } finally {
        setBusy(false)
      }
    },
    [workspaceId],
  )

  return { run, busy }
}
