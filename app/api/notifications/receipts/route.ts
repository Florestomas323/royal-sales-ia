import { NextResponse } from "next/server"
import { getAdminDb, isAdminNotConfigured } from "@/lib/firebase/admin"
import { authenticateRequest } from "@/lib/firebase/server-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Read receipts for a SUPER ADMIN.
 *
 * A super admin may READ every workspace's notifications, but the Security
 * Rule for `notifications` only allows writing `read`/`readAt` on documents
 * whose `userId` is your own — so they cannot, and must not, mark a
 * distributor's notification as read. Their own read state therefore lives
 * here, in `notificationReceipts`, keyed by the EVENT (workspace + type +
 * lead) rather than by recipient.
 *
 * The collection is not declared in firestore.rules, so the catch-all denies
 * every client access to it: it is reachable only through this route, with
 * the Admin SDK, after the caller is verified as a super admin. Nothing in
 * the rules needed to change.
 */
const COLLECTION = "notificationReceipts"

/** One document per super admin per event. `/` is the only forbidden char. */
function receiptId(uid: string, key: string): string {
  return `${uid}__${key}`.replace(/\//g, "_")
}

/** Keys must look like `workspace__type__lead`; anything else is rejected. */
function validKey(v: unknown): v is string {
  return typeof v === "string" && v.length > 0 && v.length <= 400 && !v.includes("/")
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.user.membership.role !== "super_admin") {
    // Not an error: a normal member has no receipts, their read state lives
    // on their own notification documents.
    return NextResponse.json({ keys: [] })
  }

  try {
    const snap = await getAdminDb()
      .collection(COLLECTION)
      .where("uid", "==", auth.user.uid)
      .get()
    const keys = snap.docs.map((d) => (d.data() as { key?: string }).key).filter(Boolean)
    return NextResponse.json({ keys })
  } catch (err) {
    if (isAdminNotConfigured(err)) return NextResponse.json({ error: "server_not_configured" }, { status: 503 })
    console.error("[notifications/receipts] read failed", err instanceof Error ? err.name : "unknown")
    // Failing open on a READ is harmless: nothing is hidden, the badge simply
    // shows the events as unread.
    return NextResponse.json({ keys: [] })
  }
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (auth.user.membership.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  let body: { keys?: unknown }
  try {
    body = (await request.json()) as { keys?: unknown }
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const keys = Array.isArray(body.keys) ? body.keys.filter(validKey) : []
  if (keys.length === 0) return NextResponse.json({ error: "no_keys" }, { status: 400 })
  if (keys.length > 200) return NextResponse.json({ error: "too_many" }, { status: 400 })

  try {
    const db = getAdminDb()
    const batch = db.batch()
    const now = new Date().toISOString()
    for (const key of [...new Set(keys)]) {
      batch.set(
        db.collection(COLLECTION).doc(receiptId(auth.user.uid, key)),
        { uid: auth.user.uid, key, readAt: now },
        { merge: true },
      )
    }
    await batch.commit()
    return NextResponse.json({ ok: true, stored: keys.length })
  } catch (err) {
    if (isAdminNotConfigured(err)) return NextResponse.json({ error: "server_not_configured" }, { status: 503 })
    console.error("[notifications/receipts] write failed", err instanceof Error ? err.name : "unknown")
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
