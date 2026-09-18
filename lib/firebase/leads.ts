"use client"

import { useEffect, useMemo, useState } from "react"
import {
  collection,
  doc,
  getCountFromServer,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryConstraint,
} from "firebase/firestore"
import { auth, db } from "./client"
import { useWorkspace } from "./workspace-context"
import { PIPELINES, PLATFORMS } from "@/lib/constants"
import {
  closedFieldsFor,
  isStageOf,
  isValidClosedValue,
  leadTypeOf,
  normalizePhone,
  requiresClosedValue,
} from "@/lib/leads"
import { stageActivity, type ActorContext } from "./activities"
import { STAGE_LABELS } from "@/lib/constants"
import type {
  Attribution,
  Lead,
  LeadType,
  PipelineStage,
  Platform,
  RecruitingProfile,
} from "@/types"

const leadsCol = collection(db, "leads")

/** `"all"` = both types (no leadType filter in Firestore). */
export type LeadTypeFilter = LeadType | "all"

export interface LeadsScope {
  /** Active workspace. `null` = all workspaces (super admin only). */
  workspaceId: string | null
  /** Ventas / Reclutamiento / todos. */
  leadType?: LeadTypeFilter
  /** When set, only leads assigned to this team profile id (sales_rep). */
  assignedToId?: string
  /** Count helper: restrict to explicitly archived docs. */
  archived?: boolean
}

function scopeConstraints(scope: LeadsScope): QueryConstraint[] {
  const constraints: QueryConstraint[] = []
  if (scope.workspaceId) constraints.push(where("workspaceId", "==", scope.workspaceId))
  if (scope.leadType && scope.leadType !== "all") {
    constraints.push(where("leadType", "==", scope.leadType))
  }
  if (scope.assignedToId) constraints.push(where("assignedToId", "==", scope.assignedToId))
  if (scope.archived !== undefined) constraints.push(where("archived", "==", scope.archived))
  return constraints
}

/**
 * Subscribe to leads, newest first, filtered in Firestore by workspace,
 * lead type and (for reps) assignee.
 *
 * Composite indexes required (firestore.indexes.json):
 *   leads: workspaceId, createdAt DESC
 *   leads: workspaceId, assignedToId, createdAt DESC
 *   leads: workspaceId, leadType, createdAt DESC
 *   leads: workspaceId, leadType, assignedToId, createdAt DESC
 *   leads: leadType, createdAt DESC              (super admin, all workspaces)
 */
export function subscribeLeads(
  scope: LeadsScope,
  onData: (leads: Lead[]) => void,
  onError?: (err: Error) => void,
) {
  const q = query(leadsCol, ...scopeConstraints(scope), orderBy("createdAt", "desc"))
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ ...(d.data() as Lead), id: d.id }))
      onData(rows)
    },
    (err) => onError?.(err),
  )
}

/** Server-side count for a scope (aggregation query; no documents downloaded). */
export async function countLeads(scope: LeadsScope): Promise<number> {
  const snap = await getCountFromServer(query(leadsCol, ...scopeConstraints(scope)))
  return snap.data().count
}

/**
 * Move a lead to a new pipeline stage AND record it, atomically.
 * Used by the board (drag & "Mover a") and by the detail sheet, so a single
 * code path means a single activity per real change.
 */
export async function updateLeadStage(
  lead: Pick<Lead, "id" | "workspaceId" | "leadType" | "stage" | "closedValue" | "closedAt">,
  stage: PipelineStage,
  actor: ActorContext,
  /** Real amount confirmed by the person; required to close a SALE. */
  confirmedValue?: number,
): Promise<void> {
  if (!isStageOf(leadTypeOf(lead), stage)) {
    throw new LeadValidationError("stage", "La etapa no corresponde al tipo de prospecto.")
  }
  if (lead.stage === stage) return
  // A sale is only closed with an amount a person confirmed. `potentialValue`
  // is never promoted to revenue on its own.
  if (requiresClosedValue(lead, stage) && !isValidClosedValue(confirmedValue)) {
    throw new LeadValidationError("closedValue", "Confirma el importe real de la venta.")
  }
  const batch = writeBatch(db)
  batch.update(doc(leadsCol, lead.id), {
    stage,
    ...closedFieldsFor(lead, stage, confirmedValue),
  })
  stageActivity(batch, lead, actor, {
    type: "stage_change",
    payload: {
      from: lead.stage,
      to: stage,
      fromLabel: STAGE_LABELS[lead.stage as PipelineStage] ?? lead.stage,
      toLabel: STAGE_LABELS[stage],
    },
  })
  await batch.commit()
}

