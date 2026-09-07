import type { MemberStatus, User, UserRole } from "@/types"

/**
 * How a person is shown ANYWHERE in the UI. A Firestore document id is an
 * implementation detail: it must never reach the screen as a label, not even
 * as a last resort — an id tells the user nothing and looks like a bug.
 */
export function memberLabel(
  member: Pick<User, "name" | "email"> | null | undefined,
  fallback = "Usuario sin nombre",
): string {
  const name = member?.name?.trim()
  if (name) return name
  const email = member?.email?.trim()
  if (email) return email
  return fallback
}

/**
 * Roles a workspace admin may grant: Distribuidor, Asistente, Telemarketing.
 * `super_admin` is global and never one of them; `viewer` is legacy and no
 * longer offered, though existing viewers keep working.
 */
export const ASSIGNABLE_ROLES: UserRole[] = ["client_admin", "manager", "sales_rep"]

export function isAssignableRole(role: string): role is UserRole {
  return (ASSIGNABLE_ROLES as string[]).includes(role)
}

/**
 * Who may change another member's role or status. Mirrors the Rules: the
 * super admin anywhere, a client_admin or manager inside their own workspace.
 */
export function canManageMember(
  ctx: { role: UserRole | null; workspaceId: string | null; isSuperAdmin: boolean; userId: string | null },
  member: Pick<User, "id" | "workspaceId" | "role">,
): boolean {
  // A super_admin profile is never administered from a workspace screen.
  if (member.role === "super_admin") return false
  if (ctx.isSuperAdmin) return true
  if (ctx.workspaceId !== member.workspaceId) return false
  return ctx.role === "client_admin" || ctx.role === "manager"
}

/** Nobody demotes or deactivates themselves by accident. */
export function isSelf(ctx: { userId: string | null }, member: Pick<User, "id">): boolean {
  return ctx.userId != null && ctx.userId === member.id
}

/**
 * An invited person has not signed in yet, so their status is driven by the
 * invitation flow and must not be flipped by hand.
 */
export function canToggleStatus(member: Pick<User, "status">): boolean {
  return member.status === "active" || member.status === "inactive"
}

export function nextStatus(current: MemberStatus): MemberStatus {
  return current === "active" ? "inactive" : "active"
}

/** Only members of that workspace, and never an inactive one. */
export function assignableMembers<T extends Pick<User, "workspaceId" | "status">>(
  users: T[],
  workspaceId: string | null,
): T[] {
  if (!workspaceId) return []
  return users.filter((u) => u.workspaceId === workspaceId && u.status !== "inactive")
}
