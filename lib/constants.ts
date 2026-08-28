import type {
  CampaignStatus,
  LeadTemperature,
  MemberStatus,
  PipelineStage,
  Platform,
  UserRole,
} from '@/types'

export const STAGE_ORDER: PipelineStage[] = [
  'new_lead',
  'contact',
  'contacted',
  'interested',
  'appointment',
  'follow_up',
  'sale',
]

export const STAGE_LABELS: Record<PipelineStage, string> = {
  new_lead: 'New Lead',
  contact: 'Contact',
  contacted: 'Contacted',
  interested: 'Interested',
  appointment: 'Appointment',
  follow_up: 'Follow-up',
  sale: 'Sale',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  client_admin: 'Client Admin',
  manager: 'Manager',
  sales_rep: 'Sales Rep',
  viewer: 'Viewer',
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  meta: 'Meta Ads',
  tiktok: 'TikTok Ads',
  google: 'Google Ads',
  instagram: 'Instagram',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  referral: 'Referral',
  organic: 'Organic',
}

/** Short mark shown inside the platform badge. */
export const PLATFORM_MARK: Record<Platform, string> = {
  meta: 'M',
  tiktok: 'TT',
  google: 'G',
  instagram: 'IG',
  facebook: 'f',
  whatsapp: 'W',
  referral: 'R',
  organic: 'O',
}

export const PLATFORM_COLOR: Record<Platform, string> = {
  meta: 'var(--chart-1)',
  tiktok: 'var(--foreground)',
  google: 'var(--chart-3)',
  instagram: 'var(--chart-5)',
  facebook: 'var(--chart-1)',
  whatsapp: 'var(--chart-2)',
  referral: 'var(--chart-4)',
  organic: 'var(--muted-foreground)',
}

export const CAMPAIGN_STATUS_VARIANT: Record<
  CampaignStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  active: { label: 'Active', variant: 'default' },
  paused: { label: 'Paused', variant: 'secondary' },
  learning: { label: 'Learning', variant: 'outline' },
  ended: { label: 'Ended', variant: 'secondary' },
}

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  active: 'Active',
  invited: 'Invited',
  inactive: 'Inactive',
}

export function temperatureColor(t: LeadTemperature): string {
  switch (t) {
    case 'hot':
      return 'var(--destructive)'
    case 'warm':
      return 'var(--warning)'
    case 'cold':
      return 'var(--chart-1)'
  }
}

export function scoreColor(score: number): string {
  if (score >= 80) return 'var(--success)'
  if (score >= 55) return 'var(--warning)'
  return 'var(--muted-foreground)'
}
