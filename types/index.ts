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
  | 'website'

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

/**
 * Audit trail types. Every one except `note` must accompany a real change to
 * the lead in the same batch (enforced by Security Rules).
 */
export type ActivityType =
  | 'lead_created'
  | 'whatsapp'
  | 'call'
  | 'stage_change'
  | 'assignment_change'
  | 'note'
  | 'archived'
  | 'restored'

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
  /** Contact phone of the distributor's company. */
  phone?: string
  city?: string
  /** State/province, free text: distributors operate in MX and the US. */
  state?: string
  /** IANA zone (e.g. "America/Mexico_City"). Drives how dates are read. */
  timezone?: string
  /**
   * Who holds each of the 2+2+2 seats (users.id). Written in the same
   * transaction as the profile change it reflects and validated by Security
   * Rules, since Rules cannot count documents. Absent on legacy workspaces
   * until their first team operation builds it.
   */
  seats?: { client_admin: string[]; manager: string[]; sales_rep: string[] }
  /** The last ledger change, declared so the Rules can verify it. */
  seatOps?: { kind: 'add' | 'remove'; role: 'client_admin' | 'manager' | 'sales_rep'; userId: string }[]
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
  /**
   * Access flag, mirrored from the team profile. Lives HERE because the
   * membership is the document Security Rules already read on every request:
   * deactivating must revoke access server-side, not merely hide buttons.
   *
   * Absent means active — legacy memberships predate this field.
   */
  status?: MemberStatus
}

/**
 * End customer of Royal Prestige — the person who buys.
 *
 * Deliberately NOT the `clients` collection: a `Client` is a commercial
 * ACCOUNT (brand, business line, sub-distributor) that campaigns attribute to.
 * Mixing buyers into it would collide with `Campaign.clientId`. In the UI this
 * is called "Clientes finales" to keep the two apart.
 *
 * Carries no counters: revenue and sale counts are derived from `sales`.
 */
export interface Customer {
  id: string
  /** Tenant. Immutable. */
  workspaceId: string
  name: string
  phone?: string
  email?: string
  /** Where they live — same shape the calendar uses for demo addresses. */
  address?: AppointmentLocation
  /**
   * Seller responsible TODAY, reassignable. `""` means unassigned — the same
   * convention `Lead.assignedToId` uses, so there is one representation.
   * This is NOT who closed a sale: that is `Sale.soldById`, and it never moves.
   */
  assignedToId: string
  /** users.id of whoever created it. Immutable. */
  createdBy: string
  createdAt: string
  updatedAt: string
}

/**
 * One confirmed purchase. A customer may buy many times, so this is a
 * separate document rather than a field on the customer.
 */
export interface Sale {
  /**
   * Also the operation key: the dialog generates it ONCE and reuses it on
   * retries, so a double tap writes the same document instead of a second sale.
   */
  id: string
  /** Tenant. Immutable. */
  workspaceId: string
  /** Immutable. */
  customerId: string
  /**
   * The lead this purchase came from, or `null` for a repeat purchase made
   * straight from the customer's file. ALWAYS present as a key, so there is
   * one way to say "no lead" instead of two (absent vs null). Immutable.
   */
  sourceLeadId: string | null
  product: string
  /** Confirmed amount, always > 0. Immutable in K1. */
  amount: number
  soldAt: string
  /**
   * Who actually closed THIS sale. Immutable: reassigning the customer must
   * never rewrite history or move a commission.
   */
  soldById: string
  notes?: string
  /**
   * K1 only ever writes 'confirmed'. Cancelling needs coherent answers about
   * the lead's stage, closedValue and revenue, so it gets its own phase.
   */
  status: SaleStatus
  createdBy: string
  createdAt: string
  updatedAt: string
}

export type SaleStatus = 'confirmed'

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

export interface MetaAdAccountRef extends MetaAssetRef {
  /** "act_123" */
  id: string
  /** "123" */
  accountId: string
  /** Meta account_status code (1 = active). */
  status: number | null
  currency: string | null
}

