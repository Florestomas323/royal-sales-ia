"use client"

import { useCallback, useEffect, useState } from "react"
import { onAuthStateChanged } from "firebase/auth"
import { auth } from "@/lib/firebase/client"
import type { CampaignAd, CampaignAdsErrorCode } from "@/lib/meta/ads"

/** Mirrors what /api/meta/campaign-ads returns. Declared here so client code
 * never imports types from a server route. */
interface CampaignAdsBody {
  ok: boolean
  ads?: CampaignAd[]
  errorCode?: CampaignAdsErrorCode
  detail?: string
}

export interface CampaignAdsState {
  ads: CampaignAd[]
  loading: boolean
  errorCode: CampaignAdsErrorCode | null
  detail: string | null
  reload: () => void
}

/**
 * Ads of one Meta campaign, fetched through the server route.
 *
 * Important: Firebase Auth hydrates asynchronously in the browser. Reading
 * auth.currentUser immediately can return null even for a signed-in user,
 * which prevents the request from ever reaching /api/meta/campaign-ads.
 * We wait for onAuthStateChanged before requesting the Firebase ID token.
 */
export function useCampaignAds(metaCampaignId: string | null): CampaignAdsState {
  const [ads, setAds] = useState<CampaignAd[]>([])
  const [loading, setLoading] = useState(Boolean(metaCampaignId))
  const [errorCode, setErrorCode] = useState<CampaignAdsErrorCode | null>(null)
  const [detail, setDetail] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!metaCampaignId) {
      setAds([])
      setLoading(false)
      setErrorCode(null)
      setDetail(null)
      return
    }

    let cancelled = false
    let requestStarted = false

    setLoading(true)
    setErrorCode(null)
    setDetail(null)

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (cancelled || requestStarted) return

      if (!user) {
        setAds([])
        setErrorCode("forbidden")
        setDetail("Firebase Auth no encontró una sesión activa.")
        setLoading(false)
        return
      }

      requestStarted = true

      try {
        const token = await user.getIdToken()

        const res = await fetch(
          `/api/meta/campaign-ads?metaCampaignId=${encodeURIComponent(metaCampaignId)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
          },
        )

        const body = (await res.json().catch(() => ({}))) as CampaignAdsBody
        if (cancelled) return

        setAds(body.ads ?? [])
        setErrorCode(body.ok ? null : (body.errorCode ?? "meta_graph_error"))
        setDetail(body.detail ?? null)
      } catch (err) {
        if (!cancelled) {
          setAds([])
          setErrorCode("meta_graph_error")
          setDetail(
            err instanceof Error
              ? `client_fetch_error: ${err.message}`
              : "client_fetch_error",
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [metaCampaignId, nonce])

  return { ads, loading, errorCode, detail, reload }
}
