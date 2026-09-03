import {
  collection,
  getDocs,
  limit,
  query,
  where,
  writeBatch,
  doc,
} from "firebase/firestore"
import { db } from "./client"
import { leads as demoLeads } from "@/lib/mock-data/leads"
import { clients as demoClients } from "@/lib/mock-data/clients"
import { users as demoUsers } from "@/lib/mock-data/workspace"
import { campaigns as demoCampaigns } from "@/lib/mock-data/campaigns"

/**
 * EXPLICIT demo seeding.
 *
 * Nothing in this file runs automatically. It is only invoked from the super
 * admin tools panel, and only when `isDemoSeedEnabled()` is true:
 *   - NODE_ENV !== "production", or
 *   - NEXT_PUBLIC_ENABLE_DEMO_SEED === "true" (opt-in for a staging project)
 *
 * Seeded documents are re-mapped to the target workspace and flagged
 * `isDemo: true` so the UI can label them.
 */
export function isDemoSeedEnabled(): boolean {
  if (process.env.NEXT_PUBLIC_ENABLE_DEMO_SEED === "true") return true
  return process.env.NODE_ENV !== "production"
}

export type SeedResult = { seeded: true; count: number } | { seeded: false; reason: "disabled" | "not_empty" }

/**
 * Seeds the full demo dataset (clients, users, campaigns, leads) into
 * `workspaceId`, preserving the original ids (prefixed by workspace) so
 * cross-references keep resolving. Refuses to run if the workspace already
 * has any client, campaign, user or lead.
 */
export async function seedDemoWorkspace(workspaceId: string): Promise<SeedResult> {
  if (!isDemoSeedEnabled()) return { seeded: false, reason: "disabled" }

  for (const name of ["clients", "campaigns", "users", "leads"]) {
    const existing = await getDocs(
      query(collection(db, name), where("workspaceId", "==", workspaceId), limit(1)),
    )
    if (!existing.empty) return { seeded: false, reason: "not_empty" }
  }

  const id = (raw: string) => `${workspaceId}_${raw}`
  const batch = writeBatch(db)
  let count = 0

  for (const c of demoClients) {
    batch.set(doc(collection(db, "clients"), id(c.id)), { ...c, id: id(c.id), workspaceId, isDemo: true })
    count++
  }
  for (const u of demoUsers) {
    // Demo users must never be claimable: use a non-deliverable email domain.
    batch.set(doc(collection(db, "users"), id(u.id)), {
      ...u,
      id: id(u.id),
      workspaceId,
      authUid: null,
      // The demo dataset has a super_admin; inside a workspace that role does
      // not exist, so it is downgraded.
      role: u.role === "super_admin" ? "client_admin" : u.role,
      email: u.email.replace(/@.*$/, "@demo.invalid"),
      isDemo: true,
    })
    count++
  }
  for (const c of demoCampaigns) {
    batch.set(doc(collection(db, "campaigns"), id(c.id)), {
      ...c,
      id: id(c.id),
      workspaceId,
      clientId: id(c.clientId),
      isDemo: true,
    })
    count++
  }
  for (const l of demoLeads) {
    batch.set(doc(collection(db, "leads"), id(l.id)), {
      ...l,
      id: id(l.id),
      workspaceId,
      clientId: id(l.clientId),
      campaignId: id(l.campaignId),
      assignedToId: l.assignedToId ? id(l.assignedToId) : "",
      isDemo: true,
    })
    count++
  }

  await batch.commit()
  return { seeded: true, count }
}
