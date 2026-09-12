"use client"

import { useEffect, useMemo, useState } from "react"
import {
  addDoc, collection, deleteDoc, doc, onSnapshot, query, updateDoc, where,
  type DocumentData, type Query,
} from "firebase/firestore"
import { db } from "@/lib/firebase/client"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import type { ContentDraft, DraftStatus, NewDraft } from "./types"
import type { UserRole } from "@/types"

/**
 * `contentDrafts` CRUD, mirroring the multi-tenant pattern already used for
 * clients and campaigns. Security Rules are the real boundary; these helpers
 * simply avoid issuing queries that would be denied.
 */

const draftsCol = collection(db, "contentDrafts")

/** Roles that may see internal drafts, not just approved creatives. */
export function canManageDrafts(role: UserRole | null): boolean {
  return role === "super_admin" || role === "client_admin" || role === "manager"
}

/** Distribuidor, Asistente (and super_admin) may archive or delete. */
export function canArchiveDrafts(role: UserRole | null): boolean {
  return role === "super_admin" || role === "client_admin" || role === "manager"
}

const byUpdated = (a: ContentDraft, b: ContentDraft) =>
  Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || "")

/**
 * Live drafts for the active workspace.
 *
 * A sales_rep or viewer receives a query pinned to `status == "approved"`,
 * which is exactly what the Rules allow: an unfiltered list from them would
 * be rejected by Firestore, so the restriction is enforced server-side too.
 * Ordering happens in the client, so no composite index is needed.
 */
export function useContentDrafts() {
  const { workspaceId, isSuperAdmin, role, status } = useWorkspace()
  const [drafts, setDrafts] = useState<ContentDraft[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const approvedOnly = !canManageDrafts(role)

  useEffect(() => {
    if (status !== "ready") return
    if (!workspaceId && !isSuperAdmin) {
      setDrafts([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)

    const filters = [
      ...(workspaceId ? [where("workspaceId", "==", workspaceId)] : []),
      ...(approvedOnly ? [where("status", "==", "approved")] : []),
    ]
    const q: Query<DocumentData> = filters.length > 0 ? query(draftsCol, ...filters) : query(draftsCol)

    const unsub = onSnapshot(
      q,
      (snap) => {
        setDrafts(snap.docs.map((d) => ({ ...(d.data() as ContentDraft), id: d.id })).sort(byUpdated))
        setLoading(false)
      },
      (err) => {
        console.error("[firestore] contentDrafts subscription failed:", err)
        setError(err)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [workspaceId, isSuperAdmin, status, approvedOnly])

  return { drafts, loading, error, approvedOnly }
}

export function useDraftCounts(drafts: ContentDraft[]) {
  return useMemo(
    () => ({
      draft: drafts.filter((d) => d.status === "draft").length,
      approved: drafts.filter((d) => d.status === "approved").length,
      archived: drafts.filter((d) => d.status === "archived").length,
    }),
    [drafts],
  )
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

/** Creates a draft. `createdBy` must be the caller's own users.id (Rules). */
export async function createDraft(input: NewDraft): Promise<string> {
  const now = new Date().toISOString()
  const ref = await addDoc(
    draftsCol,
    stripUndefined({ ...input, createdAt: now, updatedAt: now, status: "draft" as DraftStatus }),
  )
  return ref.id
}

export async function updateDraft(
  id: string,
  patch: Partial<Pick<ContentDraft, "title" | "output" | "variants" | "inputs">>,
): Promise<void> {
  await updateDoc(doc(draftsCol, id), stripUndefined({ ...patch, updatedAt: new Date().toISOString() }))
}

/** Approval records who approved it; workspace and author stay untouched. */
export async function approveDraft(id: string, approverUserId: string): Promise<void> {
  const now = new Date().toISOString()
  await updateDoc(doc(draftsCol, id), {
    status: "approved" satisfies DraftStatus,
    approvedBy: approverUserId,
    approvedAt: now,
    updatedAt: now,
  })
}

export async function archiveDraft(id: string): Promise<void> {
  await updateDoc(doc(draftsCol, id), {
    status: "archived" satisfies DraftStatus,
    updatedAt: new Date().toISOString(),
  })
}

export async function restoreDraft(id: string): Promise<void> {
  await updateDoc(doc(draftsCol, id), {
    status: "draft" satisfies DraftStatus,
    updatedAt: new Date().toISOString(),
  })
}

/** Duplicating always produces a NEW draft owned by whoever duplicated it. */
export async function duplicateDraft(source: ContentDraft, createdBy: string): Promise<string> {
  return createDraft({
    workspaceId: source.workspaceId,
    createdBy,
    objective: source.objective,
    channel: source.channel,
    format: source.format,
    sourceCampaignId: source.sourceCampaignId,
    title: `${source.title} (copia)`,
    inputs: source.inputs,
    output: source.output,
    outputSource: source.outputSource,
    variants: source.variants,
  })
}

export async function deleteDraft(id: string): Promise<void> {
  await deleteDoc(doc(draftsCol, id))
}
