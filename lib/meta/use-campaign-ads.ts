"use client"

import { useCallback, useEffect, useState } from "react"
import { auth } from "@/lib/firebase/client"
import type { CampaignAd, CampaignAdsErrorCode } from "@/lib/meta/ads"

/** Mirrors what /api/meta/campaign-ads returns. Declared here so no client
 *  module has to import from a server route file. */
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
  /** Safe technical detail from Meta, for the diagnostic message. */
  detail: string | null
  reload: () => void
}

/**
 * Ads of one Meta campaign, fetched through the server route.
 *
 * The browser never sees a Meta token: it sends the person's Firebase ID
 * token and the server does the Graph call. One request per campaign, run
 * once per mount — not on every render — and a failure leaves `ads` empty
 * instead of throwing, so a Meta outage cannot take the page down.
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
      setAds([]); setLoading(false); setErrorCode(null); setDetail(null)
      return
    }
    let cancelled = false
    setLoading(true); setErrorCode(null); setDetail(null)
    ;(async () => {
      try {
        const token = await auth.currentUser?.getIdToken()
        if (!token) throw new Error("not_signed_in")
        const res = await fetch(
          `/api/meta/campaign-ads?metaCampaignId=${encodeURIComponent(metaCampaignId)}`,
          { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
        )
        const body = (await res.json().catch(() => ({}))) as CampaignAdsBody
        if (cancelled) return
        setAds(body.ads ?? [])
        setErrorCode(body.ok ? null : (body.errorCode ?? "meta_graph_error"))
        setDetail(body.detail ?? null)
      } catch {
        if (!cancelled) { setAds([]); setErrorCode("meta_graph_error") }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [metaCampaignId, nonce])

  return { ads, loading, errorCode, detail, reload }
}
