import { getAuth } from "firebase-admin/auth"
import { getAdminApp, getAdminDb, isAdminNotConfigured } from "./admin"
import type { Membership, UserRole } from "@/types"

/**
 * SERVER-ONLY authentication for Route Handlers.
 *
 * Clients send their Firebase ID token as `Authorization: Bearer <idToken>`.
 * We verify it with Firebase Admin and load `memberships/{uid}` — the same
 * document Security Rules use — so API routes enforce exactly the same tenancy
 * model as the rest of the app.
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

  let uid: string
  let email: string | null
  try {
    const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken)
    uid = decoded.uid
    email = decoded.email ?? null
  } catch (err) {
    if (isAdminNotConfigured(err)) {
      console.error("[server-auth]", err.message)
      return { ok: false, status: 503, error: "server_not_configured" }
    }
    return { ok: false, status: 401, error: "invalid_token" }
  }

  const snap = await getAdminDb().collection("memberships").doc(uid).get()
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
