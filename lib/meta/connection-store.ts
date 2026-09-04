import type { Firestore } from "firebase-admin/firestore"
import type { MetaConnection } from "@/types"
import type { GraphFailure } from "./graph"
import type { MetaInventory } from "./inventory"

/**
 * SERVER-ONLY persistence of a workspace's Meta connection at
 * `integrations/{workspaceId}_meta`. The collection is closed to clients by
 * Security Rules; only Firebase Admin reads/writes it.
 */

export const INTEGRATIONS_COLLECTION = "integrations"

export function metaConnectionDocId(workspaceId: string): string {
  return `${workspaceId}_meta`
}

export async function readMetaConnection(db: Firestore, workspaceId: string): Promise<MetaConnection | null> {
  const snap = await db.collection(INTEGRATIONS_COLLECTION).doc(metaConnectionDocId(workspaceId)).get()
  if (!snap.exists) return null
  return { ...(snap.data() as Omit<MetaConnection, "id">), id: snap.id }
}

export function emptyMetaConnection(workspaceId: string): MetaConnection {
  return {
    id: metaConnectionDocId(workspaceId),
    workspaceId,
    provider: "meta_ads",
    status: "not_connected",
    account: null,
    businesses: [],
    adAccount: null,
    adAccounts: [],
    page: null,
    pages: [],
    leadForms: [],
    campaigns: [],
    permissions: [],
    capabilities: {
      adsRead: false,
      adsManagement: false,
      businessManagement: false,
      leadsRetrieval: false,
      pagesAccess: false,
    },
    leadAdsStatus: "unknown",
    syncReport: null,
    missingPermissions: [],
    leadAdsActive: false,
    lastSyncAt: null,
    connectedAt: null,
    connectedByUserId: null,
    secretRef: null,
    lastError: null,
  }
}

/**
 * Merges a fresh inventory into the stored connection. The preferred ad
 * account / page are kept if still reachable; otherwise a single reachable
 * asset is auto-selected; otherwise left null for the admin to choose.
 */
export function mergeInventory(
  previous: MetaConnection | null,
  workspaceId: string,
  inv: MetaInventory,
  selection: { adAccountId?: string | null; pageId?: string | null },
  now: string,
  connectedByUserId: string | null,
): MetaConnection {
  const base = previous ?? emptyMetaConnection(workspaceId)

  const wantedAd = selection.adAccountId ?? base.adAccount?.id ?? null
  const adAccount =
    (wantedAd ? inv.adAccounts.find((a) => a.id === wantedAd || a.accountId === wantedAd) : undefined) ??
    (inv.adAccounts.length === 1 ? inv.adAccounts[0] : null)

  const wantedPage = selection.pageId ?? base.page?.id ?? null
  const page =
    (wantedPage ? inv.pages.find((p) => p.id === wantedPage) : undefined) ??
    (inv.pages.length === 1 ? inv.pages[0] : null)

  return {
    ...base,
    id: metaConnectionDocId(workspaceId),
    workspaceId,
    provider: "meta_ads",
    status: "connected",
    account: inv.account,
    businesses: inv.businesses,
    adAccount,
    adAccounts: inv.adAccounts,
    page,
    pages: inv.pages,
    leadForms: inv.leadForms,
    campaigns: inv.campaigns,
    permissions: inv.permissions,
    capabilities: inv.capabilities,
    leadAdsStatus: inv.leadAdsStatus,
    syncReport: inv.syncReport,
    missingPermissions: inv.missingPermissions,
    leadAdsActive: inv.leadAdsStatus === "active",
    lastSyncAt: now,
    connectedAt: base.connectedAt ?? now,
    connectedByUserId: connectedByUserId ?? base.connectedByUserId,
    secretRef: "env:META_ACCESS_TOKEN",
    lastError: null,
  }
}

export function markConnectionFailed(previous: MetaConnection | null, workspaceId: string, failure: GraphFailure, now: string): MetaConnection {
  const base = previous ?? emptyMetaConnection(workspaceId)
  const status: MetaConnection["status"] =
    failure.kind === "auth" ? "expired" : failure.kind === "not_configured" ? "not_connected" : "error"
  return { ...base, id: metaConnectionDocId(workspaceId), workspaceId, status, lastError: failure.kind, lastSyncAt: now }
}

export async function writeMetaConnection(db: Firestore, connection: MetaConnection): Promise<void> {
  const { id, ...data } = connection
  await db.collection(INTEGRATIONS_COLLECTION).doc(id).set(data, { merge: false })
}
