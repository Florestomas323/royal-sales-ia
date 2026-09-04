import type { Firestore } from "firebase-admin/firestore"
import type {
  LeadType,
  MetaCampaignLink,
  MetaWebhookEvent,
  ProcessedMetaLead,
} from "@/types"
import type { GraphCampaignLookup } from "./graph"
import type { MetaLeadgenEvent } from "./types"

/**
 * Lead Ads processing.
 *
 *   leadgen webhook
 *     → claim leadgen_id (transaction, idempotent, reprocess-aware)
 *     → campaign_id from payload, or ad_id → Graph API → campaign_id
 *     → metaCampaignLinks/{campaignId}  (active === true)
 *     → resolved { workspaceId, objective }   ← nothing is written to `leads` yet
 *
 * Ownership is decided ONLY by the campaign link. page_id, form_id, ad_id and
 * adgroup_id are stored as metadata and never used to pick a workspace.
 */

export const COLLECTIONS = {
  processed: "processedMetaLeads",
  events: "metaWebhookEvents",
  links: "metaCampaignLinks",
} as const

/** How long a `received` claim may stay open before another invocation may take it over. */
const STALE_CLAIM_MS = 5 * 60 * 1000

export interface ResolvedOwner {
  workspaceId: string
  objective: LeadType
  metaCampaignId: string
  /** Local Royal Sales IA campaign id from the link, if set. */
  campaignId: string | null
}

/** Permanent for this payload, or waiting for a link (reprocessable). */
export type UnresolvedReason =
  | "missing_leadgen_id"
  | "missing_ad_id"
  | "ad_not_found"
  | "no_campaign_id"
  | "no_link"
  | "link_inactive"
  | "link_invalid"
  | "graph_permission"

/** Temporary; the same leadgen_id may be reprocessed later. */
export type RetryableReason =
  | "graph_not_configured"
  | "graph_timeout"
  | "graph_network"
  | "graph_rate_limit"
  | "graph_auth"
  | "graph_server"
  | "graph_invalid_json"
  | "graph_http"

export type LeadgenOutcome =
  | { status: "duplicate" }
  | { status: "unresolved"; reason: UnresolvedReason }
  | { status: "retryable"; reason: RetryableReason }
  | { status: "resolved"; owner: ResolvedOwner; via: "payload" | "graph" }
  | { status: "error"; reason: string }

export interface ClaimResult {
  outcome: "claimed" | "duplicate"
  attempt: number
}

export interface MetaLeadProcessor {
  /** Atomically claims a leadgen_id (or re-claims a reprocessable one). */
  claim(event: MetaLeadgenEvent): Promise<ClaimResult>
  /** Looks up the explicit campaign link. Never resolves through page/form/ad ids. */
  resolveLink(metaCampaignId: string): Promise<
    | { status: "resolved"; owner: ResolvedOwner }
    | { status: "unresolved"; reason: "no_link" | "link_inactive" | "link_invalid" }
  >
  /** Persists the outcome (processed record + diagnostic event). */
  record(event: MetaLeadgenEvent, outcome: LeadgenOutcome, ctx: RecordContext): Promise<void>
}

export interface RecordContext {
  attempt: number
  campaignId: string | null
  adsetId: string | null
  via: "payload" | "graph" | null
}

export type CampaignLookupFn = (adId: string) => Promise<GraphCampaignLookup>

const GRAPH_REASON: Record<Exclude<GraphCampaignLookup, { ok: true }>["kind"], RetryableReason | UnresolvedReason> = {
  not_configured: "graph_not_configured",
  timeout: "graph_timeout",
  network: "graph_network",
  rate_limit: "graph_rate_limit",
  auth: "graph_auth",
  permission: "graph_permission",
  server: "graph_server",
  invalid_json: "graph_invalid_json",
  http: "graph_http",
  not_found: "ad_not_found",
  no_campaign_id: "no_campaign_id",
}

/**
 * Attribution payload for the lead that WILL be created once
 * `leads_retrieval` is granted. Built from the webhook + the resolved link;
 * every field is optional because Meta does not always send them, and none is
 * ever invented.
 *
 * Consumed later by `createLead({ workspaceId, leadType, source: "meta", attribution })`.
 */
export interface MetaLeadAttribution {
  workspaceId: string
  leadType: LeadType
  campaignId: string | null
  metaLeadId?: string
  externalCampaignId?: string
  externalAdSetId?: string
  externalAdId?: string
  externalFormId?: string
  externalPageId?: string
  receivedAt?: string
}

