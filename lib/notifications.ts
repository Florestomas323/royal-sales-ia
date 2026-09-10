import { PLATFORM_LABELS } from "@/lib/constants"
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
  const kind = lead.leadType === "recruiting" ? "Nuevo candidato" : "Nuevo prospecto"
  const subject = `${kind} en Royal Sales IA — ${lead.name}`
  const origin = formLabel(form, lead.source)
  const when = new Date(lead.createdAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" })
  // Deep link: the app opens Prospectos with this lead's sheet. No token in
  // the URL — the person signs in as usual and the Rules decide what they see.
  const link = `${appUrl.replace(/\/$/, "")}/leads?lead=${encodeURIComponent(lead.id)}`
  const rows: [string, string][] = [
    ["Nombre", lead.name],
    ["Teléfono", lead.phone || "—"],
    ["Origen", origin],
    ["Workspace", workspaceName],
    ["Fecha", when],
  ]
  const text = [subject, "", ...rows.map(([k, v]) => `${k}: ${v}`), "", `Ver prospecto: ${link}`].join("\n")
  const esc = (v: string) => v.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] ?? c)
  const html = `<!doctype html><html lang="es"><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;padding:24px">
<h2 style="margin:0 0 16px">${esc(kind)}</h2>
<table style="border-collapse:collapse">${rows.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#666">${esc(k)}</td><td style="padding:4px 0"><strong>${esc(v)}</strong></td></tr>`).join("")}</table>
<p style="margin:24px 0"><a href="${esc(link)}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;display:inline-block">Ver prospecto</a></p>
<p style="color:#888;font-size:12px">Royal Sales IA</p></body></html>`
  return { subject, text, html }
}

/** Members eligible to receive the email: same rule as in-app, plus an address. */
export function emailRecipients(
  lead: Pick<Lead, "workspaceId" | "assignedToId">,
  members: Pick<User, "id" | "workspaceId" | "role" | "status" | "email">[],
): string[] {
  const ids = new Set(recipientsFor(lead, members))
  return [...new Set(members.filter((m) => ids.has(m.id) && m.email).map((m) => m.email.trim().toLowerCase()))]
}

export type { MemberStatus, UserRole }
