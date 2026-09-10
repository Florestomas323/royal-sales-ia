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
 */
export async function emailNewLeadServer(
  lead: Lead,
  form: string | null,
  opts: { appUrl: string; members?: User[]; workspaceName?: string },
): Promise<string[]> {
  const db = getAdminDb()
  const members = opts.members ?? (await db.collection("users").where("workspaceId", "==", lead.workspaceId).get())
    .docs.map((d) => ({ ...(d.data() as Omit<User, "id">), id: d.id }))
  const workspaceName = opts.workspaceName
    ?? ((await db.collection("workspaces").doc(lead.workspaceId).get()).data() as { name?: string } | undefined)?.name
    ?? lead.workspaceId
  const to = emailRecipients(lead, members)
  const mail = newLeadEmail(lead, form, workspaceName, opts.appUrl)
  const result = await sendEmail({ to, ...mail })
  return result.sent ? to : []
}
