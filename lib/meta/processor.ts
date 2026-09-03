import type { Firestore } from "firebase-admin/firestore"
import type {
  LeadType,
  MetaCampaignLink,
  MetaWebhookEvent,
  ProcessedMetaLead,
} from "@/types"
import type { MetaLeadgenEvent } from "./types"

/**
 * Lead Ads processing contract. The webhook route only talks to this
 * interface.
 *
 *  - `createFirestoreProcessor(adminDb)` — persistent (Firebase Admin, server
 *    only). Idempotency via a transaction on `processedMetaLeads/{leadgenId}`;
 *    owner resolution ONLY through `metaCampaignLinks/{metaCampaignId}`.
 *  - `createLogOnlyProcessor()` — fallback when Admin is not configured:
 *    nothing is persisted, every event ends `unresolved`.
 *
 * Neither implementation ever creates a document in `leads`. That is the next
 * phase, after the owner can be resolved and the lead downloaded via OAuth.
 */

export const COLLECTIONS = {
  processed: "processedMetaLeads",
  events: "metaWebhookEvents",
  links: "metaCampaignLinks",
} as const

export interface ResolvedOwner {
  workspaceId: string
  objective: LeadType
  campaignId: string | null
}

export type UnresolvedReason = "missing_leadgen_id" | "missing_campaign_id" | "no_link"

export type LeadgenOutcome =
  | { status: "duplicate" }
  | { status: "unresolved"; reason: UnresolvedReason }
  | { status: "resolved"; owner: ResolvedOwner }
  | { status: "error"; reason: string }

export interface MetaLeadProcessor {
  /**
   * Atomically claims a leadgen_id. Returns "duplicate" if it was already
   * claimed by this or a concurrent invocation.
   */
  claim(event: MetaLeadgenEvent): Promise<"claimed" | "duplicate">
  /**
   * Finds the OWNER workspace. Resolves exclusively via an explicit, active
   * campaign link keyed by Meta campaign id — NEVER via page_id, form_id,
   * ad_id, adgroup_id or campaign names.
   */
  resolveOwner(event: MetaLeadgenEvent): Promise<ResolvedOwner | null>
  /** Persists the outcome (status on the processed record + diagnostic event). */
  record(event: MetaLeadgenEvent, outcome: LeadgenOutcome): Promise<void>
}

/** Runs the full decision for one leadgen event. Never guesses a workspace. */
export async function handleLeadgenEvent(
  event: MetaLeadgenEvent,
  processor: MetaLeadProcessor,
): Promise<LeadgenOutcome> {
  let outcome: LeadgenOutcome
  try {
    if (!event.leadgenId) {
      outcome = { status: "unresolved", reason: "missing_leadgen_id" }
    } else if ((await processor.claim(event)) === "duplicate") {
      outcome = { status: "duplicate" }
    } else if (!event.campaignId) {
      outcome = { status: "unresolved", reason: "missing_campaign_id" }
    } else {
      const owner = await processor.resolveOwner(event)
      outcome = owner ? { status: "resolved", owner } : { status: "unresolved", reason: "no_link" }
    }
  } catch (err) {
    outcome = { status: "error", reason: err instanceof Error ? err.name : "unknown" }
  }

  try {
    await processor.record(event, outcome)
  } catch (err) {
    // Recording must never turn a handled event into a 5xx for Meta.
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

export function createFirestoreProcessor(db: Firestore): MetaLeadProcessor {
  const processed = db.collection(COLLECTIONS.processed)
  const events = db.collection(COLLECTIONS.events)
  const links = db.collection(COLLECTIONS.links)

  return {
    async claim(event) {
      if (!event.leadgenId) return "duplicate"
      const ref = processed.doc(event.leadgenId)
      // Transaction: read-then-create is atomic, so two concurrent deliveries
      // of the same leadgen_id cannot both claim it.
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        if (snap.exists) return "duplicate" as const
        const record: ProcessedMetaLead = {
          leadgenId: event.leadgenId as string,
          pageId: event.pageId,
          formId: event.formId,
          adId: event.adId,
          adgroupId: event.adgroupId,
          campaignId: event.campaignId,
          receivedAt: nowIso(),
          status: "received",
          workspaceId: null,
          objective: null,
          reason: null,
        }
        tx.create(ref, record)
        return "claimed" as const
      })
    },

    async resolveOwner(event) {
      if (!event.campaignId) return null
      // Document id === metaCampaignId → one link per campaign, unique by construction.
      const snap = await links.doc(event.campaignId).get()
      if (!snap.exists) return null
      const link = snap.data() as Partial<MetaCampaignLink>
      if (link.active !== true) return null
      if (typeof link.workspaceId !== "string" || link.workspaceId.length === 0) return null
      if (link.objective !== "sales" && link.objective !== "recruiting") return null
      return {
        workspaceId: link.workspaceId,
        objective: link.objective,
        campaignId: typeof link.campaignId === "string" ? link.campaignId : null,
      }
    },

    async record(event, outcome) {
      const receivedAt = nowIso()
      const resolved = outcome.status === "resolved" ? outcome.owner : null
      const reason =
        outcome.status === "unresolved" || outcome.status === "error" ? outcome.reason : null

      const diagnostic: MetaWebhookEvent = {
        kind: "leadgen",
        leadgenId: event.leadgenId,
        pageId: event.pageId,
        formId: event.formId,
        adId: event.adId,
        adgroupId: event.adgroupId,
        campaignId: event.campaignId,
        createdTime: event.createdTime,
        receivedAt,
        outcome: outcome.status,
        reason,
        workspaceId: resolved?.workspaceId ?? null,
        objective: resolved?.objective ?? null,
      }
      const writes: Promise<unknown>[] = [events.add(diagnostic)]

      // Duplicates keep the original record untouched.
      if (event.leadgenId && outcome.status !== "duplicate") {
        const status: ProcessedMetaLead["status"] =
          outcome.status === "resolved" ? "resolved" : outcome.status === "error" ? "error" : "unresolved"
        writes.push(
          processed.doc(event.leadgenId).set(
            {
              status,
              reason,
              workspaceId: resolved?.workspaceId ?? null,
              objective: resolved?.objective ?? null,
            },
            { merge: true },
          ),
        )
      }
      await Promise.all(writes)
    },
  }
}

/* -------------------------------------------------------------------------- */
/*  Log-only fallback (no Admin credentials)                                   */
/* -------------------------------------------------------------------------- */

/**
 * Used only when Firebase Admin is not configured. Nothing persists; the
 * in-memory set just avoids double-logging on a warm instance. Every event
 * ends "unresolved" because no link storage is reachable.
 */
export function createLogOnlyProcessor(): MetaLeadProcessor {
  const seen = new Set<string>()
  return {
    async claim(event) {
      if (!event.leadgenId || seen.has(event.leadgenId)) return "duplicate"
      seen.add(event.leadgenId)
      return "claimed"
    },
    async resolveOwner() {
      return null
    },
    async record() {
      // Intentionally nothing.
    },
  }
}
