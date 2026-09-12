import { NextResponse } from "next/server"
import { getAdminDb, isAdminNotConfigured } from "@/lib/firebase/admin"
import { resolveByKey } from "@/lib/website/integration-store"
import { allow } from "@/lib/website/rate-limit"
import { keyLooksValid } from "@/lib/website-leads"
import { FUNNEL_EVENTS, buildFunnelEvent, parseFunnelEvent } from "@/lib/funnel-events"

export const runtime = "nodejs"

/**
 * SERVER-TO-SERVER endpoint for landing funnel events.
 *
 * Same trust model as /api/website/leads: the only credential is the
 * integration key, and the workspace it resolves to is where the events go —
 * the body never names a workspace. No CORS headers and no OPTIONS handler,
 * so a key pasted into browser code cannot work: the landing posts to its own
 * backend, which forwards here with the key from its environment.
 *
 * Accepts a single event or a batch, so a landing can flush several steps in
 * one request instead of one call per click.
 */
export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  if (!allow(`fe-ip:${ip}`, 120)) return NextResponse.json({ error: "rate_limited" }, { status: 429 })

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? ""
  const key = (request.headers.get("x-integration-key")?.trim() || bearer) ?? ""
  if (!keyLooksValid(key)) return NextResponse.json({ error: "unauthorized" }, { status: 401 })
  if (!allow(`fe-key:${key.slice(0, 12)}`, 600)) return NextResponse.json({ error: "rate_limited" }, { status: 429 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const raw = Array.isArray(body) ? body : [body]
  if (raw.length === 0 || raw.length > 25) return NextResponse.json({ error: "invalid_batch" }, { status: 400 })
  const parsed = raw.map(parseFunnelEvent)
  const failed = parsed.findIndex((p) => !p.ok)
  if (failed >= 0) {
    const p = parsed[failed] as { ok: false; errors: unknown }
    return NextResponse.json({ error: "validation", index: failed, details: p.errors }, { status: 400 })
  }

  try {
    const integration = await resolveByKey(key)
    if (!integration || integration.status !== "connected") {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }
    const db = getAdminDb()
    const now = new Date().toISOString()
    const batch = db.batch()
    for (const p of parsed) {
      if (!p.ok) continue
      batch.set(
        db.collection(FUNNEL_EVENTS).doc(`${integration.workspaceId}_${p.event.sessionId}_${p.event.eventName}`),
        buildFunnelEvent(integration.workspaceId, p.event, now),
      )
    }

    // The spin belongs on the prospect too, so whoever calls them knows what
    // was promised without opening analytics. Written only when the landing
    // named a prospect, and only onto a lead of THIS workspace.
    const spin = parsed
      .flatMap((p) => (p.ok ? [p.event] : []))
      .find((e) => e.eventName === "roulette_spun" && e.prospectId)
    if (spin?.prospectId) {
      const leadRef = db.collection("leads").doc(spin.prospectId)
      const snap = await leadRef.get()
      const lead = snap.data() as { workspaceId?: string } | undefined
      if (snap.exists && lead?.workspaceId === integration.workspaceId) {
        batch.set(
          leadRef,
          {
            webForm: {
              ...(spin.prize ? { gift: spin.prize } : {}),
              rouletteSpun: true,
              rouletteSpunAt: now,
            },
          },
          { merge: true },
        )
      }
    }

    await batch.commit()
    return NextResponse.json({ ok: true, stored: parsed.length }, { status: 201 })
  } catch (err) {
    if (isAdminNotConfigured(err)) return NextResponse.json({ error: "server_not_configured" }, { status: 503 })
    console.error("[website/events]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
