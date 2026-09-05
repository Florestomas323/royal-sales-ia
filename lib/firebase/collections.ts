"use client"

import { useEffect, useMemo, useState } from "react"
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Query,
  type DocumentData,
} from "firebase/firestore"
import { db } from "./client"
import { useWorkspace } from "./workspace-context"
import type { Campaign, Client, LeadType, User } from "@/types"

/* -------------------------------------------------------------------------- */
/*  Generic workspace-scoped realtime hook                                    */
/* -------------------------------------------------------------------------- */

/**
 * Subscribes to a collection filtered by the ACTIVE workspace.
 *
 *  - Members: `where("workspaceId", "==", <their workspace>)` — always.
 *  - super_admin with a workspace selected: same filter.
 *  - super_admin in "all workspaces" mode: no filter (Rules allow it only for
 *    super_admin; any other role would get permission-denied, which we surface).
 *
 * No automatic seeding happens here anymore (see seed.ts / admin-tools.ts).
 */
function useWorkspaceCollection<T extends { id: string }>(
  name: string,
  sortBy: (a: T, b: T) => number,
) {
  const { workspaceId, isSuperAdmin, status } = useWorkspace()
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (status !== "ready") return
    // A member without workspace can never query; avoid an unfiltered read.
    if (!workspaceId && !isSuperAdmin) {
      setData([])
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    const col = collection(db, name)
    const q: Query<DocumentData> = workspaceId
      ? query(col, where("workspaceId", "==", workspaceId))
      : query(col)

    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }))
        rows.sort(sortBy)
        setData(rows)
        setLoading(false)
      },
      (err) => {
        console.error(`[firestore] ${name} subscription failed:`, err)
        setError(err)
        setLoading(false)
      },
    )
    return () => unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, workspaceId, isSuperAdmin, status])

  return { data, loading, error }
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

const PALETTE = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
]
const pick = (arr: readonly string[]) => arr[Math.floor(Math.random() * arr.length)]

/* -------------------------------------------------------------------------- */
/*  Clients                                                                    */
/* -------------------------------------------------------------------------- */

export function useClients() {
  const { data, loading, error } = useWorkspaceCollection<Client>("clients", byName)
  return { clients: data, loading, error }
}

export interface NewClientInput {
  workspaceId: string
  name: string
  industry: string
  status?: Client["status"]
}

export async function createClient(input: NewClientInput) {
  const client: Omit<Client, "id"> = {
    workspaceId: input.workspaceId,
    name: input.name,
    industry: input.industry || "—",
    logoColor: pick(PALETTE),
    status: input.status ?? "onboarding",
    adSpend: 0,
    leads: 0,
    appointments: 0,
    sales: 0,
    revenue: 0,
  }
  const ref = await addDoc(collection(db, "clients"), client)
  return ref.id
}

/* -------------------------------------------------------------------------- */
/*  Team (users)                                                               */
/* -------------------------------------------------------------------------- */

export function useUsers() {
  const { data, loading, error } = useWorkspaceCollection<User>("users", byName)
  return { users: data, loading, error }
}

/**
 * Team members of ONE specific workspace, independent of the workspace
 * currently selected in the sidebar.
 *
 * WHY THIS EXISTS: `useUsers()` is scoped to the AMBIENT workspace. Since the
 * Prospectos workspace filter (super admin) can show leads from a workspace
 * other than the ambient one, reading assignees from the ambient scope
 * returned members of the wrong workspace — and after filtering by the lead's
 * workspace, none at all. Assignees must come from `lead.workspaceId`.
 *
 * SECURITY: `workspaceId` must always be derived from an already-loaded,
 * already-authorized document (the lead) — never from user input. Firestore
 * Rules still decide: a member querying another workspace is denied, so this
 * cannot widen access. Passing `null` disables the subscription.
 */
