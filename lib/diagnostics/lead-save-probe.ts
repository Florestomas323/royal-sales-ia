"use client"

/**
 * TEMPORARY DIAGNOSTIC — remove once the permission-denied on "Editar
 * prospecto → Guardar" is explained.
 *
 * Purpose: say WHICH write of the save is refused and WHY, using the real
 * published Security Rules as the authority. Nothing here relaxes a rule,
 * grants a permission or bypasses auditing:
 *
 *   Phase 1 (read-only + one no-op write, NO data change):
 *     - reads the lead and `memberships/{authUid}` FRESH from Firestore;
 *     - checks, field by field, the predicates the Rules re-evaluate;
 *     - P0: an update that rewrites `workspaceId` with its own value. The
 *       diff is empty, so every data predicate passes trivially and only the
 *       identity/role/workspace part of `allow update` is exercised.
 *
 *   Phase 2 (explicit, applies the user's OWN intended change):
 *     - P1 stage only, P2 assignment only, P3 the remaining fields — each
 *       through the REAL `updateLead()`, so each is a normal, fully audited
 *       batch (lead update + its activity). No write is ever made without
 *       the activity that describes it.
 *
 * The report contains ids, field NAMES, types and stage values only — never
 * a name, phone or email.
 */

import { doc, getDoc, updateDoc, type DocumentData } from "firebase/firestore"
import { auth, db } from "@/lib/firebase/client"
import { updateLead, type LeadPatch } from "@/lib/firebase/leads"
import type { ActorContext } from "@/lib/firebase/activities"
import { leadTypeOf, normalizePhone } from "@/lib/leads"
import type { Lead } from "@/types"

export function leadSaveDiagEnabled(): boolean {
  if (typeof window === "undefined") return false
  return new URLSearchParams(window.location.search).get("diag") === "1"
}

/* Literal copies of the Rules lists (firestore.rules:143–151, 1721–1725). */
const RULES_SALES_STAGES = ["new_lead", "contact", "contacted", "interested", "appointment", "follow_up", "sale", "not_interested"]
const RULES_RECRUITING_STAGES = ["rec_new", "rec_contact", "rec_contacted", "rec_qualified", "rec_interview", "rec_orientation", "rec_follow_up", "rec_hired", "rec_disqualified"]
const RULES_PLATFORMS = ["meta", "facebook", "instagram", "tiktok", "google", "youtube", "indeed", "whatsapp", "web", "landing_page", "referral", "manual", "other", "organic"]
const IMMUTABLE = ["workspaceId", "attribution", "createdAt", "clientId", "webForm"]

export interface Check {
  id: string
  rule: string
  ok: boolean
  detail: string
}

export interface ProbeResult {
  id: string
  what: string
  ok: boolean | null // null = skipped
  code?: string
  message?: string
}

export interface LeadSaveReport {
  at: string
  leadId: string
  patchKeys: string[]
  originalError?: { code?: string; message: string }
  identity: Record<string, unknown>
  leadFields: Record<string, string>
  checks: Check[]
  probes: ProbeResult[]
  verdict: string
}

/** Type as the Rules see it, without exposing the value. */
function typeOf(v: unknown): string {
  if (v === undefined) return "(ausente)"
  if (v === null) return "null"
  if (Array.isArray(v)) return "list"
  if (typeof v === "object") {
    const ctor = (v as { constructor?: { name?: string } }).constructor?.name
    return ctor && ctor !== "Object" ? ctor : "map"
  }
  return typeof v
}

/** Stage and ids are not personal data; everything else is shown as its type. */
const SHOW_VALUE = new Set(["workspaceId", "leadType", "stage", "source", "assignedToId", "campaignId", "attributionSource", "archived", "customerId", "purgeClaimId"])

function errInfo(err: unknown): { code?: string; message: string } {
  const e = err as { code?: unknown; message?: unknown; name?: unknown }
  return {
    code: typeof e?.code === "string" ? e.code : typeof e?.name === "string" ? e.name : undefined,
    message: typeof e?.message === "string" ? e.message : String(err),
  }
}

function check(checks: Check[], id: string, rule: string, ok: boolean, detail: string) {
  checks.push({ id, rule, ok, detail })
}

/**
 * Phase 1. Reads + one no-op write. Changes no data.
 */
