import { NextResponse } from "next/server"
import { getAdminDb, isAdminNotConfigured } from "@/lib/firebase/admin"
import { authenticateRequest, canAccessWorkspace } from "@/lib/firebase/server-auth"
import { getCampaignLink } from "@/lib/meta/campaign-links"
import { readMetaConnection } from "@/lib/meta/connection-store"
import { getCampaignAds } from "@/lib/meta/graph"
import { normalizeAd, type CampaignAd } from "@/lib/meta/ads"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export interface CampaignAdsResponse {
  ok: boolean
  ads: CampaignAd[]
  errorCode?: "no_ad_account" | "not_linked" | "graph_error" | "forbidden"
  message?: string
}

/**
 * Ads of ONE Meta campaign, read live from the Graph API.
 *
 * Server-only by necessity: the access token lives in the server environment
 * and never reaches the browser. Isolation is enforced twice — the caller must
 * have access to the workspace, AND the campaign must be linked to that same
 * workspace — so knowing a Meta campaign id is not enough to read another
 * distributor's ads.
 *
 * Reuses the existing integration: same token, same ad account selected in
 * Administrar Meta, same link records. No parallel integration.
 */
export async function GET(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const url = new URL(request.url)
  const metaCampaignId = url.searchParams.get("metaCampaignId")?.trim() ?? ""
  if (!metaCampaignId) return NextResponse.json({ error: "missing_campaign" }, { status: 400 })

  try {
    const db = getAdminDb()
    const link = await getCampaignLink(db, metaCampaignId)
    if (!link || !link.active) {
      const body: CampaignAdsResponse = {
        ok: false, ads: [], errorCode: "not_linked",
        message: "Esta campaña no está asignada a ningún workspace.",
      }
      return NextResponse.json(body)
    }
    // The campaign's OWN workspace decides, never one the caller supplies.
    if (!canAccessWorkspace(auth.user, link.workspaceId, false)) {
      const body: CampaignAdsResponse = { ok: false, ads: [], errorCode: "forbidden" }
      return NextResponse.json(body, { status: 403 })
    }

    const conn = await readMetaConnection(db, link.workspaceId)
    if (!conn?.adAccount?.id) {
      const body: CampaignAdsResponse = {
        ok: false, ads: [], errorCode: "no_ad_account",
        message: "Este workspace no tiene cuenta publicitaria seleccionada en Administrar Meta.",
      }
      return NextResponse.json(body)
    }

    const result = await getCampaignAds(metaCampaignId)
    if (!result.ok) {
      console.error("[meta/campaign-ads] graph failed", JSON.stringify({ kind: result.kind, campaignId: metaCampaignId }))
      const body: CampaignAdsResponse = {
        ok: false, ads: [], errorCode: "graph_error",
        message: "No pudimos cargar los anuncios desde Meta.",
      }
      return NextResponse.json(body)
    }

    const ads = (result.data.data ?? []).map(normalizeAd)
    const body: CampaignAdsResponse = { ok: true, ads }
    return NextResponse.json(body)
  } catch (err) {
    if (isAdminNotConfigured(err)) {
      return NextResponse.json({ error: "server_not_configured" }, { status: 503 })
    }
    console.error("[meta/campaign-ads]", err)
    const body: CampaignAdsResponse = {
      ok: false, ads: [], errorCode: "graph_error",
      message: "No pudimos cargar los anuncios desde Meta.",
    }
    return NextResponse.json(body, { status: 500 })
  }
}
