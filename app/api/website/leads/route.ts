import { NextResponse } from "next/server"
import { getAdminDb, isAdminNotConfigured } from "@/lib/firebase/admin"
import { resolveByKey, touchLastReceived } from "@/lib/website/integration-store"
import { allow } from "@/lib/website/rate-limit"
import { buildWebsiteLead, isSameContact, keyLooksValid, parseWebsiteLead } from "@/lib/website-leads"
import { notifyNewLeadServer } from "@/lib/notifications/server"
import type { Lead } from "@/types"

/** Where the email's "Ver prospecto" points. Configurable; falls back to this deployment. */
function appUrlFrom(request: Request): string {
  return process.env.APP_URL || new URL(request.url).origin
}

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

/**
 * Success envelope.
 *
 * Two shapes on purpose. `success` + `prospectId` is what a landing page
 * checks; `ok` + `leadId` is what earlier integrations already read. Emitting
 * both keeps anyone who integrated against either one working, and it is the
 * ONLY place a success body is built — so no branch can claim success with a
 * different shape by accident.
 */
const ok = (
  prospectId: string,
  extra: { duplicate: boolean; reason?: string },
  status = 200,
) =>
  json({ success: true, prospectId, ok: true, leadId: prospectId, ...extra }, status)

/**
 * One structured line per request, readable in Vercel. Never carries the key,
 * the name or the full phone: the last four digits are enough to recognise a
 * submission while leaving the record useless to anyone reading the logs.
 */
function log(stage: string, detail: Record<string, unknown> = {}) {
  console.log(`[website/leads] ${stage}`, JSON.stringify(detail))
}

function phoneTail(phone: string | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "")
  return digits ? `…${digits.slice(-4)}` : "—"
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  log("request", { method: request.method, ip })
  // Two buckets: per IP (a runaway script) and per key (a runaway form).
  if (!allow(`ip:${ip}`, 30)) {
    log("rate_limited", { scope: "ip", status: 429 })
    return json({ error: "rate_limited" }, 429)
  }

  // The key may arrive in either header: `X-Integration-Key` is what the
  // panel documents, `Authorization: Bearer` is what most existing backends
  // already send. Both are server-side headers; neither is a browser concern.
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? ""
  const key = (request.headers.get("x-integration-key")?.trim() || bearer) ?? ""
  if (!keyLooksValid(key)) {
    // Never log the key. The shape alone says whether the header arrived at
    // all, which is the difference between "not configured" and "wrong value".
    log("auth_failed", {
      reason: key ? "malformed_key" : "missing_key",
      header: request.headers.get("x-integration-key") ? "x-integration-key" : request.headers.get("authorization") ? "authorization" : "none",
      status: 401,
    })
    return json({ error: "unauthorized" }, 401)
  }
  if (!allow(`key:${key.slice(0, 12)}`, 120)) {
    log("rate_limited", { scope: "key", status: 429 })
    return json({ error: "rate_limited" }, 429)
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    log("invalid_body", { status: 400 })
    return json({ error: "invalid_body" }, 400)
  }
  const parsed = parseWebsiteLead(body)
  if (!parsed.ok) {
    // Field NAMES and reasons only — never the values the visitor typed.
    log("validation_failed", { fields: parsed.errors.map((e) => `${e.field}:${e.reason}`), status: 400 })
    return json({ error: "validation", details: parsed.errors }, 400)
  }

  try {
    const integration = await resolveByKey(key)
    // Same answer for "no such key" and "disabled": nothing to learn from it.
    if (!integration || integration.status !== "connected") {
      log("auth_failed", {
        reason: integration ? "integration_disabled" : "key_not_found",
        status: 401,
      })
      return json({ error: "unauthorized" }, 401)
    }
    log("auth_ok", {
      workspaceId: integration.workspaceId,
      domain: integration.domain,
      form: parsed.payload.form ?? null,
      type: parsed.payload.type,
      phone: phoneTail(parsed.payload.phone),
    })

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
        log("duplicate", { workspaceId: integration.workspaceId, prospectId: prior.docs[0].id, reason: "external_id", status: 200 })
        return ok(prior.docs[0].id, { duplicate: true, reason: "external_id" })
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
      log("duplicate", { workspaceId: integration.workspaceId, prospectId: existing.id, reason: "contact", status: 200 })
      return ok(existing.id, { duplicate: true, reason: "contact" })
    }

    const ref = leads.doc()
    await ref.set(draft, { merge: false })

    // Success is only claimed once Firestore confirms the document is really
    // there. `set()` resolving is normally enough, but this endpoint is the
    // landing's gate to its own flow: a false success locks a visitor out of
    // the roulette with a prospect that does not exist, so it is read back.
    const written = await ref.get()
    if (!written.exists) {
      log("write_unconfirmed", { workspaceId: integration.workspaceId, status: 500 })
      return json({ error: "write_unconfirmed" }, 500)
    }
    await touchLastReceived(integration.workspaceId, now)
    log("lead_created", {
      workspaceId: integration.workspaceId,
      prospectId: ref.id,
      campaignId: draft.campaignId || null,
      campaignSource: draft.attribution?.externalFormId ?? draft.source,
      stage: draft.stage,
      status: 201,
    })
    // Central trigger, and only here: the two duplicate branches above return
    // before this line, so a re-submission never announces a "new" lead.
    // Best-effort by design — a failed notification never undoes the lead.
    try {
      await notifyNewLeadServer(
        { ...draft, id: ref.id },
        parsed.payload.form ?? null,
        { appUrl: appUrlFrom(request) },
      )
    } catch (err) {
      console.error("[website/leads] notify failed", err)
    }
    return ok(ref.id, { duplicate: false }, 201)
  } catch (err) {
    if (isAdminNotConfigured(err)) {
      log("server_not_configured", { status: 503, hint: "FIREBASE_SERVICE_ACCOUNT_JSON missing or invalid" })
      return json({ error: "server_not_configured" }, 503)
    }
    // The real cause, surfaced instead of being swallowed by the catch.
    log("internal_error", {
      status: 500,
      name: err instanceof Error ? err.name : typeof err,
      message: err instanceof Error ? err.message : String(err),
    })
    console.error("[website/leads] stack", err)
    return json({ error: "internal" }, 500)
  }
}
