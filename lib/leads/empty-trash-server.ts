import { FieldPath, FieldValue, type Firestore } from "firebase-admin/firestore"
import { NOTIFICATIONS } from "@/lib/notifications"

/**
 * Deletion of the ARCHIVED prospects of ONE workspace, as a reusable helper.
 *
 * The route is a thin authenticated wrapper around this function, and the
 * tests import and run THIS code — nothing is transcribed anywhere.
 *
 * ## The race, and how it is closed
 *
 * Deleting a lead's relations before checking whether somebody restored it
 * loses data: the lead survives with no activities, no appointments, no
 * notifications and no dedup key. So the purge CLAIMS the lead first:
 *
 *   1. one transaction verifies workspace + archived and stamps
 *      `purgeClaimId` / `purgeClaimedAt` on the lead itself;
 *   2. only then are its relations deleted;
 *   3. a second transaction verifies the claim is still ours and deletes the
 *      lead;
 *   4. on any failure the claim is RELEASED, so the lead stays restorable
 *      and the next run retries it.
 *
 * Restore is blocked while a claim is held — enforced by the Security Rules
 * (`leads` update refuses clearing `archived` while `purgeClaimId` is set),
 * which is the one rule change this feature needed. A claim older than
 * STALE_CLAIM_MS counts as abandoned and may be taken over, so a crashed run
 * never leaves a lead locked forever.
 */
const PAGE = 100
const BATCH = 400
/** A claim left behind by a crashed run stops protecting after this. */
export const STALE_CLAIM_MS = 5 * 60 * 1000

const RELATED_WITH_WORKSPACE = ["appointments", NOTIFICATIONS, "leadIdentityKeys"] as const

/** Outcome of the per-lead delete transaction. */
type DeleteOutcome = "deleted" | "already_missing" | "conflict"

/**
 * Outcome of the claim. Explicitly three-valued: a lead that is simply gone
 * is NOT the same as one somebody restored or another run holds, and they are
 * counted differently.
 */
type ClaimOutcome = "claimed" | "already_missing" | "conflict"