export async function diagnoseLeadSave(input: {
  lead: Lead
  patch: LeadPatch
  actor: ActorContext | null
  originalError?: unknown
}): Promise<LeadSaveReport> {
  const { lead, patch, actor } = input
  const checks: Check[] = []
  const probes: ProbeResult[] = []
  const uid = auth.currentUser?.uid ?? null

  // --- Fresh documents, read with the caller's own permissions.
  let fresh: DocumentData | null = null
  let leadRead = "ok"
  try {
    const snap = await getDoc(doc(db, "leads", lead.id))
    if (snap.exists()) fresh = snap.data()
    else leadRead = "no existe"
  } catch (e) {
    leadRead = errInfo(e).code ?? "error"
  }

  let mem: DocumentData | null = null
  let membershipRead = uid ? "ok" : "sin sesión"
  if (uid) {
    try {
      const snap = await getDoc(doc(db, "memberships", uid))
      if (snap.exists()) mem = snap.data()
      else membershipRead = "no existe"
    } catch (e) {
      membershipRead = errInfo(e).code ?? "error"
    }
  }

  const identity: Record<string, unknown> = {
    authUid: uid,
    leadRead,
    membershipRead,
    membership: mem
      ? { role: mem.role, workspaceId: mem.workspaceId, status: mem.status ?? "(ausente)", userId: mem.userId ?? "(ausente)" }
      : null,
    sessionActor: actor ? { userId: actor.userId, role: actor.role } : "(sin actor: no se escriben actividades)",
  }

  const leadFields: Record<string, string> = {}
  if (fresh) {
    for (const k of Object.keys(fresh).sort()) {
      leadFields[k] = SHOW_VALUE.has(k) ? `${typeOf(fresh[k])} = ${JSON.stringify(fresh[k])}` : typeOf(fresh[k])
    }
  }

  // --- Identity (firestore.rules:69, 81, 85, 1976, 1978).
  if (mem) {
    const role = mem.role as string
    const status = (mem.status ?? "active") as string
    check(checks, "M1", "membershipIsActive() L69", status === "active", `status=${JSON.stringify(mem.status ?? null)}`)
    if (role !== "super_admin") {
      check(checks, "M2", "inWorkspace() L81", fresh ? mem.workspaceId === fresh.workspaceId : false,
        `membership.workspaceId=${mem.workspaceId} lead.workspaceId=${fresh?.workspaceId}`)
      check(checks, "M3", "isWsAdmin() L85", ["client_admin", "manager"].includes(role), `role=${role}`)
    }
    if (actor) {
      check(checks, "A1", "actorId == myUserId() L1976", actor.userId === mem.userId,
        `sesión=${actor.userId} membership=${mem.userId}`)
      check(checks, "A2", "actorRole == role() L1978", actor.role === mem.role,
        `sesión=${actor.role} membership=${mem.role}`)
    }
  } else {
    check(checks, "M0", "me() / hasMembership()", false, "no se pudo leer memberships/{authUid}")
  }

  // --- Lead data re-evaluated by a stage change.
  if (fresh) {
    const typeStored = fresh.leadType
    const type = typeStored == null ? "sales" : typeStored
    check(checks, "L1", "validLeadType(leadTypeAfter()) L1662", type === "sales" || type === "recruiting", `leadType=${JSON.stringify(typeStored ?? null)}`)
    if (patch.stage !== undefined) {
      const list = type === "sales" ? RULES_SALES_STAGES : RULES_RECRUITING_STAGES
      check(checks, "L2", "stageMatchesType() L163", list.includes(patch.stage), `destino=${patch.stage}`)
      const won = type === "sales" ? "sale" : "rec_hired"
      const hasCV = fresh.closedValue != null
      const hasCA = fresh.closedAt != null
      check(checks, "L3", "closingInvariants() #5 L1415", patch.stage === won || (!hasCV && !hasCA),
        `closedValue=${typeOf(fresh.closedValue)} closedAt=${typeOf(fresh.closedAt)}`)
      check(checks, "L4", "stage_change: payload.from == leadBefore().stage L1943", fresh.stage === lead.stage,
        `enviado=${lead.stage} guardado=${fresh.stage}`)
    }
    if (patch.assignedToId !== undefined) {
      const stored = fresh.assignedToId === undefined ? "" : fresh.assignedToId
      check(checks, "L5", "assignment_change: payload.from == leadBefore().assignedToId L1948",
        (lead.assignedToId ?? "") === stored, `enviado=${JSON.stringify(lead.assignedToId ?? null)} guardado=${JSON.stringify(fresh.assignedToId ?? null)}`)
    }
    if (patch.source !== undefined) {
      check(checks, "L6", "channelChangeIsValid() L1726", RULES_PLATFORMS.includes(patch.source), `source=${patch.source}`)
    }
    if (patch.name !== undefined) check(checks, "L7", "changedToNonEmptyString('name')", patch.name.trim().length > 0, "")
    if (patch.phone !== undefined) {
      check(checks, "L8", "changedToString('phone')", typeof normalizePhone(patch.phone) === "string",
        `guardado=${typeOf(fresh.phone)} normalizado_igual=${normalizePhone(patch.phone) === fresh.phone}`)
    }
    const touchedImmutable = Object.keys(patch).filter((k) => IMMUTABLE.includes(k))
    check(checks, "L9", "campos inmutables L1822", touchedImmutable.length === 0, touchedImmutable.join(",") || "ninguno")
    check(checks, "L10", "lead no archivado (canEditLead)", fresh.archived !== true, `archived=${JSON.stringify(fresh.archived ?? null)}`)
    check(checks, "L11", "tipo coherente con la sesión", leadTypeOf(lead) === (type as string), `sesión=${leadTypeOf(lead)} guardado=${type}`)
  }

  // --- P0: no-op update. Empty diff → only identity/role/workspace are tested.
  if (fresh) {
    try {
      await updateDoc(doc(db, "leads", lead.id), { workspaceId: fresh.workspaceId })
      probes.push({ id: "P0", what: "update leads/{id} sin cambios (solo identidad/rol/workspace)", ok: true })
    } catch (e) {
      probes.push({ id: "P0", what: "update leads/{id} sin cambios (solo identidad/rol/workspace)", ok: false, ...errInfo(e) })
    }
  }

  return {
    at: new Date().toISOString(),
    leadId: lead.id,
    patchKeys: Object.keys(patch),
    ...(input.originalError ? { originalError: errInfo(input.originalError) } : {}),
    identity,
    leadFields,
    checks,
    probes,
    verdict: verdictOf(checks, probes),
  }
}