export interface MetaLeadFormRef extends MetaAssetRef {
  pageId: string
  status: 'active' | 'inactive'
  leadsCount: number | null
}

export interface MetaCampaignSummary {
  id: string
  name: string
  status: string | null
  objective: string | null
  effectiveStatus: string | null
  /** Minor units as Meta returns them (string), or null. */
  dailyBudget: string | null
  lifetimeBudget: string | null
  createdTime: string | null
  updatedTime: string | null
}

/**
 * Outcome of syncing ONE Meta resource. A missing permission must never fail
 * the whole sync — each resource reports its own state.
 */
export type MetaResourceState = 'ok' | 'permission_required' | 'error' | 'skipped'

export interface MetaResourceStatus {
  state: MetaResourceState
  /** Number of items retrieved when state === 'ok'. */
  count: number
  /** Safe, user-facing note (Spanish) when not ok. */
  note: string | null
}

export type MetaSyncResource =
  | 'businesses'
  | 'adAccounts'
  | 'pages'
  | 'campaigns'
  | 'leadForms'
  | 'leadRetrieval'

export type MetaSyncReport = Record<MetaSyncResource, MetaResourceStatus>

/** Capabilities derived from /me/permissions (granted only). */
export interface MetaCapabilities {
  adsRead: boolean
  adsManagement: boolean
  businessManagement: boolean
  leadsRetrieval: boolean
  pagesAccess: boolean
}

/**
 * Lead Ads readiness, reported honestly:
 *   active               → forms could be read for at least one page
 *   permissions_required → the token lacks scopes (see missingPermissions)
 *   no_pages             → no page reachable with this token
 *   error                → Meta failed while reading forms
 */
export type MetaLeadAdsStatus = 'active' | 'permissions_required' | 'no_pages' | 'error' | 'unknown'

/**
 * Connection of ONE workspace to Meta. Persisted by the SERVER only at
 * `integrations/{workspaceId}_meta` (Firebase Admin). Clients never read it
 * from Firestore — they get it through /api/meta/status.
 *
 * SECURITY: this document never holds an access token. `secretRef` is a
 * pointer to a server-side secret (today: the META_ACCESS_TOKEN env var).
 */
