import {
  collection,
  getDocs,
  limit,
  query,
  writeBatch,
  doc,
} from "firebase/firestore"
import { db } from "./client"
import { leads as demoLeads } from "@/lib/mock-data/leads"

let seedPromise: Promise<void> | null = null

/**
 * Seeds the `leads` collection with the demo dataset the first time the app
 * runs against an empty database. Preserves the original document ids (l1..l14)
 * so that client/campaign/team lookups keep resolving.
 *
 * Idempotent: if any lead already exists, it does nothing. The in-memory
 * `seedPromise` guard also prevents duplicate work within a single session.
 */
export function seedLeadsIfEmpty(): Promise<void> {
  if (seedPromise) return seedPromise

  seedPromise = (async () => {
    const leadsCol = collection(db, "leads")
    const existing = await getDocs(query(leadsCol, limit(1)))
    if (!existing.empty) return

    const batch = writeBatch(db)
    for (const lead of demoLeads) {
      batch.set(doc(leadsCol, lead.id), lead)
    }
    await batch.commit()
  })()

  // If seeding fails, allow a later retry.
  seedPromise.catch(() => {
    seedPromise = null
  })

  return seedPromise
}
