"use client"

/**
 * Client-side helper for the invitation-only login flow.
 *
 * This is a UX gate, not the security boundary: the real guarantee is that a
 * Firebase Auth account by itself grants no access. Reading any workspace data
 * requires `memberships/{uid}`, which Security Rules only allow to be created
 * by matching an unclaimed invitation with a verified email.
 */
export type InvitationCheck =
  | { status: "invited" }
  | { status: "not_invited" }
  | { status: "unavailable" }

export async function checkInvitation(email: string): Promise<InvitationCheck> {
  try {
    const res = await fetch("/api/auth/invitation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    })
    if (!res.ok) return { status: "unavailable" }
    const body = (await res.json()) as { invited?: boolean }
    return body.invited === true ? { status: "invited" } : { status: "not_invited" }
  } catch {
    return { status: "unavailable" }
  }
}
