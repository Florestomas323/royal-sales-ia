/**
 * Royal Sales IA — Domain model
 *
 * These interfaces are the single source of truth for the product data model.
 * In Phase 1 they are populated by the mock-data layer (`/lib/mock-data`).
 * In Phase 2 the same shapes will be returned from Firebase/Firestore so the
 * UI never has to change — only the data source does.
 */

/**
 * Origin of a lead / channel of a campaign.
 *  - Ad platforms: meta, facebook, instagram, tiktok, google, youtube, indeed
 *  - Messaging:    whatsapp
 *  - Owned:        web, landing_page
 *  - Offline:      referral, manual, other
 *  - Legacy:       organic (kept for existing documents; not offered in forms)
 *
 * `indeed` is a RECRUITING-only source (see SOURCES_BY_LEAD_TYPE in constants).
 */
export type Platform =
  | 'meta'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'google'
  | 'youtube'
  | 'indeed'
  | 'whatsapp'
  | 'web'
  | 'landing_page'
  | 'referral'
  | 'manual'
  | 'other'
  | 'organic'

/** Alias used where the meaning is "where the lead came from". */
export type LeadSource = Platform

/**
 * Business line a lead (or campaign) belongs to.
 * - `sales`      → venta de producto (pipeline comercial actual)
 * - `recruiting` → reclutamiento de vendedores (Indeed y afines, fase futura)
 */
export type LeadType = 'sales' | 'recruiting'

/**
 * Providers the platform is prepared to integrate. Only the type exists today;
 * no external API is connected yet.
 */
export type IntegrationProvider =
  | 'meta_ads'
  | 'facebook'
  | 'instagram'
  | 'whatsapp'
  | 'tiktok_ads'
  | 'google_ads'
  | 'youtube'
  | 'indeed'

export type LeadTemperature = 'hot' | 'warm' | 'cold'

/**
 * Sales pipeline. Keys are stable identifiers stored in Firestore; the
 * original seven values are preserved so existing leads need no migration.
 *   new_lead → Nuevo · contact → Contactar · contacted → Contactado
 *   interested → Interesado · appointment → Demostración agendada
 *   follow_up → Seguimiento · sale → Venta · not_interested → No interesado
 */
export type SalesStage =
  | 'new_lead'
  | 'contact'
  | 'contacted'
  | 'interested'
  | 'appointment'
  | 'follow_up'
  | 'sale'
  | 'not_interested'

/** Recruiting pipeline (independent from sales). Prefixed to avoid collisions. */
export type RecruitingStage =
  | 'rec_new'
  | 'rec_contact'
  | 'rec_contacted'
  | 'rec_qualified'
  | 'rec_interview'
  | 'rec_orientation'
  | 'rec_follow_up'
  | 'rec_hired'
  | 'rec_disqualified'

export type PipelineStage = SalesStage | RecruitingStage

export type CampaignStatus = 'active' | 'paused' | 'learning' | 'ended'

/**
 * Whether Royal Sales IA can offer an integration at all (catalog-level).
 *   available   → the connector exists (or is being built) and can be managed
 *   coming_soon → on the roadmap, no UI action yet
 *   unavailable → not planned for this workspace/region
 */
export type IntegrationAvailability = 'available' | 'coming_soon' | 'unavailable'

/**
 * State of a REAL connection for a workspace. `connected` must only ever be
 * derived from a persisted connection document written by the server-side
 * OAuth flow — never from local UI state.
 */
export type ConnectionStatus = 'not_connected' | 'connected' | 'expired' | 'error'

export type UserRole =
  | 'super_admin'
  | 'client_admin'
  | 'manager'
  | 'sales_rep'
  | 'viewer'

export type MemberStatus = 'active' | 'invited' | 'inactive'

export type ClientStatus = 'active' | 'onboarding' | 'paused'

export type InsightType = 'opportunity' | 'warning' | 'performance' | 'action'
export type InsightPriority = 'high' | 'medium' | 'low'

export type ActivityType =
  | 'lead_received'
  | 'whatsapp'
  | 'call'
  | 'email'
  | 'appointment'
  | 'note'
  | 'stage_change'
  | 'sale'
  | 'demo'
  | 'interview'
  | 'orientation'
  | 'hired'

export type Period = 'today' | '7d' | '30d' | 'custom'

export type WorkspaceStatus = 'active' | 'suspended'

/**
 * Tenant boundary. One workspace = one distribuidor (or agency) with fully
 * isolated data. Every tenant-scoped document carries `workspaceId`.
 */
export interface Workspace {
  id: string
  name: string
  plan: string
  logoColor: string
  status: WorkspaceStatus
  createdAt: string
  /** Optional: email of the person who owns/administers the workspace. */
  ownerEmail?: string
}

/**
 * Links a Firebase Auth account to a workspace and a role.
 * Document id === Firebase Auth UID. Read by Security Rules on every request.
 *
 * `super_admin` memberships have `workspaceId: null` (global access).
 */
