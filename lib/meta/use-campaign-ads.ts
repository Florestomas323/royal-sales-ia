"use client"

import { useCallback, useEffect, useState } from "react"
import { onAuthStateChanged } from "firebase/auth"
import { auth } from "@/lib/firebase/client"
import type { CampaignAd } from "@/lib/meta/ads"

type CampaignAdsErrorCode =
  | "no_ad_account"
  | "not_linked"
  | "graph_error"
  | "forbidden"

interface CampaignAdsResponse {
  ok: boolean
  ads: CampaignAd[]
  errorCode?: CampaignAdsErrorCode
  message?: string
}

export interface CampaignAdsState {
  ads: CampaignAd[]
  loading: boolean
  errorCode: CampaignAdsErrorCode | null
  reload: () => void
}

/**
 * Ads of one Meta campaign, fetched through the server route.
 * Waits for Firebase Auth to finish hydrating before calling the API.
 */
export function useCampaignAds(metaCampaignId: string | null): CampaignAdsState {
  const [ads, setAds] = useState<CampaignAd[]>([])
  const [loading, setLoading] = useState(Boolean(metaCampaignId))
  const [errorCode, setErrorCode] = useState<CampaignAdsErrorCode | null>(null)
  const [nonce, setNonce] = useState(0)

  const reload = useCallback(() => setNonce((n) => n + 1), [])

  useEffect(() => {
    if (!metaCampaignId) {
      setAds([])
      setLoading(false)
      setErrorCode(null)
      return
    }

    let cancelled = false
    let requestStarted = false

    setLoading(true)
    setErrorCode(null)

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (cancelled || requestStarted) return

      if (!user) {
        setAds([])
        setErrorCode("forbidden")
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

        const body = (await res.json().catch(() => ({}))) as CampaignAdsResponse
        if (cancelled) return

        setAds(body.ads ?? [])
        setErrorCode(body.ok ? null : (body.errorCode ?? "graph_error"))
      } catch {
        if (!cancelled) {
          setAds([])
          setErrorCode("graph_error")
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

  return { ads, loading, errorCode, reload }
}
