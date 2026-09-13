import type { GraphAd } from "@/lib/meta/graph"

/**
 * One ad as the Campañas screen shows it. Pure shaping of what Meta returned:
 * nothing is inferred and no URL is ever built from an id.
 */
export interface CampaignAd {
  id: string
  name: string
  /** Raw `effective_status` from Meta, e.g. ACTIVE, PAUSED, ADSET_PAUSED. */
  status: string
  /** One of four buckets the UI colours; everything unusual falls in `other`. */
  statusKind: AdStatusKind
  adSetId: string | null
  adSetName: string | null
  /**
   * Public link to the ad, or null. Only ever a URL Meta itself supplied,
   * filled in by a SEPARATE request after the list already loaded.
   */
  url: string | null
}

export type AdStatusKind = "active" | "paused" | "archived" | "other"

/**
 * Why the ads could not be listed. Kept distinct so a failure can be
 * diagnosed from the UI and the logs instead of guessed at: a missing scope
 * and an expired token need different fixes.
 */
export type CampaignAdsErrorCode =
  | "not_linked"
  | "no_ad_account"
  | "missing_ads_read"
  | "meta_auth_error"
  | "meta_permission_error"
  | "meta_graph_error"
  | "forbidden"

/**
 * Meta reports many statuses; these are the ones that mean the same thing to
 * a distributor. `ADSET_PAUSED` and `CAMPAIGN_PAUSED` are paused from where
 * they stand — the ad is not running — so they are shown as paused rather
 * than as some fourth state nobody can act on.
 */
export function statusKind(status: string | undefined): AdStatusKind {
  const s = (status ?? "").toUpperCase()
  if (s === "ACTIVE") return "active"
  if (s === "PAUSED" || s === "ADSET_PAUSED" || s === "CAMPAIGN_PAUSED") return "paused"
  if (s === "ARCHIVED" || s === "DELETED") return "archived"
  return "other"
}

/** Spanish label for each bucket. */
export const AD_STATUS_LABELS: Record<AdStatusKind, string> = {
  active: "Activo",
  paused: "Pausado",
  archived: "Archivado",
  other: "Otro estado",
}

/**
 * Only an http(s) link Meta returned is kept. There is no fallback that
 * assembles a URL from the ad id: Meta's public URL formats are not stable,
 * and a button that leads nowhere is worse than no button.
 */
function realUrl(v: string | undefined): string | null {
  if (!v) return null
  try {
    const u = new URL(v)
    return u.protocol === "https:" || u.protocol === "http:" ? v : null
  } catch {
    return null
  }
}

export function normalizeAd(ad: GraphAd): CampaignAd {
  const status = ad.effective_status ?? ad.status ?? ""
  return {
    id: ad.id,
    // An unnamed ad still needs something to click on; its id is the honest
    // fallback, not an invented title.
    name: ad.name?.trim() || ad.id,
    status,
    statusKind: statusKind(status),
    // Flat field only: the first call no longer expands `adset{}`.
    adSetId: ad.adset_id ?? null,
    adSetName: null,
    url: realUrl(ad.preview_shareable_link),
  }
}
