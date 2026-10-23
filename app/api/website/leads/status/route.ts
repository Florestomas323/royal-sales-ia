import { NextResponse } from "next/server"
import { FieldValue, type DocumentSnapshot } from "firebase-admin/firestore"
import { getAdminDb, isAdminNotConfigured } from "@/lib/firebase/admin"
import { resolveByKey } from "@/lib/website/integration-store"
import { allow } from "@/lib/website/rate-limit"
import { keyLooksValid } from "@/lib/website-leads"
import { STAGE_LABELS } from "@/lib/constants"
import {
  appointmentNotesFor,
  appointmentStatusFor,
  appointmentTypeFor,
  integrationAppointmentId,
  nextStageFor,
  parseLeadStatus,
} from "@/lib/website-lead-status"
import type { Appointment, Lead, LeadType, WebFormSubmission } from "@/types"

export const runtime = "nodejs"

/**
 * SERVER-TO-SERVER endpoint: an integration (the WhatsApp appointment bot)
 * reports what happened with a prospect it already sent to /api/website/leads.
 *
 * Same trust model as /api/website/leads: the ONLY credential is the
 * integration key; the workspace it resolves to is the only one this request
 * can touch — the lead is looked up INSIDE that workspace and re-checked
 * before any write. No CORS headers and no OPTIONS handler, on purpose.
 *
 * Idempotent: the integration's meeting maps to a deterministic appointment
 * id, answers are merged by key and stage moves only happen from the stages
 * allowed in lib/website-lead-status.ts — a retry of the same report changes
 * nothing the second time.
 */

const json = (body: unknown, status = 200) => NextResponse.json(body, { status })

/** Who the timeline shows for these writes (see actorByRole.integration in lib/i18n.ts). */
const ACTOR_ID = "integration:whatsapp-bot"
const ACTOR_ROLE = "integration"

