import { collection, getDocs, query, where, writeBatch, doc, type DocumentData } from "firebase/firestore"
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

/* -------------------------------------------------------------------------- */
/*  Phase 2 normalization: leadType on leads, objective on campaigns          */
/* -------------------------------------------------------------------------- */

/**
 * Idempotent, workspace-scoped, additive:
 *   - leads without `leadType`            → leadType = "sales"
 *     (decision documented in ARCHITECTURE.md §"Ventas y Reclutamiento":
 *      every pre-Phase-2 record was a commercial prospect)
 *   - campaigns without `objective`        → objective = campaignType ?? "sales"
 * Nothing else on the documents is touched. Runs on the ACTIVE workspace only
 * (super admin tools), so it never reads across tenants.
 */
export interface NormalizationScan {
  leads: string[]
  campaigns: string[]
  total: number
}

export async function scanPhase2Normalization(workspaceId: string): Promise<NormalizationScan> {
  const [leadsSnap, campaignsSnap] = await Promise.all([
    getDocs(query(collection(db, "leads"), where("workspaceId", "==", workspaceId))),
    getDocs(query(collection(db, "campaigns"), where("workspaceId", "==", workspaceId))),
  ])
  const leads = leadsSnap.docs
    .filter((d) => {
      const v = d.data().leadType
      return v !== "sales" && v !== "recruiting"
    })
    .map((d) => d.id)
  const campaigns = campaignsSnap.docs
    .filter((d) => {
      const v = d.data().objective
      return v !== "sales" && v !== "recruiting"
    })
    .map((d) => d.id)
  return { leads, campaigns, total: leads.length + campaigns.length }
}

export async function runPhase2Normalization(
  scan: NormalizationScan,
  workspaceId: string,
): Promise<number> {
  let done = 0
  let batch = writeBatch(db)
  let inBatch = 0
  const flush = async () => {
    if (inBatch === 0) return
    await batch.commit()
    batch = writeBatch(db)
    inBatch = 0
  }

  const campaignsSnap = await getDocs(
    query(collection(db, "campaigns"), where("workspaceId", "==", workspaceId)),
  )
  const wantedCampaigns = new Set(scan.campaigns)
  for (const d of campaignsSnap.docs) {
    if (!wantedCampaigns.has(d.id)) continue
    const data = d.data()
    if (data.objective === "sales" || data.objective === "recruiting") continue
    const objective = data.campaignType === "recruiting" ? "recruiting" : "sales"
    batch.update(doc(db, "campaigns", d.id), { objective })
    done++
    if (++inBatch >= 400) await flush()
  }

  const wantedLeads = new Set(scan.leads)
  const leadsSnap = await getDocs(query(collection(db, "leads"), where("workspaceId", "==", workspaceId)))
  for (const d of leadsSnap.docs) {
    if (!wantedLeads.has(d.id)) continue
    const v = d.data().leadType
    if (v === "sales" || v === "recruiting") continue
    batch.update(doc(db, "leads", d.id), { leadType: "sales" })
    done++
    if (++inBatch >= 400) await flush()
  }

  await flush()
  return done
}
