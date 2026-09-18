import { createHash } from "node:crypto"
import { FieldValue, type DocumentData, type Firestore, type QueryDocumentSnapshot, type Transaction } from "firebase-admin/firestore"
import { getAdminDb } from "@/lib/firebase/admin"
import { leadIdentity, legacyPhoneVariants, sameLeadIdentity } from "@/lib/lead-dedup"
import type { Lead, UserRole } from "@/types"

const CLAIMS = "leadIdentityKeys"

interface DuplicatePatch {
  receivedAt?: string
}

export interface AtomicLeadCreateInput {
  lead: Omit<Lead, "id">
  actor?: { userId: string; role: UserRole }
  duplicatePatch?: DuplicatePatch
}

export interface AtomicLeadCreateResult {
  leadId: string
  created: boolean
  /** How the existing prospect was found, when it was not created. */
  matchedBy?: "external_id" | "identity" | "legacy_identity"
  duplicate: boolean
  restored: boolean
  /** True when empty fields of the existing prospect were filled in. */
  enriched: boolean
  /** Which fields were filled in, for the API response and the logs. */
  enrichedFields: string[]
}

/**
 * Descriptive fields a duplicate may FILL IN when the stored value is empty.
 *
 * Deliberately excludes everything that is identity, ownership, workflow or
 * control: id, workspaceId, createdAt, assignedToId, stage, leadType, the
 * archive flags (restoring is handled separately), closing data, and internal
 * bookkeeping such as score, emailNotifiedAt or isDemo. Those are decisions
 * somebody made inside the app; an inbound payload does not get to change
 * them, not even when they look empty.
 */
const ENRICHABLE_FIELDS = [
  "email",
  "source",
  "campaignId",
  "campaignName",
  "attributionSource",
  "temperature",
  "nextAction",
  "clientId",
  "attribution",
  "webForm",
  "recruiting",
] as const

/** Array-valued fields are merged instead of replaced. */
const MERGEABLE_ARRAY_FIELDS: string[] = ["tags", "labels"]

/**
 * Empty means: absent, null, a string that is blank once trimmed, or an empty
 * array. Anything else is a real value and is never touched.
 */
function isEmptyValue(v: unknown): boolean {
  if (v === undefined || v === null) return true
  if (typeof v === "string") return v.trim().length === 0
  if (Array.isArray(v)) return v.length === 0
  return false
}

/** Keys that must never be written through a merge (prototype pollution). */
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"])

/** Plain object, not an array, not null. */
function isPlainMap(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v)
}

/**
 * Recursively fills the gaps of `current` from `incoming`.
 *
 * At every depth the rule is the same: write a key only when the stored value
 * is empty. Nested maps recurse, so `webForm.answers` keeps every answer it
 * already had AND gains the new ones; arrays are unioned without dropping
 * elements; and `__proto__`, `prototype` and `constructor` are refused at any
 * level. Returns null when nothing would change, so an unchanged map is never
 * rewritten.
 */
function deepFillGaps(
  current: Record<string, unknown>,
  incoming: Record<string, unknown>,
  depth = 0,
): Record<string, unknown> | null {
  // Defensive bound: a hostile payload cannot make this recurse forever.
  if (depth > 8) return null
  const merged: Record<string, unknown> = { ...current }
  let changed = false

  for (const key of Object.keys(incoming)) {
    if (FORBIDDEN_KEYS.has(key)) continue
    const from = incoming[key]
    const to = current[key]
    if (isEmptyValue(from)) continue

    if (isPlainMap(from)) {
      const nested = deepFillGaps(isPlainMap(to) ? to : {}, from, depth + 1)
      if (nested) {
        merged[key] = nested
        changed = true
      }
      continue
    }

    if (Array.isArray(from)) {
      const base = Array.isArray(to) ? to : []
      const additions = from.filter((v) => !base.includes(v))
      if (additions.length > 0) {
        merged[key] = [...base, ...additions]
        changed = true
      }
      continue
    }

    // A stored scalar always wins.
    if (isEmptyValue(to)) {
      merged[key] = from
      changed = true
    }
  }

  return changed ? merged : null
}

/**
 * Fills in the gaps of `existing` from `incoming`, and nothing more.
 *
 * Rule: a field is written ONLY when the stored value is empty and the
 * incoming one is not. A populated field is never replaced, even if the
 * incoming value looks better. Arrays are merged without duplicates and no
 * existing element is ever dropped. Maps (attribution, webForm, recruiting)
 * are filled key by key with the same test, so a stored campaign id inside
 * `attribution` survives an inbound payload that carries a different one.
 */
