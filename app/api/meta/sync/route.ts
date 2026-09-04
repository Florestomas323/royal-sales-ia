import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/firebase/admin"
import { authenticateRequest, canAccessWorkspace } from "@/lib/firebase/server-auth"
import { buildMetaInventory } from "@/lib/meta/inventory"
import { friendlyGraphMessage, type MetaStatusResponse } from "@/lib/meta/api-response"
import {
  markConnectionFailed,
  mergeInventory,
  readMetaConnection,
  writeMetaConnection,
} from "@/lib/meta/connection-store"

/**
 * POST /api/meta/sync  { workspaceId, adAccountId?, pageId? }
 *
 * Validates the token, reads assets + campaigns + lead forms, and persists the
 * result at integrations/{workspaceId}_meta with lastSyncAt. Requires an
 * admin of the workspace (client_admin / manager) or super_admin.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface SyncBody {
  workspaceId?: string
  adAccountId?: string | null
  pageId?: string | null
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: SyncBody = {}
  try {
    body = (await request.json()) as SyncBody
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }
  const workspaceId = body.workspaceId?.trim()
  if (!workspaceId) return NextResponse.json({ error: "missing_workspace" }, { status: 400 })
  if (!canAccessWorkspace(auth.user, workspaceId, true)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const db = getAdminDb()
  const stored = await readMetaConnection(db, workspaceId)
  const now = new Date().toISOString()
  const adAccountId = typeof body.adAccountId === "string" ? body.adAccountId : null
  const pageId = typeof body.pageId === "string" ? body.pageId : null

  const result = await buildMetaInventory({
    campaignsFor: adAccountId ?? stored?.adAccount?.id ?? null,
    pageIds: pageId ? [pageId] : stored?.page ? [stored.page.id] : undefined,
  })

  if (!result.ok) {
    console.warn(`[meta/sync] ${workspaceId}: ${result.failure.kind} ${result.failure.detail}`)
    const failed = markConnectionFailed(stored, workspaceId, result.failure, now)
    await writeMetaConnection(db, failed)
    const res: MetaStatusResponse = {
      connected: false,
      connection: failed,
      errorCode: result.failure.kind,
      message: friendlyGraphMessage(result.failure),
      warnings: [],
    }
    return NextResponse.json(res)
  }

  let connection = mergeInventory(
    stored,
    workspaceId,
    result.inventory,
    { adAccountId, pageId },
    now,
    auth.user.membership.userId,
  )

  // If the preferred ad account was just (auto)selected and campaigns were
  // fetched for a different one (or none), fetch them for the final choice.
  if (connection.adAccount && result.inventory.campaignsFor !== connection.adAccount.id) {
    const again = await buildMetaInventory({
      campaignsFor: connection.adAccount.id,
      pageIds: connection.page ? [connection.page.id] : undefined,
    })
    if (again.ok) {
      connection = mergeInventory(stored, workspaceId, again.inventory, { adAccountId: connection.adAccount.id, pageId: connection.page?.id ?? null }, now, auth.user.membership.userId)
    }
  }

  await writeMetaConnection(db, connection)
  console.info(
    `[meta/sync] ${workspaceId}: connected adAccounts=${connection.adAccounts.length} pages=${connection.pages.length} campaigns=${connection.campaigns.length} leadAds=${connection.leadAdsStatus}`,
  )

  const res: MetaStatusResponse = {
    connected: true,
    connection,
    errorCode: null,
    message: null,
    warnings: result.inventory.warnings,
  }
  return NextResponse.json(res)
}
