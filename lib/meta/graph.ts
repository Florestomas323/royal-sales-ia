import { getGraphApiVersion, getMetaAccessToken, isMissingEnvError } from "./env"

/**
 * SERVER-ONLY Meta Graph API client. Single place for the base URL, version,
 * token handling, timeouts and error classification.
 *
 * The access token is read from META_ACCESS_TOKEN on every call, sent as a
 * Bearer header (never in the URL, so it cannot leak into request logs) and
 * never logged. Nothing in this module may be imported from client code.
 */

export type GraphFailureKind =
  | "not_configured" // META_ACCESS_TOKEN missing            → retryable
  | "timeout" //                                             → retryable
  | "network" //                                             → retryable
  | "rate_limit" // Meta code 4 / 17 / 32 / 613, HTTP 429    → retryable
  | "auth" // Meta code 190 (invalid/expired token)          → retryable (fix token, reprocess)
  | "permission" // Meta code 10 / 200-299 (missing scope)   → permanent for this token
  | "server" // HTTP 5xx                                     → retryable
  | "invalid_json" //                                        → retryable
  | "not_found" // Meta code 100 subcode 33 / HTTP 404       → permanent
  | "no_campaign_id" // ad exists but no campaign_id         → permanent
  | "http" // any other non-2xx                              → retryable

export interface GraphFailure {
  ok: false
  kind: GraphFailureKind
  retryable: boolean
  /** Safe to log: HTTP status + Meta error code/subcode/type. Never the token. */
  detail: string
  /** Meta's own error message (safe: never contains the token). */
  message: string | null
  code: number | null
}

export type GraphResult<T> = { ok: true; data: T } | GraphFailure

const RETRYABLE: Record<GraphFailureKind, boolean> = {
  not_configured: true,
  timeout: true,
  network: true,
  rate_limit: true,
  auth: true,
  permission: false,
  server: true,
  invalid_json: true,
  http: true,
  not_found: false,
  no_campaign_id: false,
}

function fail(kind: GraphFailureKind, detail: string, message: string | null = null, code: number | null = null): GraphFailure {
  return { ok: false, kind, retryable: RETRYABLE[kind], detail, message, code }
}

interface GraphErrorBody {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number }
}

export interface GraphClientOptions {
  /** Abort after this many ms. */
  timeoutMs?: number
  /** Injected for tests. */
  fetchImpl?: typeof fetch
  baseUrl?: string
}

/**
 * GET /{version}/{path}?{params}. Returns parsed JSON or a classified failure.
 * Only the token is added by this function; callers pass everything else.
 */
export async function graphGet<T>(
  path: string,
  params: Record<string, string> = {},
  options: GraphClientOptions = {},
): Promise<GraphResult<T>> {
  let token: string
  try {
    token = getMetaAccessToken()
  } catch (err) {
    return fail("not_configured", isMissingEnvError(err) ? err.message : "token unavailable")
  }

  const version = getGraphApiVersion()
  const baseUrl = options.baseUrl ?? "https://graph.facebook.com"
  const doFetch = options.fetchImpl ?? fetch
  const search = new URLSearchParams(params).toString()
  const url = `${baseUrl}/${version}/${path.replace(/^\/+/, "")}${search ? `?${search}` : ""}`

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
    const code = error?.code ?? null
    const sub = error?.error_subcode
    const message = typeof error?.message === "string" ? error.message : null
    const detail = `HTTP ${response.status} code=${code ?? "—"} subcode=${sub ?? "—"} type=${error?.type ?? "—"}`
    if (response.status === 404 || (code === 100 && sub === 33)) return fail("not_found", detail, message, code)
    if (code === 190 || response.status === 401) return fail("auth", detail, message, code)
    if (code === 10 || (code !== null && code >= 200 && code <= 299) || response.status === 403) {
      return fail("permission", detail, message, code)
    }
    if (response.status === 429 || code === 4 || code === 17 || code === 32 || code === 613) {
      return fail("rate_limit", detail, message, code)
    }
    if (response.status >= 500) return fail("server", detail, message, code)
    return fail("http", detail, message, code)
  }

  if (typeof body !== "object" || body === null) return fail("invalid_json", "unexpected body")
  return { ok: true, data: body as T }
}