/**
 * Change the lead type. The stage is reset to the initial stage of the new
 * pipeline so the lead never carries a stage of the other pipeline.
 */
export async function updateLeadType(id: string, leadType: LeadType) {
  // The stage resets to the new pipeline's initial one, so the lead is no
  // longer won: closing data must be cleared in the same write (Rules enforce
  // that a lead outside its won stage holds none).
  await updateDoc(doc(leadsCol, id), {
    leadType,
    stage: PIPELINES[leadType].initial,
    closedValue: null,
    closedAt: null,
  })
}

/**
 * Records a contact attempt (WhatsApp / phone) and refreshes `lastContactAt`
 * in the SAME batch — Rules reject the activity unless `lastContactAt` really
 * changed. Opening WhatsApp is not proof a message was sent, so the activity
 * only means "iniciado".
 *
 * `lastContactAt` stays `string | null` (ISO): the model is unchanged. The
 * audit order relies on the activity's server timestamp, not on this value.
 */
export async function recordContact(
  lead: Pick<Lead, "id" | "workspaceId" | "lastContactAt">,
  kind: "whatsapp" | "call",
  actor: ActorContext,
): Promise<void> {
  const now = new Date().toISOString()
  // Guarantee a real change even on two contacts within the same millisecond.
  const lastContactAt = now === lead.lastContactAt ? new Date(Date.now() + 1).toISOString() : now
  const batch = writeBatch(db)
  batch.update(doc(leadsCol, lead.id), { lastContactAt })
  stageActivity(batch, lead, actor, { type: kind })
  await batch.commit()
}

/* -------------------------------------------------------------------------- */
/*  Editing (Phase C)                                                          */
/* -------------------------------------------------------------------------- */

/** Fields a person may change from the edit form. Nothing else is accepted. */
export interface LeadPatch {
  name?: string
  /** Confirmed revenue; only accepted when the lead is moving to `sale`. */
  closedValue?: number
  phone?: string
  email?: string
  potentialValue?: number
  stage?: PipelineStage
  assignedToId?: string
  nextAction?: string
  /**
   * Manual attribution: the local `campaigns` document id, or "" for
   * "Sin campaña". Always written together with `attributionSource: "manual"`.
   * The campaign name is denormalised so lists need no extra read.
   */
  campaignId?: string
  campaignName?: string
  /**
   * Channel / origin (`Platform`). `attribution` is NOT rewritten, so the
   * original Meta ids stay as the record of where the lead really came from.
   */
  source?: Platform
}

export class LeadValidationError extends Error {
  readonly field: keyof LeadPatch
  constructor(field: keyof LeadPatch, message: string) {
    super(message)
    this.name = "LeadValidationError"
    this.field = field
  }
}

/**
 * Validates and persists an edit.
 *  - `workspaceId`, `leadType`, `source`, attribution… are NOT part of the
 *    patch type, so they can never be changed from here (Rules also forbid
 *    moving a lead between workspaces).
 *  - The stage must belong to the lead's pipeline: a sales lead can never be
 *    saved with a `rec_*` stage and vice-versa.
 *  - Reassigning is rejected by Rules for sales_rep (`unchanged('assignedToId')`);
 *    the form hides the control for them, and Firestore is the final say.
 */
