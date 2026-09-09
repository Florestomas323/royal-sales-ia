import { NextResponse } from "next/server"
import { getAdminDb, isAdminNotConfigured } from "@/lib/firebase/admin"
import { resolveByKey, touchLastReceived } from "@/lib/website/integration-store"
import { allow } from "@/lib/website/rate-limit"
import { buildWebsiteLead, isSameContact, keyLooksValid, parseWebsiteLead } from "@/lib/website-leads"
import type { Lead } from "@/types"

export const runtime = "nodejs"

/**
 * SERVER-TO-SERVER endpoint a workspace's website backend posts leads to.
 *
 * Trust model: the ONLY credential is the integration key in the
 * `X-Integration-Key` header. It is a SECRET: it must live in the
 * distributor's server environment and never in a browser. Their public form
 * posts to their own backend, which adds the header and forwards here.
 *
 * That is why this route sends NO CORS headers and has no OPTIONS handler: a
 * browser preflight fails on purpose, so a key pasted into client-side code
 * cannot work even by accident.
 *
 * The key is hashed and looked up; the workspace it resolves to is where the
 * lead goes. Nothing in the body can choose a tenant. A disabled integration
 * is refused like a wrong key. Writes use the Admin SDK, which bypasses
 * Firestore Rules — hence every field is validated first and the document is
 * built by a pure helper that mirrors the app's own lead shape.
 */

const json = (body: unknown, status = 200) => NextResponse.json(body, { status })

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  // Two buckets: per IP (a runaway script) and per key (a runaway form).
  if (!allow(`ip:${ip}`, 30)) return json({ error: "rate_limited" }, 429)

  // The key may arrive in either header: `X-Integration-Key` is what the
  // panel documents, `Authorization: Bearer` is what most existing backends
  // already send. Both are server-side headers; neither is a browser concern.
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? ""
  const key = (request.headers.get("x-integration-key")?.trim() || bearer) ?? ""
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

    // Idempotency first: a retry carrying the id the origin system already
    // assigned must never produce a second lead, even if the person legitimately
    // filled the form twice with different details.
    const externalId = draft.webForm?.externalId
    if (externalId) {
      const prior = await leads
        .where("workspaceId", "==", integration.workspaceId)
        .where("webForm.externalId", "==", externalId)
        .limit(1)
        .get()
      if (!prior.empty) {
        await touchLastReceived(integration.workspaceId, now)
        return json({ ok: true, leadId: prior.docs[0].id, duplicate: true, reason: "external_id" })
      }
    }

    // Then reasonable de-duplication, always INSIDE the resolved workspace:
    // same phone or same email. Two equality filters, no composite index.
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
      return json({ ok: true, leadId: existing.id, duplicate: true, reason: "contact" })
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
