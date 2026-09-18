import type { Firestore } from "firebase-admin/firestore"
import type { Membership, UserRole } from "@/types"

/**
 * Specific failure codes for authorised server mutations.
 *
 * Collapsing everything into `permission-denied` is what made the campaign
 * and scheduling failures impossible to diagnose from the UI: a lead in the
 * wrong workspace, a campaign that does not exist, an inactive membership and
 * a missing address all looked identical. Each of these maps to its own
 * actionable message.
 */
export type MutationErrorCode =
  | "unauthenticated"
  | "invalid_token"
  | "membership_inactive"
  | "membership_missing"
  | "identity_inconsistent"
  | "wrong_workspace"
  | "insufficient_role"
  | "lead_not_found"
  | "lead_archived"
  | "campaign_not_found"
  | "campaign_wrong_workspace"
  | "campaign_type_mismatch"
  | "address_required"
  | "invalid_body"
  | "server_not_configured"
  | "internal"

export const ERROR_STATUS: Record<MutationErrorCode, number> = {
  unauthenticated: 401,
  invalid_token: 401,
  membership_inactive: 403,
  membership_missing: 403,
  // 409, not 403: the person's permissions may be fine; their documents
  // disagree with each other. Telling them "no tienes permiso" would be a lie.
  identity_inconsistent: 409,
  wrong_workspace: 403,
  insufficient_role: 403,
  lead_not_found: 404,
  lead_archived: 409,
  campaign_not_found: 404,
  campaign_wrong_workspace: 403,
  campaign_type_mismatch: 422,
  address_required: 422,
  invalid_body: 400,
  server_not_configured: 503,
  internal: 500,
}

/**
 * Preserves what `authenticateRequest` actually reported.
 *
 * Collapsing all of these into `unauthenticated` told somebody to sign in
 * again when the real problem was a deactivated membership or a server
 * without credentials — two things signing in again cannot fix.
 */
export function authErrorCode(error: string | undefined): MutationErrorCode {
  switch (error) {
    case "server_not_configured":
      return "server_not_configured"
    case "no_membership":
      return "membership_missing"
    case "membership_inactive":
      return "membership_inactive"
    case "invalid_token":
      return "invalid_token"
    default:
      return "unauthenticated"
  }
}

/** A short id for correlating a user report with the server logs. */
export function newOperationId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

/**
 * Structured server log. Ids and roles only: never a name, phone, email or
 * address, so the log can be read and shared without exposing anybody.
 */
export function logMutation(
  route: string,
  fields: {
    operationId: string
    uid: string
    userId?: string
    role?: UserRole
    workspaceId?: string | null
    resourceId?: string
    code?: MutationErrorCode | "ok"
    detail?: string
  },
): void {
  const line = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")
  const failed = fields.code && fields.code !== "ok"
  const message = `[${route}] ${line}`
  if (failed) console.error(message)
  else console.info(message)
}

/* -------------------------------------------------------------------------- */
/*  Identity coherence                                                         */
/* -------------------------------------------------------------------------- */

export interface IdentityReport {
  coherent: boolean
  /** Machine-readable reasons; no personal data. */
  problems: string[]
  membershipRole: UserRole
  membershipStatus: string
  profileRole?: UserRole
  profileStatus?: string
  profileWorkspaceId?: string
  seatHeld: boolean
  seatExpected: boolean
}

const SEAT_ROLES: UserRole[] = ["client_admin", "manager", "sales_rep"]

/**
 * Compares `memberships/{authUid}`, `users/{userId}` and the workspace seat
 * ledger, which are the three documents every authorisation path reads.
 *
 * This is the diagnosis that was previously only possible by hand: when a
 * mutation is refused, the route can say WHICH of the three disagrees instead
 * of reporting a bare permission error. Read-only.
 */
export async function inspectIdentity(
  db: Firestore,
  uid: string,
  membership: Membership,
): Promise<IdentityReport> {
  const problems: string[] = []
  const membershipStatus = membership.status ?? "active"

  const report: IdentityReport = {
    coherent: true,
    problems,
    membershipRole: membership.role,
    membershipStatus,
    seatHeld: false,
    seatExpected: SEAT_ROLES.includes(membership.role),
  }

  if (membershipStatus !== "active") problems.push("membership_not_active")

  const profileSnap = membership.userId
    ? await db.collection("users").doc(membership.userId).get()
    : null
  if (!profileSnap?.exists) {
    // A super admin legitimately has no team profile; anyone else must.
    if (membership.role !== "super_admin") problems.push("profile_missing")
  } else {
    const p = profileSnap.data() as {
      role?: UserRole
      status?: string
      workspaceId?: string
      authUid?: string | null
    }
    report.profileRole = p.role
    report.profileStatus = p.status
    report.profileWorkspaceId = p.workspaceId
    if (membership.role !== "super_admin") {
      if (p.workspaceId !== membership.workspaceId) problems.push("profile_workspace_mismatch")
      if (p.role !== membership.role) problems.push("profile_role_mismatch")
      if ((p.status ?? "active") !== membershipStatus) problems.push("profile_status_mismatch")
    }
    if (p.authUid && p.authUid !== uid) problems.push("profile_bound_to_other_auth")
  }

  if (membership.workspaceId && report.seatExpected) {
    const wsSnap = await db.collection("workspaces").doc(membership.workspaceId).get()
    const seats = (wsSnap.data() as { seats?: Record<string, string[]> } | undefined)?.seats
    if (!seats) problems.push("seat_ledger_missing")
    else {
      report.seatHeld = (seats[membership.role] ?? []).includes(membership.userId)
      const elsewhere = SEAT_ROLES.filter(
        (r) => r !== membership.role && (seats[r] ?? []).includes(membership.userId),
      )
      if (membershipStatus === "active" && !report.seatHeld) problems.push("seat_missing")
      if (elsewhere.length > 0) problems.push("seat_in_other_role")
    }
  }

  report.coherent = problems.length === 0
  return report
}