export function useUsersForWorkspace(workspaceId: string | null) {
  const { status } = useWorkspace()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(Boolean(workspaceId))
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (status !== "ready" || !workspaceId) {
      setUsers([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    const q = query(collection(db, "users"), where("workspaceId", "==", workspaceId))
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({ ...(d.data() as User), id: d.id }))
        rows.sort(byName)
        setUsers(rows)
        setLoading(false)
      },
      (err) => {
        console.error("[firestore] users(workspace) subscription failed:", err)
        setError(err)
        setLoading(false)
      },
    )
    return () => unsub()
  }, [workspaceId, status])

  return { users, loading, error }
}

/**
 * Lookup map of users by id. Pass a `workspaceId` to read that workspace
 * instead of the ambient one (same reason as `useUsersForWorkspace`).
 */
export function useUsersMap(workspaceId?: string | null): Record<string, User> {
  const ambient = useUsers()
  const scoped = useUsersForWorkspace(workspaceId ?? null)
  const users = workspaceId ? scoped.users : ambient.users
  return useMemo(() => {
    const map: Record<string, User> = {}
    for (const u of users) map[u.id] = u
    return map
  }, [users])
}

export interface NewUserInput {
  workspaceId: string
  name: string
  email: string
  role: User["role"]
}

/**
 * Creates an INVITED team profile. The person links their Firebase Auth
 * account the first time they sign in with this email (see membership.ts).
 * `super_admin` cannot be granted from here (Rules reject it).
 */
export async function createUser(input: NewUserInput) {
  const user: Omit<User, "id"> = {
    workspaceId: input.workspaceId,
    authUid: null,
    name: input.name,
    email: input.email.trim().toLowerCase(),
    role: input.role,
    avatarColor: pick([...PALETTE, "var(--warning)"]),
    status: "invited",
    assignedLeads: 0,
    appointments: 0,
    sales: 0,
  }
  const ref = await addDoc(collection(db, "users"), user)
  return ref.id
}

/** Colors a person can pick for their own avatar. */
export const AVATAR_COLORS: readonly string[] = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--warning)",
]

/**
 * Updates the signed-in person's own team profile.
 * Security Rules only allow `name`, `avatarColor` and `updatedAt` on the
 * document whose `authUid` matches the caller, so this can never be used to
 * edit somebody else or change a role.
 */
export async function updateOwnProfile(
  userId: string,
  patch: { name?: string; avatarColor?: string },
): Promise<void> {
  // `updatedAt` is not part of the User model (it only exists to satisfy the
  // Security Rule that whitelists name/avatarColor/updatedAt), hence DocumentData.
  const data: DocumentData = { updatedAt: serverTimestamp() }
  if (typeof patch.name === "string") data.name = patch.name.trim()
  if (typeof patch.avatarColor === "string") data.avatarColor = patch.avatarColor
  await updateDoc(doc(collection(db, "users"), userId), data)
}

/* -------------------------------------------------------------------------- */
/*  Campaigns                                                                  */
/* -------------------------------------------------------------------------- */

export function useCampaigns() {
  const { data, loading, error } = useWorkspaceCollection<Campaign>("campaigns", byName)
  return { campaigns: data, loading, error }
}

export interface NewCampaignInput {
  workspaceId: string
  name: string
  platform: Campaign["platform"]
  clientId: string
  status?: Campaign["status"]
  /** Clientes (sales) o Candidatos (recruiting). */
  objective?: LeadType
}

export async function createCampaign(input: NewCampaignInput) {
  const objective: LeadType = input.objective ?? "sales"
  const campaign: Omit<Campaign, "id"> = {
    workspaceId: input.workspaceId,
    objective,
    // Phase 1 field, kept in sync for older readers.
    campaignType: objective,
    name: input.name,
    platform: input.platform,
    status: input.status ?? "learning",
    spend: 0,
    leads: 0,
    cpl: 0,
    appointments: 0,
    sales: 0,
    revenue: 0,
    roas: 0,
    clientId: input.clientId,
  }
  const ref = await addDoc(collection(db, "campaigns"), campaign)
  return ref.id
}
