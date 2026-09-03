/**
 * Royal Sales IA — Domain model
 *
 * These interfaces are the single source of truth for the product data model.
 * In Phase 1 they are populated by the mock-data layer (`/lib/mock-data`).
 * In Phase 2 the same shapes will be returned from Firebase/Firestore so the
 * UI never has to change — only the data source does.
 */

export type Platform =
  | 'meta'
  | 'tiktok'
  | 'google'
  | 'instagram'
  | 'facebook'
  | 'whatsapp'
  | 'youtube'
  | 'indeed'
  | 'referral'
  | 'organic'

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

export type PipelineStage =
  | 'new_lead'
  | 'contact'
  | 'contacted'
  | 'interested'
  | 'appointment'
  | 'follow_up'
  | 'sale'

export type CampaignStatus = 'active' | 'paused' | 'learning' | 'ended'

export type IntegrationStatus = 'connected' | 'not_connected' | 'coming_soon'

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
 * Preparation for future connectors. Not a collection yet.
 */
export interface WorkspaceIntegration {
  id: string
  workspaceId: string
  provider: IntegrationProvider
  status: IntegrationStatus
  externalAccountId?: string
  connectedAt?: string
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
  clickId?: string
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
  isDemo?: boolean
}

export interface Campaign {
  id: string
  workspaceId: string
  campaignType: LeadType
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

export interface Activity {
  id: string
  leadId: string
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
