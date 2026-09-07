"use client"

import { useEffect, useState } from "react"
import {
  addDoc,
  collection,
  doc,
  documentId,
  onSnapshot,
  query,
  deleteField,
  serverTimestamp,
  updateDoc,
  where,
  type DocumentData,
} from "firebase/firestore"
import { db } from "./client"
import type { Workspace } from "@/types"

const workspacesCol = collection(db, "workspaces")

/**
 * Live list of workspaces.
 *  - super_admin → all workspaces
 *  - anyone else → only their own (Rules enforce it; we constrain the query
 *    so it is allowed at all).
 */
export function useWorkspaces(opts: { isSuperAdmin: boolean; ownWorkspaceId: string | null }) {
  const { isSuperAdmin, ownWorkspaceId } = opts
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!isSuperAdmin && !ownWorkspaceId) {
      setWorkspaces([])
      setLoading(false)
      return
    }
    const q = isSuperAdmin
      ? query(workspacesCol)
      : query(workspacesCol, where(documentId(), "==", ownWorkspaceId))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ ...(d.data() as Omit<Workspace, "id">), id: d.id }))
        rows.sort((a, b) => a.name.localeCompare(b.name))
        setWorkspaces(rows)
        setLoading(false)
      },
      (err) => {
        setError(err)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [isSuperAdmin, ownWorkspaceId])

  return { workspaces, loading, error }
}

export interface NewWorkspaceInput {
  name: string
  plan?: string
  ownerEmail?: string
}

/** super_admin only (enforced by Rules). */
export async function createWorkspace(input: NewWorkspaceInput): Promise<string> {
  const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"]
  const ws: Omit<Workspace, "id"> = {
    name: input.name.trim(),
    plan: input.plan ?? "Starter",
    logoColor: palette[Math.floor(Math.random() * palette.length)],
    status: "active",
    createdAt: new Date().toISOString(),
    ...(input.ownerEmail ? { ownerEmail: input.ownerEmail.toLowerCase() } : {}),
  }
  const ref = await addDoc(workspacesCol, ws)
  return ref.id
}

/**
 * Saves the company profile. Security Rules whitelist exactly these keys and
 * only for super_admin or the workspace's client_admin — a manager or viewer
 * is rejected server-side, so the screen must not pretend otherwise.
 *
 * A `null` clears the field for real: writing an empty string would leave a
 * hollow value that reads like data the distributor never entered.
 */
export async function updateWorkspaceSettings(
  workspaceId: string,
  patch: {
    name: string
    phone: string | null
    ownerEmail: string | null
    city: string | null
    state: string | null
    timezone: string | null
  },
): Promise<void> {
  const data: DocumentData = { name: patch.name.trim(), updatedAt: serverTimestamp() }
  for (const key of ["phone", "ownerEmail", "city", "state", "timezone"] as const) {
    data[key] = patch[key] === null ? deleteField() : patch[key]
  }
  await updateDoc(doc(workspacesCol, workspaceId), data)
}
