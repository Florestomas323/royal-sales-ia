import { NextResponse } from "next/server"
import { getAdminDb, isAdminNotConfigured } from "@/lib/firebase/admin"

/**
 * POST /api/auth/invitation  { email }  →  { invited: boolean }
 *
 * Royal Sales IA is NOT a public sign-up product. The login screen only lets
 * somebody create an account when an administrator has already invited that
 * exact email (an unclaimed `users` profile: `authUid == null`).
 *
 * This endpoint is intentionally public — it runs before the person has an
 * account — but it is a narrow yes/no: it never returns the workspace, the
 * role, the name or any other field, so it cannot be used to learn anything
 * about a workspace. Creating the account still grants ZERO data access on its
 * own: `memberships/{uid}` can only be written by matching an invitation, and
 * Security Rules enforce that independently of this check.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Per-instance throttle so the endpoint cannot be used to enumerate emails quickly. */
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 20
const hits = new Map<string, { count: number; resetAt: number }>()

function throttled(key: string): boolean {
  const now = Date.now()
  const entry = hits.get(key)
  if (!entry || entry.resetAt < now) {
    hits.set(key, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > MAX_PER_WINDOW
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null
  const email = value.trim().toLowerCase()
  if (email.length < 5 || email.length > 254 || !email.includes("@")) return null
  return email
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  if (throttled(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }
  const email = normalizeEmail((body as { email?: unknown })?.email)
  if (!email) return NextResponse.json({ error: "invalid_email" }, { status: 400 })

  try {
    const snap = await getAdminDb()
      .collection("users")
      .where("email", "==", email)
      .where("authUid", "==", null)
      .limit(1)
      .get()
    // Only a boolean leaves the server. No workspace, role or name.
    return NextResponse.json({ invited: !snap.empty })
  } catch (err) {
    if (isAdminNotConfigured(err)) {
      console.error("[auth/invitation]", err.message)
      return NextResponse.json({ error: "server_not_configured" }, { status: 503 })
    }
    console.error("[auth/invitation] lookup failed")
    return NextResponse.json({ error: "lookup_failed" }, { status: 500 })
  }
}
