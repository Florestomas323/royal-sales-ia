import { getGraphApiVersion, getMetaAccessToken, isMissingEnvError } from "./env"

/**
 * Minimal SERVER-ONLY Meta Graph API client.
 *
 * Only what this phase needs: ad_id → campaign_id. The access token is read
 * from META_ACCESS_TOKEN on every call, sent as a Bearer header (never in the
 * URL, so it cannot leak into request logs) and never logged.
 */

export type GraphFailureKind =
  | "not_configured" // META_ACCESS_TOKEN missing            → retryable
  | "timeout" //                                             → retryable
  | "network" //                                             → retryable
  | "rate_limit" // Meta code 4 / 17 / 32 / 613, HTTP 429    → retryable
  | "auth" // Meta code 190 (invalid/expired token), 10, 200 → retryable (fix token, reprocess)
  | "server" // HTTP 5xx                                     → retryable
  | "invalid_json" //                                        → retryable
  | "not_found" // Meta code 100 subcode 33 / HTTP 404       → permanent
  | "no_campaign_id" // ad exists but no campaign_id         → permanent
  | "http" // any other non-2xx                              → retryable

export type GraphCampaignLookup =
  | { ok: true; campaignId: string; adsetId: string | null }
  | { ok: false; kind: GraphFailureKind; retryable: boolean; detail: string }

const RETRYABLE: Record<GraphFailureKind, boolean> = {
  not_configured: true,
  timeout: true,
  network: true,
  rate_limit: true,
  auth: true,
  server: true,
  invalid_json: true,
  http: true,
  not_found: false,
  no_campaign_id: false,
}

function fail(kind: GraphFailureKind, detail: string): GraphCampaignLookup {
  return { ok: false, kind, retryable: RETRYABLE[kind], detail }
}

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number }
}

interface GraphAdBody {
  id?: string
  campaign_id?: string
  adset_id?: string
}

export interface GraphClientOptions {
  /** Abort after this many ms. Webhooks must stay fast. */
  timeoutMs?: number
  /** Injected for tests. */
  fetchImpl?: typeof fetch
  baseUrl?: string
}

/**
 * GET /{version}/{adId}?fields=campaign_id,adset_id
 * Requires a token with ads_read on the ad account that owns the ad.
 */
export async function lookupCampaignIdForAd(
  adId: string,
  options: GraphClientOptions = {},
): Promise<GraphCampaignLookup> {
  let token: string
  try {
    token = getMetaAccessToken()
  } catch (err) {
    return fail("not_configured", isMissingEnvError(err) ? err.message : "token unavailable")
  }

  const version = getGraphApiVersion()
  const baseUrl = options.baseUrl ?? "https://graph.facebook.com"
  const doFetch = options.fetchImpl ?? fetch
  const url = `${baseUrl}/${version}/${encodeURIComponent(adId)}?fields=campaign_id,adset_id`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 8000)

  let response: Response
  try {
    response = await doFetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: controller.signal,
      cache: "no-store",
    })
  } catch (err) {
    clearTimeout(timer)
    const aborted = err instanceof Error && err.name === "AbortError"
    return fail(aborted ? "timeout" : "network", aborted ? "request aborted" : "fetch failed")
  }
  clearTimeout(timer)

  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    return fail("invalid_json", `HTTP ${response.status} without JSON body`)
  }

  if (!response.ok) {
    const error = (body as GraphErrorBody)?.error
    const code = error?.code
    const sub = error?.error_subcode
    const detail = `HTTP ${response.status} code=${code ?? "—"} subcode=${sub ?? "—"} type=${error?.type ?? "—"}`
    if (response.status === 404 || (code === 100 && sub === 33)) return fail("not_found", detail)
    if (code === 190 || code === 10 || code === 200 || response.status === 401 || response.status === 403) {
      return fail("auth", detail)
    }
    if (response.status === 429 || code === 4 || code === 17 || code === 32 || code === 613) {
      return fail("rate_limit", detail)
    }
    if (response.status >= 500) return fail("server", detail)
    return fail("http", detail)
  }

  const ad = body as GraphAdBody
  if (typeof ad !== "object" || ad === null) return fail("invalid_json", "unexpected body")
  if (typeof ad.campaign_id !== "string" || ad.campaign_id.length === 0) {
    return fail("no_campaign_id", "ad returned without campaign_id")
  }
  return {
    ok: true,
    campaignId: ad.campaign_id,
    adsetId: typeof ad.adset_id === "string" && ad.adset_id.length > 0 ? ad.adset_id : null,
  }
}
