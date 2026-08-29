"use client"

import { useEffect, useMemo, useState } from "react"
import {
  addDoc,
  collection,
  getDocs,
  limit,
  onSnapshot,
  query,
  writeBatch,
  doc,
} from "firebase/firestore"
import { db } from "./client"
import { clients as demoClients } from "@/lib/mock-data/clients"
import { users as demoUsers } from "@/lib/mock-data/workspace"
import { campaigns as demoCampaigns } from "@/lib/mock-data/campaigns"
import type { Campaign, Client, User } from "@/types"

/* -------------------------------------------------------------------------- */
/*  Generic idempotent seeder                                                  */
/* -------------------------------------------------------------------------- */

const seedGuards: Record<string, Promise<void> | null> = {}

/**
 * Seeds a collection with a demo dataset the first time it runs against an
 * empty collection, preserving the original document ids so cross-references
 * (leads → clientId / assignedToId / campaignId) keep resolving.
 *
 * Idempotent: if any doc already exists it does nothing. Per-collection
 * in-memory guards prevent duplicate work within a session.
 */
export function seedCollectionIfEmpty<T extends { id: string }>(
  name: string,
  rows: T[],
): Promise<void> {
  if (seedGuards[name]) return seedGuards[name] as Promise<void>

  const run = (async () => {
    const col = collection(db, name)
    const existing = await getDocs(query(col, limit(1)))
    if (!existing.empty) return

    const batch = writeBatch(db)
    for (const row of rows) {
      batch.set(doc(col, row.id), row)
    }
    await batch.commit()
  })()

  seedGuards[name] = run
  run.catch(() => {
    seedGuards[name] = null // allow retry on failure
  })
  return run
}

/* -------------------------------------------------------------------------- */
/*  Generic realtime hook                                                      */
/* -------------------------------------------------------------------------- */

function useCollection<T extends { id: string }>(
  name: string,
  seedRows: T[],
  sortBy: (a: T, b: T) => number,
) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let unsub: (() => void) | undefined
    let active = true

    seedCollectionIfEmpty(name, seedRows)
      .catch(() => {
        // Seeding failure is non-fatal; the subscription can still run.
      })
      .finally(() => {
        if (!active) return
        unsub = onSnapshot(
          collection(db, name),
          (snap) => {
            const rows = snap.docs.map((d) => ({ ...(d.data() as T), id: d.id }))
            rows.sort(sortBy)
            setData(rows)
            setLoading(false)
          },
          (err) => {
            setError(err)
            setLoading(false)
          },
        )
      })

    return () => {
      active = false
      unsub?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name])

  return { data, loading, error }
}

/* -------------------------------------------------------------------------- */
/*  Clients                                                                    */
/* -------------------------------------------------------------------------- */

const byName = (a: { name: string }, b: { name: string }) =>
  a.name.localeCompare(b.name)

export function useClients() {
  const { data, loading, error } = useCollection<Client>(
    "clients",
    demoClients,
    byName,
  )
  return { clients: data, loading, error }
}

export interface NewClientInput {
  name: string
  industry: string
  status?: Client["status"]
}

export async function createClient(input: NewClientInput) {
  const palette = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
  ]
  const client: Omit<Client, "id"> = {
    name: input.name,
    industry: input.industry || "—",
    logoColor: palette[Math.floor(Math.random() * palette.length)],
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
  const { data, loading, error } = useCollection<User>(
    "users",
    demoUsers,
    byName,
  )
  return { users: data, loading, error }
}

/**
 * A lookup map of users by id, merged over the demo defaults so rep names
 * always resolve immediately (even before the live snapshot arrives).
 */
export function useUsersMap(): Record<string, User> {
  const { users } = useUsers()
  return useMemo(() => {
    const map: Record<string, User> = {}
    for (const u of demoUsers) map[u.id] = u
    for (const u of users) map[u.id] = u
    return map
  }, [users])
}

export interface NewUserInput {
  name: string
  email: string
  role: User["role"]
}

export async function createUser(input: NewUserInput) {
  const palette = [
    "var(--chart-1)",
    "var(--chart-2)",
    "var(--chart-3)",
    "var(--chart-4)",
    "var(--chart-5)",
    "var(--warning)",
  ]
  const user: Omit<User, "id"> = {
    name: input.name,
    email: input.email,
    role: input.role,
    avatarColor: palette[Math.floor(Math.random() * palette.length)],
    status: "invited",
    assignedLeads: 0,
    appointments: 0,
    sales: 0,
  }
  const ref = await addDoc(collection(db, "users"), user)
  return ref.id
}

/* -------------------------------------------------------------------------- */
/*  Campaigns                                                                  */
/* -------------------------------------------------------------------------- */

export function useCampaigns() {
  const { data, loading, error } = useCollection<Campaign>(
    "campaigns",
    demoCampaigns,
    byName,
  )
  return { campaigns: data, loading, error }
}

export interface NewCampaignInput {
  name: string
  platform: Campaign["platform"]
  clientId: string
  status?: Campaign["status"]
}

export async function createCampaign(input: NewCampaignInput) {
  const campaign: Omit<Campaign, "id"> = {
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
