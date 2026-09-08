import { NextResponse } from "next/server"
import { authenticateRequest, canAccessWorkspace } from "@/lib/firebase/server-auth"
import { isAdminNotConfigured } from "@/lib/firebase/admin"
import { readIntegration, setIntegrationStatus, upsertIntegration } from "@/lib/website/integration-store"
import { normalizeDomain } from "@/lib/website-leads"

export const runtime = "nodejs"

/**
 * Manages a workspace's website integration. Every call carries the caller's
 * Firebase ID token and is checked against their MEMBERSHIP server-side; the
 * workspaceId in the body is only honoured if that membership allows writes
 * on it. Secrets never travel to the client except the plain key, once, at
 * generation — and the client is told to copy it then.
 */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: { workspaceId?: string; action?: string; domain?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }
  const workspaceId = typeof body.workspaceId === "string" ? body.workspaceId : ""
  if (!workspaceId) return NextResponse.json({ error: "missing_workspace" }, { status: 400 })
  if (!canAccessWorkspace(auth.user, workspaceId, true)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  try {
    switch (body.action) {
      case "save": {
        const domain = normalizeDomain(typeof body.domain === "string" ? body.domain : "")
        if (!domain) return NextResponse.json({ error: "invalid_domain" }, { status: 400 })
        const { integration, plainKey } = await upsertIntegration({ workspaceId, domain, rotateKey: false })
        return NextResponse.json({ integration: publicView(integration), plainKey })
      }
      case "rotate": {
        const current = await readIntegration(workspaceId)
        if (!current) return NextResponse.json({ error: "not_configured" }, { status: 404 })
        const { integration, plainKey } = await upsertIntegration({ workspaceId, domain: current.domain, rotateKey: true })
        return NextResponse.json({ integration: publicView(integration), plainKey })
      }
      case "disable":
      case "enable": {
        const current = await readIntegration(workspaceId)
        if (!current) return NextResponse.json({ error: "not_configured" }, { status: 404 })
        await setIntegrationStatus(workspaceId, body.action === "enable" ? "connected" : "disabled")
        return NextResponse.json({ ok: true })
      }
      default:
        return NextResponse.json({ error: "invalid_action" }, { status: 400 })
    }
  } catch (err) {
    if (isAdminNotConfigured(err)) return NextResponse.json({ error: "server_not_configured" }, { status: 503 })
    console.error("[website/integration]", err)
    return NextResponse.json({ error: "internal" }, { status: 500 })
  }
}

/** Never return the hash: the client has no use for it and it must not leak. */
function publicView(i: Awaited<ReturnType<typeof readIntegration>>) {
  if (!i) return null
  const { keyHash: _hash, ...rest } = i
  return rest
}
