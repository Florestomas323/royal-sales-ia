"use client"

import { useCallback, useEffect, useState } from "react"
import { auth } from "@/lib/firebase/client"
import type { MetaStatusResponse } from "@/lib/meta/api-response"
import type { ConnectionStatus, MetaConnection } from "@/types"

/**
 * Meta connection state for a workspace, read through the server
 * (/api/meta/status). The browser never touches Meta nor the token: the
 * server validates META_ACCESS_TOKEN and returns only status + asset names.
 */
export interface MetaConnectionState {
  status: ConnectionStatus
  connection: MetaConnection | null
  loading: boolean
  /** User-facing error (Spanish) from the last check, if any. */
  error: string | null
  warnings: string[]
  refresh: () => Promise<void>
}

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser
  if (!user) throw new Error("not_signed_in")
  const token = await user.getIdToken()
  return { Authorization: `Bearer ${token}` }
}

async function parse(res: Response): Promise<MetaStatusResponse> {
  if (!res.ok) {
    let code = `http_${res.status}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) code = body.error
    } catch {
      // keep http code
    }
    throw new Error(code)
  }
  return (await res.json()) as MetaStatusResponse
}

const GENERIC_ERROR = "No se pudo consultar Meta. Inténtalo de nuevo."

function messageFor(err: unknown): string {
  const code = err instanceof Error ? err.message : ""
  switch (code) {
    case "forbidden":
      return "No tienes permiso para ver la integración de este workspace."
    case "no_membership":
    case "missing_token":
    case "invalid_token":
    case "not_signed_in":
      return "Tu sesión no es válida. Vuelve a iniciar sesión."
    default:
      return GENERIC_ERROR
  }
}

export function useMetaConnection(workspaceId: string | null): MetaConnectionState {
  const [state, setState] = useState<Omit<MetaConnectionState, "refresh">>({
    status: "not_connected",
    connection: null,
    loading: Boolean(workspaceId),
    error: null,
    warnings: [],
  })

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setState({ status: "not_connected", connection: null, loading: false, error: null, warnings: [] })
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const res = await fetch(`/api/meta/status?workspaceId=${encodeURIComponent(workspaceId)}`, {
        headers: await authHeaders(),
        cache: "no-store",
      })
      const body = await parse(res)
      setState({
        status: body.connection?.status ?? (body.connected ? "connected" : "not_connected"),
        connection: body.connection,
        loading: false,
        error: body.message,
        warnings: body.warnings,
      })
    } catch (err) {
      console.error("[meta] status failed:", err instanceof Error ? err.message : "unknown")
      setState({ status: "error", connection: null, loading: false, error: messageFor(err), warnings: [] })
    }
  }, [workspaceId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { ...state, refresh }
}

/**
 * Manual "Sincronizar Meta": the server re-reads Meta and persists the
 * result for the workspace. Optionally sets the preferred ad account / page.
 */
export async function syncMetaConnection(
  workspaceId: string,
  selection: { adAccountId?: string | null; pageId?: string | null } = {},
): Promise<MetaStatusResponse> {
  try {
    const res = await fetch("/api/meta/sync", {
      method: "POST",
      headers: { ...(await authHeaders()), "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceId, ...selection }),
    })
    return await parse(res)
  } catch (err) {
    throw new Error(messageFor(err))
  }
}
