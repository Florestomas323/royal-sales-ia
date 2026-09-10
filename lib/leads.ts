import { PIPELINES, RECRUITING_ONLY_SOURCES, SOURCES_BY_LEAD_TYPE, visibleStage } from "@/lib/constants"
import { t } from "@/lib/i18n"
import type { Attribution, Campaign, Lead, LeadType, MemberStatus, PipelineStage, Platform, UserRole } from "@/types"

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
/**
 * The stage a lead is SHOWN under. Nothing is written: the document keeps the
 * stage it has.
 *
 * A lead stored under a retired stage (`contacted`, `rec_qualified`…) maps to
 * the closest working one, so it stays visible on the board instead of
 * disappearing. Anything else unrecognisable falls back to the initial stage.
 */
export function displayStage(lead: Pick<Lead, "leadType" | "stage">): PipelineStage {
  const type = leadTypeOf(lead)
  if (isStageOf(type, lead.stage)) return lead.stage
  const legacy = visibleStage(lead.stage)
  return isStageOf(type, legacy) ? legacy : PIPELINES[type].initial
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

/* -------------------------------------------------------------------------- */
/*  Kanban (Phase D)                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Groups leads into the columns of ONE pipeline.
 *  - Archived leads are never shown (they keep their stage untouched, so a
 *    restore puts them straight back in the right column).
 *  - Leads of the other type are ignored even if present in the input.
 *  - A lead whose stored stage does not belong to its pipeline lands in the
 *    initial column for display only (nothing is written).
 * `overrides` lets the board show an optimistic stage while a move is saving.
 */
export function groupLeadsByStage(
  leads: Lead[],
  leadType: LeadType,
  overrides: Record<string, PipelineStage> = {},
): Record<PipelineStage, Lead[]> {
  const pipeline = PIPELINES[leadType]
  const map = {} as Record<PipelineStage, Lead[]>
  for (const stage of pipeline.stages) map[stage] = []
  for (const lead of leads) {
    if (lead.archived === true) continue
    if (leadTypeOf(lead) !== leadType) continue
    const optimistic = overrides[lead.id]
    const stage = optimistic && isStageOf(leadType, optimistic) ? optimistic : displayStage(lead)
    if (map[stage]) map[stage].push(lead)
  }
  return map
}

/**
 * Whether a move should be attempted at all. Combines the edit permission
 * (mirror of Rules) with pipeline coherence (also enforced by Rules).
 */
export function canMoveLeadTo(
  ctx: LeadEditorContext,
  lead: Pick<Lead, "workspaceId" | "assignedToId" | "leadType" | "stage" | "archived">,
  stage: PipelineStage,
): boolean {
  if (lead.archived === true) return false
  if (!canEditLead(ctx, lead)) return false
  if (!isStageOf(leadTypeOf(lead), stage)) return false
  return lead.stage !== stage
}

/* -------------------------------------------------------------------------- */
/*  Closed revenue (Phase F)                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Revenue only exists for SALES. `rec_hired` is a hire: it records `closedAt`
 * so we know when it happened, but never a `closedValue`.
 */
export function isRevenueStage(leadType: LeadType, stage: PipelineStage): boolean {
  return leadType === "sales" && stage === PIPELINES.sales.won
}

/** Moving here must ask the person to confirm the real amount. */
export function requiresClosedValue(
  lead: Pick<Lead, "leadType" | "stage">,
  nextStage: PipelineStage,
): boolean {
  return isRevenueStage(leadTypeOf(lead), nextStage) && lead.stage !== nextStage
}

export interface ClosedFields {
  closedValue?: number | null
  closedAt?: string | null
}

/**
 * Fields to write when a lead changes stage.
 *   → sale        : { closedValue: <confirmed>, closedAt: now }
 *   → rec_hired   : { closedAt: now }            (no revenue)
 *   leaving won   : { closedValue: null, closedAt: null }  — a deal later lost
 *                   must stop counting as closed.
 *   anything else : {}
 */
export function closedFieldsFor(
  lead: Pick<Lead, "leadType" | "stage" | "closedValue" | "closedAt">,
  nextStage: PipelineStage,
  confirmedValue?: number,
): ClosedFields {
  const type = leadTypeOf(lead)
  const wonStage = PIPELINES[type].won
  const enteringWon = nextStage === wonStage && lead.stage !== wonStage
  const leavingWon = lead.stage === wonStage && nextStage !== wonStage

  if (enteringWon) {
    const now = new Date().toISOString()
    return isRevenueStage(type, nextStage)
      ? { closedValue: confirmedValue, closedAt: now }
      : { closedAt: now }
  }
  if (leavingWon) {
    // Clear both, even for recruiting, so nothing lingers as "closed".
    return { closedValue: null, closedAt: null }
  }
  return {}
}

/** A confirmed amount must be a real, positive number. */
export function isValidClosedValue(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

/** Won sales that predate Phase F have no amount: never counted as revenue. */
export function hasClosedAmount(lead: Pick<Lead, "closedValue">): boolean {
  return isValidClosedValue(lead.closedValue)
}

/* -------------------------------------------------------------------------- */
/*  Money displayed on a lead (Phase F correction)                             */
/* -------------------------------------------------------------------------- */

export interface LeadAmount {
  /** Amount to render, or null when there is nothing honest to show. */
  amount: number | null
  /** True when it is a CONFIRMED closed amount, not a potential value. */
  closed: boolean
  /** Won sale with no confirmed amount (predates Phase F). */
  legacyWonWithoutAmount: boolean
}

/**
 * The single rule for showing money on a lead, used by every surface.
 *
 *   sale + closedValue > 0  → the confirmed amount (never `potentialValue`)
 *   sale without amount     → nothing: a legacy sale must not be dressed up
 *                             with its potential value
 *   any other stage         → `potentialValue`, clearly a potential figure
 *
 * `rec_hired` is a hire, not revenue, so it never shows an amount as closed.
 */
export function leadAmount(
  lead: Pick<Lead, "leadType" | "stage" | "potentialValue" | "closedValue">,
): LeadAmount {
  const type = leadTypeOf(lead)
  const isWonSale = type === "sales" && lead.stage === PIPELINES.sales.won
  if (!isWonSale) {
    return { amount: lead.potentialValue ?? 0, closed: false, legacyWonWithoutAmount: false }
  }
  if (hasClosedAmount(lead)) {
    return { amount: lead.closedValue as number, closed: true, legacyWonWithoutAmount: false }
  }
  return { amount: null, closed: false, legacyWonWithoutAmount: true }
}

/**
 * Money total for a pipeline column.
 *  - Won sales column → sum of CONFIRMED amounts only.
 *  - Any other column → sum of potential values.
 * A legacy won sale contributes 0 and is reported through `missingAmounts`.
 */
export function columnAmount(
  leads: Pick<Lead, "leadType" | "stage" | "potentialValue" | "closedValue">[],
): { total: number; closed: boolean; missingAmounts: number } {
  let total = 0
  let missing = 0
  let closed = false
  for (const lead of leads) {
    const value = leadAmount(lead)
    if (value.legacyWonWithoutAmount) {
      missing += 1
      continue
    }
    if (value.closed) closed = true
    total += value.amount ?? 0
  }
  return { total, closed, missingAmounts: missing }
}

/* -------------------------------------------------------------------------- */
/*  Attribution display (corrección de producción)                             */
/* -------------------------------------------------------------------------- */

/**
 * Sources that can carry real ad attribution. `manual`, `referral` and the
 * like are entered by a person: they never come from an ad platform.
 */
const AD_PLATFORMS: readonly Platform[] = [
  "meta",
  "facebook",
  "instagram",
  "tiktok",
  "google",
  "youtube",
  "indeed",
] as const

/**
 * Real, platform-side identifiers. A stored `attribution.platform` is NOT one
 * of these: it is a duplicate of `source` written at creation time, so it can
 * be stale or plainly wrong on old documents and must never be trusted on its
 * own.
 */
export function hasExternalIds(
  attribution: Partial<Attribution> | undefined,
): boolean {
  if (!attribution) return false
  return Boolean(
    attribution.externalCampaignId ||
      attribution.externalAdSetId ||
      attribution.externalAdId ||
      attribution.externalCreativeId ||
      attribution.externalFormId ||
      attribution.externalPageId ||
      attribution.metaLeadId ||
      attribution.clickId,
  )
}

/** Marketing context the person typed or that came with a real campaign. */
export function hasMarketingContext(
  lead: Pick<Lead, "campaignId"> & { attribution?: Partial<Attribution> },
): boolean {
  const a = lead.attribution
  return Boolean(
    lead.campaignId ||
      a?.utmSource ||
      a?.utmMedium ||
      a?.utmCampaign ||
      a?.utmContent ||
      a?.utmTerm ||
      a?.landingPage ||
      a?.referrer,
  )
}

export interface AttributionView {
  /** Ad platform to display, or null when there is no real attribution. */
  platform: Platform | null
  /** True when the lead has no attribution worth showing. */
  empty: boolean
  campaign: string | null
  adSet: string | null
  ad: string | null
  creative: string | null
}

/** Placeholders written by older versions of `createLead`. Never displayed. */
const PLACEHOLDERS = new Set(["—", "-", "", "Entrada manual"])

function realValue(value: string | undefined): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 && !PLACEHOLDERS.has(trimmed) ? trimmed : null
}

/**
 * What the Atribución tab should show.
 *
 * SOURCE OF TRUTH: `lead.source` (the real origin) plus the presence of real
 * external identifiers — never the stored `attribution.platform`, which is a
 * redundant copy. A lead with `source: "manual"` and a stale
 * `attribution.platform: "indeed"` and no external ids resolves to EMPTY.
 *
 * No platform is ever inferred: if the source is not an ad platform, the
 * answer is "sin atribución", full stop.
 */
export function attributionView(
  lead: Pick<Lead, "source" | "campaignId" | "campaignName"> & { attribution?: Partial<Attribution> },
): AttributionView {
  const a = lead.attribution
  const external = hasExternalIds(a)
  const fromAdPlatform = AD_PLATFORMS.includes(lead.source)
  // A platform is shown only when the lead really came from an ad platform.
  // External ids alone do not invent one: they still need an ad source.
  const platform = fromAdPlatform ? lead.source : null
  const campaign = realValue(a?.campaign) ?? realValue(lead.campaignName)
  const adSet = realValue(a?.adSet)
  const ad = realValue(a?.ad)
  const creative = realValue(a?.creative)

  const empty =
    platform === null && !external && !hasMarketingContext(lead) && campaign === null

  return { platform, empty, campaign, adSet, ad, creative }
}

/**
 * Sending a lead to the trash (and bringing it back) is an admin decision:
 * Distribuidor, Asistente or the super admin, inside the lead's workspace.
 * Telemarketing may edit its own leads but never remove them from the funnel.
 */
export function canDeleteLead(
  editor: { role: UserRole | null; workspaceId: string | null; isSuperAdmin: boolean },
  lead: Pick<Lead, "workspaceId">,
): boolean {
  if (editor.isSuperAdmin) return true
  if (editor.workspaceId !== lead.workspaceId) return false
  return editor.role === "client_admin" || editor.role === "manager"
}