export function buildLeadAttribution(
  event: MetaLeadgenEvent,
  owner: ResolvedOwner,
  adsetId: string | null,
): MetaLeadAttribution {
  const attribution: MetaLeadAttribution = {
    workspaceId: owner.workspaceId,
    leadType: owner.objective,
    campaignId: owner.campaignId,
    externalCampaignId: owner.metaCampaignId,
  }
  if (event.leadgenId) attribution.metaLeadId = event.leadgenId
  if (adsetId) attribution.externalAdSetId = adsetId
  else if (event.adgroupId) attribution.externalAdSetId = event.adgroupId
  if (event.adId) attribution.externalAdId = event.adId
  if (event.formId) attribution.externalFormId = event.formId
  if (event.pageId) attribution.externalPageId = event.pageId
  if (typeof event.createdTime === "number") {
    attribution.receivedAt = new Date(event.createdTime * 1000).toISOString()
  }
  return attribution
}

/**
 * Full decision for one leadgen event. Never guesses a workspace, never
 * writes to `leads`, never lets a transient failure become a 5xx for Meta.
 */
export async function handleLeadgenEvent(
  event: MetaLeadgenEvent,
  processor: MetaLeadProcessor,
  lookupCampaignId: CampaignLookupFn,
): Promise<LeadgenOutcome> {
  const ctx: RecordContext = { attempt: 0, campaignId: event.campaignId, adsetId: null, via: null }
  let outcome: LeadgenOutcome

  try {
    if (!event.leadgenId) {
      outcome = { status: "unresolved", reason: "missing_leadgen_id" }
    } else {
      const claim = await processor.claim(event)
      ctx.attempt = claim.attempt
      if (claim.outcome === "duplicate") {
        outcome = { status: "duplicate" }
      } else {
        // 1. campaign_id: from the payload if present, otherwise via ad_id → Graph.
        let campaignId = event.campaignId
        if (campaignId) {
          ctx.via = "payload"
        } else if (!event.adId) {
          campaignId = null
        } else {
          const lookup = await lookupCampaignId(event.adId)
          if (lookup.ok) {
            campaignId = lookup.campaignId
            ctx.adsetId = lookup.adsetId
            ctx.via = "graph"
          } else {
            const reason = GRAPH_REASON[lookup.kind]
            outcome = lookup.retryable
              ? { status: "retryable", reason: reason as RetryableReason }
              : { status: "unresolved", reason: reason as UnresolvedReason }
            await processor.record(event, outcome, ctx)
            return outcome
          }
        }
        ctx.campaignId = campaignId

        // 2. campaign_id → explicit link → owner.
        if (!campaignId) {
          outcome = { status: "unresolved", reason: "missing_ad_id" }
        } else {
          const link = await processor.resolveLink(campaignId)
          outcome =
            link.status === "resolved"
              ? { status: "resolved", owner: link.owner, via: ctx.via ?? "payload" }
              : { status: "unresolved", reason: link.reason }
        }
      }
    }
  } catch (err) {
    outcome = { status: "error", reason: err instanceof Error ? err.name : "unknown" }
  }

  try {
    await processor.record(event, outcome, ctx)
  } catch (err) {
    console.error("[meta/processor] record failed:", err instanceof Error ? err.name : "unknown")
  }
  return outcome
}

/* -------------------------------------------------------------------------- */
/*  Firestore (Firebase Admin) implementation                                  */
/* -------------------------------------------------------------------------- */

function nowIso(): string {
  return new Date().toISOString()
}

/** Statuses/reasons that may be processed again on a later delivery. */
function isReprocessable(rec: Partial<ProcessedMetaLead>, now: number): boolean {
  if (rec.status === "retryable" || rec.status === "error") return true
  if (rec.status === "unresolved" && (rec.reason === "no_link" || rec.reason === "link_inactive")) return true
  if (rec.status === "received") {
    // A claim left open by a crashed invocation must not block the lead forever.
    const updated = typeof rec.updatedAt === "string" ? Date.parse(rec.updatedAt) : NaN
    return Number.isFinite(updated) && now - updated > STALE_CLAIM_MS
  }
  return false
}

