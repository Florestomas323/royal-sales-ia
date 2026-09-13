"use client"

import { useEffect, useState } from "react"
import { onAuthStateChanged } from "firebase/auth"
import { auth } from "@/lib/firebase/client"
import type { CampaignAdsErrorCode } from "@/lib/meta/ads"
import type { AdPreview } from "@/lib/meta/creative"

/** Mirrors /api/meta/ad-preview. Declared here so no client module imports a route file. */
interface AdPreviewBody {
  ok: boolean
  preview?: AdPreview | null
  errorCode?: CampaignAdsErrorCode
  detail?: string
}

export interface AdPreviewState {
  preview: AdPreview | null
  loading: boolean
  errorCode: CampaignAdsErrorCode | null
  detail: string | null
}

/**
 * Creative of one ad, fetched only while the preview is open (`enabled`).
 *
 * Same auth pattern as useCampaignAds: wait for Firebase Auth to hydrate,
 * then send the person's ID token. The Meta token stays on the server.
 */
export function useAdPreview(
  input: { adId: string; metaCampaignId: string } | null,
  enabled: boolean,
): AdPreviewState {
  const [state, setState] = useState<AdPreviewState>({ preview: null, loading: false, errorCode: null, detail: null })

  useEffect(() => {
    if (!enabled || !input) {
      setState({ preview: null, loading: false, errorCode: null, detail: null })
      return
    }
    let cancelled = false
    let started = false
    setState({ preview: null, loading: true, errorCode: null, detail: null })

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (cancelled || started) return
      if (!user) {
        setState({ preview: null, loading: false, errorCode: "forbidden", detail: "Firebase Auth no encontró una sesión activa." })
        return
      }
      started = true
      try {
        const token = await user.getIdToken()
        const res = await fetch(
          `/api/meta/ad-preview?adId=${encodeURIComponent(input.adId)}&metaCampaignId=${encodeURIComponent(input.metaCampaignId)}`,
          { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
        )
        const body = (await res.json().catch(() => ({}))) as AdPreviewBody
        if (cancelled) return
        setState({
          preview: body.ok ? (body.preview ?? null) : null,
          loading: false,
          errorCode: body.ok ? null : (body.errorCode ?? "meta_graph_error"),
          detail: body.detail ?? null,
        })
      } catch {
        if (!cancelled) setState({ preview: null, loading: false, errorCode: "meta_graph_error", detail: null })
      }
    })

    return () => { cancelled = true; unsubscribe() }
  }, [enabled, input?.adId, input?.metaCampaignId])

  return state
}