/* -------------------------------------------------------------------------- */
/*  ad_id → campaign_id (used by the Lead Ads webhook processor)               */
/* -------------------------------------------------------------------------- */

export type GraphCampaignLookup =
  | { ok: true; campaignId: string; adsetId: string | null }
  | GraphFailure

interface GraphAdBody {
  id?: string
  campaign_id?: string
  adset_id?: string
}

/** GET /{version}/{adId}?fields=campaign_id,adset_id — requires ads_read on the ad account. */
export async function lookupCampaignIdForAd(
  adId: string,
  options: GraphClientOptions = {},
): Promise<GraphCampaignLookup> {
  const result = await graphGet<GraphAdBody>(encodeURIComponent(adId), { fields: "campaign_id,adset_id" }, options)
  if (!result.ok) return result
  const ad = result.data
  if (typeof ad.campaign_id !== "string" || ad.campaign_id.length === 0) {
    return fail("no_campaign_id", "ad returned without campaign_id")
  }
  return {
    ok: true,
    campaignId: ad.campaign_id,
    adsetId: typeof ad.adset_id === "string" && ad.adset_id.length > 0 ? ad.adset_id : null,
  }
}

/* -------------------------------------------------------------------------- */
/*  Assets / diagnostics (used by /api/meta/status and /api/meta/sync)         */
/* -------------------------------------------------------------------------- */

export interface GraphPaged<T> {
  data?: T[]
  paging?: { next?: string }
}

export interface GraphMe {
  id: string
  name?: string
}

export interface GraphPermission {
  permission: string
  status: "granted" | "declined" | string
}

export interface GraphAdAccount {
  id: string // "act_123"
  account_id: string // "123"
  name?: string
  account_status?: number
  currency?: string
}

export interface GraphPage {
  id: string
  name?: string
}

export interface GraphBusiness {
  id: string
  name?: string
}

export interface GraphCampaign {
  id: string
  name?: string
  status?: string
  objective?: string
  effective_status?: string
  daily_budget?: string
  lifetime_budget?: string
  created_time?: string
  updated_time?: string
}

export interface GraphLeadForm {
  id: string
  name?: string
  status?: string
  leads_count?: number
}

export const getMe = (o?: GraphClientOptions) => graphGet<GraphMe>("me", { fields: "id,name" }, o)

export const getPermissions = (o?: GraphClientOptions) =>
  graphGet<GraphPaged<GraphPermission>>("me/permissions", {}, o)

export const getAdAccounts = (o?: GraphClientOptions) =>
  graphGet<GraphPaged<GraphAdAccount>>(
    "me/adaccounts",
    { fields: "id,account_id,name,account_status,currency", limit: "100" },
    o,
  )

/** Pages granted directly to the token's user (needs pages_show_list). */
export const getMyPages = (o?: GraphClientOptions) =>
  graphGet<GraphPaged<GraphPage>>("me/accounts", { fields: "id,name", limit: "100" }, o)

/** Businesses the system user belongs to (needs business_management). */
export const getBusinesses = (o?: GraphClientOptions) =>
  graphGet<GraphPaged<GraphBusiness>>("me/businesses", { fields: "id,name", limit: "50" }, o)

export const getBusinessPages = (businessId: string, edge: "owned_pages" | "client_pages", o?: GraphClientOptions) =>
  graphGet<GraphPaged<GraphPage>>(`${encodeURIComponent(businessId)}/${edge}`, { fields: "id,name", limit: "100" }, o)

