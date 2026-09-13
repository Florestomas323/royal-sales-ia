import { getAdminDb } from "@/lib/firebase/admin"
import { sendEmail } from "@/lib/email/send"
import { NOTIFICATIONS, buildNotification, emailRecipients, newLeadEmail, recipientsFor } from "@/lib/notifications"
import type { Lead, User } from "@/types"

/**
 * THE central trigger for "new lead", server side. Every backend path that
 * creates a lead (website form, future Meta Lead Ads, any integration) calls
 * this once, AFTER the lead really exists, and only for a genuine creation —
 * a deduplicated re-submission never reaches here.
 *
 * In-app notifications are written with the Admin SDK; the email goes out
 * best-effort and never blocks or fails the lead.
 */
export async function notifyNewLeadServer(
  lead: Lead,
  form: string | null,
  opts: { appUrl: string },
): Promise<{ notified: string[]; emailed: string[] }> {
  const db = getAdminDb()
  const [membersSnap, wsSnap] = await Promise.all([
    db.collection("users").where("workspaceId", "==", lead.workspaceId).get(),
    db.collection("workspaces").doc(lead.workspaceId).get(),
  ])
  const members = membersSnap.docs.map((d) => ({ ...(d.data() as Omit<User, "id">), id: d.id }))
  const workspaceName = (wsSnap.data() as { name?: string } | undefined)?.name ?? lead.workspaceId

  const recipients = recipientsFor(lead, members)
  const now = new Date().toISOString()
  const batch = db.batch()
  for (const userId of recipients) {
    batch.set(db.collection(NOTIFICATIONS).doc(), buildNotification(lead, form, userId, now))
  }
  await batch.commit()

  const emailed = await emailNewLeadServer(lead, form, { appUrl: opts.appUrl, members, workspaceName })
  return { notified: recipients, emailed }
}

/**
 * Email half of the trigger, on its own so the in-app path that already
 * wrote its notifications client-side (manual creation) can still send the
 * email from the server, where the provider key lives.
 *
 * IDEMPOTENT: the lead document is stamped with `emailNotifiedAt` BEFORE
 * the send, inside a transaction. A second call for the same lead — a retry,
 * a double click, the manual path and a webhook racing — reads the stamp
 * and sends nothing. If the provider then fails, the stamp is cleared so a
 * later attempt may try again; a failure never reaches the caller.
 */
export async function emailNewLeadServer(
  lead: Lead,
  form: string | null,
  opts: { appUrl: string; members?: User[]; workspaceName?: string },
): Promise<string[]> {
  const db = getAdminDb()
  const leadRef = db.collection("leads").doc(lead.id)

  // Claim the send atomically. Whoever sees the stamp already present backs off.
  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(leadRef)
    if (!snap.exists) return false
    const data = snap.data() as { emailNotifiedAt?: string; workspaceId?: string }
    // Never email about a lead that is not in the workspace we were told.
    if (data.workspaceId !== lead.workspaceId) return false
    if (data.emailNotifiedAt) return false
    tx.update(leadRef, { emailNotifiedAt: new Date().toISOString() })
    return true
  })
  if (!claimed) return []

  try {
    const members = opts.members ?? (await db.collection("users").where("workspaceId", "==", lead.workspaceId).get())
      .docs.map((d) => ({ ...(d.data() as Omit<User, "id">), id: d.id }))
    const workspaceName = opts.workspaceName
      ?? ((await db.collection("workspaces").doc(lead.workspaceId).get()).data() as { name?: string } | undefined)?.name
      ?? lead.workspaceId
    const to = emailRecipients(lead, members)
    if (to.length === 0) return []
    const mail = newLeadEmail(lead, form, workspaceName, opts.appUrl)
    const result = await sendEmail({ to, ...mail })
    if (!result.sent) {
      // Release the claim so a later attempt can retry; the lead is untouched.
      await leadRef.update({ emailNotifiedAt: null })
      console.error("[notifications] email not sent", JSON.stringify({ leadId: lead.id, workspaceId: lead.workspaceId, reason: result.reason }))
      return []
    }
    return to
  } catch (err) {
    await leadRef.update({ emailNotifiedAt: null }).catch(() => {})
    console.error("[notifications] email failed", JSON.stringify({ leadId: lead.id, workspaceId: lead.workspaceId, message: err instanceof Error ? err.message : String(err) }))
    return []
  }
}
