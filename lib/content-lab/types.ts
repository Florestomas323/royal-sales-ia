import type { LeadType } from "@/types"

/**
 * Laboratorio de Contenido — shared types.
 *
 * A brief is what the person typed. A campaign context is an AGGREGATED,
 * server-built summary (numbers + engine findings). Neither ever carries lead
 * PII, Meta tokens or credentials — see prompt.ts, which is the only place
 * that decides what reaches the model.
 */

export type ContentObjective = LeadType // "sales" | "recruiting"

export type SalesIntent = "product" | "demo" | "promotion" | "education" | "remarketing" | "lead_gen"
export type RecruitingIntent =
  | "opportunity" | "extra_income" | "full_time" | "entrepreneurship" | "testimonial" | "candidate_gen"
export type ContentIntent = SalesIntent | RecruitingIntent

export type ContentTone = "professional" | "close" | "direct" | "educational" | "aspirational"
export type ContentChannel = "facebook" | "instagram" | "tiktok" | "whatsapp" | "general"
export type ContentFormat = "image" | "reel" | "story" | "carousel" | "post" | "ad_copy"

export const SALES_INTENTS: SalesIntent[] = ["product", "demo", "promotion", "education", "remarketing", "lead_gen"]
export const RECRUITING_INTENTS: RecruitingIntent[] = [
  "opportunity", "extra_income", "full_time", "entrepreneurship", "testimonial", "candidate_gen",
]
export const TONES: ContentTone[] = ["professional", "close", "direct", "educational", "aspirational"]
export const CHANNELS: ContentChannel[] = ["facebook", "instagram", "tiktok", "whatsapp", "general"]
export const FORMATS: ContentFormat[] = ["image", "reel", "story", "carousel", "post", "ad_copy"]
/** Formats that require a script and a shot list. */
export const VIDEO_FORMATS: ContentFormat[] = ["reel", "story"]

export function intentsFor(objective: ContentObjective): ContentIntent[] {
  return objective === "sales" ? [...SALES_INTENTS] : [...RECRUITING_INTENTS]
}

export function isVideoFormat(format: ContentFormat): boolean {
  return VIDEO_FORMATS.includes(format)
}

export interface CreativeBrief {
  objective: ContentObjective
  intent: ContentIntent
  /** Product, service or opportunity, in the person's own words. */
  subject: string
  offer?: string
  audience?: string
  market?: string
  notes?: string
  tone: ContentTone
  channel: ContentChannel
  format: ContentFormat
}

/** Aggregated Media Buyer context. Any metric may be null = "Sin datos". */
export interface CampaignContext {
  campaignName: string
  objective: LeadType
  metrics: {
    spend: number | null
    impressions: number | null
    reach: number | null
    frequency: number | null
    ctr: number | null
    cpc: number | null
    cpm: number | null
    metaLeads: number | null
    crmLeads: number | null
    cplCrm: number | null
    sales: number | null
    revenue: number | null
    roas: number | null
  }
  health: string | null
  findings: string[]
  recommendations: string[]
}

/* ------------------------------- Output ---------------------------------- */

export interface CreativeAngle {
  name: string
  description: string
}

export interface ScriptBeat {
  window: string
  spoken: string
  onScreen: string
  visual: string
}

export interface VisualConcept {
  scene: string
  protagonist: string
  setting: string
  composition: string
  lighting: string
  elements: string[]
  onScreenText: string
  style: string
}

export interface CreativeOutput {
  strategy: { objective: string; audience: string; intent: string; mainAngle: string }
  angles: CreativeAngle[]
  hooks: string[]
  copy: string
  description: string
  headline: { main: string; variants: string[] }
  ctas: string[]
  /** Only for video formats; empty array otherwise. */
  script: ScriptBeat[]
  visualConcept: VisualConcept
  /** Only for video formats; empty array otherwise. */
  shotList: string[]
  visualPrompt: string
}

export type VariantVariable = "hook" | "angle" | "cta" | "headline"

export interface VariantSet {
  /** Exactly ONE variable changes across A/B/C. */
  variable: VariantVariable
  variants: { label: "A" | "B" | "C"; value: string }[]
}

/**
 * Provenance is always explicit. A deterministic fallback is labelled
 * "Plantilla sugerida" and never passed off as an AI answer.
 */
export type OutputSource = "ai" | "template"

/* ------------------------------- Drafts ---------------------------------- */

export type DraftStatus = "draft" | "approved" | "archived"

export interface ContentDraft {
  id: string
  /** Tenant. Immutable; Security Rules pin it to an authorised workspace. */
  workspaceId: string
  /** users.id of the author, resolved server-side from the caller's membership. */
  createdBy: string
  createdAt: string
  updatedAt: string
  status: DraftStatus
  approvedBy?: string
  approvedAt?: string
  objective: ContentObjective
  channel: ContentChannel
  format: ContentFormat
  sourceCampaignId?: string
  title: string
  inputs: CreativeBrief
  output: CreativeOutput
  outputSource: OutputSource
  variants?: VariantSet
}

export type NewDraft = Omit<ContentDraft, "id" | "createdAt" | "updatedAt" | "status" | "approvedBy" | "approvedAt">
