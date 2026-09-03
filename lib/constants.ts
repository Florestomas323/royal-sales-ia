import type {
  CampaignStatus,
  ClientStatus,
  LeadTemperature,
  LeadType,
  MemberStatus,
  PipelineStage,
  Platform,
  RecruitingStage,
  SalesStage,
  UserRole,
} from '@/types'

/* -------------------------------------------------------------------------- */
/*  Lead type (Ventas / Reclutamiento)                                         */
/* -------------------------------------------------------------------------- */

export const LEAD_TYPES: LeadType[] = ['sales', 'recruiting']

export const LEAD_TYPE_LABELS: Record<LeadType, string> = {
  sales: 'Ventas',
  recruiting: 'Reclutamiento',
}

/** Singular label used on badges and forms ("Venta" / "Reclutamiento"). */
export const LEAD_TYPE_SINGULAR: Record<LeadType, string> = {
  sales: 'Venta',
  recruiting: 'Reclutamiento',
}

/** What a campaign with that objective is looking for. */
export const CAMPAIGN_OBJECTIVE_LABELS: Record<LeadType, string> = {
  sales: 'Clientes',
  recruiting: 'Candidatos',
}

/* -------------------------------------------------------------------------- */
/*  Pipelines                                                                  */
/* -------------------------------------------------------------------------- */

export interface PipelineDefinition<S extends PipelineStage = PipelineStage> {
  /** Ordered stages shown as Kanban columns. */
  stages: S[]
  /** Stage that counts as "won" (venta / incorporado). */
  won: S
  /** Stage that counts as "lost" (no interesado / no calificado). */
  lost: S
  /** Stage a lead lands in when created. */
  initial: S
}

export const SALES_PIPELINE: PipelineDefinition<SalesStage> = {
  stages: [
    'new_lead',
    'contact',
    'contacted',
    'interested',
    'appointment',
    'follow_up',
    'sale',
    'not_interested',
  ],
  won: 'sale',
  lost: 'not_interested',
  initial: 'new_lead',
}

export const RECRUITING_PIPELINE: PipelineDefinition<RecruitingStage> = {
  stages: [
    'rec_new',
    'rec_contact',
    'rec_contacted',
    'rec_qualified',
    'rec_interview',
    'rec_orientation',
    'rec_follow_up',
    'rec_hired',
    'rec_disqualified',
  ],
  won: 'rec_hired',
  lost: 'rec_disqualified',
  initial: 'rec_new',
}

export const PIPELINES: Record<LeadType, PipelineDefinition> = {
  sales: SALES_PIPELINE,
  recruiting: RECRUITING_PIPELINE,
}

/** @deprecated Sales-only order kept for compatibility. Prefer PIPELINES[type].stages. */
export const STAGE_ORDER: PipelineStage[] = SALES_PIPELINE.stages

export const STAGE_LABELS: Record<PipelineStage, string> = {
  // Ventas
  new_lead: 'Nuevo',
  contact: 'Contactar',
  contacted: 'Contactado',
  interested: 'Interesado',
  appointment: 'Demostración agendada',
  follow_up: 'Seguimiento',
  sale: 'Venta',
  not_interested: 'No interesado',
  // Reclutamiento
  rec_new: 'Nuevo candidato',
  rec_contact: 'Contactar',
  rec_contacted: 'Contactado',
  rec_qualified: 'Calificado',
  rec_interview: 'Entrevista',
  rec_orientation: 'Orientación',
  rec_follow_up: 'Seguimiento',
  rec_hired: 'Incorporado',
  rec_disqualified: 'No calificado',
}

/** Column / badge accent per stage. */
export const STAGE_TONE: Record<PipelineStage, string> = {
  new_lead: 'var(--chart-1)',
  contact: 'var(--chart-2)',
  contacted: 'var(--chart-3)',
  interested: 'var(--chart-4)',
  appointment: 'var(--chart-5)',
  follow_up: 'var(--warning)',
  sale: 'var(--success)',
  not_interested: 'var(--muted-foreground)',
  rec_new: 'var(--chart-1)',
  rec_contact: 'var(--chart-2)',
  rec_contacted: 'var(--chart-3)',
  rec_qualified: 'var(--chart-4)',
  rec_interview: 'var(--chart-5)',
  rec_orientation: 'var(--chart-2)',
  rec_follow_up: 'var(--warning)',
  rec_hired: 'var(--success)',
  rec_disqualified: 'var(--muted-foreground)',
}

/* -------------------------------------------------------------------------- */
/*  Sources                                                                    */
/* -------------------------------------------------------------------------- */

/** Sources offered in forms, per lead type. `indeed` is recruiting-only. */
export const SOURCES_BY_LEAD_TYPE: Record<LeadType, Platform[]> = {
  sales: [
    'meta',
    'facebook',
    'instagram',
    'whatsapp',
    'tiktok',
    'google',
    'youtube',
    'web',
    'landing_page',
    'referral',
    'manual',
    'other',
  ],
  recruiting: [
    'indeed',
    'meta',
    'facebook',
    'instagram',
    'whatsapp',
    'tiktok',
    'google',
    'youtube',
    'web',
    'landing_page',
    'referral',
    'manual',
    'other',
  ],
}

export const RECRUITING_ONLY_SOURCES: Platform[] = ['indeed']

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  client_admin: 'Admin de cliente',
  manager: 'Gerente',
  sales_rep: 'Vendedor',
  viewer: 'Observador',
}

export const PLATFORM_LABELS: Record<Platform, string> = {
  meta: 'Meta Ads',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok Ads',
  google: 'Google Ads',
  youtube: 'YouTube',
  indeed: 'Indeed',
  whatsapp: 'WhatsApp',
  web: 'Sitio web',
  landing_page: 'Landing page',
  referral: 'Referido',
  manual: 'Manual',
  other: 'Otro',
  organic: 'Orgánico',
}

/** Short mark shown inside the platform badge. */
export const PLATFORM_MARK: Record<Platform, string> = {
  meta: 'M',
  facebook: 'f',
  instagram: 'IG',
  tiktok: 'TT',
  google: 'G',
  youtube: 'YT',
  indeed: 'IN',
  whatsapp: 'W',
  web: 'W',
  landing_page: 'LP',
  referral: 'R',
  manual: 'M',
  other: '?',
  organic: 'O',
}

export const PLATFORM_COLOR: Record<Platform, string> = {
  meta: 'var(--chart-1)',
  facebook: 'var(--chart-1)',
  instagram: 'var(--chart-5)',
  tiktok: 'var(--foreground)',
  google: 'var(--chart-3)',
  youtube: 'var(--destructive)',
  indeed: 'var(--chart-3)',
  whatsapp: 'var(--chart-2)',
  web: 'var(--chart-4)',
  landing_page: 'var(--chart-4)',
  referral: 'var(--chart-4)',
  manual: 'var(--muted-foreground)',
  other: 'var(--muted-foreground)',
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