export async function updateLead(
  id: string,
  current: Pick<Lead, "leadType"> &
    Partial<Pick<Lead, "id" | "workspaceId" | "stage" | "assignedToId" | "closedValue" | "closedAt">>,
  patch: LeadPatch,
  /** When present, stage/assignment changes are audited in the same batch. */
  audit?: { actor: ActorContext; memberName?: (userId: string) => string },
): Promise<void> {
  const data: Partial<Lead> = {}
  const type = leadTypeOf(current)

  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) throw new LeadValidationError("name", "El nombre es obligatorio.")
    data.name = name
  }
  if (patch.phone !== undefined) data.phone = normalizePhone(patch.phone)
  if (patch.email !== undefined) {
    const email = patch.email.trim().toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new LeadValidationError("email", "El correo no es válido.")
    }
    data.email = email
  }
  if (patch.source !== undefined) {
    if (!PLATFORMS.includes(patch.source)) {
      throw new LeadValidationError("source", "Canal no válido.")
    }
    data.source = patch.source
  }
  if (patch.campaignId !== undefined) {
    // A person picked this; from now on Media Buyer matches by it alone.
    data.campaignId = patch.campaignId
    data.campaignName = patch.campaignId ? (patch.campaignName ?? "") : ""
    data.attributionSource = "manual"
  }
  if (patch.potentialValue !== undefined) {
    if (!Number.isFinite(patch.potentialValue) || patch.potentialValue < 0) {
      throw new LeadValidationError("potentialValue", "El valor debe ser un número positivo.")
    }
    data.potentialValue = patch.potentialValue
  }
  if (patch.stage !== undefined) {
    if (!isStageOf(type, patch.stage)) {
      throw new LeadValidationError("stage", "La etapa no corresponde al tipo de prospecto.")
    }
    data.stage = patch.stage
    // Entering / leaving the won stage also writes (or clears) the closed fields.
    if (current.stage !== undefined) {
      const lead = {
        leadType: current.leadType,
        stage: current.stage,
        closedValue: current.closedValue,
        closedAt: current.closedAt,
      }
      if (requiresClosedValue(lead, patch.stage) && !isValidClosedValue(patch.closedValue)) {
        throw new LeadValidationError("closedValue", "Confirma el importe real de la venta.")
      }
      Object.assign(data, closedFieldsFor(lead, patch.stage, patch.closedValue))
    }
  }
  if (patch.assignedToId !== undefined) data.assignedToId = patch.assignedToId
  if (patch.nextAction !== undefined) data.nextAction = patch.nextAction.trim()

  if (Object.keys(data).length === 0) return

  const workspaceId = current.workspaceId
  const canAudit = Boolean(audit && workspaceId)
  if (!canAudit) {
    await updateDoc(doc(leadsCol, id), data as DocumentData)
    return
  }

  const lead = { id, workspaceId: workspaceId as string }
  const batch = writeBatch(db)
  batch.update(doc(leadsCol, id), data as DocumentData)

  if (data.stage !== undefined && current.stage !== undefined && data.stage !== current.stage) {
    stageActivity(batch, lead, audit!.actor, {
      type: "stage_change",
      payload: {
        from: current.stage,
        to: data.stage,
        fromLabel: STAGE_LABELS[current.stage] ?? current.stage,
        toLabel: STAGE_LABELS[data.stage],
      },
    })
  }
  if (
    data.assignedToId !== undefined &&
    current.assignedToId !== undefined &&
    data.assignedToId !== current.assignedToId
  ) {
    const label = audit!.memberName
    stageActivity(batch, lead, audit!.actor, {
      type: "assignment_change",
      payload: {
        from: current.assignedToId,
        to: data.assignedToId,
        fromLabel: label?.(current.assignedToId),
        toLabel: label?.(data.assignedToId),
      },
    })
  }
  await batch.commit()
}

/** Archive: hidden from lists and counts, never deleted. Audited atomically. */
/**
 * Soft delete. The document stays, flagged `archived`, and every active
 * surface (Prospectos, funnel, metrics, search) filters it out; the trash
 * toggle in Prospectos shows it again and `restoreLead` brings it back. Who
 * did it and when are kept on the document, and the audit trail gets its
 * `archived` activity in the same batch.
 */