export interface Membership {
  /** Firebase Auth UID (same as the document id). */
  authUid: string
  workspaceId: string | null
  role: UserRole
  /** `users.id` of the team profile linked to this account. */
  userId: string
  email: string
  createdAt: string
}

/**
 * Shape of the future Campaign Builder wizard (prep only — no UI yet).
 * Kept here so nothing in the data model contradicts it later.
 */
export type CampaignChannel = 'meta' | 'tiktok' | 'google' | 'indeed'
export type CampaignDestination = 'whatsapp' | 'form' | 'web' | 'landing_page'
export type CampaignCreativeType = 'image' | 'reel' | 'video' | 'carousel'

export interface CampaignDraft {
  workspaceId: string
  objective: LeadType
  channel: CampaignChannel
  location?: { city?: string; state?: string; radiusKm?: number }
  budget?: { daily?: number; total?: number; currency: string }
  destination?: CampaignDestination
  creative?: { type: CampaignCreativeType; assetUrl?: string }
}

/**
 * Preparation for future connectors. Not a collection yet.
 */
export interface WorkspaceIntegration {
  id: string
  workspaceId: string
  provider: IntegrationProvider
  status: ConnectionStatus
  externalAccountId?: string
  connectedAt?: string
}

/* -------------------------------------------------------------------------- */
/*  Meta — Fase 1 (preparación). Ver META.md. Nada de esto se persiste aún.   */
/* -------------------------------------------------------------------------- */

export interface MetaAssetRef {
  id: string
  name: string
}

export interface MetaLeadFormRef extends MetaAssetRef {
  pageId: string
  status: 'active' | 'inactive'
}

/**
 * Connection of ONE workspace to Meta. Future document
 * `integrations/{workspaceId}_meta` (rules to be added with the OAuth phase).
 *
 * SECURITY: this document never holds an access token. Tokens live server-side
 * (Secret Manager) and are referenced by `secretRef`; the client only sees
 * status and asset names.
 */
export interface MetaConnection {
  id: string
  workspaceId: string
  provider: 'meta_ads'
  status: ConnectionStatus
  /** Meta user / Business that granted access. */
  account: MetaAssetRef | null
  adAccount: MetaAssetRef | null
  page: MetaAssetRef | null
  leadForms: MetaLeadFormRef[]
  /** Whether the Lead Ads webhook subscription is active for the page. */
  leadAdsActive: boolean
  lastSyncAt: string | null
  connectedAt: string | null
  /** users.id of the person who connected it (audit). */
  connectedByUserId: string | null
  /** Pointer to the server-side secret. NEVER the token itself. */
  secretRef: string | null
  lastError: string | null
}

/**
 * OWNERSHIP RULE — "1 campaña = 1 workspace".
 * A Facebook Page can be shared by several distribuidores, so the owner of a
 * lead is NEVER derived from the page. It is derived from the Meta campaign
 * (or the form bound to it) that generated the lead:
 *
 *   Meta campaign id → MetaCampaignLink.workspaceId + objective
 *                     → lead created in that workspace, as sales|recruiting
 *
 * Future global collection `meta_campaign_links` keyed by `metaCampaignId`,
 * managed by super_admin, readable by the owning workspace.
 */
export interface MetaCampaignLink {
  /** Meta campaign id. It is ALSO the document id → unique by construction. */
  metaCampaignId: string
  workspaceId: string
  /** Where its leads land: Prospectos / Ventas or Prospectos / Reclutamiento. */
  objective: LeadType
  /** Inactive links never resolve an owner (a campaign can be re-assigned by deactivating and creating another). */
  active: boolean
  /** Local campaign this maps to, if already created in Royal Sales IA. */
  campaignId: string | null
  /** Informational only — never used for ownership. */
  pageId: string | null
  /** Informational only — never used for ownership. */
  formIds: string[]
  createdAt: string
  updatedAt: string
}

/** Server-side idempotency record: `processedMetaLeads/{leadgenId}`. */
export type ProcessedMetaLeadStatus = 'received' | 'resolved' | 'unresolved' | 'error'

export interface ProcessedMetaLead {
  leadgenId: string
  pageId: string | null
  formId: string | null
  adId: string | null
  adgroupId: string | null
  campaignId: string | null
  receivedAt: string
  status: ProcessedMetaLeadStatus
  /** Set only when status === 'resolved'. */
  workspaceId: string | null
  objective: LeadType | null
  reason: string | null
}

/** Server-side diagnostic log: `metaWebhookEvents/{autoId}`. Never contains secrets or PII. */
export interface MetaWebhookEvent {
  kind: 'leadgen'
  leadgenId: string | null
  pageId: string | null
  formId: string | null
  adId: string | null
  adgroupId: string | null
  campaignId: string | null
  createdTime: number | null
  receivedAt: string
  outcome: 'resolved' | 'unresolved' | 'duplicate' | 'error'
  reason: string | null
  workspaceId: string | null
  objective: LeadType | null
}

