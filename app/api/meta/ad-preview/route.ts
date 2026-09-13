import { NextResponse } from "next/server"
import { getAdminDb, isAdminNotConfigured } from "@/lib/firebase/admin"
import { authenticateRequest, canAccessWorkspace } from "@/lib/firebase/server-auth"
import { getCampaignLink } from "@/lib/meta/campaign-links"
import { readMetaConnection } from "@/lib/meta/connection-store"
import { getAdPreviewLink, getAdWithCreative, getVideoSource, type GraphFailure } from "@/lib/meta/graph"
import { normalizeCreative, type AdPreview } from "@/lib/meta/creative"
import type { CampaignAdsErrorCode } from "@/lib/meta/ads"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export interface AdPreviewResponse {
  ok: boolean
  preview: AdPreview | null
  errorCode?: CampaignAdsErrorCode
  detail?: string
}

/**
 * The creative behind ONE ad, for the in-app preview.
 *
 * TOKEN: this route uses the SAME single global `META_ACCESS_TOKEN` as every
 * other Meta call in the project — there is no per-workspace token today
 * (`MetaConnection.secretRef` points at that env var). The workspace's
 * connection is read for its AD ACCOUNT, not for a credential.
 *
 * Because one token can read several ad accounts, isolation cannot rest on
 * the credential. It is enforced in the app, four times, in order:
 *   1. the caller is signed in;
 *   2. the campaign they name is linked to a workspace they may access;
 *   3. the ad Meta returns REALLY belongs to that campaign (`campaign_id`);
 *   4. that ad belongs to the ad account this workspace has connected
 *      (`account_id`), so a campaign id pointing at another distributor's
 *      account inside the same token cannot be previewed here.
 *
 * The token never leaves the server: only the normalised preview — text and
 * media URLs Meta chose to publish — travels to the browser. Video source and
 * shareable link are optional extras; failing to get them degrades that piece
 * to "no disponible" and never fails the response.
 */
type Stage = "auth" | "campaign_link" | "workspace_access" | "meta_connection" | "fetch_creative" | "verify_ad" | "verify_account" | "extras"

function log(detail: Record<string, unknown>) {
  console.error("[meta/ad-preview]", JSON.stringify(detail))
}

function errorCodeFor(failure: GraphFailure): CampaignAdsErrorCode {
  switch (failure.kind) {
    case "not_configured": return "missing_ads_read"
    case "auth": return "meta_auth_error"
    case "permission": return "meta_permission_error"
    default: return "meta_graph_error"
  }
}

export async function GET(request: Request) {
  let stage: Stage = "auth"
  let adId = ""
  let campaignId = ""
  let workspaceId: string | null = null

  const fail = (errorCode: CampaignAdsErrorCode, detail?: string, status = 200) =>
    NextResponse.json({ ok: false, preview: null, errorCode, ...(detail ? { detail } : {}) } satisfies AdPreviewResponse, { status })

  try {
    const auth = await authenticateRequest(request)
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

    const url = new URL(request.url)
    adId = url.searchParams.get("adId")?.trim() ?? ""
    campaignId = url.searchParams.get("metaCampaignId")?.trim() ?? ""
    if (!adId || !campaignId) return NextResponse.json({ error: "missing_params" }, { status: 400 })

    const db = getAdminDb()

    stage = "campaign_link"
    const link = await getCampaignLink(db, campaignId)
    if (!link || !link.active) return fail("not_linked")
    workspaceId = link.workspaceId

    stage = "workspace_access"
    if (!canAccessWorkspace(auth.user, link.workspaceId, false)) return fail("forbidden", undefined, 403)

    // Not a credential: the ad account this workspace works with, used below
    // to confirm the ad really is theirs.
    stage = "meta_connection"
    const conn = await readMetaConnection(db, link.workspaceId)
    if (!conn?.adAccount?.id) return fail("no_ad_account")

    stage = "fetch_creative"
    const result = await getAdWithCreative(adId)
    if (!result.ok) {
      log({ stage, adId, campaignId, workspaceId, errorKind: result.kind, detail: result.detail })
      return fail(errorCodeFor(result), `${result.kind} at ${stage}: ${result.detail}`)
    }

    // 3. The ad must belong to the campaign the caller was authorised for.
    //    Without this, any ad id readable by the token could be previewed
    //    from any workspace.
    stage = "verify_ad"
    if (result.data.campaign_id !== campaignId) {
      log({ stage, adId, campaignId, workspaceId, errorKind: "ad_not_in_campaign" })
      return fail("forbidden", undefined, 403)
    }

    // 4. And to the ad account this workspace connected. The global token may
    //    read several accounts, so this is what stops one distributor's
    //    campaign id from surfacing another's creative. Only checked when Meta
    //    actually returned `account_id`: an absent field is not proof of
    //    anything, and refusing on it would break previews for no gain.
    stage = "verify_account"
    const adAccount = normalizeAccountId(result.data.account_id)
    const connAccount = normalizeAccountId(conn.adAccount.id)
    if (adAccount && connAccount && adAccount !== connAccount) {
      log({ stage, adId, campaignId, workspaceId, errorKind: "ad_account_mismatch" })
      return fail("forbidden", undefined, 403)
    }

    const preview = normalizeCreative(result.data)

    // Optional extras, each swallowed on failure.
    stage = "extras"
    await Promise.all([
      (async () => {
        if (!preview.videoId) return
        try {
          const video = await getVideoSource(preview.videoId)
          if (video.ok) {
            preview.videoUrl = safeUrl(video.data.source)
            preview.imageUrl = preview.imageUrl ?? safeUrl(video.data.picture)
          }
        } catch { /* thumbnail only */ }
      })(),
      (async () => {
        try {
          const share = await getAdPreviewLink(adId)
          if (share.ok) preview.shareableLink = safeUrl(share.data.preview_shareable_link)
        } catch { /* no secondary link */ }
      })(),
    ])

    return NextResponse.json({ ok: true, preview } satisfies AdPreviewResponse)
  } catch (err) {
    if (isAdminNotConfigured(err)) return NextResponse.json({ error: "server_not_configured" }, { status: 503 })
    const errorName = err instanceof Error ? err.name : typeof err
    const errorMessage = err instanceof Error ? err.message : String(err)
    log({ stage, adId, campaignId, workspaceId, errorName, errorMessage })
    return fail("meta_graph_error", `unexpected at ${stage}: ${errorName}: ${errorMessage}`)
  }
}

function safeUrl(v: string | undefined): string | null {
  if (!v) return null
  try {
    const u = new URL(v)
    return u.protocol === "https:" || u.protocol === "http:" ? v : null
  } catch {
    return null
  }
}

/** Meta reports the account with and without the `act_` prefix; compare bare. */
function normalizeAccountId(v: string | undefined | null): string | null {
  const s = (v ?? "").trim()
  if (!s) return null
  return s.startsWith("act_") ? s.slice(4) : s
}
