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
export async function upsertCampaignLink(db: Firestore, input: CampaignLinkInput): Promise<MetaCampaignLink> {
  const ref = linksCol(db).doc(input.metaCampaignId)
  const now = new Date().toISOString()
  const existing = await ref.get()
  const previous = existing.exists ? (existing.data() as Partial<MetaCampaignLink>) : null

  const link: MetaCampaignLink = {
    metaCampaignId: input.metaCampaignId,
    workspaceId: input.workspaceId,
    objective: input.objective,
    active: input.active,
    campaignId: previous?.campaignId ?? null,
    pageId: previous?.pageId ?? null,
    formIds: previous?.formIds ?? [],
    metaCampaignName: input.metaCampaignName ?? previous?.metaCampaignName ?? null,
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
