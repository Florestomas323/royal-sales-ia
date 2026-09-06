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
import { db } from "./client"
import { useWorkspace } from "./workspace-context"
import { PIPELINES } from "@/lib/constants"
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
export async function archiveLead(
  lead: Pick<Lead, "id" | "workspaceId">,
  actor: ActorContext,
): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(leadsCol, lead.id), { archived: true, archivedAt: new Date().toISOString() })
  stageActivity(batch, lead, actor, { type: "archived" })
  await batch.commit()
}

export async function restoreLead(
  lead: Pick<Lead, "id" | "workspaceId">,
  actor: ActorContext,
): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(leadsCol, lead.id), { archived: false, archivedAt: null })
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
  /** When present, a `lead_created` activity is written in the same batch. */
  actor?: ActorContext
}

function stripUndefined<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}

/** Create a new lead with sensible defaults for the fields the UI omits. */
export async function createLead(input: NewLeadInput) {
  const now = new Date().toISOString()
  const campaignName = input.campaignName ?? "Entrada manual"
  const attribution: Attribution = stripUndefined({
    platform: input.source,
    campaign: campaignName,
    adSet: "—",
    ad: "—",
    creative: "—",
    ...input.attribution,
  })

  const lead: Omit<Lead, "id"> = {
    workspaceId: input.workspaceId,
    leadType: input.leadType,
    name: input.name,
    phone: normalizePhone(input.phone ?? ""),
    email: (input.email ?? "").trim().toLowerCase(),
    source: input.source,
    campaignId: input.campaignId ?? "",
    campaignName,
    score: 50,
    temperature: "warm",
    stage: PIPELINES[input.leadType].initial,
    assignedToId: input.assignedToId ?? "",
    potentialValue: input.potentialValue ?? 0,
    createdAt: now,
    lastContactAt: null,
    nextFollowUpAt: null,
    nextAction: "Primer contacto",
    attribution,
    clientId: input.clientId ?? "",
    ...(input.leadType === "recruiting" && input.recruiting
      ? { recruiting: stripUndefined(input.recruiting) }
      : {}),
  }
  // The lead and its `lead_created` activity are born in the same batch:
  // Rules use getAfter() so the activity can reference a lead that does not
  // exist yet, and reject `lead_created` on a lead that already existed.
  const ref = doc(leadsCol)
  const batch = writeBatch(db)
  batch.set(ref, lead)
  if (input.actor) {
    stageActivity(batch, { id: ref.id, workspaceId: input.workspaceId }, input.actor, {
      type: "lead_created",
    })
  }
  await batch.commit()
  return ref.id
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
