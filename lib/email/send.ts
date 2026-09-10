/**
 * Outbound email, server-only.
 *
 * There is NO email provider in this project yet. This module is written for
 * Resend's HTTP API (plain `fetch`, no dependency) and turns itself off when
 * the credentials are absent: it logs once and returns `{ sent: false }`.
 * Nothing else in the app waits on it — a lead is created whether or not the
 * email goes out.
 *
 * Required environment variables (server only, never NEXT_PUBLIC_):
 *   RESEND_API_KEY   — API key from resend.com
 *   EMAIL_FROM       — verified sender, e.g. "Royal Sales IA <avisos@royalsalesia.com>"
 */
export interface OutboundEmail {
  to: string[]
  subject: string
  text: string
  html: string
}

export interface SendResult {
  sent: boolean
  reason?: "not_configured" | "no_recipients" | "provider_error"
  id?: string
}

export function emailIsConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM)
}

export async function sendEmail(mail: OutboundEmail): Promise<SendResult> {
  if (mail.to.length === 0) return { sent: false, reason: "no_recipients" }
  if (!emailIsConfigured()) {
    console.warn("[email] not configured: set RESEND_API_KEY and EMAIL_FROM to enable notifications by email")
    return { sent: false, reason: "not_configured" }
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: mail.to, subject: mail.subject, text: mail.text, html: mail.html }),
    })
    if (!res.ok) {
      console.error("[email] provider error", res.status, await res.text().catch(() => ""))
      return { sent: false, reason: "provider_error" }
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string }
    return { sent: true, id: body.id }
  } catch (err) {
    console.error("[email] send failed", err)
    return { sent: false, reason: "provider_error" }
  }
}
