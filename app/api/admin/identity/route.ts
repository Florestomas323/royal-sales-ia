import { NextResponse } from "next/server"
import { getAdminDb, isAdminNotConfigured } from "@/lib/firebase/admin"
import { authenticateRequest } from "@/lib/firebase/server-auth"
import {
  ERROR_STATUS,
  inspectIdentity,
  logMutation,
  newOperationId,
  type MutationErrorCode,
} from "@/lib/server/mutation-errors"
import type { Membership, UserRole } from "@/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Diagnose — and, on explicit request, repair — a member whose three identity
 * documents disagree.
 *
 * `memberships/{authUid}`, `users/{userId}` and the workspace seat ledger are
 * read by every authorisation path. When they drift apart, a perfectly valid
 * Asistente is refused with nothing to go on. GET reports which of the three
 * disagrees; POST fixes it, and only in one direction.
 *
 * THE MEMBERSHIP IS THE AUTHORITY. Repair aligns the profile and the seat to
 * it, and never the other way round, because the membership is what grants
 * access: deriving it from the profile would let a stale profile escalate
 * somebody. Nothing here grants a role that was not already on the
 * membership, and seat limits are respected — an over-limit workspace is
 * reported, not forced.
 */
const SEAT_ROLES: UserRole[] = ["client_admin", "manager", "sales_rep"]
const SEAT_LIMIT = 2

interface Body {
  /** Firebase Auth uid of the member to inspect or repair. */
  authUid?: string
  /** Must be exactly true to write anything. */
  repair?: boolean
}

async function resolveTarget(
  db: ReturnType<typeof getAdminDb>,
  authUid: string,
): Promise<Membership | null> {
  const snap = await db.collection("memberships").doc(authUid).get()
  if (!snap.exists) return null
  return { ...(snap.data() as Omit<Membership, "authUid">), authUid }
}

export async function POST(request: Request) {
  const operationId = newOperationId("identity")

  const auth = await authenticateRequest(request)
  if (!auth.ok) return fail("unauthenticated", operationId)
  const { membership: caller, uid } = auth.user

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return fail("invalid_body", operationId)
  }
  const targetUid = typeof body.authUid === "string" ? body.authUid.trim() : ""
  if (!targetUid) return fail("invalid_body", operationId)
  const repair = body.repair === true

  const log = (code: MutationErrorCode | "ok", detail?: string) =>
    logMutation("api/admin/identity", {
      operationId,
      uid,
      userId: caller.userId,
      role: caller.role,
      workspaceId: caller.workspaceId,
      // The SUBJECT is logged as an id only; no name, email or phone.
      resourceId: targetUid,
      code,
      detail,
    })

  try {
    const db = getAdminDb()
    const target = await resolveTarget(db, targetUid)
    if (!target) {
      log("membership_missing")
      return fail("membership_missing", operationId)
    }

    // Who may look at, and fix, this person: the super admin anywhere, or an
    // admin of the SAME workspace. Never across workspaces.
    const isSuper = caller.role === "super_admin"
    const sameWorkspace = caller.workspaceId === target.workspaceId
    const callerIsAdmin = caller.role === "client_admin" || caller.role === "manager"
    if (!isSuper && !(sameWorkspace && callerIsAdmin)) {
      log(sameWorkspace ? "insufficient_role" : "wrong_workspace")
      return fail(sameWorkspace ? "insufficient_role" : "wrong_workspace", operationId)
    }
    // Repairing a super admin is out of scope for a workspace admin.
    if (target.role === "super_admin" && !isSuper) {
      log("insufficient_role", "target_super_admin")
      return fail("insufficient_role", operationId)
    }

    const before = await inspectIdentity(db, targetUid, target)
    if (!repair || before.coherent) {
      log("ok", before.coherent ? "coherent" : `diagnose:${before.problems.join(",")}`)
      return NextResponse.json({
        success: true,
        operationId,
        repaired: false,
        coherent: before.coherent,
        problems: before.problems,
      })
    }

    // ---- Repair, in one transaction, membership as the authority.
    const applied: string[] = []
    const workspaceId = target.workspaceId
    const status = target.status ?? "active"

    await db.runTransaction(async (tx) => {
      const userRef = db.collection("users").doc(target.userId)
      const wsRef = workspaceId ? db.collection("workspaces").doc(workspaceId) : null
      const userSnap = await tx.get(userRef)
      const wsSnap = wsRef ? await tx.get(wsRef) : null

      if (userSnap.exists) {
        const p = userSnap.data() as { role?: UserRole; status?: string; workspaceId?: string }
        const patch: FirebaseFirestore.UpdateData<Record<string, unknown>> = {}
        if (p.role !== target.role) { patch.role = target.role; applied.push("profile_role") }
        if ((p.status ?? "active") !== status) { patch.status = status; applied.push("profile_status") }
        if (workspaceId && p.workspaceId !== workspaceId) {
          patch.workspaceId = workspaceId
          applied.push("profile_workspace")
        }
        if (Object.keys(patch).length > 0) {
          patch.updatedAt = new Date().toISOString()
          tx.update(userRef, patch)
        }
      }

      // ---- Seat ledger: hold exactly the seat of your own role, and only
      // when active. Never exceed the limit — an over-limit workspace is
      // reported instead of being forced.
      if (wsRef && wsSnap?.exists && SEAT_ROLES.includes(target.role)) {
        const seats = ((wsSnap.data() as { seats?: Record<string, string[]> }).seats ?? {
          client_admin: [], manager: [], sales_rep: [],
        }) as Record<string, string[]>
        const next: Record<string, string[]> = {}
        for (const r of SEAT_ROLES) next[r] = (seats[r] ?? []).filter((id) => id !== target.userId)
        let changed = SEAT_ROLES.some((r) => (seats[r] ?? []).length !== next[r].length)

        if (status === "active") {
          if (next[target.role].length >= SEAT_LIMIT) {
            applied.push("seat_limit_reached")
          } else {
            next[target.role] = [...next[target.role], target.userId]
            changed = true
            applied.push("seat_restored")
          }
        } else if (changed) {
          applied.push("seat_released")
        }

        if (changed) {
          tx.update(wsRef, {
            seats: next,
            // The ledger rule expects the change to be declared.
            seatOps: [{ kind: status === "active" ? "add" : "remove", role: target.role, userId: target.userId }],
            updatedAt: new Date().toISOString(),
          })
        }
      }
    })

    const after = await inspectIdentity(db, targetUid, target)
    log("ok", `repair:${applied.join(",") || "none"}`)
    return NextResponse.json({
      success: true,
      operationId,
      repaired: applied.length > 0,
      applied,
      before: before.problems,
      after: after.problems,
      coherent: after.coherent,
    })
  } catch (err) {
    if (isAdminNotConfigured(err)) return fail("server_not_configured", operationId)
    log("internal", err instanceof Error ? err.name : "unknown")
    return fail("internal", operationId)
  }
}

function fail(code: MutationErrorCode, operationId: string) {
  return NextResponse.json({ error: code, operationId }, { status: ERROR_STATUS[code] })
}
