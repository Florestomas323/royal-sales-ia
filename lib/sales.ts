import type { Lead, Sale, User, UserRole } from "@/types"

/**
 * Pure rules for registering a sale. No Firestore here: everything in this
 * file is decidable from values, which is what makes it testable and what the
 * Security Rules mirror server-side.
 */

/** Unassigned is `""` everywhere in this codebase — never null, never absent. */
export const UNASSIGNED = ""

/** Roles that may be credited with closing a sale. A viewer never sells. */
export const SELLER_ROLES: UserRole[] = ["client_admin", "manager", "sales_rep"]

/**
 * Can this person be recorded as the seller?
 *
 * The team profile alone is not enough: a pending invitation has a profile but
 * no membership, and a membership can be revoked without the profile changing.
 * The membership is the authority, so the caller must supply whether one
 * exists and is active — exactly what the Security Rules check server-side.
 */
export function isEligibleSeller(
  seller: Pick<User, "workspaceId" | "role" | "authUid" | "status"> | null | undefined,
  workspaceId: string,
  membership: { workspaceId: string; role: UserRole; status?: string } | null | undefined,
): boolean {
  if (!seller || !workspaceId) return false
  // No authUid means the invitation was never claimed: there is no membership.
  if (!seller.authUid) return false
  if (seller.workspaceId !== workspaceId) return false
  if (!membership) return false
  if (membership.workspaceId !== workspaceId) return false
  if (membership.status === "inactive") return false
  return SELLER_ROLES.includes(membership.role)
}

/** Only a sales lead can become a purchase. A candidate is not a customer. */
export function canRegisterSale(lead: Pick<Lead, "leadType">): boolean {
  return lead.leadType === "sales"
}

/**
 * The link from lead to customer may only be written at the MOMENT of the
 * close: the lead was not won before and is won now. A lead already sitting in
 * `sale` cannot gain the link later — that path would let anyone attach an
 * arbitrary customer to a closed deal.
 */
export function isFirstConversion(
  before: Pick<Lead, "stage" | "leadType" | "customerId">,
): boolean {
  return before.leadType === "sales"
    && before.stage !== "sale"
    && !(before.customerId ?? "")
}

export interface SaleDraft {
  product: string
  amount: string
  soldById: string
  notes: string
}

export interface SaleDraftErrors {
  product?: "required"
  amount?: "required" | "invalid"
  soldById?: "required" | "not_eligible"
}

/** Accepts "1,234.50" and "1234,50": distributors type both. */
export function parseAmount(raw: string): number {
  const cleaned = raw.replace(/[^\d.,-]/g, "")
  const normalized = cleaned.includes(",") && !cleaned.includes(".")
    ? cleaned.replace(",", ".")
    : cleaned.replace(/,/g, "")
  const value = Number(normalized)
  return Number.isFinite(value) ? value : NaN
}

export function validateSaleDraft(
  draft: SaleDraft,
  eligibleSellerIds: string[],
): SaleDraftErrors {
  const errors: SaleDraftErrors = {}
  if (draft.product.trim().length === 0) errors.product = "required"

  if (draft.amount.trim().length === 0) errors.amount = "required"
  else {
    const amount = parseAmount(draft.amount)
    if (!Number.isFinite(amount) || amount <= 0) errors.amount = "invalid"
  }

  if (draft.soldById.trim().length === 0) errors.soldById = "required"
  else if (!eligibleSellerIds.includes(draft.soldById)) errors.soldById = "not_eligible"

  return errors
}

export function hasSaleErrors(errors: SaleDraftErrors): boolean {
  return Object.keys(errors).length > 0
}

/**
 * A rep may only credit themselves. Managers and admins may credit any
 * eligible seller in the workspace — the Rules verify that server-side too.
 */
export function canCreditOthers(role: UserRole | null, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || role === "client_admin" || role === "manager"
}

/** Only a manager or above may move a customer to a different seller. */
export function canReassignCustomer(role: UserRole | null, isSuperAdmin: boolean): boolean {
  return isSuperAdmin || role === "client_admin" || role === "manager"
}

/** Revenue and counts are DERIVED from sales — never stored on the customer. */
export function totalRevenue(sales: Pick<Sale, "amount" | "status">[]): number {
  return sales
    .filter((s) => s.status === "confirmed")
    .reduce((sum, s) => sum + (Number.isFinite(s.amount) ? s.amount : 0), 0)
}

export function confirmedCount(sales: Pick<Sale, "status">[]): number {
  return sales.filter((s) => s.status === "confirmed").length
}

/** Newest first. Sorted in the client so no composite index is needed. */
export function sortSales<T extends Pick<Sale, "soldAt">>(sales: T[]): T[] {
  return [...sales].sort((a, b) => b.soldAt.localeCompare(a.soldAt))
}
