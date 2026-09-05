import { PIPELINES, RECRUITING_ONLY_SOURCES, SOURCES_BY_LEAD_TYPE } from "@/lib/constants"
import { t } from "@/lib/i18n"
import type { Campaign, Lead, LeadType, MemberStatus, PipelineStage, Platform, UserRole } from "@/types"

/**
 * Pure helpers shared by UI and data layers. No Firestore access here.
 */

/**
 * Legacy documents (created before Phase 2) may have no `leadType`.
 * Decision: they are treated as SALES — every existing record in the product
 * was a commercial prospect, and there is no field to infer otherwise.
 * The value is only written to Firestore by the explicit normalization tool.
 */
export function leadTypeOf(lead: Pick<Lead, "leadType">): LeadType {
  return lead.leadType === "recruiting" ? "recruiting" : "sales"
}

/** Campaign objective with fallback to the Phase 1 field and then to sales. */
export function campaignObjective(c: Pick<Campaign, "objective" | "campaignType">): LeadType {
  if (c.objective === "recruiting" || c.objective === "sales") return c.objective
  return c.campaignType === "recruiting" ? "recruiting" : "sales"
}

export function isStageOf(type: LeadType, stage: string): stage is PipelineStage {
  return (PIPELINES[type].stages as string[]).includes(stage)
}

/**
 * Stage to DISPLAY a lead in for its pipeline. If the stored stage belongs to
 * the other pipeline (e.g. a lead re-typed to recruiting that still has a
 * sales stage), it is shown in the initial column. Nothing is written.
 */
export function displayStage(lead: Pick<Lead, "leadType" | "stage">): PipelineStage {
  const type = leadTypeOf(lead)
  return isStageOf(type, lead.stage) ? lead.stage : PIPELINES[type].initial
}

export function isWon(lead: Pick<Lead, "leadType" | "stage">): boolean {
  return lead.stage === PIPELINES[leadTypeOf(lead)].won
}

export function isLost(lead: Pick<Lead, "leadType" | "stage">): boolean {
  return lead.stage === PIPELINES[leadTypeOf(lead)].lost
}

export function isOpen(lead: Pick<Lead, "leadType" | "stage">): boolean {
  return !isWon(lead) && !isLost(lead)
}

/** Sources a form may offer for the given type (Indeed only for recruiting). */
export function sourcesFor(type: LeadType): Platform[] {
  return SOURCES_BY_LEAD_TYPE[type]
}

export function isRecruitingOnlySource(source: Platform): boolean {
  return RECRUITING_ONLY_SOURCES.includes(source)
}

/** Keeps a phone in a form WhatsApp can use later: digits with optional leading "+". */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  const digits = trimmed.replace(/[^\d]/g, "")
  return trimmed.startsWith("+") ? `+${digits}` : digits
}

/* -------------------------------------------------------------------------- */
/*  Contact links (tel: / WhatsApp)                                            */
/* -------------------------------------------------------------------------- */

/**
 * Default country code applied ONLY when a number has exactly 10 digits and
 * no "+" prefix. Royal Sales IA operates in the US; a 10-digit number written
 * without country code is a US number by every reasonable reading. Numbers
 * with "+" or with 11+ digits are used exactly as stored — never guessed.
 */
export const DEFAULT_COUNTRY_CODE = "1"

/** Digits only, with the country code resolved as described above; null if unusable. */
export function phoneDigitsForDialing(raw: string | null | undefined): string | null {
  if (!raw) return null
  const trimmed = raw.trim()
  const digits = trimmed.replace(/[^\d]/g, "")
  if (digits.length < 7) return null
  if (trimmed.startsWith("+")) return digits
  if (digits.length === 10) return `${DEFAULT_COUNTRY_CODE}${digits}`
  return digits
}

/** `tel:` link the phone can open, or null when there is no dialable number. */
export function telHref(raw: string | null | undefined): string | null {
  const digits = phoneDigitsForDialing(raw)
  return digits ? `tel:+${digits}` : null
}

/**
 * First WhatsApp message, different for a customer and for a candidate.
 * `ownerName` is the real assigned rep when there is one; otherwise a natural
 * variant without a name is used — a name is never invented.
 */
export function whatsappOpener(
  lead: Pick<Lead, "leadType" | "name">,
  ownerName?: string | null,
): string {
  const firstName = lead.name.trim().split(/\s+/)[0] || lead.name.trim()
  const owner = ownerName?.trim() ? ownerName.trim().split(/\s+/)[0] : null
  return leadTypeOf(lead) === "recruiting"
    ? t.leads.detail.whatsappRecruiting(firstName, owner)
    : t.leads.detail.whatsappSales(firstName, owner)
}

/** `https://wa.me/<digits>` link (WhatsApp requires country code, no "+"), or null. */
export function whatsappHref(raw: string | null | undefined, text?: string): string | null {
  const digits = phoneDigitsForDialing(raw)
  if (!digits) return null
  const query = text ? `?text=${encodeURIComponent(text)}` : ""
  return `https://wa.me/${digits}${query}`
}

/* -------------------------------------------------------------------------- */
/*  Phone storage: E.164 going forward, legacy-compatible reading              */
/* -------------------------------------------------------------------------- */

/**
 * How phones are stored (inspected before Phase C):
 *   - `createLead` used `normalizePhone`: digits, keeping "+" only if typed.
 *     So production holds a mix of "+12145550198" and "2145550198".
 *   - `phoneDigitsForDialing` already handles both (10 bare digits → US).
 *
 * Phase C rule: every phone SAVED from now on (create or edit) is E.164
 * ("+<country><number>"), chosen through an explicit country selector — the
 * country is never guessed silently. Existing bare numbers keep working
 * through the legacy fallback and get normalised the first time they are
 * edited. No data migration is executed.
 */
