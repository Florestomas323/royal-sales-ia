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
} from "firebase/firestore"
import { db } from "./client"
import { seedLeadsIfEmpty } from "./seed"
import type { Lead, PipelineStage } from "@/types"

const leadsCol = collection(db, "leads")

/** Subscribe to the live leads collection, newest first. */
export function subscribeLeads(
  onData: (leads: Lead[]) => void,
  onError?: (err: Error) => void,
) {
  const q = query(leadsCol, orderBy("createdAt", "desc"))
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
  name: string
  phone?: string
  email?: string
  campaignId?: string
  campaignName?: string
  source?: Lead["source"]
  assignedToId?: string
  clientId?: string
  potentialValue?: number
}

/** Create a new lead with sensible defaults for the fields the UI omits. */
export async function createLead(input: NewLeadInput) {
  const now = new Date().toISOString()
  const source: Lead["source"] = input.source ?? "referral"
  const lead: Omit<Lead, "id"> = {
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
 * Hook that seeds (if needed) and subscribes to the live leads collection.
 * Used by both the Leads table and the Pipeline board.
 */
export function useLeads() {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let unsub: (() => void) | undefined
    let active = true

    seedLeadsIfEmpty()
      .catch(() => {
        // Seeding failure is non-fatal; the subscription can still run.
      })
      .finally(() => {
        if (!active) return
        unsub = subscribeLeads(
          (rows) => {
            setLeads(rows)
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
  }, [])

  return { leads, loading, error }
}
