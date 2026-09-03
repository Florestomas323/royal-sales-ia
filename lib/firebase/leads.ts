"use client"

import { useEffect, useState } from "react"
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  type QueryConstraint,
} from "firebase/firestore"
import { db } from "./client"
import { useWorkspace } from "./workspace-context"
import type { Lead, LeadType, PipelineStage } from "@/types"

const leadsCol = collection(db, "leads")

export interface LeadsScope {
  /** Active workspace. `null` = all workspaces (super admin only). */
  workspaceId: string | null
  /** When set, only leads assigned to this team profile id (sales_rep). */
  assignedToId?: string
}

/**
 * Subscribe to leads, newest first, scoped to the workspace (and optionally
 * to a single rep). Filtering happens in Firestore, not in the browser.
 *
 * Required composite indexes (see firestore.indexes.json):
 *   leads: workspaceId ASC, createdAt DESC
 *   leads: workspaceId ASC, assignedToId ASC, createdAt DESC
 */
export function subscribeLeads(
  scope: LeadsScope,
  onData: (leads: Lead[]) => void,
  onError?: (err: Error) => void,
) {
  const constraints: QueryConstraint[] = []
  if (scope.workspaceId) constraints.push(where("workspaceId", "==", scope.workspaceId))
  if (scope.assignedToId) constraints.push(where("assignedToId", "==", scope.assignedToId))
  constraints.push(orderBy("createdAt", "desc"))

  const q = query(leadsCol, ...constraints)
  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((d) => ({ ...(d.data() as Lead), id: d.id }))
      onData(rows)
    },
    (err) => onError?.(err),
  )
}

/** Move a lead to a new pipeline stage (persisted, realtime). */
export async function updateLeadStage(id: string, stage: PipelineStage) {
  await updateDoc(doc(leadsCol, id), { stage })
}

export interface NewLeadInput {
  workspaceId: string
  name: string
  phone?: string
  email?: string
  campaignId?: string
  campaignName?: string
  source?: Lead["source"]
  assignedToId?: string
  clientId?: string
  potentialValue?: number
  leadType?: LeadType
}

/** Create a new lead with sensible defaults for the fields the UI omits. */
export async function createLead(input: NewLeadInput) {
  const now = new Date().toISOString()
  const source: Lead["source"] = input.source ?? "referral"
  const lead: Omit<Lead, "id"> = {
    workspaceId: input.workspaceId,
    leadType: input.leadType ?? "sales",
    name: input.name,
    phone: input.phone ?? "",
    email: input.email ?? "",
    source,
    campaignId: input.campaignId ?? "",
    campaignName: input.campaignName ?? "Entrada manual",
    score: 50,
    temperature: "warm",
    stage: "new_lead",
    assignedToId: input.assignedToId ?? "",
    potentialValue: input.potentialValue ?? 0,
    createdAt: now,
    lastContactAt: null,
    nextFollowUpAt: null,
    nextAction: "Primer contacto",
    attribution: {
      platform: source,
      campaign: input.campaignName ?? "Entrada manual",
      adSet: "—",
      ad: "—",
      creative: "—",
    },
    clientId: input.clientId ?? "",
  }
  const ref = await addDoc(leadsCol, lead)
  return ref.id
}

/**
 * Hook that subscribes to the leads of the active workspace.
 * sales_rep accounts are automatically restricted to their own leads, which
 * is also what Security Rules require for the query to be allowed.
 */
export function useLeads() {
  const { workspaceId, isSuperAdmin, role, membership, status } = useWorkspace()
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
      { workspaceId, assignedToId },
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
  }, [workspaceId, isSuperAdmin, assignedToId, status])

  return { leads, loading, error }
}