export interface PhoneCountry {
  /** Dial code without "+". */
  code: string
  iso: string
  label: string
}

export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { code: "1", iso: "US", label: "Estados Unidos / Canadá (+1)" },
  { code: "52", iso: "MX", label: "México (+52)" },
  { code: "57", iso: "CO", label: "Colombia (+57)" },
  { code: "58", iso: "VE", label: "Venezuela (+58)" },
  { code: "51", iso: "PE", label: "Perú (+51)" },
  { code: "593", iso: "EC", label: "Ecuador (+593)" },
  { code: "503", iso: "SV", label: "El Salvador (+503)" },
  { code: "502", iso: "GT", label: "Guatemala (+502)" },
  { code: "504", iso: "HN", label: "Honduras (+504)" },
  { code: "505", iso: "NI", label: "Nicaragua (+505)" },
  { code: "506", iso: "CR", label: "Costa Rica (+506)" },
  { code: "507", iso: "PA", label: "Panamá (+507)" },
  { code: "1809", iso: "DO", label: "Rep. Dominicana (+1 809)" },
  { code: "34", iso: "ES", label: "España (+34)" },
] as const

/** Longest-prefix match so "+1809…" resolves to DO before US. */
const COUNTRY_CODES_BY_LENGTH = [...PHONE_COUNTRIES].sort((a, b) => b.code.length - a.code.length)

export interface SplitPhone {
  /** Dial code without "+", or the default when the stored value has none. */
  countryCode: string
  /** National number, digits only. */
  national: string
  /** True when the stored value had no "+" and the country was assumed (legacy). */
  assumed: boolean
}

/**
 * Splits a stored phone into country + national number for editing.
 * Legacy bare numbers: 10 digits → assumed US; 11 digits starting with 1 → US.
 * Anything else without "+" is left with the default code and flagged so the
 * form can show the person exactly what will be saved.
 */
export function splitPhone(raw: string | null | undefined): SplitPhone {
  const trimmed = (raw ?? "").trim()
  const digits = trimmed.replace(/[^\d]/g, "")
  if (!digits) return { countryCode: DEFAULT_COUNTRY_CODE, national: "", assumed: false }

  if (trimmed.startsWith("+")) {
    const match = COUNTRY_CODES_BY_LENGTH.find((c) => digits.startsWith(c.code))
    if (match) return { countryCode: match.code, national: digits.slice(match.code.length), assumed: false }
    return { countryCode: DEFAULT_COUNTRY_CODE, national: digits, assumed: true }
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return { countryCode: "1", national: digits.slice(1), assumed: true }
  }
  return { countryCode: DEFAULT_COUNTRY_CODE, national: digits, assumed: true }
}

/** Builds the E.164 value to store, or "" when there is no number. */
export function toE164(countryCode: string, national: string): string {
  const cc = countryCode.replace(/[^\d]/g, "")
  const n = national.replace(/[^\d]/g, "")
  if (!n) return ""
  return `+${cc}${n}`
}

/** E.164 sanity check: "+" followed by 8–15 digits. */
export function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value)
}

/* -------------------------------------------------------------------------- */
/*  Edit permissions (mirror of firestore.rules — the Rules are the authority) */
/* -------------------------------------------------------------------------- */

export interface LeadEditorContext {
  role: UserRole | null
  /** users.id of the caller's team profile. */
  userId: string | null
  /** Caller's own workspace (null for super_admin). */
  workspaceId: string | null
  isSuperAdmin: boolean
}

/**
 * Who may edit a lead. Mirrors `match /leads … allow update`:
 *   super_admin → any; client_admin / manager → their workspace;
 *   sales_rep   → only leads assigned to them; viewer → never.
 */
export function canEditLead(ctx: LeadEditorContext, lead: Pick<Lead, "workspaceId" | "assignedToId">): boolean {
  if (ctx.isSuperAdmin) return true
  if (ctx.workspaceId !== lead.workspaceId) return false
  if (ctx.role === "client_admin" || ctx.role === "manager") return true
  if (ctx.role === "sales_rep") return Boolean(ctx.userId) && lead.assignedToId === ctx.userId
  return false
}

/**
 * Who can be the owner of a lead.
 *
 * ROOT CAUSE of the empty picker: it filtered `status === "active"`, but
 * `createUser` writes `status: "invited"` and the profile only turns "active"
 * when the person signs in and claims the invitation. A workspace whose team
 * has been invited but has not signed in yet therefore had zero options.
 *
 * An invited profile is a perfectly valid assignee: `users/{id}` already
 * exists, its id is stable, and leads reference that id (never `authUid`).
 * Only `inactive` members are excluded.
 *
 * Assignees are always restricted to the LEAD's workspace, never the viewer's.
 */
export function eligibleAssignees<T extends { workspaceId: string; status: MemberStatus }>(
  users: T[],
  leadWorkspaceId: string,
): T[] {
  return users.filter((u) => u.workspaceId === leadWorkspaceId && u.status !== "inactive")
}

/** Reassigning is an admin action: Rules force `unchanged('assignedToId')` for reps. */
export function canReassignLead(ctx: LeadEditorContext, lead: Pick<Lead, "workspaceId">): boolean {
  if (ctx.isSuperAdmin) return true
  if (ctx.workspaceId !== lead.workspaceId) return false
  return ctx.role === "client_admin" || ctx.role === "manager"
}
