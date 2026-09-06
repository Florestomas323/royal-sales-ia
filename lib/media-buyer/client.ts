"use client"

import { useCallback, useEffect, useState } from "react"
import { auth } from "@/lib/firebase/client"
import type { InsightsResponse } from "@/app/api/meta/insights/route"
import type { InsightsPeriod } from "@/lib/meta/insights"

/**
 * Client side of Media Buyer IA. The browser never talks to Meta: it asks
 * /api/meta/insights with the person's Firebase ID token, and the server
 * decides which workspace(s) and campaigns they may see.
 */
export interface MediaBuyerState {
  data: InsightsResponse | null
  loading: boolean
  /** User-facing message when the request itself failed. */
  error: string | null
  refresh: () => Promise<void>
}

function messageFor(code: string): string {
  switch (code) {
    case "forbidden":
      return "Tu rol no tiene acceso al análisis de Meta Ads."
    case "no_workspace":
      return "Tu cuenta no está asignada a ningún workspace."
    case "missing_token":
    case "invalid_token":
    case "not_signed_in":
      return "Tu sesión no es válida. Vuelve a iniciar sesión."
    default:
      return "No se pudieron cargar los datos de Meta. Inténtalo de nuevo."
  }
}

export function useMediaBuyer(workspaceId: string | null, period: InsightsPeriod, isSuperAdmin: boolean): MediaBuyerState {
  const [data, setData] = useState<InsightsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const user = auth.currentUser
      if (!user) throw new Error("not_signed_in")
      const token = await user.getIdToken()
      // Super admin with no workspace selected = every authorised workspace.
      const scope = workspaceId ?? (isSuperAdmin ? "all" : "")
      const res = await fetch(
        `/api/meta/insights?workspaceId=${encodeURIComponent(scope)}&period=${encodeURIComponent(period)}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      )
      if (!res.ok) {
        let code = `http_${res.status}`
        try {
          code = ((await res.json()) as { error?: string }).error ?? code
        } catch {
          // keep http code
        }
        throw new Error(code)
      }
      setData((await res.json()) as InsightsResponse)
    } catch (err) {
      console.error("[media-buyer] insights failed:", err instanceof Error ? err.message : "unknown")
      setData(null)
      setError(messageFor(err instanceof Error ? err.message : ""))
    } finally {
      setLoading(false)
    }
  }, [workspaceId, period, isSuperAdmin])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}
