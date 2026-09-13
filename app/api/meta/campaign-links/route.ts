import { NextResponse } from "next/server"
import { getAdminDb, isAdminNotConfigured } from "@/lib/firebase/admin"
import { authenticateRequest, canAccessWorkspace } from "@/lib/firebase/server-auth"
import { getCampaignLink } from "@/lib/meta/campaign-links"
import { readMetaConnection } from "@/lib/meta/connection-store"
import { getAdPreviewLink, getCampaignAds, type GraphFailure } from "@/lib/meta/graph"
import { normalizeAd, type CampaignAd, type CampaignAdsErrorCode } from "@/lib/meta/ads"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export interface CampaignAdsResponse {
  ok: boolean
  ads: CampaignAd[]
  errorCode?: CampaignAdsErrorCode
  /** Safe technical detail for diagnosis: HTTP status + Meta code. Never a token. */
  detail?: string
}

/**
 * Ads of ONE Meta campaign, read live from the Graph API.
 *
 * Server-only: the access token lives in the server environment and never
 * reaches the browser. Isolation is enforced twice — the caller must have
 * access to the workspace AND the campaign must be linked to that same
 * workspace — so knowing a Meta campaign id is not enough to read another
 * distributor's ads.
 *
 * Reuses the existing integration (same token, same ad account selected in
 * Administrar Meta, same link records). No parallel integration.
 *
 * Errors are NOT collapsed into one generic code: Meta already says whether
 * it was a token, a scope or a transport problem, and throwing that away is
 * what makes an outage impossible to diagnose from the outside.
 */

/** One structured line per failure. Never a token, never a Firebase id token. */
function logFailure(detail: {
  stage: string
  campaignId: string
  workspaceId: string | null
  errorKind: string
  detail?: string
}) {
  console.error("[meta/campaign-ads]", JSON.stringify(detail))
}

/** Maps the Graph client's own classification to what the UI reports. */
function errorCodeFor(failure: GraphFailure): CampaignAdsErrorCode {
  switch (failure.kind) {
    case "not_configured":
      return "missing_ads_read"
    case "auth":
      return "meta_auth_error"
    case "permission":
      return "meta_permission_error"
    default:
      return "meta_graph_error"
  }
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const url = new URL(request.url)
  const metaCampaignId = url.searchParams.get("metaCampaignId")?.trim() ?? ""
  if (!metaCampaignId) return NextResponse.json({ error: "missing_campaign" }, { status: 400 })

  const fail = (errorCode: CampaignAdsErrorCode, detail?: string, status = 200) =>
    NextResponse.json({ ok: false, ads: [], errorCode, ...(detail ? { detail } : {}) } satisfies CampaignAdsResponse, { status })

  try {
    const db = getAdminDb()

    const link = await getCampaignLink(db, metaCampaignId)
    if (!link || !link.active) {
      logFailure({ stage: "resolve_link", campaignId: metaCampaignId, workspaceId: null, errorKind: "not_linked" })
      return fail("not_linked")
    }

    // The campaign's OWN workspace decides, never one the caller supplies.
    if (!canAccessWorkspace(auth.user, link.workspaceId, false)) {
      logFailure({ stage: "authorize", campaignId: metaCampaignId, workspaceId: link.workspaceId, errorKind: "forbidden" })
      return fail("forbidden", undefined, 403)
    }

    const conn = await readMetaConnection(db, link.workspaceId)
    if (!conn?.adAccount?.id) {
      logFailure({ stage: "read_connection", campaignId: metaCampaignId, workspaceId: link.workspaceId, errorKind: "no_ad_account" })
      return fail("no_ad_account")
    }

    // 1. The list first. Core fields only, so no optional extra can hide it.
    const result = await getCampaignAds(metaCampaignId)
    if (!result.ok) {
      logFailure({
        stage: "graph_ads",
        campaignId: metaCampaignId,
        workspaceId: link.workspaceId,
        errorKind: result.kind,
        detail: `${result.detail}${result.message ? ` — ${result.message}` : ""}`,
      })
      return fail(errorCodeFor(result), `${result.kind}: ${result.detail}`)
    }

    const ads = (result.data.data ?? []).map(normalizeAd)

    // 2. Then the preview links, one request per ad, all in parallel and all
    //    optional. A failure here leaves that ad without a button and is
    //    logged once; it can never empty the list or fail the response.
    await Promise.all(
      ads.map(async (ad) => {
        const preview = await getAdPreviewLink(ad.id)
        if (preview.ok) {
          ad.url = normalizeAd({ id: ad.id, preview_shareable_link: preview.data.preview_shareable_link }).url
          return
        }
        logFailure({
          stage: "graph_preview",
          campaignId: metaCampaignId,
          workspaceId: link.workspaceId,
          errorKind: preview.kind,
          detail: preview.detail,
        })
      }),
    )

    return NextResponse.json({ ok: true, ads } satisfies CampaignAdsResponse)
  } catch (err) {
    if (isAdminNotConfigured(err)) {
      return NextResponse.json({ error: "server_not_configured" }, { status: 503 })
    }
    logFailure({
      stage: "unexpected",
      campaignId: metaCampaignId,
      workspaceId: null,
      errorKind: err instanceof Error ? err.name : typeof err,
      detail: err instanceof Error ? err.message : String(err),
    })
    return fail("meta_graph_error", undefined, 500)
  }
}
