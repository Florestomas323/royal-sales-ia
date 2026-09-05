import { PIPELINES, RECRUITING_ONLY_SOURCES, SOURCES_BY_LEAD_TYPE } from "@/lib/constants"
import { t } from "@/lib/i18n"
import type { Campaign, Lead, LeadType, PipelineStage, Platform } from "@/types"

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