export function enrichmentPatch(
  existing: Partial<Lead>,
  incoming: Partial<Lead>,
): { patch: DocumentData; fields: string[] } {
  const patch: DocumentData = {}
  const fields: string[] = []

  for (const field of ENRICHABLE_FIELDS) {
    const from = (incoming as Record<string, unknown>)[field]
    const to = (existing as Record<string, unknown>)[field]
    if (isEmptyValue(from)) continue

    // Maps are merged RECURSIVELY: only empty keys are filled, at any depth.
    if (isPlainMap(from)) {
      const merged = deepFillGaps(isPlainMap(to) ? to : {}, from)
      if (merged) {
        patch[field] = merged
        fields.push(field)
      }
      continue
    }

    if (isEmptyValue(to)) {
      patch[field] = from
      fields.push(field)
    }
  }

  // Arrays: union, existing order first, no element removed.
  for (const field of MERGEABLE_ARRAY_FIELDS) {
    const from = (incoming as Record<string, unknown>)[field]
    const to = (existing as Record<string, unknown>)[field]
    if (!Array.isArray(from) || from.length === 0) continue
    const current = Array.isArray(to) ? to : []
    const additions = from.filter((v) => !current.includes(v))
    if (additions.length > 0) {
      patch[field] = [...current, ...additions]
      fields.push(field)
    }
  }

  return { patch, fields }
}

/**
 * The single, unambiguous word for what happened. When a duplicate was both
 * restored AND enriched the caller still gets both facts, because `restored`
 * and `enriched` travel alongside it in the same payload.
 */
export function leadOutcomeOf(
  r: Pick<AtomicLeadCreateResult, "created" | "restored" | "enriched">,
): "created" | "restored" | "enriched" | "unchanged" {
  if (r.created) return "created"
  if (r.restored) return "restored"
  if (r.enriched) return "enriched"
  return "unchanged"
}

function claimIdFor(input: Pick<Lead, "workspaceId" | "name" | "phone">): string {
  const identity = leadIdentity(input)
  if (!identity.workspaceId || !identity.nameKey || !identity.phoneKey) {
    throw new Error("invalid_lead_identity")
  }
  return createHash("sha256")
    .update(`${identity.workspaceId}\u0000${identity.phoneKey}\u0000${identity.nameKey}`, "utf8")
    .digest("hex")
}

function chooseCanonical(docs: QueryDocumentSnapshot[]): QueryDocumentSnapshot | null {
  if (docs.length === 0) return null
  return [...docs].sort((a, b) => {
    const ad = a.data() as Partial<Lead>
    const bd = b.data() as Partial<Lead>
    // Prefer the live record; otherwise keep the oldest as the canonical one.
    if ((ad.archived === true) !== (bd.archived === true)) return ad.archived === true ? 1 : -1
    return String(ad.createdAt ?? "").localeCompare(String(bd.createdAt ?? "")) || a.id.localeCompare(b.id)
  })[0]
}

async function findLegacyMatch(
  tx: FirebaseFirestore.Transaction,
  db: Firestore,
  lead: Pick<Lead, "workspaceId" | "name" | "phone">,
): Promise<QueryDocumentSnapshot | null> {
  const found = new Map<string, QueryDocumentSnapshot>()
  for (const phone of legacyPhoneVariants(lead.phone)) {
    const snap = await tx.get(
      db.collection("leads")
        .where("workspaceId", "==", lead.workspaceId)
        .where("phone", "==", phone),
    )
    for (const doc of snap.docs) {
      const data = doc.data() as Lead
      if (sameLeadIdentity(data, lead)) found.set(doc.id, doc)
    }
  }
  return chooseCanonical([...found.values()])
}

function duplicateUpdate(
  data: Partial<Lead>,
  input: AtomicLeadCreateInput,
): { patch: DocumentData | null; enrichedFields: string[] } {
  const patch: DocumentData = {}
  if (input.duplicatePatch?.receivedAt) patch.receivedAt = input.duplicatePatch.receivedAt
  // Restoring is the one archive-related change a duplicate may cause.
  if (data.archived === true) {
    patch.archived = false
    patch.archivedAt = null
    patch.archivedBy = null
    patch.archivedByName = null
  }
  // …and filling in the gaps, which never overwrites anything.
  const { patch: enrich, fields } = enrichmentPatch(data, input.lead)
  Object.assign(patch, enrich)
  return { patch: Object.keys(patch).length > 0 ? patch : null, enrichedFields: fields }
}

/**
 * Creates one prospect or returns/reactivates the canonical existing one.
 *
 * The identity claim and lead are written in the SAME Firestore transaction.
 * Concurrent website/manual submissions therefore contend on one claim doc;
 * one creates the lead and every retry receives that same lead id.
 */
