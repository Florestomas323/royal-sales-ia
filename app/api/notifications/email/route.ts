import { NextResponse } from "next/server"
import { authenticateRequest, canAccessWorkspace } from "@/lib/firebase/server-auth"
import { getAdminDb, isAdminNotConfigured } from "@/lib/firebase/admin"
import { emailNewLeadServer } from "@/lib/notifications/server"
import type { Lead } from "@/types"

export const runtime = "nodejs"

/**
 * Sends the "new lead" email for a lead the caller just created in the app.
 *
 * The browser cannot send email (the provider key is a server secret), so
 * after a manual creation the client calls this once. The lead is re-read
 * server-side and the caller's membership is checked against ITS workspace:
 * nobody can make the server email about a lead they cannot see.
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: { leadId?: string }
  try { body = await request.json() } catch { return NextResponse.json({ error: "invalid_body" }, { status: 400 }) }
  const leadId = typeof body.leadId === "string" ? body.leadId : ""
  if (!leadId) return NextResponse.json({ error: "missing_lead" }, { status: 400 })

  try {
    const snap = await getAdminDb().collection("leads").doc(leadId).get()
    if (!snap.exists) return NextResponse.json({ error: "not_found" }, { status: 404 })
    const lead = { ...(snap.data() as Omit<Lead, "id">), id: snap.id }
    if (!canAccessWorkspace(auth.user, lead.workspaceId, false)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }
    const emailed = await emailNewLeadServer(lead, lead.attribution?.externalFormId ?? null, {
      appUrl: process.env.APP_URL || new URL(request.url).origin,
    })
    return NextResponse.json({ ok: true, emailed })
  } catch (err) {
    if (isAdminNotConfigured(err)) return NextResponse.json({ error: "server_not_configured" }, { status: 503 })
    console.error("[notifications/email]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}
