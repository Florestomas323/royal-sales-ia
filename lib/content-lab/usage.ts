import { getAdminDb } from "@/lib/firebase/admin"

/**
 * Content Lab quotas — SERVER ONLY, enforced with Firestore transactions.
 *
 * Disabling a button is not a limit: anyone can call the endpoint directly,
 * so the counters live server-side and are the only thing that decides.
 *
 * Two different limits, on purpose:
 *
 *  1. PER USER, PER MINUTE — counts ATTEMPTS. Its job is to stop double taps,
 *     spam and retry loops, so a failed provider call still consumes it;
 *     otherwise a loop of failures would be free to hammer the endpoint.
 *
 *  2. PER WORKSPACE, PER DAY — counts COMPLETED generations, i.e. only when
 *     the provider returned content our validator accepted. A timeout, a
 *     rejected answer or a missing API key never burns the daily quota.
 *
 * The daily limit uses a RESERVE → CONFIRM / RELEASE protocol, because
 * checking the counter and incrementing it in two separate transactions is a
 * race: with 49 completed, two concurrent requests would both read 49, both
 * pass, and both commit — ending at 51. So the reservation increments
 * `reserved` in the SAME transaction as the check, and the invariant
 * `completed + reserved <= PER_WORKSPACE_PER_DAY` is enforced atomically.
 * Firestore transactions are serialisable across serverless instances, so
 * this holds no matter how many lambdas run at once.
 *
 * Each reservation carries its OWN id and expiry, stored in a map on the day
 * document. That identity is what makes 51 impossible rather than merely
 * unlikely: `confirmGeneration` only increments `count` if its exact
 * reservation id is still present and unexpired IN THE SAME TRANSACTION. A
 * reservation that timed out has already been pruned, so a late answer from
 * the provider can never be counted — its slot belongs to someone else now.
 *
 * Confirm, release and pruning are idempotent: settling an id that is no
 * longer in the map is a no-op, so a retry, a double confirm or a release
 * after a confirm changes nothing.
 *
 * Storage: `contentLabUsage/{deterministic id}`. The collection is written
 * exclusively through the Admin SDK; browsers cannot touch it because
 * firestore.rules ends with a catch-all that denies every collection not
 * explicitly matched. No new rule is needed, and none was added.
 *
 * super_admin is NOT exempt: a silent bypass would hide real cost.
 */

export const PER_USER_PER_MINUTE = 5
export const PER_WORKSPACE_PER_DAY = 50
/** A reservation is void once this much time has passed since it was made. */
export const RESERVATION_TTL_MS = 5 * 60_000

const COLLECTION = "contentLabUsage"

export type QuotaKind = "user_minute" | "workspace_day"

export interface QuotaDecision {
  allowed: boolean
  /** Which limit rejected the request, when it did. */
  kind: QuotaKind | null
  /** Identifies THIS reservation; required to confirm or release it. */
  reservationId: string | null
  /** Attempts already used in the current minute window. */
  minuteCount: number
  /** Completed generations already used today by the workspace. */
  dayCount: number
  /** Live (unexpired) reservations counted against today's quota. */
  reserved: number
}

interface DayDoc {
  kind?: string
  workspaceId?: string
  window?: string
  count?: number
  /** reservationId → ISO expiry. Absent ids are settled or expired. */
  reservations?: Record<string, string>
  updatedAt?: string
}

/** UTC minute bucket, e.g. 2026-09-06T17:42. */
export function minuteKey(now = new Date()): string {
  return now.toISOString().slice(0, 16)
}

/** UTC day bucket, e.g. 2026-09-06. */
export function dayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10)
}

/** Ids are deterministic so the documents are trivial to inspect or purge. */
export function minuteDocId(userId: string, minute: string): string {
  return `u_${userId}__${minute}`
}

export function dayDocId(workspaceId: string, day: string): string {
  return `w_${workspaceId}__${day}`
}

/** Drops expired reservations. Pure, so pruning is deterministic. */
export function pruneReservations(
  reservations: Record<string, string> | undefined,
  now: Date,
): Record<string, string> {
  const live: Record<string, string> = {}
  for (const [id, expiresAt] of Object.entries(reservations ?? {})) {
    const at = Date.parse(expiresAt)
    if (Number.isFinite(at) && at > now.getTime()) live[id] = expiresAt
  }
  return live
}

