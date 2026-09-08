import { NextResponse } from "next/server"
import { getAdminDb, isAdminNotConfigured } from "@/lib/firebase/admin"
import { resolveByKey, touchLastReceived } from "@/lib/website/integration-store"
import { allow } from "@/lib/website/rate-limit"
import { buildWebsiteLead, isSameContact, keyLooksValid, parseWebsiteLead } from "@/lib/website-leads"
import type { Lead } from "@/types"

export const runtime = "nodejs"

/**
 * Public endpoint a workspace's website posts leads to.
 *
 * Trust model: the ONLY credential is the integration key in the
 * `X-Integration-Key` header. It is hashed and looked up; the workspace it
 * resolves to is where the lead goes. Nothing in the body can choose a
 * tenant. A disabled integration is refused like a wrong key, so a site can
 * be switched off without rotating anything.
 *
 * Writes use the Admin SDK, which bypasses Firestore Rules; that is why every
 * field is validated here first and the document is built by a pure helper
 * that mirrors the app's own lead shape.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Integration-Key",
  "Access-Control-Max-Age": "86400",
}

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: CORS })

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  // Two buckets: per IP (a runaway script) and per key (a runaway form).
  if (!allow(`ip:${ip}`, 30)) return json({ error: "rate_limited" }, 429)

  const key = request.headers.get("x-integration-key")?.trim() ?? ""
  if (!keyLooksValid(key)) return json({ error: "unauthorized" }, 401)
  if (!allow(`key:${key.slice(0, 12)}`, 120)) return json({ error: "rate_limited" }, 429)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: "invalid_body" }, 400)
  }
  const parsed = parseWebsiteLead(body)
  if (!parsed.ok) return json({ error: "validation", details: parsed.errors }, 400)

  try {
    const integration = await resolveByKey(key)
    // Same answer for "no such key" and "disabled": nothing to learn from it.
    if (!integration || integration.status !== "connected") return json({ error: "unauthorized" }, 401)

    const db = getAdminDb()
    const leads = db.collection("leads")
    const now = new Date().toISOString()
    const draft = buildWebsiteLead(integration.workspaceId, parsed.payload, now)

    // Reasonable de-duplication, always INSIDE the resolved workspace: same
    // phone or same email. Two equality filters, no composite index.
    const [byPhone, byEmail] = await Promise.all([
      leads.where("workspaceId", "==", integration.workspaceId).where("phone", "==", draft.phone).limit(1).get(),
      draft.email
        ? leads.where("workspaceId", "==", integration.workspaceId).where("email", "==", draft.email).limit(1).get()
        : Promise.resolve(null),
    ])
    const existing = [...byPhone.docs, ...(byEmail?.docs ?? [])]
      .find((d) => isSameContact(d.data() as Lead, draft))

    if (existing) {
      // Known contact: record that they came back, do not create a second lead.
      await Promise.all([
        existing.ref.set({ receivedAt: now }, { merge: true }),
        touchLastReceived(integration.workspaceId, now),
      ])
      return json({ ok: true, leadId: existing.id, duplicate: true })
    }

    const ref = leads.doc()
    await Promise.all([
      ref.set(draft, { merge: false }),
      touchLastReceived(integration.workspaceId, now),
    ])
    return json({ ok: true, leadId: ref.id, duplicate: false }, 201)
  } catch (err) {
    if (isAdminNotConfigured(err)) return json({ error: "server_not_configured" }, 503)
    console.error("[website/leads]", err)
    return json({ error: "internal" }, 500)
  }
}
