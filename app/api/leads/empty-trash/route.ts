import { NextResponse } from "next/server"
import { getAdminDb, isAdminNotConfigured } from "@/lib/firebase/admin"
import { authenticateRequest, canAccessWorkspace } from "@/lib/firebase/server-auth"
import { emptyWorkspaceTrash } from "@/lib/leads/empty-trash-server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Permanently deletes the ARCHIVED prospects of one workspace ("Vaciar
 * papelera"), with the Admin SDK. The client never deletes documents: the
 * Security Rules only allow soft-delete (`archived: true`), and that stays
 * unchanged — this route is the one privileged path, and it is authenticated,
 * authorised and scoped to a single workspace.
 *
 * Deleted, per archived lead:
 *   - the lead document itself
 *   - its `activities` subcollection (the audit trail of that lead)
 *   - `appointments` where leadId == the lead
 *   - `notifications` where leadId == the lead
 *   - `leadIdentityKeys` where leadId == the lead, so the same phone+name
 *     can be captured again instead of being deduplicated into a ghost
 *
 * NEVER touched: campaigns, users, memberships, workspace settings, active
 * prospects, or anything belonging to another workspace.
 */
interface EmptyTrashBody {
  workspaceId?: string
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: EmptyTrashBody
  try {
    body = (await request.json()) as EmptyTrashBody
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  /**
   * The authorised workspace, not the one the body asks for.
   *
   * A super admin MUST name the workspace explicitly — there is no "all
   * workspaces" path, so no misclick can empty every trash. Everyone else is
   * pinned to their own membership, and the body is only allowed to confirm
   * it: a mismatch is a 403, never a silent redirect to their own data.
   */
  const isSuper = auth.user.membership.role === "super_admin"
  const asked = typeof body.workspaceId === "string" ? body.workspaceId.trim() : ""
  if (isSuper && !asked) {
    return NextResponse.json({ error: "workspace_required" }, { status: 400 })
  }
  const workspaceId = isSuper ? asked : auth.user.membership.workspaceId
  if (!workspaceId) return NextResponse.json({ error: "no_workspace" }, { status: 403 })
  if (asked && asked !== workspaceId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }
  // Write-level access: super_admin, client_admin (Distribuidor) and manager
  // (Asistente). sales_rep, viewer and anyone with no membership get 403.
  if (!canAccessWorkspace(auth.user, workspaceId, true)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const operationId = `empty_trash_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

  let outcome
  try {
    // All deletion logic lives in the helper, which the emulator tests import
    // and run directly — the route adds authentication and nothing else.
    outcome = await emptyWorkspaceTrash(getAdminDb(), workspaceId)
  } catch (err) {
    if (isAdminNotConfigured(err)) {
      return NextResponse.json({ error: "server_not_configured" }, { status: 503 })
    }
    console.error(`[api/leads/empty-trash] ${operationId} failed`, err instanceof Error ? err.name : "unknown")
    return NextResponse.json(
      { success: false, workspaceId, deletedCount: 0, error: "internal", operationId },
      { status: 500 },
    )
  }

  // Audit: actor, role, workspace, counts, timestamp and operation id. The
  // per-lead trail is gone with the leads, so this is the surviving record.
  console.info(
    `[api/leads/empty-trash] ${operationId} actor=${auth.user.membership.userId} role=${auth.user.membership.role} workspace=${workspaceId} deleted=${outcome.deletedCount} pending=${outcome.pendingCount} conflicts=${outcome.conflictCount} alreadyMissing=${outcome.alreadyMissingCount} at=${new Date().toISOString()}`,
  )

  // A partial result is never dressed up as a full success. Counts only: no
  // ids, names or phone numbers are returned.
  return NextResponse.json(
    {
      success: outcome.success,
      workspaceId,
      deletedCount: outcome.deletedCount,
      operationId,
      ...(outcome.success
        ? {}
        : {
            partial: true,
            pendingCount: outcome.pendingCount,
            conflictCount: outcome.conflictCount,
            // The helper already stopped early if this is set; the counts
            // above are still real, so a partially done run is never
            // reported as if it had changed nothing.
            ...(outcome.errored ? { errored: true } : {}),
          }),
    },
    { status: outcome.success ? 200 : 207 },
  )
}