export interface EmptyTrashOutcome {
  workspaceId: string
  /** Lead documents THIS run actually deleted. */
  deletedCount: number
  /** Leads left behind: a relation failed, or they were restored / moved. */
  pendingCount: number
  /** Of those, skipped because they stopped being archived, moved, or are claimed elsewhere. */
  conflictCount: number
  /** Leads a concurrent run had already removed. Neither deleted nor pending. */
  alreadyMissingCount: number
  success: boolean
  /** Set when the run stopped early; the counts above are still real. */
  errored?: boolean
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

async function commitInBatches(
  db: Firestore,
  refs: FirebaseFirestore.DocumentReference[],
): Promise<void> {
  for (const group of chunk(refs, BATCH)) {
    const batch = db.batch()
    for (const ref of group) batch.delete(ref)
    await batch.commit()
  }
}

async function deleteSubcollection(db: Firestore, path: string): Promise<void> {
  for (;;) {
    const snap = await db.collection(path).limit(BATCH).get()
    if (snap.empty) return
    await commitInBatches(db, snap.docs.map((d) => d.ref))
    if (snap.size < BATCH) return
  }
}

/** Claims a lead for purging, distinguishing gone from contested. */
async function claimLead(
  db: Firestore,
  leadId: string,
  workspaceId: string,
  claimId: string,
): Promise<ClaimOutcome> {
  return db.runTransaction(async (tx): Promise<ClaimOutcome> => {
    const ref = db.collection("leads").doc(leadId)
    const snap = await tx.get(ref)
    // Already removed, by a concurrent run or by hand: nothing to do, and it
    // is not a pending item.
    if (!snap.exists) return "already_missing"
    const data = snap.data() as {
      workspaceId?: string
      archived?: boolean
      purgeClaimId?: string
      purgeClaimedAt?: string
      purgeState?: string
    }
    // Restored, or moved to another workspace, while we were listing.
    if (data.workspaceId !== workspaceId || data.archived !== true) return "conflict"
    if (data.purgeClaimId) {
      const at = Date.parse(data.purgeClaimedAt ?? "")
      const stale = !Number.isFinite(at) || Date.now() - at >= STALE_CLAIM_MS
      if (!stale) return "conflict"
    }
    // The state machine only ever moves FORWARD: claimed → purging → deleted.
    // Taking over a stale claim that had already entered `purging` must KEEP
    // `purging`. Downgrading it to `claimed` would let a later failure look
    // releasable, and releasing it would expose a prospect whose relations
    // were already partly deleted.
    const resumedDestructive = data.purgeState === "purging"
    tx.update(ref, {
      purgeClaimId: claimId,
      purgeClaimedAt: new Date().toISOString(),
      purgeState: resumedDestructive ? "purging" : "claimed",
    })
    return "claimed"
  })
}

/**
 * Marks that relation deletion has STARTED, and reports explicitly whether
 * THIS run still legitimately holds the claim.
 *
 * `"lost"` means somebody took the claim from us (or the lead is gone): this
 * run must NOT delete a single relation, because another run owns the work.
 * Only `"marked"` authorises destruction.
 */
type MarkOutcome = "marked" | "lost" | "already_missing"

async function markPurging(db: Firestore, leadId: string, claimId: string): Promise<MarkOutcome> {
  return db.runTransaction(async (tx): Promise<MarkOutcome> => {
    const ref = db.collection("leads").doc(leadId)
    const snap = await tx.get(ref)
    // Vanished between the claim and now: nothing to purge, and not a
    // conflict — no other run is contesting it.
    if (!snap.exists) return "already_missing"
    if ((snap.data() as { purgeClaimId?: string }).purgeClaimId !== claimId) return "lost"
    tx.update(ref, { purgeState: "purging" })
    return "marked"
  })
}

/**
 * Releases our claim — ONLY while nothing has been deleted yet.
 *
 * Once `purgeState` is "purging", relations may already be partially gone, so
 * releasing would let somebody restore a mutilated prospect. Such a lead keeps
 * its claim, goes stale after STALE_CLAIM_MS and is RESUMED by the next run,
 * which finishes the deletion instead of resurrecting it.
 */
async function releaseClaim(db: Firestore, leadId: string, claimId: string): Promise<void> {
  try {
    await db.runTransaction(async (tx) => {
      const ref = db.collection("leads").doc(leadId)
      const snap = await tx.get(ref)
      if (!snap.exists) return
      const data = snap.data() as { purgeClaimId?: string; purgeState?: string }
      if (data.purgeClaimId !== claimId) return
      // THE invariant, encoded rather than commented: a claim that has ever
      // entered the destructive phase is never released, whoever holds it now.
      if (data.purgeState === "purging") return
      tx.update(ref, {
        purgeClaimId: FieldValue.delete(),
        purgeClaimedAt: FieldValue.delete(),
        purgeState: FieldValue.delete(),
      })
    })
  } catch {
    // A claim we cannot release goes stale on its own; never fatal.
  }
}

export async function emptyWorkspaceTrash(
  db: Firestore,
  workspaceId: string,
): Promise<EmptyTrashOutcome> {
  const runId = `purge_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
  let deletedCount = 0
  let conflictCount = 0
  let alreadyMissingCount = 0
  const failedLeadIds = new Set<string>()
  let errored = false

  /** Counters are captured on every exit, so progress is never reported as zero. */
  const result = (): EmptyTrashOutcome => {
    const pendingCount = failedLeadIds.size + conflictCount
    return {
      workspaceId,
      deletedCount,
      pendingCount,
      conflictCount,
      alreadyMissingCount,
      success: pendingCount === 0 && !errored,
      ...(errored ? { errored: true } : {}),
    }
  }

  // Stable cursor over document id: a page that fails entirely does NOT stop
  // the ones after it, and no lead is visited twice.
  let cursor: string | null = null

  for (;;) {
    let page
    try {
      let q = db
        .collection("leads")
        .where("workspaceId", "==", workspaceId)
        .where("archived", "==", true)
        .orderBy(FieldPath.documentId())
        .limit(PAGE)
      if (cursor) q = q.startAfter(cursor)
      page = await q.get()
    } catch {
      // Stop, but report everything already deleted.
      errored = true
      return result()
    }
    if (page.empty) break

    const ids = page.docs.map((d) => d.id)
    cursor = ids[ids.length - 1]

    for (const leadId of ids) {
      let claim: ClaimOutcome
      try {
        claim = await claimLead(db, leadId, workspaceId, runId)
      } catch {
        failedLeadIds.add(leadId)
        continue
      }
      if (claim === "already_missing") {
        // Gone already: neither deleted by us nor pending.
        alreadyMissingCount += 1
        continue
      }
      if (claim === "conflict") {
        // Restored, moved, or held by another live run.
        conflictCount += 1
        continue
      }

      // Nothing is deleted until this run is CONFIRMED to hold the claim.
      // A "lost" result means another run owns the work: we touch nothing.
      let mark: MarkOutcome
      try {
        mark = await markPurging(db, leadId, runId)
      } catch {
        failedLeadIds.add(leadId)
        // Safe: markPurging failing means nothing was deleted yet, and
        // releaseClaim itself refuses to release a `purging` claim.
        await releaseClaim(db, leadId, runId)
        continue
      }
      if (mark === "already_missing") {
        alreadyMissingCount += 1
        continue
      }
      if (mark === "lost") {
        // Another run holds the claim: its work, not ours. Nothing deleted.
        conflictCount += 1
        continue
      }

      // --- Relations, only now that the lead is claimed and cannot be
      //     restored underneath us.
      let relationsOk = true
      try {
        await deleteSubcollection(db, `leads/${leadId}/activities`)
      } catch {
        relationsOk = false
      }
      if (relationsOk) {
        for (const collection of RELATED_WITH_WORKSPACE) {
          try {
            const related = await db
              .collection(collection)
              // The workspace filter is what stops a tampered leadId from
              // reaching another tenant's documents.
              .where("workspaceId", "==", workspaceId)
              .where("leadId", "==", leadId)
              .get()
            await commitInBatches(db, related.docs.map((d) => d.ref))
          } catch {
            relationsOk = false
            break
          }
        }
      }
      if (!relationsOk) {
        failedLeadIds.add(leadId)
        await releaseClaim(db, leadId, runId)
        continue
      }

      // --- The lead itself, still under our claim.
      let outcome: DeleteOutcome
      try {
        outcome = await db.runTransaction(async (tx): Promise<DeleteOutcome> => {
          const ref = db.collection("leads").doc(leadId)
          const snap = await tx.get(ref)
          // A concurrent purge finished it: this run deleted nothing, so it
          // must not be counted as a deletion by both runs.
          if (!snap.exists) return "already_missing"
          const data = snap.data() as { workspaceId?: string; archived?: boolean; purgeClaimId?: string }
          if (data.workspaceId !== workspaceId || data.archived !== true) return "conflict"
          if (data.purgeClaimId !== runId) return "conflict"
          tx.delete(ref)
          return "deleted"
        })
      } catch {
        failedLeadIds.add(leadId)
        await releaseClaim(db, leadId, runId)
        continue
      }

      if (outcome === "deleted") deletedCount += 1
      else if (outcome === "already_missing") alreadyMissingCount += 1
      else {
        conflictCount += 1
        await releaseClaim(db, leadId, runId)
      }
    }

    if (page.size < PAGE) break
  }

  return result()
}
