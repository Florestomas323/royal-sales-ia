import type { Firestore } from "firebase-admin/firestore"
import { COLLECTIONS } from "./processor"
import type { LeadType, MetaCampaignLink } from "@/types"

/**
 * SERVER-ONLY access to `metaCampaignLinks` — the collection that decides
 * WHICH WORKSPACE OWNS a Meta lead.
 *
 * Document id === Meta campaign id, so a campaign can belong to exactly one
 * workspace by construction. Ownership is never derived from page_id,
 * form_id, ad_id or campaign names (see META.md).
 *
 * The collection stays closed to browsers by Security Rules; everything here
 * runs with Firebase Admin behind an authenticated Route Handler.
 */

export interface CampaignLinkInput {
  metaCampaignId: string
  workspaceId: string
  objective: LeadType
  active: boolean
  metaCampaignName?: string | null
  /** Meta's effective_status, so the local mirror shows the real state. */
  metaCampaignStatus?: string | null
  adAccountId?: string | null
  assignedByUserId: string | null
}

function linksCol(db: Firestore) {
  return db.collection(COLLECTIONS.links)
}

export async function getCampaignLink(db: Firestore, metaCampaignId: string): Promise<MetaCampaignLink | null> {
  const snap = await linksCol(db).doc(metaCampaignId).get()
  if (!snap.exists) return null
  return { ...(snap.data() as MetaCampaignLink), metaCampaignId: snap.id }
}

/**
 * Links visible to the caller.
 *  - super_admin (`workspaceId === null`) → all links
 *  - anyone else → only their workspace's links
 */
export async function listCampaignLinks(db: Firestore, workspaceId: string | null): Promise<MetaCampaignLink[]> {
  const query = workspaceId ? linksCol(db).where("workspaceId", "==", workspaceId) : linksCol(db)
  const snap = await query.get()
  return snap.docs.map((d) => ({ ...(d.data() as MetaCampaignLink), metaCampaignId: d.id }))
}

/**
 * Creates or updates the link for a campaign. Reassigning a campaign to a
 * different workspace overwrites the same document, so a campaign can never
 * end up owned by two workspaces at once.
 *
 * Leads already stored keep the workspace they were created with: this only
 * affects leads received from now on.
 */
/**
 * The LOCAL `campaigns` document that mirrors one Meta campaign inside one
 * workspace. Find-or-create, keyed by (workspaceId, externalId): assigning
 * the same campaign twice — or syncing again — returns the same document,
 * never a second one. Manual campaigns (no externalId) are never touched.
 *
 * Only identity is written here: name, platform, objective, status and the
 * Meta id. Spend and performance are NOT copied — they keep coming live from
 * Meta through the insights route, so nothing is invented or goes stale.
 */
/**
 * Meta's campaign status → the local one.
 *
 *   ACTIVE                     → "active"
 *   PAUSED / CAMPAIGN_PAUSED   → "paused"
 *   ANY other non-empty state  → "ended"   (ARCHIVED, DELETED, IN_PROCESS,
 *                                           WITH_ISSUES, anything new)
 *   null / undefined / ""      → null      (Meta said nothing)
 *
 * Only the first two are listed in Campañas and offered for attribution.
 * Everything else lands on `ended` on purpose: a campaign that stops being
 * ACTIVE must not keep an "active" mirror, and an unrecognised state must
 * never be presented as running or as merely paused. `null` means "no
 * information", which leaves a stored status untouched.
 */
export function localStatusFor(metaStatus: string | null | undefined): "active" | "paused" | "ended" | null {
  const s = (metaStatus ?? "").trim().toUpperCase()
  if (s === "") return null
  if (s === "ACTIVE") return "active"
  if (s === "PAUSED" || s === "CAMPAIGN_PAUSED") return "paused"
  return "ended"
}

