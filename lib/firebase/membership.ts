import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore"
import type { User as AuthUser } from "firebase/auth"
import { db } from "./client"
import { TenancyError } from "./errors"
import type { Membership, User, Workspace } from "@/types"

/**
 * Identity model
 * --------------
 *  Firebase Auth account  (uid, email, emailVerified)
 *        │
 *        ▼ 1:1  memberships/{uid}   ← read by Security Rules on EVERY request
 *        │        { authUid, workspaceId, role, userId, email }
 *        │
 *        ▼ 1:1  users/{userId}      ← team profile shown in the UI
 *                 { workspaceId, authUid, name, email, role, status, ... }
 *
 * Why two documents?
 *  - Rules can only `get()` a document by a known path, and the only thing
 *    they know is `request.auth.uid`. Hence a doc keyed by uid.
 *  - Team profiles are created by an admin BEFORE the person has an account
 *    (status "invited"), so they cannot be keyed by uid. Leads reference
 *    `users.id` via `assignedToId`; keeping that id stable avoids rewriting
 *    references when the invitation is claimed.
 *
 * Claiming an invitation
 *  When a signed-in user has no membership, we look for a `users` profile with
 *  the same email and `authUid == null`. If found (and the email is verified),
 *  the client writes `memberships/{uid}` + sets `users.authUid` in one batch.
 *  Security Rules validate every field of that batch against the invitation,
 *  so a tampered client cannot grant itself a different role or workspace.
 */

export interface ResolvedIdentity {
  membership: Membership
  profile: User | null
  workspace: Workspace | null
}

export type ResolveOutcome =
  | { status: "ready"; identity: ResolvedIdentity }
  | { status: "no_membership" }
  | { status: "unverified_email"; invitationId: string }

const membershipsCol = collection(db, "memberships")
const usersCol = collection(db, "users")
const workspacesCol = collection(db, "workspaces")

export async function getMembership(uid: string): Promise<Membership | null> {
  const snap = await getDoc(doc(membershipsCol, uid))
  if (!snap.exists()) return null
  return { ...(snap.data() as Omit<Membership, "authUid">), authUid: snap.id }
}

export async function getProfile(userId: string): Promise<User | null> {
  const snap = await getDoc(doc(usersCol, userId))
  if (!snap.exists()) return null
  return { ...(snap.data() as Omit<User, "id">), id: snap.id }
}

export async function getWorkspace(workspaceId: string): Promise<Workspace | null> {
  const snap = await getDoc(doc(workspacesCol, workspaceId))
  if (!snap.exists()) return null
  return { ...(snap.data() as Omit<Workspace, "id">), id: snap.id }
}

/** Finds an unclaimed team profile for this email (invitation). */
export async function findInvitation(email: string): Promise<User | null> {
  const snap = await getDocs(
    query(
      usersCol,
      where("email", "==", email.toLowerCase()),
      where("authUid", "==", null),
      limit(1),
    ),
  )
  if (snap.empty) return null
  const d = snap.docs[0]
  return { ...(d.data() as Omit<User, "id">), id: d.id }
}

/**
 * Atomically links the signed-in account to an invited profile.
 * Every value written here is re-validated by Security Rules.
 */
export async function claimInvitation(authUser: AuthUser, invitation: User): Promise<Membership> {
  if (!authUser.email) throw new TenancyError("missing_profile", "La cuenta no tiene correo.")
  if (!authUser.emailVerified) {
    throw new TenancyError("unverified_email", "El correo no está verificado.")
  }
  if (invitation.role === "super_admin") {
    // Super admins are never created through the self-service claim flow.
    throw new TenancyError("invalid_role", "Un super admin no puede reclamarse desde la app.")
  }

  const membership: Omit<Membership, "authUid"> = {
    workspaceId: invitation.workspaceId,
    role: invitation.role,
    userId: invitation.id,
    email: authUser.email.toLowerCase(),
    createdAt: new Date().toISOString(),
  }

  const batch = writeBatch(db)
  batch.set(doc(membershipsCol, authUser.uid), membership)
  batch.update(doc(usersCol, invitation.id), {
    authUid: authUser.uid,
    status: "active",
    updatedAt: serverTimestamp(),
  })
  await batch.commit()

  return { ...membership, authUid: authUser.uid }
}

/**
 * Full resolution used by WorkspaceProvider after login.
 */
export async function resolveIdentity(authUser: AuthUser): Promise<ResolveOutcome> {
  let membership = await getMembership(authUser.uid)

  if (!membership) {
    const invitation = authUser.email ? await findInvitation(authUser.email) : null
    if (!invitation) return { status: "no_membership" }
    if (!authUser.emailVerified) return { status: "unverified_email", invitationId: invitation.id }
    membership = await claimInvitation(authUser, invitation)
  }

  const [profile, workspace] = await Promise.all([
    getProfile(membership.userId),
    membership.workspaceId ? getWorkspace(membership.workspaceId) : Promise.resolve(null),
  ])

  if (membership.role !== "super_admin" && !membership.workspaceId) {
    throw new TenancyError("missing_workspace", "La membresía no tiene workspace.")
  }

  return { status: "ready", identity: { membership, profile, workspace } }
}
