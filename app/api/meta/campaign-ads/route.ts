import { NextResponse } from "next/server"
import { getAdminDb, isAdminNotConfigured } from "@/lib/firebase/admin"
import { authenticateRequest, canAccessWorkspace } from "@/lib/firebase/server-auth"
import { getCampaignLink } from "@/lib/meta/campaign-links"
import { readMetaConnection } from "@/lib/meta/connection-store"
import { getAdPreviewLink, getAdSetName, getCampaignAds, type GraphFailure } from "@/lib/meta/graph"
import { normalizeAd, type CampaignAd, type CampaignAdsErrorCode } from "@/lib/meta/ads"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export interface CampaignAdsResponse {
  ok: boolean
  ads: CampaignAd[]
  errorCode?: CampaignAdsErrorCode
  /** Safe technical detail for diagnosis. Never a token or a secret. */
  detail?: string
}

/**
 * Ads of ONE Meta campaign, read live from the Graph API.
 *
 * Server-only: the access token lives in the server environment and never
 * reaches the browser. Isolation is enforced twice — the caller must have
 * access to the workspace AND the campaign must be linked to that same
 * workspace. Reuses the existing integration; no parallel one.
 *
 * Order matters: the ad LIST loads first, with minimum safe fields. Ad set
 * names and preview links are separate, optional requests afterwards — a
 * failure in either leaves the ads on screen without that extra.
 */

/** Where execution reached. Reported on failure so a crash is locatable. */
type Stage =
  | "auth"
  | "campaign_link"
  | "workspace_access"
  | "meta_connection"
  | "fetch_ads"
  | "normalize_ads"
  | "fetch_previews"

/** Structured, secret-free log line. */
function logFailure(detail: {
  stage: Stage
  campaignId: string
  workspaceId: string | null
  errorName: string
  errorMessage: string
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
  // Tracks how far we got, so an unexpected throw says WHERE it happened.
  let stage: Stage = "auth"
  let campaignId = ""
  let workspaceId: string | null = null

  try {
    const auth = await authenticateRequest(request)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const url = new URL(request.url)
    // This is `Campaign.externalId` — the Meta campaign id the client sends,
    // never the local Firestore document id.
    campaignId = url.searchParams.get("metaCampaignId")?.trim() ?? ""
    if (!campaignId) return NextResponse.json({ error: "missing_campaign" }, { status: 400 })

    const fail = (errorCode: CampaignAdsErrorCode, detail?: string, status = 200) =>
      NextResponse.json(
        { ok: false, ads: [], errorCode, ...(detail ? { detail } : {}) } satisfies CampaignAdsResponse,
        { status },
      )

    const db = getAdminDb()

    stage = "campaign_link"
    const link = await getCampaignLink(db, campaignId)
    if (!link || !link.active) {
      logFailure({ stage, campaignId, workspaceId, errorName: "not_linked", errorMessage: "campaign has no active workspace link" })
      return fail("not_linked")
    }
    workspaceId = link.workspaceId

    stage = "workspace_access"
    // The campaign's OWN workspace decides, never one the caller supplies.
    if (!canAccessWorkspace(auth.user, link.workspaceId, false)) {
      logFailure({ stage, campaignId, workspaceId, errorName: "forbidden", errorMessage: "caller cannot access this workspace" })
      return fail("forbidden", undefined, 403)
    }

    stage = "meta_connection"
    const conn = await readMetaConnection(db, link.workspaceId)
    if (!conn?.adAccount?.id) {
      logFailure({ stage, campaignId, workspaceId, errorName: "no_ad_account", errorMessage: "no ad account selected" })
      return fail("no_ad_account")
    }

    // ---- 1. The list. Minimum safe fields; nothing optional can hide it.
    stage = "fetch_ads"
    const result = await getCampaignAds(campaignId)
    if (!result.ok) {
      logFailure({
        stage,
        campaignId,
        workspaceId,
        errorName: result.kind,
        errorMessage: `${result.detail}${result.message ? ` — ${result.message}` : ""}`,
      })
      return fail(errorCodeFor(result), `${result.kind} at ${stage}: ${result.detail}`)
    }

    stage = "normalize_ads"
    const ads = (result.data.data ?? []).map(normalizeAd)

    // ---- 2. Extras. Every failure below is swallowed on purpose: the ads
    //         are already loaded and must stay on screen.
    stage = "fetch_previews"
    await Promise.all([
      ...ads.map(async (ad) => {
        try {
          const preview = await getAdPreviewLink(ad.id)
          if (preview.ok) {
            ad.url = normalizeAd({ id: ad.id, preview_shareable_link: preview.data.preview_shareable_link }).url
          }
        } catch {
          // No link for this ad. Not worth failing the response over.
        }
      }),
      ...[...new Set(ads.map((a) => a.adSetId).filter((v): v is string => Boolean(v)))].map(async (adSetId) => {
        try {
          const res = await getAdSetName(adSetId)
          if (res.ok && res.data.name) {
            for (const ad of ads) if (ad.adSetId === adSetId) ad.adSetName = res.data.name
          }
        } catch {
          // The ad keeps showing its ad set id.
        }
      }),
    ])

    return NextResponse.json({ ok: true, ads } satisfies CampaignAdsResponse)
  } catch (err) {
    if (isAdminNotConfigured(err)) {
      return NextResponse.json({ error: "server_not_configured" }, { status: 503 })
    }
    const errorName = err instanceof Error ? err.name : typeof err
    const errorMessage = err instanceof Error ? err.message : String(err)
    logFailure({ stage, campaignId, workspaceId, errorName, errorMessage })
    // The real reason, surfaced instead of a bare 500: the whole point is
    // that the next failure names itself.
    return NextResponse.json(
      {
        ok: false,
        ads: [],
        errorCode: "meta_graph_error",
        detail: `unexpected at ${stage}: ${errorName}: ${errorMessage}`,
      } satisfies CampaignAdsResponse,
      { status: 200 },
    )
  }
}