export function createFirestoreProcessor(db: Firestore): MetaLeadProcessor {
  const processed = db.collection(COLLECTIONS.processed)
  const events = db.collection(COLLECTIONS.events)
  const links = db.collection(COLLECTIONS.links)

  return {
    async claim(event) {
      if (!event.leadgenId) return { outcome: "duplicate", attempt: 0 }
      const ref = processed.doc(event.leadgenId)
      const now = nowIso()
      // Transaction: read-then-write is atomic, so two concurrent deliveries of
      // the same leadgen_id cannot both claim it. `resolved` is terminal.
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        if (!snap.exists) {
          const record: ProcessedMetaLead = {
            leadgenId: event.leadgenId as string,
            pageId: event.pageId,
            formId: event.formId,
            adId: event.adId,
            adgroupId: event.adgroupId,
            campaignId: event.campaignId,
            adsetId: null,
            resolvedVia: null,
            receivedAt: now,
            updatedAt: now,
            attempts: 1,
            status: "received",
            workspaceId: null,
            objective: null,
            localCampaignId: null,
            reason: null,
          }
          tx.create(ref, record)
          return { outcome: "claimed" as const, attempt: 1 }
        }
        const existing = snap.data() as Partial<ProcessedMetaLead>
        if (!isReprocessable(existing, Date.now())) {
          return { outcome: "duplicate" as const, attempt: existing.attempts ?? 1 }
        }
        const attempt = (existing.attempts ?? 1) + 1
        tx.update(ref, { status: "received", updatedAt: now, attempts: attempt, reason: null })
        return { outcome: "claimed" as const, attempt }
      })
    },

    async resolveLink(metaCampaignId) {
      // Document id === metaCampaignId → one link per campaign, unique by construction.
      const snap = await links.doc(metaCampaignId).get()
      if (!snap.exists) return { status: "unresolved", reason: "no_link" }
      const link = snap.data() as Partial<MetaCampaignLink>
      if (link.active !== true) return { status: "unresolved", reason: "link_inactive" }
      if (typeof link.workspaceId !== "string" || link.workspaceId.length === 0) {
        return { status: "unresolved", reason: "link_invalid" }
      }
      if (link.objective !== "sales" && link.objective !== "recruiting") {
        return { status: "unresolved", reason: "link_invalid" }
      }
      return {
        status: "resolved",
        owner: {
          workspaceId: link.workspaceId,
          objective: link.objective,
          metaCampaignId,
          campaignId: typeof link.campaignId === "string" ? link.campaignId : null,
        },
      }
    },

    async record(event, outcome, ctx) {
      const receivedAt = nowIso()
      const owner = outcome.status === "resolved" ? outcome.owner : null
      const reason =
        outcome.status === "unresolved" || outcome.status === "retryable" || outcome.status === "error"
          ? outcome.reason
          : null

      const diagnostic: MetaWebhookEvent = {
        kind: "leadgen",
        leadgenId: event.leadgenId,
        pageId: event.pageId,
        formId: event.formId,
        adId: event.adId,
        adgroupId: event.adgroupId,
        campaignId: ctx.campaignId,
        adsetId: ctx.adsetId,
        createdTime: event.createdTime,
        receivedAt,
        outcome: outcome.status,
        reason,
        resolvedVia: ctx.via,
        attempt: ctx.attempt,
        workspaceId: owner?.workspaceId ?? null,
        objective: owner?.objective ?? null,
      }
      const writes: Promise<unknown>[] = [events.add(diagnostic)]

      // Duplicates never touch the existing record.
      if (event.leadgenId && outcome.status !== "duplicate") {
        const patch: Partial<ProcessedMetaLead> = {
          status: outcome.status,
          reason,
          updatedAt: receivedAt,
          campaignId: ctx.campaignId,
          adsetId: ctx.adsetId,
          resolvedVia: ctx.via,
          workspaceId: owner?.workspaceId ?? null,
          objective: owner?.objective ?? null,
          localCampaignId: owner?.campaignId ?? null,
        }
        writes.push(processed.doc(event.leadgenId).set(patch, { merge: true }))
      }
      await Promise.all(writes)
    },
  }
}

/* -------------------------------------------------------------------------- */
/*  Log-only fallback (no Admin credentials)                                   */
/* -------------------------------------------------------------------------- */

export function createLogOnlyProcessor(): MetaLeadProcessor {
  const seen = new Set<string>()
  return {
    async claim(event) {
      if (!event.leadgenId || seen.has(event.leadgenId)) return { outcome: "duplicate", attempt: 1 }
      seen.add(event.leadgenId)
      return { outcome: "claimed", attempt: 1 }
    },
    async resolveLink() {
      return { status: "unresolved", reason: "no_link" }
    },
    async record() {
      // Intentionally nothing.
    },
  }
}