/**
 * Internal team profile (colección `users`). NOT the Firebase Auth account:
 * a profile can exist before the person signs up (status `invited`).
 * The link to Firebase Auth is `authUid` (+ a `memberships/{authUid}` doc).
 */
export interface User {
  id: string
  workspaceId: string
  /** Firebase Auth UID once the person has signed in and claimed the profile. */
  authUid: string | null
  name: string
  email: string
  role: UserRole
  avatarColor: string
  status: MemberStatus
  assignedLeads: number
  appointments: number
  sales: number
  isDemo?: boolean
}

/**
 * Cuenta comercial dentro de un workspace (marca, línea de negocio o
 * sub-distribuidor). El aislamiento de datos es SIEMPRE por `workspaceId`,
 * nunca por `clientId`. Ver MULTITENANT.md.
 */
export interface Client {
  id: string
  workspaceId: string
  name: string
  industry: string
  logoColor: string
  status: ClientStatus
  adSpend: number
  leads: number
  appointments: number
  sales: number
  revenue: number
  isDemo?: boolean
}

/**
 * Attribution snapshot stored ON the lead at creation time.
 * Only what is known is written; external ids are never invented.
 */
export interface Attribution {
  platform: Platform
  campaign: string
  adSet: string
  ad: string
  creative: string
  /** Platform-side identifiers (Meta / TikTok / Google / Indeed). Future. */
  externalCampaignId?: string
  externalAdSetId?: string
  externalAdId?: string
  externalCreativeId?: string
  /** fbclid / ttclid / gclid when captured. */
  clickId?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  utmTerm?: string
  landingPage?: string
  referrer?: string
}

/**
 * Optional candidate data for `leadType === "recruiting"`.
 * Dates are ISO strings (the whole model uses ISO strings, not Timestamps).
 * `indeed*` ids are only filled by the future Indeed Candidate Sync.
 */
export interface RecruitingProfile {
  jobTitle?: string
  city?: string
  state?: string
  employmentPreference?: string
  hasVehicle?: boolean
  interviewDate?: string
  orientationDate?: string
  hiredAt?: string
  indeedJobId?: string
  indeedCandidateId?: string
}

export interface Lead {
  id: string
  workspaceId: string
  leadType: LeadType
  name: string
  phone: string
  email: string
  source: Platform
  campaignId: string
  campaignName: string
  score: number
  temperature: LeadTemperature
  stage: PipelineStage
  assignedToId: string
  potentialValue: number
  createdAt: string
  lastContactAt: string | null
  nextFollowUpAt: string | null
  nextAction: string
  attribution: Attribution
  clientId: string
  /** Present only for recruiting leads. */
  recruiting?: RecruitingProfile
  isDemo?: boolean
}

export interface Campaign {
  id: string
  workspaceId: string
  /** What the campaign is looking for: customers (sales) or candidates (recruiting). */
  objective: LeadType
  /** @deprecated Phase 1 name of `objective`. Still written for compatibility; read via `campaignObjective()`. */
  campaignType?: LeadType
  name: string
  platform: Platform
  status: CampaignStatus
  spend: number
  leads: number
  cpl: number
  appointments: number
  sales: number
  revenue: number
  roas: number
  clientId: string
  /** Platform-side campaign id (future connectors). */
  externalId?: string
  isDemo?: boolean
}

export interface PlatformMetrics {
  platform: Platform
  spend: number
  leads: number
  cpl: number
  appointments: number
  sales: number
  revenue: number
}

export interface Appointment {
  id: string
  leadId: string
  leadName: string
  assignedToId: string
  scheduledAt: string
  status: 'scheduled' | 'completed' | 'no_show'
}

/**
 * Activity / history entry. Not persisted yet (future collection `activities`,
 * one document per event, always with `workspaceId`). The lead timeline
 * currently derives a single "received" entry from the lead itself.
 */
export interface Activity {
  id: string
  leadId: string
  workspaceId?: string
  /** users.id of the person who performed it; absent for system events. */
  userId?: string
  type: ActivityType
  title: string
  description: string
  actor: string
  timestamp: string
}

export interface AIInsight {
  id: string
  type: InsightType
  priority: InsightPriority
  title: string
  explanation: string
  suggestedAction: string
  actionLabel: string
  actionHref: string
}

export interface Kpi {
  id: string
  label: string
  value: number
  previousValue: number
  format: 'currency' | 'number' | 'percent'
  invertedTrend?: boolean
}

export interface FunnelStep {
  stage: string
  count: number
  conversion: number
}

export interface LeadQuality {
  score: number
  label: string
  responseRate: number
  appointmentRate: number
  showRate: number
  closeRate: number
}

export type NotificationTone = 'success' | 'warning' | 'danger' | 'info'

export interface Notification {
  id: string
  tone: NotificationTone
  title: string
  body: string
  read: boolean
  createdAt: string
}