export async function archiveLead(
  lead: Pick<Lead, "id" | "workspaceId">,
  actor: ActorContext,
  actorName?: string,
): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(leadsCol, lead.id), {
    archived: true,
    archivedAt: new Date().toISOString(),
    archivedBy: actor.userId,
    ...(actorName ? { archivedByName: actorName } : {}),
  })
  stageActivity(batch, lead, actor, { type: "archived" })
  await batch.commit()
}

export async function restoreLead(
  lead: Pick<Lead, "id" | "workspaceId">,
  actor: ActorContext,
): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(leadsCol, lead.id), { archived: false, archivedAt: null, archivedBy: null, archivedByName: null })
  stageActivity(batch, lead, actor, { type: "restored" })
  await batch.commit()
}

export interface NewLeadInput {
  workspaceId: string
  leadType: LeadType
  source: Platform
  name: string
  phone?: string
  email?: string
  campaignId?: string
  campaignName?: string
  assignedToId?: string
  clientId?: string
  potentialValue?: number
  /** Optional attribution details known at creation (UTMs, landing page…). */
  attribution?: Partial<Omit<Attribution, "platform">>
  recruiting?: RecruitingProfile
}

export interface CreateLeadResult {
  leadId: string
  created: boolean
  duplicate: boolean
  restored: boolean
  /** One word for what happened, straight from the server. */
  outcome: "created" | "restored" | "enriched" | "unchanged"
  /** True when empty fields of the existing prospect were filled in. */
  enriched: boolean
  /**
   * Which fields were filled. Field NAMES only — never their values, so the
   * confirmation can say "se completó el correo" without showing it.
   */
  enrichedFields: string[]
}

/**
 * Manual creation goes through the authenticated server route so the same
 * atomic identity claim protects manual forms and external integrations.
 */
export async function createLead(input: NewLeadInput): Promise<CreateLeadResult> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new MutationError("unauthenticated")
  const response = await fetch("/api/leads", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(input),
  })
  const body = (await response.json().catch(() => ({}))) as Partial<CreateLeadResult> & {
    error?: string
    operationId?: string
  }
  // A MutationError, never a bare Error: `describeError` then shows the real
  // reason (and the operation id) instead of "Ocurrió un error inesperado".
  if (!response.ok || !body.leadId) {
    throw new MutationError(body.error ?? "internal", body.operationId)
  }
  return {
    leadId: body.leadId,
    created: body.created === true,
    duplicate: body.duplicate === true,
    restored: body.restored === true,
    // Carried through from the server instead of being dropped, so the
    // dialog can tell "unchanged" from "enriched" from "restored".
    enriched: body.enriched === true,
    enrichedFields: Array.isArray(body.enrichedFields) ? body.enrichedFields : [],
    outcome:
      body.outcome === "created" || body.outcome === "restored"
        || body.outcome === "enriched" || body.outcome === "unchanged"
        ? body.outcome
        : body.created === true
          ? "created"
          : body.restored === true
            ? "restored"
            : body.enriched === true
              ? "enriched"
              : "unchanged",
  }
}

/**
 * Hook that subscribes to the leads of the active workspace.
 * sales_rep accounts are automatically restricted to their own leads, which
 * is also what Security Rules require for the query to be allowed.
 */
/**
 * @param leadType  Ventas / Reclutamiento / todos.
 * @param workspaceOverride  Narrows the query to ONE workspace.
 *
 * SECURITY: the override is honoured **only for super_admin**. For every other
 * role it is ignored and the workspace still comes from `memberships/{uid}` via
 * the context, so a tampered client cannot use it to reach another tenant.
 * Even for super_admin it only narrows what Security Rules already allow —
 * Firestore, not this hook, is the authority.
 */