function log(stage: string, detail: Record<string, unknown> = {}) {
  console.log(`[website/leads/status] ${stage}`, JSON.stringify(detail))
}

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown"
  if (!allow(`ls-ip:${ip}`, 60)) return json({ error: "rate_limited" }, 429)

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ?? ""
  const key = (request.headers.get("x-integration-key")?.trim() || bearer) ?? ""
  if (!keyLooksValid(key)) {
    log("auth_failed", { reason: key ? "malformed_key" : "missing_key", status: 401 })
    return json({ error: "unauthorized" }, 401)
  }
  if (!allow(`ls-key:${key.slice(0, 12)}`, 240)) return json({ error: "rate_limited" }, 429)

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: "invalid_body" }, 400)
  }
  const parsed = parseLeadStatus(body)
  if (!parsed.ok) {
    log("validation_failed", { fields: parsed.errors.map((e) => `${e.field}:${e.reason}`), status: 400 })
    return json({ error: "validation", details: parsed.errors }, 400)
  }
  const p = parsed.payload

  try {
    const integration = await resolveByKey(key)
    if (!integration || integration.status !== "connected") {
      log("auth_failed", { reason: integration ? "integration_disabled" : "key_not_found", status: 401 })
      return json({ error: "unauthorized" }, 401)
    }
    const workspaceId = integration.workspaceId
    const db = getAdminDb()
    const leads = db.collection("leads")
    const appointments = db.collection("appointments")

    const result = await db.runTransaction(async (tx) => {
      // --- Find the prospect, always inside THIS workspace.
      let snap: DocumentSnapshot | null = null
      if (p.prospectId) {
        const byId = await tx.get(leads.doc(p.prospectId))
        if (byId.exists && (byId.data() as Lead).workspaceId === workspaceId) snap = byId
      }
      if (!snap && p.externalId) {
        const q = await tx.get(
          leads.where("workspaceId", "==", workspaceId).where("webForm.externalId", "==", p.externalId).limit(1),
        )
        snap = q.docs[0] ?? null
      }
      if (!snap || !snap.exists) return { error: "lead_not_found" as const }
      const lead = snap.data() as Lead
      if (lead.workspaceId !== workspaceId) return { error: "lead_not_found" as const }
      if (lead.archived === true) return { error: "lead_archived" as const }
      const leadRef = snap.ref
      const leadType: LeadType = lead.leadType ?? "sales"
      const now = new Date().toISOString()

      // --- Reads first (Firestore transactions: all reads before writes).
      const apptRef = p.appointment ? appointments.doc(integrationAppointmentId(workspaceId, p.appointment.ref)) : null
      const prevRef = p.previousRef ? appointments.doc(integrationAppointmentId(workspaceId, p.previousRef)) : null
      const apptSnap = apptRef ? await tx.get(apptRef) : null
      const prevSnap = prevRef ? await tx.get(prevRef) : null
      const scheduled = await tx.get(
        appointments.where("workspaceId", "==", workspaceId).where("leadId", "==", leadRef.id).where("status", "==", "scheduled"),
      )

      // --- The integration's own meeting.
      const status = appointmentStatusFor(p.event)
      let appointmentId: string | null = null
      if (apptRef && p.appointment && status) {
        const a = p.appointment
        const existing = apptSnap?.exists ? (apptSnap.data() as Appointment) : null
        // Only its own documents: a same-id document created by somebody else is never overwritten.
        if (existing && existing.createdBy !== ACTOR_ID) return { error: "appointment_conflict" as const }
        const confirmed = p.event === "appointment_confirmed" || (existing?.notes ?? "").includes("✅ Confirmada")
        const type = appointmentTypeFor(a)
        const doc: Omit<Appointment, "id"> = {
          workspaceId,
          leadId: leadRef.id,
          leadName: existing?.leadName ?? lead.name,
          leadType,
          assignedToId: existing?.assignedToId ?? lead.assignedToId ?? "",
          scheduledAt: a.scheduledAt,
          durationMinutes: a.durationMinutes,
          type,
          status,
          notes: appointmentNotesFor(a, confirmed && status === "scheduled"),
          ...(type === "demo" && a.location ? { location: a.location } : {}),
          createdBy: existing?.createdBy ?? ACTOR_ID,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        }
        // set (not merge) keeps the document within the exact shape the Rules allow.
        tx.set(apptRef, doc)
        appointmentId = apptRef.id
      }
      if (prevRef && prevSnap?.exists && p.event === "appointment_rescheduled") {
        const prev = prevSnap.data() as Appointment
        if (prev.createdBy === ACTOR_ID && prev.workspaceId === workspaceId && prev.status === "scheduled") {
          tx.update(prevRef, { status: "cancelled", updatedAt: now })
        }
      }

      // --- Stage.
      // A cancellation only sends the lead back to follow-up when it was its LAST open meeting.
      const otherScheduled = scheduled.docs.some((d) => d.id !== appointmentId && d.id !== prevRef?.id)
      const to = nextStageFor(leadType, lead.stage, p.event, otherScheduled)

      // --- Lead fields the integration owns: its answers, the gift, the schedule text.
      const webForm: WebFormSubmission = {
        ...(lead.webForm ?? { form: "whatsapp-bot" }),
        ...(p.externalId && !lead.webForm?.externalId ? { externalId: p.externalId } : {}),
        answers: { ...(lead.webForm?.answers ?? {}), ...(p.answers ?? {}) },
        ...(p.gift ? { gift: p.gift } : {}),
        ...(p.schedulePreference ? { schedulePreference: p.schedulePreference } : {}),
      }
      const leadPatch: Record<string, string | WebFormSubmission> = { webForm, updatedAt: now }
      // The bot did talk to this person on WhatsApp: that is a real first contact.
      if (!lead.lastContactAt) leadPatch.lastContactAt = now
      if (to && to !== lead.stage) leadPatch.stage = to
      tx.update(leadRef, leadPatch)

      if (to && to !== lead.stage) {
        tx.set(leadRef.collection("activities").doc(), {
          workspaceId,
          leadId: leadRef.id,
          type: "stage_change",
          actorId: ACTOR_ID,
          actorRole: ACTOR_ROLE,
          createdAt: now,
          createdAtServer: FieldValue.serverTimestamp(),
          payload: { from: lead.stage, to, fromLabel: STAGE_LABELS[lead.stage], toLabel: STAGE_LABELS[to] },
        })
      }
      return { leadId: leadRef.id, stage: to ?? lead.stage, stageMoved: Boolean(to && to !== lead.stage), appointmentId }
    })

    if ("error" in result && result.error) {
      const code: string = result.error
      const http = code === "lead_not_found" ? 404 : 409
      log(code, { workspaceId, event: p.event, status: http })
      return json({ error: code }, http)
    }
    log("ok", { workspaceId, event: p.event, prospectId: result.leadId, stageMoved: result.stageMoved, status: 200 })
    return json({ success: true, ok: true, prospectId: result.leadId, stage: result.stage, stageMoved: result.stageMoved, appointmentId: result.appointmentId })
  } catch (err) {
    if (isAdminNotConfigured(err)) {
      log("server_not_configured", { status: 503 })
      return json({ error: "server_not_configured" }, 503)
    }
    log("internal_error", { status: 500, message: err instanceof Error ? err.message : String(err) })
    console.error("[website/leads/status] stack", err)
    return json({ error: "internal" }, 500)
  }
}
