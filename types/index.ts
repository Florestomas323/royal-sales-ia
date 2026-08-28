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
  | 'referral'
  | 'organic'

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

export interface Workspace {
  id: string
  name: string
  plan: string
  logoColor: string
}

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  avatarColor: string
  status: MemberStatus
  assignedLeads: number
  appointments: number
  sales: number
}

export interface Client {
  id: string
  name: string
  industry: string
  logoColor: string
  status: ClientStatus
  adSpend: number
  leads: number
  appointments: number
  sales: number
  revenue: number
}

export interface Attribution {
  platform: Platform
  campaign: string
  adSet: string
  ad: string
  creative: string
}

export interface Lead {
  id: string
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
}

export interface Campaign {
  id: string
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