function newReservationId(now: Date): string {
  return `r_${now.getTime().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Reserves one attempt for the user AND one slot of the workspace's daily
 * quota, in a single transaction. The returned `reservationId` MUST be handed
 * back to `confirmGeneration` or `releaseReservation`.
 */
export async function reserveAttempt(
  workspaceId: string,
  userId: string,
  now = new Date(),
): Promise<QuotaDecision> {
  const db = getAdminDb()
  const minute = minuteKey(now)
  const day = dayKey(now)
  const minuteRef = db.collection(COLLECTION).doc(minuteDocId(userId, minute))
  const dayRef = db.collection(COLLECTION).doc(dayDocId(workspaceId, day))

  return db.runTransaction(async (tx) => {
    const minuteSnap = await tx.get(minuteRef)
    const daySnap = await tx.get(dayRef)
    const minuteCount = (minuteSnap.exists ? (minuteSnap.data()?.count as number) : 0) || 0
    const dayData = daySnap.exists ? (daySnap.data() as DayDoc) : undefined
    const dayCount = dayData?.count ?? 0
    const live = pruneReservations(dayData?.reservations, now)
    const reserved = Object.keys(live).length

    if (minuteCount >= PER_USER_PER_MINUTE) {
      return { allowed: false, kind: "user_minute" as const, reservationId: null, minuteCount, dayCount, reserved }
    }
    // Completed + live reservations must never exceed the cap. Checking and
    // reserving in the SAME transaction is what closes the 49 + 2 race.
    if (dayCount + reserved >= PER_WORKSPACE_PER_DAY) {
      return { allowed: false, kind: "workspace_day" as const, reservationId: null, minuteCount, dayCount, reserved }
    }

    // The attempt is consumed even if the provider later fails: that is what
    // makes this a real anti-spam limit.
    tx.set(
      minuteRef,
      { kind: "user_minute", userId, workspaceId, window: minute, count: minuteCount + 1, updatedAt: now.toISOString() },
      { merge: true },
    )
    const reservationId = newReservationId(now)
    // Written WITHOUT merge: a merge would resurrect pruned reservation keys.
    tx.set(dayRef, {
      kind: "workspace_day",
      workspaceId,
      window: day,
      count: dayCount,
      reservations: { ...live, [reservationId]: new Date(now.getTime() + RESERVATION_TTL_MS).toISOString() },
      updatedAt: now.toISOString(),
    })
    return { allowed: true, kind: null, reservationId, minuteCount: minuteCount + 1, dayCount, reserved: reserved + 1 }
  })
}

/**
 * Turns a reservation into a COMPLETED generation — but only if that exact
 * reservation is still alive. An expired or already settled id increments
 * nothing, so a late provider answer can never push the day past the cap.
 */
export async function confirmGeneration(
  workspaceId: string,
  reservationId: string | null,
  now = new Date(),
): Promise<number> {
  return settleReservation(workspaceId, reservationId, true, now)
}

/**
 * Gives a reservation back. Used when the provider failed, timed out or
 * returned something the validator rejected: that must not burn the quota.
 */
export async function releaseReservation(
  workspaceId: string,
  reservationId: string | null,
  now = new Date(),
): Promise<number> {
  return settleReservation(workspaceId, reservationId, false, now)
}

async function settleReservation(
  workspaceId: string,
  reservationId: string | null,
  completed: boolean,
  now: Date,
): Promise<number> {
  const db = getAdminDb()
  const day = dayKey(now)
  const dayRef = db.collection(COLLECTION).doc(dayDocId(workspaceId, day))

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(dayRef)
    const data = snap.exists ? (snap.data() as DayDoc) : undefined
    const live = pruneReservations(data?.reservations, now)
    const current = data?.count ?? 0

    // Idempotent: an unknown, expired or already-settled id changes nothing.
    if (!reservationId || !(reservationId in live)) {
      if (snap.exists) {
        tx.set(dayRef, { ...data, count: current, reservations: live, updatedAt: now.toISOString() })
      }
      return current
    }

    delete live[reservationId]
    const count = current + (completed ? 1 : 0)
    tx.set(dayRef, {
      kind: "workspace_day", workspaceId, window: day,
      count, reservations: live, updatedAt: now.toISOString(),
    })
    return count
  })
}