/**
 * Phase 2. Applies the SAME change the person tried to save, split into
 * independent, fully audited batches through the real updateLead(). Stops at
 * the first refusal. Anything applied before that point is a legitimate,
 * audited write of what the person asked for.
 */
export async function probeLeadSaveSteps(
  report: LeadSaveReport,
  input: { lead: Lead; patch: LeadPatch; actor: ActorContext | null; memberName?: (id: string) => string },
): Promise<LeadSaveReport> {
  const { patch, actor } = input
  const audit = actor ? { actor, memberName: input.memberName } : undefined
  const probes = [...report.probes]

  const steps: { id: string; what: string; sub: LeadPatch }[] = []
  if (patch.stage !== undefined) {
    steps.push({ id: "P1", what: "solo etapa: update lead + create stage_change", sub: { stage: patch.stage, ...(patch.closedValue !== undefined ? { closedValue: patch.closedValue } : {}) } })
  }
  if (patch.assignedToId !== undefined) {
    steps.push({ id: "P2", what: "solo responsable: update lead + create assignment_change", sub: { assignedToId: patch.assignedToId } })
  }
  const rest: LeadPatch = { ...patch }
  delete rest.stage
  delete rest.closedValue
  delete rest.assignedToId
  if (Object.keys(rest).length > 0) {
    steps.push({ id: "P3", what: `resto sin actividad: ${Object.keys(rest).join(", ")}`, sub: rest })
  }

  let stopped = false
  for (const step of steps) {
    if (stopped) {
      probes.push({ id: step.id, what: step.what, ok: null })
      continue
    }
    try {
      // Re-read before each step so `current` (payload.from) is the real state.
      const snap = await getDoc(doc(db, "leads", input.lead.id))
      const current = { ...(snap.data() as Lead), id: input.lead.id }
      await updateLead(input.lead.id, current, step.sub, audit)
      probes.push({ id: step.id, what: step.what, ok: true })
    } catch (e) {
      probes.push({ id: step.id, what: step.what, ok: false, ...errInfo(e) })
      stopped = true
    }
  }

  return { ...report, probes, verdict: verdictOf(report.checks, probes) }
}

function verdictOf(checks: Check[], probes: ProbeResult[]): string {
  const failedChecks = checks.filter((c) => !c.ok).map((c) => `${c.id} ${c.rule}`)
  const failedProbe = probes.find((p) => p.ok === false)
  const p = (id: string) => probes.find((x) => x.id === id)?.ok

  if (p("P0") === false) return `Falla la identidad/rol/workspace del update del lead (P0). Checks: ${failedChecks.join("; ") || "ninguno local"}`
  if (failedProbe) return `Rechazada: ${failedProbe.id} (${failedProbe.what}). Checks fallidos: ${failedChecks.join("; ") || "ninguno local — comparar reglas publicadas"}`
  if (p("P1") === true && (p("P2") ?? true) && (p("P3") ?? true)) {
    return "Cada escritura pasa por separado: el rechazo solo ocurre al combinarlas en UN batch."
  }
  if (failedChecks.length) return `Predicción local de fallo: ${failedChecks.join("; ")}`
  return "Fase 1 sin fallos. Ejecuta la fase 2 para localizar la escritura."
}
