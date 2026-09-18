import { NextResponse } from "next/server"
import { FieldValue } from "firebase-admin/firestore"
import { getAdminDb, isAdminNotConfigured } from "@/lib/firebase/admin"
import { authenticateRequest } from "@/lib/firebase/server-auth"
import {
  ERROR_STATUS,
  inspectIdentity,
  authErrorCode,
  logMutation,
  newOperationId,
  type MutationErrorCode,
} from "@/lib/server/mutation-errors"
import { PIPELINES, STAGE_LABELS } from "@/lib/constants"
import { requiresLocation } from "@/lib/appointments"
import type { AppointmentLocation, AppointmentType, Lead, LeadType, PipelineStage } from "@/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Books an appointment, from the server.
 *
 * The browser used to write the appointment, the lead's stage and the audit
 * activity in one batch, which had to satisfy three different rule blocks at
 * once; any of them failing produced the same opaque permission error, and
 * the batch also trusted `workspaceId`, `leadName`, `leadType`, `createdBy`
 * and `actorRole` as sent. Here the body carries only WHEN, WHAT KIND and
 * WHERE; everything identifying is read from the lead and the membership.
 */
interface Body {
  leadId?: string
  scheduledAt?: string
  durationMinutes?: number
  type?: AppointmentType
  notes?: string
  location?: AppointmentLocation
  /** Optional: an admin may book on behalf of another member of the workspace. */
  assignedToId?: string
}

function meetingStageFor(leadType: LeadType): PipelineStage {
  return leadType === "recruiting" ? "rec_interview" : "appointment"
}

function isBeforeMeetingStage(leadType: LeadType, stage: PipelineStage): boolean {
  const pipeline = PIPELINES[leadType]
  const idx = pipeline.stages.indexOf(stage)
  const meetingIdx = pipeline.stages.indexOf(meetingStageFor(leadType))
  return idx !== -1 && meetingIdx !== -1 && idx < meetingIdx
}

export async function POST(request: Request) {
  const operationId = newOperationId("appointment")

  const auth = await authenticateRequest(request)
  if (!auth.ok) {
    // Keep the real reason: an inactive membership or a server without
    // credentials is not "sign in again".
    const code = authErrorCode(auth.error)
    logMutation("api/appointments", { operationId, uid: "anon", code })
    return fail(code, operationId)
  }
  const { membership, uid } = auth.user

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return fail("invalid_body", operationId)
  }
  const leadId = typeof body.leadId === "string" ? body.leadId.trim() : ""
  const scheduledAt = typeof body.scheduledAt === "string" ? body.scheduledAt.trim() : ""
  const duration = typeof body.durationMinutes === "number" ? body.durationMinutes : 60
  const type = body.type
  if (!leadId || !scheduledAt || !type || duration <= 0) return fail("invalid_body", operationId)

  const log = (code: MutationErrorCode | "ok", detail?: string) =>
    logMutation("api/appointments", {
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

    const leadSnap = await db.collection("leads").doc(leadId).get()
    if (!leadSnap.exists) {
      log("lead_not_found")
      return fail("lead_not_found", operationId)
    }
    const lead = leadSnap.data() as Lead
    const workspaceId = lead.workspaceId
    const leadType: LeadType = lead.leadType ?? "sales"

    if (lead.archived === true) {
      log("lead_archived")
      return fail("lead_archived", operationId)
    }

    // --- Authorisation, derived from the lead's workspace.
    const role = membership.role
    const isSuper = role === "super_admin"
    const sameWorkspace = membership.workspaceId === workspaceId
    // Telemarketing keeps its existing policy: only its own prospects.
    const allowed =
      isSuper
      || (sameWorkspace && (role === "client_admin" || role === "manager"))
      || (sameWorkspace && role === "sales_rep" && lead.assignedToId === membership.userId)

    if (!allowed) {
      // Before reporting a permission problem, check whether the person's own
      // documents disagree — that is a different failure with a different fix.
      const identity = await inspectIdentity(db, uid, membership)
      if (!identity.coherent) {
        log("identity_inconsistent", identity.problems.join(","))
        return fail("identity_inconsistent", operationId, { problems: identity.problems })
      }
      const code: MutationErrorCode = sameWorkspace || isSuper ? "insufficient_role" : "wrong_workspace"
      log(code)
      return fail(code, operationId)
    }

    // --- A Royal Prestige sales demo happens at the customer's home.
    const location = body.location
    const hasLocation = Boolean(
      location?.addressLine1 && location.city && location.state && location.postalCode,
    )
    if (requiresLocation(leadType, type) && !hasLocation) {
      log("address_required")
      return fail("address_required", operationId)
    }

    // The assignee defaults to the caller; an admin may name another member,
    // which is verified against the lead's workspace.
    let assignedToId = membership.userId
    if (body.assignedToId && body.assignedToId !== membership.userId) {
      if (!isSuper && role !== "client_admin" && role !== "manager") {
        log("insufficient_role", "reassign")
        return fail("insufficient_role", operationId)
      }
      const target = await db.collection("users").doc(body.assignedToId).get()
      if (!target.exists || (target.data() as { workspaceId?: string }).workspaceId !== workspaceId) {
        log("wrong_workspace", "assignee")
        return fail("wrong_workspace", operationId)
      }
      assignedToId = body.assignedToId
    }

    const now = new Date().toISOString()
    const appointmentRef = db.collection("appointments").doc()

    // --- Appointment + stage + audit activity, in ONE transaction.
    const moved = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(db.collection("leads").doc(leadId))
      if (!fresh.exists) throw new Error("lead_vanished")
      const current = fresh.data() as Lead

      tx.set(appointmentRef, {
        workspaceId,
        leadId,
        // Snapshot taken from the REAL lead, not from the browser.
        leadName: current.name,
        leadType,
        assignedToId,
        scheduledAt,
        durationMinutes: duration,
        type,
        status: "scheduled",
        ...(body.notes ? { notes: body.notes } : {}),
        ...(hasLocation ? { location } : {}),
        createdBy: membership.userId,
        createdAt: now,
        updatedAt: now,
      })

      // The stage follows the meeting, unless the lead is already at or past it.
      if (!isBeforeMeetingStage(leadType, current.stage)) return false
      const to = meetingStageFor(leadType)
      tx.update(db.collection("leads").doc(leadId), { stage: to, updatedAt: now })
      tx.set(db.collection("leads").doc(leadId).collection("activities").doc(), {
        workspaceId,
        leadId,
        type: "stage_change",
        // The actor comes from the membership, never from the request.
        actorId: membership.userId,
        actorRole: role,
        createdAt: now,
        createdAtServer: FieldValue.serverTimestamp(),
        payload: { from: current.stage, to, fromLabel: STAGE_LABELS[current.stage], toLabel: STAGE_LABELS[to] },
      })
      return true
    })

    log("ok", moved ? "stage_moved" : "stage_kept")
    return NextResponse.json({
      success: true,
      appointmentId: appointmentRef.id,
      leadId,
      workspaceId,
      stageMoved: moved,
      operationId,
    })
  } catch (err) {
    if (isAdminNotConfigured(err)) {
      log("server_not_configured")
      return fail("server_not_configured", operationId)
    }
    log("internal", err instanceof Error ? err.message.slice(0, 40) : "unknown")
    return fail("internal", operationId)
  }
}

function fail(code: MutationErrorCode, operationId: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error: code, operationId, ...extra }, { status: ERROR_STATUS[code] })
}
