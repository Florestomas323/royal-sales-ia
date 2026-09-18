import { NextResponse } from "next/server"
import { getAdminDb, isAdminNotConfigured } from "@/lib/firebase/admin"
import { authenticateRequest, canAccessWorkspace } from "@/lib/firebase/server-auth"
import {
  ERROR_STATUS,
  inspectIdentity,
  authErrorCode,
  logMutation,
  newOperationId,
  type MutationErrorCode,
} from "@/lib/server/mutation-errors"
import type { Campaign, Lead } from "@/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Changes the campaign attributed to a prospect, from the server.
 *
 * Doing this from the browser meant the write had to satisfy the published
 * Security Rules exactly, and any mismatch — a stale rule, a campaign whose
 * stored name differed, a lead in another workspace — surfaced as the same
 * opaque `permission-denied`. Here EVERY input is derived from the real
 * documents: the workspace comes from the lead, the role from the
 * membership, the campaign name from the campaign. The body carries only
 * which campaign was chosen.
 *
 * What is never touched: `attribution` (the original Meta identifiers) and
 * anything about ownership, stage or archiving.
 */
interface Body {
  /** Local `campaigns` document id, or "" for "Sin campaña". */
  campaignId?: string
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const operationId = newOperationId("lead_campaign")
  const { id: leadId } = await context.params

  const auth = await authenticateRequest(request)
  if (!auth.ok) {
    // Keep the real reason: an inactive membership or a server without
    // credentials is not "sign in again".
    const code = authErrorCode(auth.error)
    logMutation("api/leads/campaign", { operationId, uid: "anon", resourceId: leadId, code })
    return fail(code, operationId)
  }
  const { membership, uid } = auth.user

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return fail("invalid_body", operationId)
  }
  const campaignId = typeof body.campaignId === "string" ? body.campaignId.trim() : ""

  const log = (code: MutationErrorCode | "ok", detail?: string) =>
    logMutation("api/leads/campaign", {
      operationId,
      uid,
      userId: membership.userId,
      role: membership.role,
      workspaceId: membership.workspaceId,
      resourceId: leadId,
      code,
      detail,
    })

  try {
    const db = getAdminDb()

    // --- The lead is the source of truth for the workspace.
    const leadSnap = await db.collection("leads").doc(leadId).get()
    if (!leadSnap.exists) {
      log("lead_not_found")
      return fail("lead_not_found", operationId)
    }
    const lead = leadSnap.data() as Lead
    const workspaceId = lead.workspaceId

    // --- Authorisation against THAT workspace, never the one in the body.
    if (!canAccessWorkspace(auth.user, workspaceId, true)) {
      // Distinguish "another workspace" from "role too low", and surface a
      // documents-disagree problem as its own code instead of a permission one.
      const identity = await inspectIdentity(db, uid, membership)
      if (!identity.coherent) {
        log("identity_inconsistent", identity.problems.join(","))
        return fail("identity_inconsistent", operationId, { problems: identity.problems })
      }
      const code: MutationErrorCode =
        membership.role === "super_admin" || membership.workspaceId === workspaceId
          ? "insufficient_role"
          : "wrong_workspace"
      log(code)
      return fail(code, operationId)
    }

    // --- The campaign, when one was chosen.
    let campaignName = ""
    if (campaignId) {
      const campaignSnap = await db.collection("campaigns").doc(campaignId).get()
      if (!campaignSnap.exists) {
        log("campaign_not_found")
        return fail("campaign_not_found", operationId)
      }
      const campaign = campaignSnap.data() as Campaign
      if (campaign.workspaceId !== workspaceId) {
        log("campaign_wrong_workspace")
        return fail("campaign_wrong_workspace", operationId)
      }
      // A sales prospect cannot be attributed to a recruiting campaign.
      const leadType = lead.leadType ?? "sales"
      if (campaign.objective && campaign.objective !== leadType) {
        log("campaign_type_mismatch")
        return fail("campaign_type_mismatch", operationId)
      }
      // The NAME comes from the campaign document, never from the browser.
      campaignName = campaign.name ?? ""
    }

    await db.collection("leads").doc(leadId).update({
      campaignId,
      campaignName,
      attributionSource: "manual",
      updatedAt: new Date().toISOString(),
      // `attribution` is deliberately absent: the original Meta identifiers
      // are the record of where the lead really came from.
    })

    log("ok", campaignId ? "attributed" : "cleared")
    return NextResponse.json({ success: true, leadId, workspaceId, campaignId, campaignName, operationId })
  } catch (err) {
    if (isAdminNotConfigured(err)) {
      log("server_not_configured")
      return fail("server_not_configured", operationId)
    }
    log("internal", err instanceof Error ? err.name : "unknown")
    return fail("internal", operationId)
  }
}

function fail(code: MutationErrorCode, operationId: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: code, operationId, ...extra }, { status: ERROR_STATUS[code] })
}
