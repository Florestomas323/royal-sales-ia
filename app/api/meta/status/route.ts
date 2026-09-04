import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/firebase/admin"
import { authenticateRequest, canAccessWorkspace } from "@/lib/firebase/server-auth"
import { buildMetaInventory } from "@/lib/meta/inventory"
import { friendlyGraphMessage, type MetaStatusResponse } from "@/lib/meta/api-response"
import { markConnectionFailed, mergeInventory, readMetaConnection } from "@/lib/meta/connection-store"

/**
 * GET /api/meta/status?workspaceId=…
 *
 * Live, read-only diagnosis of the server-side Meta token for a workspace:
 * validates the token, lists ad accounts / pages / campaigns / lead forms and
 * reports Lead Ads readiness. Nothing is persisted here (see /sync).
 * Requires a signed-in member of the workspace (super_admin: any workspace).
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const workspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim()
  if (!workspaceId) return NextResponse.json({ error: "missing_workspace" }, { status: 400 })
  if (!canAccessWorkspace(auth.user, workspaceId, false)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const db = getAdminDb()
  const stored = await readMetaConnection(db, workspaceId)
  const now = new Date().toISOString()

  const result = await buildMetaInventory({
    campaignsFor: stored?.adAccount?.id ?? null,
    pageIds: stored?.page ? [stored.page.id] : undefined,
  })

  if (!result.ok) {
    console.warn(`[meta/status] ${workspaceId}: ${result.failure.kind} ${result.failure.detail}`)
    const body: MetaStatusResponse = {
      connected: false,
      connection: markConnectionFailed(stored, workspaceId, result.failure, now),
      errorCode: result.failure.kind,
      message: friendlyGraphMessage(result.failure),
      warnings: [],
    }
    return NextResponse.json(body)
  }

  // Live view: merged with the stored preferences but NOT written (lastSyncAt stays as stored).
  const live = mergeInventory(stored, workspaceId, result.inventory, {}, now, null)
  live.lastSyncAt = stored?.lastSyncAt ?? null
  live.connectedAt = stored?.connectedAt ?? null

  const body: MetaStatusResponse = {
    connected: true,
    connection: live,
    errorCode: null,
    message: null,
    warnings: result.inventory.warnings,
  }
  return NextResponse.json(body)
}