export interface MetaConnection {
  id: string
  workspaceId: string
  provider: 'meta_ads'
  status: ConnectionStatus
  /** Meta user / system user that the token authenticates. */
  account: MetaAssetRef | null
  /** Businesses the system user belongs to (needs business_management). */
  businesses: MetaAssetRef[]
  /** Preferred ad account of this workspace (chosen among `adAccounts`). */
  adAccount: MetaAdAccountRef | null
  adAccounts: MetaAdAccountRef[]
  /** Preferred page of this workspace (chosen among `pages`). Informational — never decides ownership. */
  page: MetaAssetRef | null
  pages: MetaAssetRef[]
  leadForms: MetaLeadFormRef[]
  campaigns: MetaCampaignSummary[]
  permissions: string[]
  capabilities: MetaCapabilities
  leadAdsStatus: MetaLeadAdsStatus
  /** Per-resource outcome of the last sync (partial failures are expected). */
  syncReport: MetaSyncReport | null
  missingPermissions: string[]
  /** Whether the Lead Ads webhook subscription is active for the page. */
  leadAdsActive: boolean
  lastSyncAt: string | null
  connectedAt: string | null
  /** users.id of the person who last synced (audit). */
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
  /** Campaign name at assignment time, so the admin UI reads well offline. */
  metaCampaignName: string | null
  /** Ad account the campaign belongs to ("act_123"). Informational. */
  adAccountId: string | null
  /** users.id of whoever assigned it (audit). */
  assignedByUserId: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Server-side idempotency record: `processedMetaLeads/{leadgenId}`.
 *
 * Status machine:
 *   received   → claimed by an invocation, processing in progress
 *   resolved   → owner found (terminal; never reprocessed)
 *   unresolved → permanent for this payload (missing ids, ad not found…)
 *                or link-related (no_link / link_inactive), which becomes
 *                reprocessable once a link is created
 *   retryable  → temporary failure (Graph timeout, auth, rate limit…);
 *                a redelivery of the same leadgen_id may reprocess it
 *   error      → unexpected exception while processing (reprocessable)
 */
export type ProcessedMetaLeadStatus = 'received' | 'resolved' | 'unresolved' | 'retryable' | 'error'

export interface ProcessedMetaLead {
  leadgenId: string
  pageId: string | null
  formId: string | null
  adId: string | null
  adgroupId: string | null
  /** Meta campaign id: from the payload or resolved via Graph API. */
  campaignId: string | null
  adsetId: string | null
  resolvedVia: 'payload' | 'graph' | null
  receivedAt: string
  updatedAt: string
  attempts: number
  status: ProcessedMetaLeadStatus
  /** Set only when status === 'resolved'. */
  workspaceId: string | null
  objective: LeadType | null
  /** Local campaign id from the link, if any. */
  localCampaignId: string | null
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
  adsetId: string | null
  createdTime: number | null
  receivedAt: string
  outcome: 'resolved' | 'unresolved' | 'retryable' | 'duplicate' | 'error'
  reason: string | null
  resolvedVia: 'payload' | 'graph' | null
  attempt: number
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
  /**
   * Copy of the lead's `source` at creation time. Kept for compatibility, but
   * it is NOT the source of truth for display: old documents may contradict
   * `Lead.source`. Use `attributionView()` in lib/leads.ts instead.
   */
  platform: Platform
  /**
   * Only present when there is real attribution. A manual entry leaves these
   * absent rather than storing placeholders like "Entrada manual" or "—".
   */
  campaign?: string
  adSet?: string
  ad?: string
  creative?: string
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
  /** Meta Lead Ads: `leadgen_id`, form and page the lead came from. */
  metaLeadId?: string
  externalFormId?: string
  externalPageId?: string
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
  /**
   * When the platform says the lead was generated, if different from
   * `createdAt` (the moment Royal Sales IA stored it). ISO string.
   */
  receivedAt?: string
  /**
   * REAL closed amount, confirmed by a person when the lead reaches `sale`.
   * Never derived from `potentialValue` automatically. Sales only: a
   * `rec_hired` candidate is a hire, not revenue, so it never carries this.
   * Cleared when the lead leaves the won stage.
   */
  closedValue?: number
  /**
   * When the lead entered its won stage (`sale` or `rec_hired`). ISO string,
   * written by the client; the non-falsifiable counterpart is the
   * `stage_change` activity, whose `createdAtServer` is signed by the server.
   * Cleared when the lead leaves the won stage.
   */
  closedAt?: string | null
  /**
   * The end customer this lead became, set on its FIRST conversion. Write-once
   * by design: a lead converts into one buyer and never into another. Absent
   * (or "") means "not converted yet"; legacy closed leads have no link and
   * cannot gain one from the app — that is an administrative migration.
   */
  customerId?: string
  /**
   * Extra answers a public web form captured. Present only for leads that
   * arrived through the website integration; every other lead leaves it
   * absent rather than storing an empty object.
   */
  webForm?: WebFormSubmission
  /** Present only for recruiting leads. */
  recruiting?: RecruitingProfile
  /**
   * Archived leads stay in Firestore (history is never lost) but are hidden
   * from lists and counts by default. Absent on legacy docs = not archived.
   * When set, `archived` is always written explicitly (true/false) so it can
   * be counted with an equality query.
   */
  archived?: boolean
  /** users.id of whoever sent it to the trash, and their name at the time. */
  archivedBy?: string
  archivedByName?: string
  archivedAt?: string | null
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

export type AppointmentStatus = 'scheduled' | 'completed' | 'no_show' | 'cancelled'

/**
 * Where the meeting happens. Royal Prestige demos are held at the customer's
 * home, so this is a physical postal address, not a meeting link.
 *
 * It is a SNAPSHOT stored on the appointment: editing it never touches the
 * lead's own address, and two meetings with the same lead may legitimately
 * happen at different places.
 */
export interface AppointmentLocation {
  addressLine1: string
  /** Apartment, unit, suite. */
  addressLine2?: string
  city: string
  state: string
  postalCode: string
}

/** What the meeting is for. Labels differ per pipeline (see lib/appointments.ts). */
export type AppointmentType =
  | 'demo'
  | 'follow_up'
  | 'closing'
  | 'interview'
  | 'orientation'
  | 'other'

/**
 * `appointments/{id}` — a real meeting attached to a real lead.
 *
 * `workspaceId` is the tenant and is immutable. `leadName` is a display
 * snapshot so the agenda renders without reading every lead (a sales_rep
 * cannot read leads that are not theirs); the authoritative link is `leadId`.
 */
export interface Appointment {
  id: string
  workspaceId: string
  leadId: string
  /** Display snapshot of the lead's name at scheduling time. */
  leadName: string
  /** Pipeline the lead belonged to, so labels stay coherent. */
  leadType: LeadType
  /** users.id of whoever the meeting belongs to. May be '' when unassigned. */
  assignedToId: string
  /** ISO datetime of the meeting. */
  scheduledAt: string
  /** Minutes. */
  durationMinutes: number
  type: AppointmentType
  status: AppointmentStatus
  notes?: string
  /**
   * Physical address of the meeting. REQUIRED for a sales demo, optional for
   * every other type (see requiresLocation in lib/appointments.ts).
   */
  location?: AppointmentLocation
  /** users.id of whoever created it; Rules pin it to the caller. */
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface ActivityPayload {
  /** stage_change / assignment_change: previous and new raw values. */
  from?: string
  to?: string
  /** Human labels resolved when written (stage / member names). */
  fromLabel?: string
  toLabel?: string
  /** note only. */
  note?: string
}

/**
 * `leads/{leadId}/activities/{activityId}` — immutable audit trail.
 *
 * `createdAtServer` (serverTimestamp) is the SOURCE OF TRUTH for ordering and
 * display; `createdAt` (ISO from the browser) is kept for compatibility with
 * the rest of the model and as a fallback while the server value resolves.
 *
 * The actor's NAME is never stored: it is resolved from `users/{actorId}` when
 * rendering, so a client cannot sign an activity as somebody else.
 */
export interface Activity {
  id: string
  workspaceId: string
  leadId: string
  type: ActivityType
  /** users.id of whoever performed it. Rules force it to equal the caller. */
  actorId: string
  /**
   * Audit snapshot of the actor's role. Rules force it to equal the caller's
   * real role in `memberships/{uid}`, so it cannot be faked. Used to label the
   * super admin, whose `users` profile lives outside any workspace.
   */
  actorRole: UserRole
  createdAt: string
  /** Firestore Timestamp; Rules force it to equal request.time. */
  createdAtServer: { toDate: () => Date } | null
  payload?: ActivityPayload
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

/**
 * Website integration of ONE workspace: `websiteIntegrations/{workspaceId}`.
 *
 * The integration key is the credential a form uses to post leads. Only its
 * SHA-256 hash is stored — the plain key is shown once, when generated, and
 * never again — so a leaked database dump cannot forge submissions. The
 * document is written exclusively by server routes with the Admin SDK; the
 * client only reads it.
 */
export interface WebsiteIntegration {
  workspaceId: string
  /** Official domain the forms live on, e.g. "impact.com". */
  domain: string
  status: 'connected' | 'disabled'
  /** SHA-256 of the integration key. Never the key itself. */
  keyHash: string
  /** First characters of the key, so the admin can recognise which one is live. */
  keyPrefix: string
  /** ISO timestamp of the last lead received, or null. */
  lastReceivedAt: string | null
  createdAt: string
  updatedAt: string
}

/** What a public form posts to /api/website/leads. */
export interface WebsiteLeadPayload {
  name: string
  phone: string
  email?: string
  city?: string
  type: LeadType
  /** Which form on the site, e.g. "contacto", "trabaja-con-nosotros". */
  form?: string
  pageUrl?: string
  referrer?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmContent?: string
  utmTerm?: string
  /** fbclid / gclid / ttclid. */
  clickId?: string
  /** Platform identifiers, when the page captured them. */
  campaignId?: string
  adsetId?: string
  adId?: string
  /** Extra answers of the specific form. */
  zip?: string
  state?: string
  answers?: Record<string, string>
  gift?: string
  giftId?: string
  schedulePreference?: string
  consent?: boolean
  /** Id in the origin system; used for idempotency. */
  externalId?: string
  receivedAt?: string
}

/**
 * What a landing page form collected beyond the standard lead fields.
 *
 * Kept as ONE optional object instead of scattering columns across `Lead`:
 * these answers belong to a specific form, they vary between campaigns, and
 * nothing in the app filters or sorts by them — they exist so the distributor
 * can read them before the visit.
 */
export interface WebFormSubmission {
  /** Which form, e.g. "experiencia-agua". */
  form: string
  zip?: string
  /** State or province as the form captured it, e.g. "GA". */
  state?: string
  /** Free-form question/answer pairs, exactly as the form sent them. */
  answers?: Record<string, string>
  /** Promotion offered on the landing page. */
  gift?: string
  giftId?: string
  /** When the person prefers to be visited, in their own words. */
  schedulePreference?: string
  /** Whether they accepted being contacted. */
  consent?: boolean
  /**
   * The submission's id in the ORIGIN system. Used for idempotency: a retry
   * carrying the same id updates nothing instead of creating a second lead.
   */
  externalId?: string
  /** When the origin system received it, if it reported that. */
  receivedAt?: string
  /** Set by the funnel events route when the visitor spun the wheel. */
  rouletteSpun?: boolean
  rouletteSpunAt?: string
}

/**
 * One in-app notification for ONE person: `notifications/{id}`.
 *
 * Created centrally by `lib/notifications.ts` whenever a lead is really
 * created — never on a deduplicated re-submission — and fanned out to the
 * admins of the lead's workspace plus its assignee. The super admin holds no
 * documents: they read every workspace's notifications through the Rules.
 */
export interface AppNotification {
  id: string
  workspaceId: string
  /** users.id of the recipient. */
  userId: string
  type: 'new_lead'
  leadId: string
  leadType: LeadType
  /** "Nuevo prospecto" / "Nuevo candidato". */
  title: string
  /** "María González · Experiencia del Agua". */
  message: string
  source: Platform
  /** Form or origin label, e.g. "experiencia-agua". */
  form: string | null
  read: boolean
  readAt: string | null
  createdAt: string
}

/** The eight steps of the landing → booking funnel, in order. */
export const FUNNEL_STEPS_ORDER = [
  'landing_view', 'form_started', 'lead_captured', 'roulette_viewed',
  'roulette_spun', 'prize_revealed', 'booking_started', 'booking_completed',
] as const
export type FunnelEventName = (typeof FUNNEL_STEPS_ORDER)[number]

/**
 * One step a visitor reached: `funnelEvents/{id}`.
 *
 * Written ONLY by the server route, which resolves `workspaceId` from the
 * integration key — the landing never states which workspace it belongs to.
 * `sessionId` is generated by the landing and is what ties the eight steps of
 * one visit together; `prospectId` appears from `lead_captured` onwards.
 */
export interface FunnelEvent {
  id: string
  workspaceId: string
  sessionId: string
  eventName: FunnelEventName
  /** Local campaign id when the landing knows it; otherwise null. */
  campaignId: string | null
  /** Free-form origin the landing reports, e.g. "experiencia-agua". */
  campaignSource: string | null
  prospectId: string | null
  pageUrl: string | null
  utmSource: string | null
  utmMedium: string | null
  utmCampaign: string | null
  utmContent: string | null
  utmTerm: string | null
  /** fbclid / gclid, when present. */
  clickId: string | null
  /** Prize won, only on roulette_spun / prize_revealed. */
  prize: string | null
  createdAt: string
}
