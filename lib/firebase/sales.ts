"use client"

import { useEffect, useState } from "react"
import {
  collection,
  doc,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  where,
} from "firebase/firestore"
import { db } from "./client"
import { sortSales } from "@/lib/sales"
import type { Customer, Sale } from "@/types"

const customersCol = collection(db, "customers")
const salesCol = collection(db, "sales")

export interface RegisterSaleInput {
  /** Generated ONCE by the dialog and reused on every retry. */
  operationKey: string
  workspaceId: string
  leadId: string
  product: string
  amount: number
  soldById: string
  soldAt: string
  notes?: string
  /** users.id of the caller. */
  createdBy: string
  /** Used only when the lead has no customer yet. */
  customerDraft: {
    name: string
    phone?: string
    email?: string
    assignedToId: string
  }
}

export interface RegisterSaleResult {
  saleId: string
  customerId: string
  /** True when the sale already existed: a retry, not a second purchase. */
  alreadyExisted: boolean
}

/**
 * First conversion: customer, sale and the lead's close move together.
 *
 * A transaction rather than a batch because the outcome DEPENDS on reads: is
 * this lead already converted, does the sale already exist. A batch cannot ask.
 *
 * Idempotency is structural, not a UI nicety. `operationKey` is the sale's
 * document id, generated once when the dialog opens, so a double tap, a retry
 * after a dropped connection, or an impatient user all land on the same
 * document. The transaction reads it first and returns early if it is there.
 */
export async function registerSaleForLead(input: RegisterSaleInput): Promise<RegisterSaleResult> {
  const saleRef = doc(salesCol, input.operationKey)
  const leadRef = doc(collection(db, "leads"), input.leadId)

  return runTransaction(db, async (tx) => {
    const existingSale = await tx.get(saleRef)
    if (existingSale.exists()) {
      // Same operation, already committed. Nothing to write.
      return {
        saleId: saleRef.id,
        customerId: (existingSale.data() as Sale).customerId,
        alreadyExisted: true,
      }
    }

    const leadSnap = await tx.get(leadRef)
    if (!leadSnap.exists()) throw new Error("lead_not_found")
    const lead = leadSnap.data() as { leadType?: string; stage: string; customerId?: string; workspaceId: string }

    // A candidate is not a purchase. Checked here AND in the Rules.
    if ((lead.leadType ?? "sales") !== "sales") throw new Error("lead_not_sales")
    if (lead.workspaceId !== input.workspaceId) throw new Error("workspace_mismatch")

    const linked = lead.customerId ?? ""
    // A lead already closed cannot be linked afterwards: the Rules refuse it,
    // so failing here gives a clear error instead of a permission denial.
    if (!linked && lead.stage === "sale") throw new Error("already_closed_without_customer")

    const now = new Date().toISOString()
    let customerId = linked

    if (!customerId) {
      const customerRef = doc(customersCol)
      customerId = customerRef.id
      const customer: Omit<Customer, "id"> = {
        workspaceId: input.workspaceId,
        name: input.customerDraft.name,
        ...(input.customerDraft.phone ? { phone: input.customerDraft.phone } : {}),
        ...(input.customerDraft.email ? { email: input.customerDraft.email } : {}),
        assignedToId: input.customerDraft.assignedToId,
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
      }
      tx.set(customerRef, customer)
    }

    const sale: Omit<Sale, "id"> = {
      workspaceId: input.workspaceId,
      customerId,
      sourceLeadId: input.leadId,
      product: input.product,
      amount: input.amount,
      soldAt: input.soldAt,
      soldById: input.soldById,
      ...(input.notes ? { notes: input.notes } : {}),
      status: "confirmed",
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    }
    tx.set(saleRef, sale)

    // The close and the link, in the same transaction as the sale. The amount
    // is the sale's amount, so the two can never disagree.
    tx.update(leadRef, {
      stage: "sale",
      closedValue: input.amount,
      closedAt: input.soldAt,
      customerId,
    })

    return { saleId: saleRef.id, customerId, alreadyExisted: false }
  })
}

/** K1 allows editing notes only; everything financial or attributive is frozen. */
export async function updateSaleNotes(saleId: string, notes: string): Promise<void> {
  await updateDoc(doc(salesCol, saleId), {
    notes: notes.trim(),
    updatedAt: new Date().toISOString(),
  })
}

export async function updateCustomer(
  customerId: string,
  patch: Partial<Pick<Customer, "name" | "phone" | "email" | "assignedToId">>,
): Promise<void> {
  await updateDoc(doc(customersCol, customerId), {
    ...patch,
    updatedAt: new Date().toISOString(),
  })
}

/**
 * Sales of ONE customer. Two equality filters, sorted in the client: no
 * composite index, and the query is bounded exactly as the Rules require —
 * Rules are not filters, so an unbounded query would be denied outright.
 */
export function useCustomerSales(customer: Pick<Customer, "id" | "workspaceId"> | null) {
  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!customer) {
      setSales([])
      setLoading(false)
      return
    }
    setLoading(true)
    const q = query(
      salesCol,
      where("workspaceId", "==", customer.workspaceId),
      where("customerId", "==", customer.id),
    )
    return onSnapshot(
      q,
      (snap) => {
        setSales(sortSales(snap.docs.map((d) => ({ ...(d.data() as Omit<Sale, "id">), id: d.id }))))
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err)
        setLoading(false)
      },
    )
  }, [customer?.id, customer?.workspaceId])

  return { sales, loading, error }
}

/**
 * Customers of a workspace. A rep must narrow to their own, or Firestore
 * denies the whole query — the Rules only permit that shape for them.
 */
export function useCustomers(workspaceId: string | null, onlyAssignedTo: string | null) {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    if (!workspaceId) {
      setCustomers([])
      setLoading(false)
      return
    }
    setLoading(true)
    const filters = [where("workspaceId", "==", workspaceId)]
    if (onlyAssignedTo !== null) filters.push(where("assignedToId", "==", onlyAssignedTo))
    return onSnapshot(
      query(customersCol, ...filters),
      (snap) => {
        const rows = snap.docs.map((d) => ({ ...(d.data() as Omit<Customer, "id">), id: d.id }))
        rows.sort((a, b) => a.name.localeCompare(b.name))
        setCustomers(rows)
        setLoading(false)
        setError(null)
      },
      (err) => {
        setError(err)
        setLoading(false)
      },
    )
  }, [workspaceId, onlyAssignedTo])

  return { customers, loading, error }
}
