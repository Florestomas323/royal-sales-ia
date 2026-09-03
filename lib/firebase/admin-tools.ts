import { collection, getDocs, writeBatch, doc, type DocumentData } from "firebase/firestore"
import { db } from "./client"

/**
 * Migration tool (super admin only — Rules deny these reads to anyone else).
 *
 * Finds documents created BEFORE the multi-tenant model (no `workspaceId`)
 * and assigns them to a workspace. Non-destructive:
 *   - never touches documents that already have `workspaceId`
 *   - only ADDS fields (workspaceId, and defaults for leadType / campaignType
 *     / authUid when missing)
 *
 * Firestore cannot query "field is missing", so we read the collection and
 * filter in memory. Acceptable for a one-off migration at current scale.
 */

export const MIGRATABLE_COLLECTIONS = ["clients", "users", "campaigns", "leads"] as const
export type MigratableCollection = (typeof MIGRATABLE_COLLECTIONS)[number]

export interface MigrationScan {
  pending: Record<MigratableCollection, string[]>
  total: number
}

function needsMigration(data: DocumentData): boolean {
  return typeof data.workspaceId !== "string" || data.workspaceId.length === 0
}

export async function scanLegacyDocuments(): Promise<MigrationScan> {
  const pending = { clients: [], users: [], campaigns: [], leads: [] } as Record<
    MigratableCollection,
    string[]
  >
  for (const name of MIGRATABLE_COLLECTIONS) {
    const snap = await getDocs(collection(db, name))
    for (const d of snap.docs) {
      if (needsMigration(d.data())) pending[name].push(d.id)
    }
  }
  const total = MIGRATABLE_COLLECTIONS.reduce((s, n) => s + pending[n].length, 0)
  return { pending, total }
}

function defaultsFor(name: MigratableCollection, data: DocumentData): DocumentData {
  switch (name) {
    case "leads":
      return { leadType: typeof data.leadType === "string" ? data.leadType : "sales" }
    case "campaigns":
      return { campaignType: typeof data.campaignType === "string" ? data.campaignType : "sales" }
    case "users":
      return { authUid: typeof data.authUid === "string" ? data.authUid : null }
    default:
      return {}
  }
}

/** Assigns every pending document to `workspaceId`. Batches of 400. */
export async function migrateLegacyDocuments(
  scan: MigrationScan,
  workspaceId: string,
): Promise<number> {
  let migrated = 0
  let batch = writeBatch(db)
  let inBatch = 0

  for (const name of MIGRATABLE_COLLECTIONS) {
    // Re-read each doc so defaults are computed from current data.
    const snap = await getDocs(collection(db, name))
    const wanted = new Set(scan.pending[name])
    for (const d of snap.docs) {
      if (!wanted.has(d.id)) continue
      const data = d.data()
      if (!needsMigration(data)) continue
      batch.update(doc(db, name, d.id), { workspaceId, ...defaultsFor(name, data) })
      migrated++
      inBatch++
      if (inBatch >= 400) {
        await batch.commit()
        batch = writeBatch(db)
        inBatch = 0
      }
    }
  }
  if (inBatch > 0) await batch.commit()
  return migrated
}
