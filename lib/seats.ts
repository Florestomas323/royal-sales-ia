import type { MemberStatus, UserRole } from "@/types"

/**
 * Seat limits per workspace: 2 Distribuidores, 2 Asistentes, 2 Telemarketing.
 * The super admin is global and never occupies a seat.
 *
 * Firestore Rules cannot COUNT documents, so a limit cannot be enforced by
 * looking at `users`. Instead the workspace carries a ledger of who holds each
 * seat, written in the same transaction as the profile change and validated
 * server-side against `size() <= 2`. A pending invitation holds a seat: the
 * chair is reserved the moment the invitation exists.
 */
export const SEAT_LIMIT = 2

export const SEAT_ROLES = ["client_admin", "manager", "sales_rep"] as const
export type SeatRole = (typeof SEAT_ROLES)[number]

export type Seats = Record<SeatRole, string[]>

export function isSeatRole(role: UserRole): role is SeatRole {
  return (SEAT_ROLES as readonly string[]).includes(role)
}

export const EMPTY_SEATS: Seats = { client_admin: [], manager: [], sales_rep: [] }

/** Invited or active members hold a seat; inactive ones do not. */
export function holdsSeat(status: MemberStatus): boolean {
  return status === "active" || status === "invited"
}

/**
 * Rebuild the ledger from the team profiles. Used once per legacy workspace
 * (they predate the ledger) and by the super admin's "recalcular" tool.
 */
export function seatsFromMembers(
  members: { id: string; role: UserRole; status: MemberStatus }[],
): Seats {
  const seats: Seats = { client_admin: [], manager: [], sales_rep: [] }
  for (const m of members) {
    if (isSeatRole(m.role) && holdsSeat(m.status)) seats[m.role].push(m.id)
  }
  return seats
}

/** Normalises whatever is stored: missing arrays, duplicates, nulls. */
export function normalizeSeats(raw: Partial<Record<string, unknown>> | null | undefined): Seats {
  const out: Seats = { client_admin: [], manager: [], sales_rep: [] }
  for (const role of SEAT_ROLES) {
    const v = raw?.[role]
    if (Array.isArray(v)) out[role] = [...new Set(v.filter((x): x is string => typeof x === "string" && x.length > 0))]
  }
  return out
}

export function seatCount(seats: Seats, role: SeatRole): number {
  return seats[role].length
}

export function hasFreeSeat(seats: Seats, role: SeatRole, forUserId?: string): boolean {
  // Someone already holding the seat is not asking for a new one.
  if (forUserId && seats[role].includes(forUserId)) return true
  return seats[role].length < SEAT_LIMIT
}

export function withSeat(seats: Seats, role: SeatRole, userId: string): Seats {
  if (seats[role].includes(userId)) return seats
  return { ...seats, [role]: [...seats[role], userId] }
}

export function withoutSeat(seats: Seats, userId: string): Seats {
  const out: Seats = { client_admin: [], manager: [], sales_rep: [] }
  for (const role of SEAT_ROLES) out[role] = seats[role].filter((id) => id !== userId)
  return out
}

/**
 * The ledger change a single operation makes, declared explicitly so the
 * Rules can verify it: CEL cannot diff two lists, but it CAN check that the
 * declared user really ends up (or stops being) a holder of that role.
 */
export interface SeatOp {
  kind: "add" | "remove"
  role: SeatRole
  userId: string
}

/** Text for the UI: "1 de 2". */
export function seatUsage(seats: Seats, role: SeatRole): { used: number; limit: number } {
  return { used: seats[role].length, limit: SEAT_LIMIT }
}

export function totalSeatsUsed(seats: Seats): number {
  return SEAT_ROLES.reduce((n, r) => n + seats[r].length, 0)
}
