"use client"

import { useEffect, useMemo, useState } from "react"
import {
  addDoc,
  collection,
  doc,
  getCountFromServer,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  type QueryConstraint,
} from "firebase/firestore"
import { db } from "./client"
import { useWorkspace } from "./workspace-context"
import { PIPELINES } from "@/lib/constants"
import { normalizePhone } from "@/lib/leads"
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
}

function scopeConstraints(scope: LeadsScope): QueryConstraint[] {
  const constraints: QueryConstraint[] = []
  if (scope.workspaceId) constraints.push(where("workspaceId", "==", scope.workspaceId))
  if (scope.leadType && scope.leadType !== "all") {
    constraints.push(where("leadType", "==", scope.leadType))
  }
  if (scope.assignedToId) constraints.push(where("assignedToId", "==", scope.assignedToId))
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

/** Move a lead to a new pipeline stage (persisted, realtime). */
export async function updateLeadStage(id: string, stage: PipelineStage) {
  await updateDoc(doc(leadsCol, id), { stage })
}

/**
 * Change the lead type. The stage is reset to the initial stage of the new
 * pipeline so the lead never carries a stage of the other pipeline.
 */
export async function updateLeadType(id: string, leadType: LeadType) {
  await updateDoc(doc(leadsCol, id), { leadType, stage: PIPELINES[leadType].initial })
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
  const ref = await addDoc(leadsCol, lead)
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
    Promise.all([
      countLeads(base),
      countLeads({ ...base, leadType: "sales" }),
      countLeads({ ...base, leadType: "recruiting" }),
    ])
      .then(([all, sales, recruiting]) => {
        if (!cancelled) setCounts({ all, sales, recruiting })
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
