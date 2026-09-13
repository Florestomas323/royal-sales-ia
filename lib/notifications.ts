import { PLATFORM_LABELS } from "@/lib/constants"
import { whatsappHref, whatsappOpener } from "@/lib/leads"
import type { AppNotification, Lead, MemberStatus, User, UserRole } from "@/types"

/**
 * Pure logic for "new lead" notifications. No I/O: the client batch, the
 * Admin SDK route and the tests all call the same functions, so who gets
 * notified and what it says is decided in exactly one place.
 */

export const NOTIFICATIONS = "notifications"

/** Human name of the form/origin, for the message and the email. */
export const FORM_LABELS: Record<string, string> = {
  "experiencia-agua": "Experiencia del Agua",
  "agendar-demostracion": "Agendar demostración",
  "trabaja-conmigo": "Trabaja conmigo",
}

export function formLabel(form: string | null | undefined, source: Lead["source"]): string {
  if (form) return FORM_LABELS[form] ?? form
  return PLATFORM_LABELS[source] ?? source
}

/**
 * Who hears about a new lead: the admins of ITS workspace (Distribuidor,
 * Asistente) and, when it arrived already assigned, the assignee. Inactive or
 * pending members are skipped, and nobody from another workspace is ever on
 * the list — the filter is by the lead's workspace, not the caller's.
 */
export function recipientsFor(
  lead: Pick<Lead, "workspaceId" | "assignedToId">,
  members: Pick<User, "id" | "workspaceId" | "role" | "status">[],
): string[] {
  const ids = new Set<string>()
  for (const m of members) {
    if (m.workspaceId !== lead.workspaceId) continue
    if (m.status !== "active") continue
    const admin = m.role === "client_admin" || m.role === "manager"
    const assignee = Boolean(lead.assignedToId) && m.id === lead.assignedToId
    if (admin || assignee) ids.add(m.id)
  }
  return [...ids]
}

export function titleFor(leadType: Lead["leadType"]): string {
  return leadType === "recruiting" ? "Nuevo candidato" : "Nuevo prospecto"
}

export function messageFor(lead: Pick<Lead, "name" | "source">, form: string | null | undefined): string {
  return `${lead.name} · ${formLabel(form, lead.source)}`
}

/** The document written for one recipient. `id` is assigned by the writer. */
export function buildNotification(
  lead: Pick<Lead, "id" | "workspaceId" | "leadType" | "name" | "source">,
  form: string | null | undefined,
  userId: string,
  now: string,
): Omit<AppNotification, "id"> {
  return {
    workspaceId: lead.workspaceId,
    userId,
    type: "new_lead",
    leadId: lead.id,
    leadType: lead.leadType,
    title: titleFor(lead.leadType),
    message: messageFor(lead, form),
    source: lead.source,
    form: form ?? null,
    read: false,
    readAt: null,
    createdAt: now,
  }
}

export function unreadCount(items: Pick<AppNotification, "read">[]): number {
  return items.filter((n) => !n.read).length
}

/** Newest first; sorted in the client so no composite index is needed. */
export function sortNotifications<T extends Pick<AppNotification, "createdAt">>(items: T[]): T[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

/* ------------------------------------------------------------------ email */

export interface NewLeadEmail {
  subject: string
  text: string
  html: string
}

export function newLeadEmail(
  lead: Pick<Lead, "id" | "name" | "phone" | "leadType" | "source" | "createdAt">,
  form: string | null | undefined,
  workspaceName: string,
  appUrl: string,
): NewLeadEmail {
  const isRecruiting = lead.leadType === "recruiting"
  const kind = isRecruiting ? "Nuevo candidato" : "Nuevo prospecto"
  const typeLabel = isRecruiting ? "Reclutamiento" : "Ventas"
  const subject = `${kind} en Royal Sales IA — ${lead.name}`
  const origin = formLabel(form, lead.source)
  const when = new Date(lead.createdAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })

  // Deep link into the app. No token, no personal data in the URL: the person
  // still signs in and the Rules decide whether they may see this lead.
  const link = `${appUrl.replace(/\/$/, "")}/leads?lead=${encodeURIComponent(lead.id)}`

  // The SAME opener the app uses on the lead's WhatsApp button, so the first
  // message a distributor sends from the email matches what they would send
  // from Prospectos. No owner is named: the email goes to several people.
  const whatsapp = whatsappHref(lead.phone, whatsappOpener(lead, null))

  const rows: [string, string][] = [
    ["Nombre", lead.name],
    ["Teléfono", lead.phone || "—"],
    ["Origen", origin],
    ["Tipo", typeLabel],
    ["Workspace", workspaceName],
    ["Fecha", when],
  ]
  const text = [
    subject, "",
    ...rows.map(([k, v]) => `${k}: ${v}`), "",
    `Ver prospecto: ${link}`,
    ...(whatsapp ? [`Contactar por WhatsApp: ${whatsapp}`] : []),
  ].join("\n")

  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c)
  const row = ([k, v]: [string, string]) =>
    `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-size:14px;white-space:nowrap;vertical-align:top">${esc(k)}</td>` +
    `<td style="padding:6px 0;font-size:14px;color:#111827;font-weight:600">${esc(v)}</td></tr>`
  const button = (href: string, label: string, bg: string, color: string) =>
    `<a href="${esc(href)}" style="display:inline-block;padding:12px 20px;border-radius:8px;background:${bg};color:${color};` +
    `font-size:15px;font-weight:600;text-decoration:none;text-align:center">${esc(label)}</a>`

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f4f6;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
  <tr><td style="background:#2563eb;padding:20px 24px">
    <p style="margin:0;color:#ffffff;font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.9">Royal Sales IA</p>
    <h1 style="margin:6px 0 0;color:#ffffff;font-size:22px;font-weight:700">${esc(kind)}</h1>
  </td></tr>
  <tr><td style="padding:24px">
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%">${rows.map(row).join("")}</table>
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;margin-top:24px">
      <tr><td style="padding-bottom:10px">${button(link, "Ver prospecto", "#2563eb", "#ffffff")}</td></tr>
      ${whatsapp ? `<tr><td>${button(whatsapp, "Contactar por WhatsApp", "#25d366", "#ffffff")}</td></tr>` : ""}
    </table>
    <p style="margin:24px 0 0;color:#6b7280;font-size:12px;line-height:1.5">
      Recibes este correo porque eres Distribuidor o Asistente de ${esc(workspaceName)}.
      Puedes desactivarlo en Configuración → Perfil.
    </p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`

  return { subject, text, html }
}

/** Members eligible to receive the email: same rule as in-app, plus an address. */
/**
 * Who gets the email: the ADMINS of the lead's workspace (Distribuidor,
 * Asistente) — never Telemarketing, never another workspace — minus anyone
 * who switched the preference off. An absent preference counts as on.
 */
export function emailRecipients(
  lead: Pick<Lead, "workspaceId">,
  members: Pick<User, "id" | "workspaceId" | "role" | "status" | "email" | "emailNewLeadNotifications">[],
): string[] {
  const emails = members
    .filter((m) => m.workspaceId === lead.workspaceId)
    .filter((m) => m.status === "active")
    .filter((m) => m.role === "client_admin" || m.role === "manager")
    .filter((m) => m.emailNewLeadNotifications !== false)
    .map((m) => (m.email ?? "").trim().toLowerCase())
    .filter(Boolean)
  return [...new Set(emails)]
}

export type { MemberStatus, UserRole }