/**
 * Finds a prior lead carrying the SAME `webForm.externalId` in the SAME
 * workspace. Read inside the transaction so the restore/enrichment it leads
 * to is atomic with everything else.
 *
 * The workspace comes from the resolved integration, never from the request
 * body, and it is part of the query — a payload cannot reach another tenant's
 * lead by guessing an external id.
 */
async function findByExternalId(
  tx: Transaction,
  db: Firestore,
  workspaceId: string,
  externalId: string,
): Promise<QueryDocumentSnapshot | null> {
  const snap = await tx.get(
    db.collection("leads")
      .where("workspaceId", "==", workspaceId)
      .where("webForm.externalId", "==", externalId)
      .limit(1),
  )
  const doc = snap.docs[0]
  if (!doc) return null
  // Belt and braces: the query already filters by workspace, but the document
  // is re-checked before anything is written to it.
  return (doc.data() as Partial<Lead>).workspaceId === workspaceId ? doc : null
}

export async function createOrReuseLeadAtomic(
  input: AtomicLeadCreateInput,
  db: Firestore = getAdminDb(),
): Promise<AtomicLeadCreateResult> {
  const identity = leadIdentity(input.lead)
  if (!identity.workspaceId || !identity.nameKey || !identity.phoneKey) {
    throw new Error("invalid_lead_identity")
  }

  const claimRef = db.collection(CLAIMS).doc(claimIdFor(input.lead))
  return db.runTransaction(async (tx) => {
    /**
     * Idempotency by external id comes FIRST and is preserved: a retry
     * carrying the id the origin system assigned never creates a second
     * lead. What changed is that it no longer returns bare — it now goes
     * through the same restore + enrichment patch as every other duplicate,
     * inside this transaction.
     */
    const externalId = input.lead.webForm?.externalId
    if (externalId) {
      const prior = await findByExternalId(tx, db, input.lead.workspaceId, externalId)
      if (prior) {
        const data = prior.data() as Partial<Lead>
        const { patch, enrichedFields } = duplicateUpdate(data, input)
        if (patch) tx.update(prior.ref, patch)
        return {
          leadId: prior.id,
          created: false,
          duplicate: true,
          matchedBy: "external_id" as const,
          restored: data.archived === true,
          enriched: enrichedFields.length > 0,
          enrichedFields,
        }
      }
    }

    const claimSnap = await tx.get(claimRef)
    if (claimSnap.exists) {
      const claimedId = claimSnap.get("leadId")
      if (typeof claimedId === "string" && claimedId) {
        const ref = db.collection("leads").doc(claimedId)
        const snap = await tx.get(ref)
        if (snap.exists && sameLeadIdentity(snap.data() as Lead, input.lead)) {
          const data = snap.data() as Partial<Lead>
          const { patch, enrichedFields } = duplicateUpdate(data, input)
          if (patch) tx.update(ref, patch)
          return {
            leadId: ref.id,
            created: false,
            duplicate: true,
            matchedBy: "identity" as const,
            restored: data.archived === true,
            enriched: enrichedFields.length > 0,
            enrichedFields,
          }
        }
      }
    }

    // Backfill the claim lazily for records created before this feature.
    const legacy = await findLegacyMatch(tx, db, input.lead)
    if (legacy) {
      const data = legacy.data() as Partial<Lead>
      const { patch, enrichedFields } = duplicateUpdate(data, input)
      if (patch) tx.update(legacy.ref, patch)
      tx.set(claimRef, {
        workspaceId: identity.workspaceId,
        nameKey: identity.nameKey,
        phoneKey: identity.phoneKey,
        leadId: legacy.id,
        createdAt: FieldValue.serverTimestamp(),
      })
      return {
        leadId: legacy.id,
        created: false,
        duplicate: true,
        matchedBy: "legacy_identity" as const,
        restored: data.archived === true,
        enriched: enrichedFields.length > 0,
        enrichedFields,
      }
    }

    const leadRef = db.collection("leads").doc()
    tx.create(leadRef, input.lead)
    tx.set(claimRef, {
      workspaceId: identity.workspaceId,
      nameKey: identity.nameKey,
      phoneKey: identity.phoneKey,
      leadId: leadRef.id,
      createdAt: FieldValue.serverTimestamp(),
    })

    if (input.actor?.userId) {
      const activityRef = leadRef.collection("activities").doc()
      tx.create(activityRef, {
        workspaceId: input.lead.workspaceId,
        leadId: leadRef.id,
        type: "lead_created",
        actorId: input.actor.userId,
        actorRole: input.actor.role,
        createdAt: new Date().toISOString(),
        createdAtServer: FieldValue.serverTimestamp(),
      })
    }
    return {
      leadId: leadRef.id,
      created: true,
      duplicate: false,
      restored: false,
      enriched: false,
      enrichedFields: [],
    }
  })
}
