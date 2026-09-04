import { getAdminDb, getAdminProjectId, isAdminNotConfigured } from "./admin"
import { verifyFirebaseIdToken } from "./verify-id-token"
import type { Membership, UserRole } from "@/types"

/**
 * SERVER-ONLY authentication for Route Handlers.
 *
 * Clients send their Firebase ID token as `Authorization: Bearer <idToken>`.
 * The token is verified against Google's public certs (see verify-id-token.ts —
 * deliberately NOT `firebase-admin/auth`, which cannot load on Vercel) and we
 * then load `memberships/{uid}` with the Admin SDK — the same document
 * Security Rules use — so API routes enforce exactly the same tenancy model as
 * the rest of the app.
 */

export interface ServerUser {
  uid: string
  email: string | null
  membership: Membership
}

export type AuthFailure = { ok: false; status: 401 | 403 | 503; error: string }
export type AuthResult = { ok: true; user: ServerUser } | AuthFailure

const ADMIN_ROLES: UserRole[] = ["super_admin", "client_admin", "manager"]

export async function authenticateRequest(request: Request): Promise<AuthResult> {
  const header = request.headers.get("authorization") ?? ""
  const [scheme, idToken] = header.split(" ", 2)
  if (scheme !== "Bearer" || !idToken) return { ok: false, status: 401, error: "missing_token" }

  let projectId: string
  try {
    projectId = getAdminProjectId()
  } catch (err) {
    if (isAdminNotConfigured(err)) {
      console.error("[server-auth]", err.message)
      return { ok: false, status: 503, error: "server_not_configured" }
    }
    return { ok: false, status: 503, error: "server_not_configured" }
  }

  const verified = await verifyFirebaseIdToken(idToken, projectId)
  if (!verified.ok) {
    // Reason only in logs; the client just gets "invalid_token".
    console.warn(`[server-auth] id token rejected: ${verified.reason}`)
    return { ok: false, status: 401, error: "invalid_token" }
  }
  const { uid, email } = verified.token

  let snap
  try {
    snap = await getAdminDb().collection("memberships").doc(uid).get()
  } catch (err) {
    if (isAdminNotConfigured(err)) {
      console.error("[server-auth]", err.message)
      return { ok: false, status: 503, error: "server_not_configured" }
    }
    throw err
  }
  if (!snap.exists) return { ok: false, status: 403, error: "no_membership" }
  const membership = { ...(snap.data() as Omit<Membership, "authUid">), authUid: uid }
  return { ok: true, user: { uid, email, membership } }
}

/**
 * Checks that the caller may act on `workspaceId`.
 *  - super_admin: any workspace
 *  - members: only their own workspace; `write` additionally requires an admin role
 */
export function canAccessWorkspace(user: ServerUser, workspaceId: string, write: boolean): boolean {
  const { role, workspaceId: own } = user.membership
  if (role === "super_admin") return true
  if (own !== workspaceId) return false
  return write ? ADMIN_ROLES.includes(role) : true
}
