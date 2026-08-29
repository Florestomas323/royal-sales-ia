import type {
  CampaignStatus,
  ClientStatus,
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
  new_lead: 'Nuevo prospecto',
  contact: 'Por contactar',
  contacted: 'Contactado',
  interested: 'Interesado',
  appointment: 'Cita',
  follow_up: 'Seguimiento',
  sale: 'Venta',
}

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  client_admin: 'Admin de cliente',
  manager: 'Gerente',
  sales_rep: 'Vendedor',
  viewer: 'Observador',
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  meta: 'Meta Ads',
  tiktok: 'TikTok Ads',
  google: 'Google Ads',
  instagram: 'Instagram',
  facebook: 'Facebook',
  whatsapp: 'WhatsApp',
  referral: 'Referido',
  organic: 'Orgánico',
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

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  active: 'Activa',
  paused: 'Pausada',
  learning: 'Aprendizaje',
  ended: 'Finalizada',
}

export const CAMPAIGN_STATUS_VARIANT: Record<
  CampaignStatus,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  active: { label: CAMPAIGN_STATUS_LABELS.active, variant: 'default' },
  paused: { label: CAMPAIGN_STATUS_LABELS.paused, variant: 'secondary' },
  learning: { label: CAMPAIGN_STATUS_LABELS.learning, variant: 'outline' },
  ended: { label: CAMPAIGN_STATUS_LABELS.ended, variant: 'secondary' },
}

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  active: 'Activo',
  onboarding: 'Onboarding',
  paused: 'Pausado',
}

export const MEMBER_STATUS_LABELS: Record<MemberStatus, string> = {
  active: 'Activo',
  invited: 'Invitado',
  inactive: 'Inactivo',
}

/** Full labels used in filters and dropdowns. */
export const TEMPERATURE_LABELS: Record<LeadTemperature, string> = {
  hot: 'Caliente',
  warm: 'Tibio',
  cold: 'Frío',
}

/** Compact labels used inside score badges. */
export const TEMPERATURE_SHORT_LABELS: Record<LeadTemperature, string> = {
  hot: 'CALIENTE',
  warm: 'TIBIO',
  cold: 'FRÍO',
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
