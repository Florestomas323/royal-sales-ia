/**
 * Minimal, defensive types for Meta Webhooks (object "page").
 * Only what the leadgen flow needs; everything is optional on the wire.
 */

export interface MetaWebhookChange {
  field?: string
  value?: Record<string, unknown>
}

export interface MetaWebhookEntry {
  id?: string
  time?: number
  changes?: MetaWebhookChange[]
}

export interface MetaWebhookPayload {
  object?: string
  entry?: MetaWebhookEntry[]
}

/** A single `leadgen` change, normalised. Any field may be missing. */
export interface MetaLeadgenEvent {
  leadgenId: string | null
  formId: string | null
  pageId: string | null
  adId: string | null
  adgroupId: string | null
  /**
   * Meta campaign id. The standard leadgen webhook does NOT include it (only
   * ad_id / adgroup_id / form_id / page_id); it is read if present and is the
   * ONLY key used to resolve the owner workspace. Never inferred.
   */
  campaignId: string | null
  /** Unix seconds as sent by Meta. */
  createdTime: number | null
}

export interface ParsedMetaWebhook {
  object: string | null
  /** leadgen events found in the payload (may be empty). */
  leadgen: MetaLeadgenEvent[]
  /** Number of changes with a field other than "leadgen" (ignored). */
  ignoredChanges: number
}

function str(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  return null
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/**
 * Walks `entry[].changes[]` and extracts leadgen events. Never throws on a
 * malformed payload: unknown shapes are simply ignored.
 */
export function parseMetaWebhook(input: unknown): ParsedMetaWebhook {
  const result: ParsedMetaWebhook = { object: null, leadgen: [], ignoredChanges: 0 }
  if (!isRecord(input)) return result

  result.object = str(input.object)
  if (result.object !== "page" || !Array.isArray(input.entry)) return result

  for (const entry of input.entry) {
    if (!isRecord(entry) || !Array.isArray(entry.changes)) continue
    const entryPageId = str(entry.id)

    for (const change of entry.changes) {
      if (!isRecord(change)) continue
      if (change.field !== "leadgen") {
        result.ignoredChanges++
        continue
      }
      const value = isRecord(change.value) ? change.value : {}
      result.leadgen.push({
        leadgenId: str(value.leadgen_id),
        formId: str(value.form_id),
        pageId: str(value.page_id) ?? entryPageId,
        adId: str(value.ad_id),
        adgroupId: str(value.adgroup_id),
        campaignId: str(value.campaign_id),
        createdTime: num(value.created_time),
      })
    }
  }
  return result
}

/** Shows only a prefix of an id in logs ("12345678…"). */
export function maskId(id: string | null): string {
  if (!id) return "—"
  return id.length <= 6 ? "…" : `${id.slice(0, 6)}…`
}