export function useLeads(leadType: LeadTypeFilter = "all", workspaceOverride: string | null = null) {
  const { workspaceId: contextWorkspaceId, isSuperAdmin, role, membership, status } = useWorkspace()
  const workspaceId = isSuperAdmin && workspaceOverride ? workspaceOverride : contextWorkspaceId
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const assignedToId = role === "sales_rep" ? membership?.userId : undefined

  useEffect(() => {
    if (status !== "ready") return
    if (!workspaceId && !isSuperAdmin) {
      setLeads([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const unsub = subscribeLeads(
      { workspaceId, leadType, assignedToId },
      (rows) => {
        setLeads(rows)
        setLoading(false)
      },
      (err) => {
        console.error("[firestore] leads subscription failed:", err)
        setError(err)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [workspaceId, isSuperAdmin, assignedToId, status, leadType])

  return { leads, loading, error }
}

export interface LeadTypeCounts {
  all: number
  sales: number
  recruiting: number
}

/**
 * Real counts per lead type for the current scope, computed by Firestore
 * aggregation queries. `refreshKey` lets callers re-count when their live
 * list changes (e.g. after creating a lead).
 *
 * `all` is the count without a leadType filter, so legacy leads that still
 * lack `leadType` are included in "Todos" until normalized.
 */
/** Same override rule as `useLeads`: super_admin only, and only to narrow. */
export function useLeadTypeCounts(refreshKey: unknown = null, workspaceOverride: string | null = null) {
  const { workspaceId: contextWorkspaceId, isSuperAdmin, role, membership, status } = useWorkspace()
  const workspaceId = isSuperAdmin && workspaceOverride ? workspaceOverride : contextWorkspaceId
  const [counts, setCounts] = useState<LeadTypeCounts | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const assignedToId = role === "sales_rep" ? membership?.userId : undefined
  const base = useMemo<LeadsScope>(() => ({ workspaceId, assignedToId }), [workspaceId, assignedToId])

  useEffect(() => {
    if (status !== "ready") return
    if (!workspaceId && !isSuperAdmin) {
      setCounts({ all: 0, sales: 0, recruiting: 0 })
      return
    }
    let cancelled = false
    // Archived leads always carry `archived: true` explicitly, so an equality
    // count works even though legacy docs have no field at all.
    Promise.all([
      countLeads(base),
      countLeads({ ...base, leadType: "sales" }),
      countLeads({ ...base, leadType: "recruiting" }),
      countLeads({ ...base, archived: true }),
      countLeads({ ...base, leadType: "sales", archived: true }),
      countLeads({ ...base, leadType: "recruiting", archived: true }),
    ])
      .then(([all, sales, recruiting, allArchived, salesArchived, recruitingArchived]) => {
        if (!cancelled) {
          setCounts({
            all: all - allArchived,
            sales: sales - salesArchived,
            recruiting: recruiting - recruitingArchived,
          })
        }
      })
      .catch((err: Error) => {
        console.error("[firestore] lead counts failed:", err)
        if (!cancelled) setError(err)
      })
    return () => {
      cancelled = true
    }
  }, [base, workspaceId, isSuperAdmin, status, refreshKey])

  return { counts, error }
}

/* ------------------------------------------------------------ empty trash */

export interface EmptyTrashResult {
  success: boolean
  workspaceId: string
  deletedCount: number
  /** Present when some deletions failed or conflicted; never a silent success. */
  partial?: boolean
  /** Leads left behind this run (failed relations + conflicts). */
  pendingCount: number
  /** Of those, skipped because they stopped being archived or moved. */
  conflictCount: number
}

/**
 * Permanently deletes the archived prospects of a workspace.
 *
 * Privileged deletion happens ONLY on the server with the Admin SDK; the
 * browser cannot delete these documents (the Rules never allowed it). The
 * workspace is sent so a super admin can name the one they selected, and the
 * server re-derives and re-authorises it regardless of what is sent.
 */
export async function emptyTrash(workspaceId: string): Promise<EmptyTrashResult> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new Error("missing_auth_token")
  const response = await fetch("/api/leads/empty-trash", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ workspaceId }),
  })
  const body = (await response.json().catch(() => ({}))) as Partial<EmptyTrashResult> & { error?: string }
  // 207 means partial: it is not an error, and it is not a full success.
  if (!response.ok && response.status !== 207) {
    throw new Error(body.error ?? `empty_trash_failed_${response.status}`)
  }
  return {
    success: body.success === true,
    workspaceId: body.workspaceId ?? workspaceId,
    deletedCount: typeof body.deletedCount === "number" ? body.deletedCount : 0,
    pendingCount: typeof body.pendingCount === "number" ? body.pendingCount : 0,
    conflictCount: typeof body.conflictCount === "number" ? body.conflictCount : 0,
    ...(body.partial ? { partial: true } : {}),
  }
}

/* --------------------------------------------- campaign, via the server */

/** Specific server codes → actionable Spanish messages. */
const MUTATION_MESSAGES: Record<string, string> = {
  unauthenticated: "Tu sesión expiró. Vuelve a iniciar sesión.",
  // Creación de prospectos: cada código del servidor dice qué corregir.
  // Sin esto, cambiar de workspace y guardar mostraba «Ocurrió un error
  // inesperado» cuando el motivo real era un responsable del workspace anterior.
  missing_workspace: "Selecciona un workspace antes de crear el prospecto.",
  invalid_assignee:
    "El responsable seleccionado no pertenece a este workspace. Elige uno de la lista.",
  invalid_campaign:
    "Esa campaña no pertenece a este workspace o no corresponde al tipo de prospecto.",
  forbidden: "Tu rol no puede crear prospectos en este workspace.",
  invalid_identity:
    "Revisa el nombre y el teléfono: el teléfono debe tener formato internacional.",
  invalid_email: "El correo no tiene un formato válido.",
  invalid_lead_type: "Selecciona un tipo de prospecto válido: Ventas o Reclutamiento.",
  invalid_source: "La fuente seleccionada no es válida.",
  invalid_source_for_type: "Esa fuente no está permitida para este tipo de prospecto.",
  invalid_token: "Tu sesión no es válida. Vuelve a iniciar sesión.",
  membership_inactive: "Tu cuenta está desactivada en este workspace.",
  membership_missing: "Tu cuenta no tiene membresía en este workspace.",
  identity_inconsistent:
    "Tus datos de acceso no coinciden entre sí (perfil, membresía o cupos). Pide a un administrador que ejecute la reparación de identidad.",
  wrong_workspace: "Ese prospecto pertenece a otro workspace.",
  insufficient_role: "Tu rol no puede realizar esta acción.",
  lead_not_found: "El prospecto ya no existe.",
  lead_archived: "El prospecto está en la papelera. Restáuralo primero.",
  campaign_not_found: "Esa campaña ya no existe.",
  campaign_wrong_workspace: "Esa campaña pertenece a otro workspace.",
  campaign_type_mismatch: "Esa campaña no corresponde al tipo de prospecto.",
  address_required: "Una demostración de ventas necesita la dirección completa.",
  invalid_body: "Faltan datos obligatorios.",
  server_not_configured: "El servidor no está configurado. Avisa al administrador.",
  internal: "No se pudo completar la operación. Inténtalo de nuevo.",
}

export class MutationError extends Error {
  readonly code: string
  readonly operationId?: string
  constructor(code: string, operationId?: string) {
    super(MUTATION_MESSAGES[code] ?? MUTATION_MESSAGES.internal)
    this.name = "MutationError"
    this.code = code
    this.operationId = operationId
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const token = await auth.currentUser?.getIdToken()
  if (!token) throw new MutationError("unauthenticated")
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  })
  const parsed = (await res.json().catch(() => ({}))) as { error?: string; operationId?: string }
  if (!res.ok) throw new MutationError(parsed.error ?? "internal", parsed.operationId)
  return parsed as T
}

/**
 * Attributes a campaign through the authenticated server route.
 *
 * The browser sends only WHICH campaign; the server derives the workspace
 * from the lead, the name from the campaign and the role from the membership,
 * and returns a specific code instead of a bare permission error.
 */
export async function setLeadCampaign(
  leadId: string,
  campaignId: string,
): Promise<{ campaignId: string; campaignName: string }> {
  return postJson(`/api/leads/${encodeURIComponent(leadId)}/campaign`, { campaignId })
}