export const getCampaigns = (adAccountId: string, o?: GraphClientOptions) =>
  graphGet<GraphPaged<GraphCampaign>>(
    `${encodeURIComponent(adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`)}/campaigns`,
    {
      fields: "id,name,status,objective,effective_status,daily_budget,lifetime_budget,created_time,updated_time",
      limit: "100",
    },
    o,
  )

export interface GraphAdSet {
  id: string
  name?: string
  status?: string
  effective_status?: string
  campaign_id?: string
}

export interface GraphAd {
  id: string
  name?: string
  status?: string
  effective_status?: string
  adset_id?: string
  campaign_id?: string
  /** Present when the caller asked for the nested `adset{id,name}` field. */
  adset?: { id?: string; name?: string }
  creative?: { id?: string; effective_object_story_id?: string }
  /** Meta returns this only for ads whose creative is a real published post. */
  preview_shareable_link?: string
}

/** Ad sets of a campaign. Needs ads_read on the owning ad account. */
export const getAdSets = (campaignId: string, o?: GraphClientOptions) =>
  graphGet<GraphPaged<GraphAdSet>>(
    `${encodeURIComponent(campaignId)}/adsets`,
    { fields: "id,name,status,effective_status,campaign_id", limit: "100" },
    o,
  )

/** Ads of a campaign (flattened across its ad sets). Needs ads_read. */
export const getAds = (campaignId: string, o?: GraphClientOptions) =>
  graphGet<GraphPaged<GraphAd>>(
    `${encodeURIComponent(campaignId)}/ads`,
    { fields: "id,name,status,effective_status,adset_id,campaign_id,creative{id}", limit: "100" },
    o,
  )

export interface GraphAction {
  action_type: string
  value: string
}

/** One row of /act_{id}/insights?level=campaign. Numbers arrive as strings. */
export interface GraphCampaignInsight {
  campaign_id: string
  campaign_name?: string
  date_start: string
  date_stop: string
  spend?: string
  impressions?: string
  reach?: string
  frequency?: string
  clicks?: string
  inline_link_clicks?: string
  ctr?: string
  cpc?: string
  cpm?: string
  actions?: GraphAction[]
  cost_per_action_type?: GraphAction[]
}

/**
 * Campaign-level insights for an exact date range (never a preset that
 * silently widens the window). READ-ONLY: this module has no write helpers
 * by design — Media Buyer IA analyses, it never edits campaigns.
 * Needs `ads_read` on the ad account.
 */
export const getCampaignInsights = (
  adAccountId: string,
  range: { since: string; until: string },
  o?: GraphClientOptions,
) =>
  graphGet<GraphPaged<GraphCampaignInsight>>(
    `${encodeURIComponent(adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`)}/insights`,
    {
      level: "campaign",
      fields: [
        "campaign_id", "campaign_name", "date_start", "date_stop",
        "spend", "impressions", "reach", "frequency", "clicks", "inline_link_clicks",
        "ctr", "cpc", "cpm", "actions", "cost_per_action_type",
      ].join(","),
      time_range: JSON.stringify({ since: range.since, until: range.until }),
      limit: "200",
    },
    o,
  )

/** Lead forms of a page. Needs pages_manage_ads / leads_retrieval; fails honestly otherwise. */
export const getLeadForms = (pageId: string, o?: GraphClientOptions) =>
  graphGet<GraphPaged<GraphLeadForm>>(
    `${encodeURIComponent(pageId)}/leadgen_forms`,
    { fields: "id,name,status,leads_count", limit: "100" },
    o,
  )

/* -------------------------------------------------------------------------- */
/*  Ads of a campaign                                                          */
/* -------------------------------------------------------------------------- */


/**
 * Ads inside ONE campaign, straight from the Graph API.
 *
 * Read-only, like the rest of this module. Includes paused and archived ads:
 * the caller decides what to show, and hiding them here would make a campaign
 * look empty right after someone pauses it. `preview_shareable_link` is asked
 * for in the same call — Meta returns it when the ad has one, and when it does
 * not there is simply no link, never a constructed one.
 *
 * Needs `ads_read` on the ad account.
 */
export const getCampaignAds = (campaignId: string, o?: GraphClientOptions) =>
  graphGet<GraphPaged<GraphAd>>(
    `${encodeURIComponent(campaignId)}/ads`,
    {
      fields: [
        "id", "name", "status", "effective_status",
        "adset_id", "campaign_id", "adset{id,name}",
        "creative{id,effective_object_story_id}",
        "preview_shareable_link",
      ].join(","),
      limit: "100",
    },
    o,
  )
