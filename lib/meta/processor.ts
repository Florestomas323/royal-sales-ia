import type { LeadType } from "@/types"
import type { MetaLeadgenEvent } from "./types"

/**
 * Lead Ads processing contract. The webhook route only talks to this
 * interface, so persistence can be added without touching the endpoint.
 *
 * FASE 1 (this phase): `createLogOnlyProcessor()` — no Firestore writes.
 *   Reason: the repo has no Firebase Admin SDK / service account. Writing
 *   from a public Route Handler with the CLIENT SDK would be unauthenticated
 *   (Rules would deny it) and would be the wrong security model. See META.md
 *   §"Lo que falta para persistir".
 *
 * FASE siguiente: `createFirestoreProcessor(adminDb)` implementing the same
 * three methods over server-only collections:
 *   processedMetaLeads/{leadgenId}   → idempotency
 *   metaCampaignLinks/{id}           → owner resolution (ad/adset/campaign/form → workspace)
 *   metaWebhookEvents/{autoId}       → unresolved / audit log
 */

export interface ResolvedOwner {
  workspaceId: string
  objective: LeadType
  campaignId: string | null
  assignedToId: string | null
}

export type LeadgenOutcome =
  | { status: "duplicate" }
  | { status: "unresolved"; reason: "missing_ids" | "no_link" }
  | { status: "resolved"; owner: ResolvedOwner }

export interface MetaLeadProcessor {
  /** True if this leadgen_id was already handled (idempotency). */
  hasProcessed(leadgenId: string): Promise<boolean>
  /**
   * Finds the OWNER workspace of the lead. Must resolve through an explicit
   * campaign link (ad_id / adgroup_id / form_id) — NEVER through page_id and
   * NEVER through campaign names.
   */
  resolveOwner(event: MetaLeadgenEvent): Promise<ResolvedOwner | null>
  /** Persists the outcome (processed marker / unresolved record). */
  record(event: MetaLeadgenEvent, outcome: LeadgenOutcome): Promise<void>
}

/**
 * Runs the full decision for one leadgen event. Never creates a lead in a
 * guessed workspace: without a resolved owner the outcome is "unresolved".
 */
export async function handleLeadgenEvent(
  event: MetaLeadgenEvent,
  processor: MetaLeadProcessor,
): Promise<LeadgenOutcome> {
  let outcome: LeadgenOutcome

  if (!event.leadgenId) {
    outcome = { status: "unresolved", reason: "missing_ids" }
  } else if (await processor.hasProcessed(event.leadgenId)) {
    outcome = { status: "duplicate" }
  } else if (!event.adId && !event.adgroupId && !event.formId) {
    // Nothing that can be linked to a campaign → cannot determine the owner.
    outcome = { status: "unresolved", reason: "missing_ids" }
  } else {
    const owner = await processor.resolveOwner(event)
    outcome = owner ? { status: "resolved", owner } : { status: "unresolved", reason: "no_link" }
  }

  await processor.record(event, outcome)
  return outcome
}

/**
 * Phase-1 processor: remembers leadgen ids only for the lifetime of the
 * server instance (protects against immediate retries on a warm instance;
 * NOT durable) and never resolves an owner, so no lead is ever created.
 */
export function createLogOnlyProcessor(): MetaLeadProcessor {
  const seen = new Set<string>()
  return {
    async hasProcessed(leadgenId) {
      return seen.has(leadgenId)
    },
    async resolveOwner() {
      // No metaCampaignLinks storage yet → nothing can be resolved.
      return null
    },
    async record(event, outcome) {
      if (event.leadgenId && outcome.status !== "duplicate") seen.add(event.leadgenId)
    },
  }
}