export async function ensureLocalCampaign(
  db: Firestore,
  input: {
    workspaceId: string
    metaCampaignId: string
    name: string | null
    objective: LeadType
    /** Meta's effective_status; when unknown the stored status is kept. */
    metaStatus?: string | null
  },
): Promise<string> {
  const campaigns = db.collection("campaigns")
  const found = await campaigns
    .where("workspaceId", "==", input.workspaceId)
    .where("externalId", "==", input.metaCampaignId)
    .limit(1)
    .get()
  if (!found.empty) {
    const doc = found.docs[0]
    const current = doc.data() as { name?: string; objective?: LeadType; status?: string }
    // Keep the name in step with Meta if the operator renamed it there, the
    // objective in step with the assignment, and the STATUS in step with
    // Meta (active / paused). Nothing else is rewritten.
    const patch: Record<string, unknown> = {}
    if (input.name && current.name !== input.name) patch.name = input.name
    if (input.metaStatus != null) {
      const status = localStatusFor(input.metaStatus)
      // An unrecognised Meta state changes nothing: better a stale but
      // truthful status than a wrong one.
      if (status !== null && current.status !== status) patch.status = status
    }
    if (current.objective !== input.objective) { patch.objective = input.objective; patch.campaignType = input.objective }
    if (Object.keys(patch).length > 0) await doc.ref.set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true })
    return doc.id
  }
  const ref = campaigns.doc()
  const now = new Date().toISOString()
  await ref.set({
    workspaceId: input.workspaceId,
    objective: input.objective,
    campaignType: input.objective,
    name: input.name ?? input.metaCampaignId,
    platform: "meta",
    // A brand new mirror whose state Meta has not confirmed is NOT assumed to
    // be running: it starts as `ended`, so it neither shows in the normal list
    // nor inflates "Campañas activas". The reconcile promotes it to active or
    // paused as soon as Meta reports one of those.
    status: localStatusFor(input.metaStatus) ?? "ended",
    spend: 0, leads: 0, cpl: 0, appointments: 0, sales: 0, revenue: 0, roas: 0,
    clientId: "",
    externalId: input.metaCampaignId,
    createdAt: now,
    updatedAt: now,
  })
  return ref.id
}

export async function upsertCampaignLink(db: Firestore, input: CampaignLinkInput): Promise<MetaCampaignLink> {
  const ref = linksCol(db).doc(input.metaCampaignId)
  const now = new Date().toISOString()
  const existing = await ref.get()
  const previous = existing.exists ? (existing.data() as Partial<MetaCampaignLink>) : null

  // The local mirror lives in the workspace the campaign is assigned to. A
  // reassignment therefore resolves (or creates) the mirror in the NEW
  // workspace; the old workspace's document is left as it was, since it may
  // carry history nobody asked to erase.
  const campaignId = await ensureLocalCampaign(db, {
    workspaceId: input.workspaceId,
    metaCampaignId: input.metaCampaignId,
    name: input.metaCampaignName ?? previous?.metaCampaignName ?? null,
    objective: input.objective,
    metaStatus: input.metaCampaignStatus ?? previous?.metaCampaignStatus ?? null,
  })

  const link: MetaCampaignLink = {
    metaCampaignId: input.metaCampaignId,
    workspaceId: input.workspaceId,
    objective: input.objective,
    active: input.active,
    campaignId,
    pageId: previous?.pageId ?? null,
    formIds: previous?.formIds ?? [],
    metaCampaignName: input.metaCampaignName ?? previous?.metaCampaignName ?? null,
    metaCampaignStatus: input.metaCampaignStatus ?? previous?.metaCampaignStatus ?? null,
    adAccountId: input.adAccountId ?? previous?.adAccountId ?? null,
    assignedByUserId: input.assignedByUserId,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  }
  const { metaCampaignId, ...data } = link
  await ref.set(data, { merge: false })
  return link
}

/** Removes a link. Leads already created keep their workspace. */
export async function deleteCampaignLink(db: Firestore, metaCampaignId: string): Promise<void> {
  await linksCol(db).doc(metaCampaignId).delete()
}
