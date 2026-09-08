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

/**
 * Five working stages, the flow a distributor actually runs:
 * Prospecto nuevo → Demostración agendada → Seguimiento → Venta / No interesado.
 *
 * `contact`, `contacted` and `interested` are NOT listed any more, but they
 * remain valid enum values and Security Rules still accept them: old leads keep
 * their stage in Firestore untouched and are shown through LEGACY_STAGE_VIEW.
 */
export const SALES_PIPELINE: PipelineDefinition<SalesStage> = {
  stages: [
    'new_lead',
    'appointment',
    'follow_up',
    'sale',
    'not_interested',
  ],
  won: 'sale',
  lost: 'not_interested',
  initial: 'new_lead',
}

/**
 * Nuevo candidato → Entrevista → Seguimiento → Nuevo socio / No calificó.
 * The dropped stages stay valid in the enum and in the Rules; see above.
 */
export const RECRUITING_PIPELINE: PipelineDefinition<RecruitingStage> = {
  stages: [
    'rec_new',
    'rec_interview',
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

/**
 * Where a lead stored under a retired stage is SHOWN. Display only: nothing is
 * written to Firestore and no record is migrated, so an old lead keeps its
 * original stage and simply appears in the closest working column instead of
 * vanishing from the board.
 */
export const LEGACY_STAGE_VIEW: Partial<Record<PipelineStage, PipelineStage>> = {
  contact: 'new_lead',
  contacted: 'follow_up',
  interested: 'follow_up',
  rec_contact: 'rec_new',
  rec_contacted: 'rec_follow_up',
  rec_qualified: 'rec_follow_up',
  rec_orientation: 'rec_follow_up',
}

/** The stage a lead is displayed under: itself, or its legacy mapping. */
export function visibleStage(stage: PipelineStage): PipelineStage {
  return LEGACY_STAGE_VIEW[stage] ?? stage
}

export const STAGE_LABELS: Record<PipelineStage, string> = {
  // Ventas
  new_lead: 'Prospecto nuevo',
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
  rec_hired: 'Nuevo socio',
  rec_disqualified: 'No calificó',
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

/**
 * Commercial names of the roles. The internal enum stays as is: it lives in
 * Security Rules, memberships, invitations and every stored document, and a
 * rename there is risk without benefit. Only what the person SEES changes.
 *
 *   client_admin → Distribuidor   (owns the workspace)
 *   manager      → Asistente      (runs the operation, no membership admin)
 *   sales_rep    → Telemarketing  (works assigned prospects only)
 *   viewer       → legacy, read-only; no longer offered on invitations
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  client_admin: 'Distribuidor',
  manager: 'Asistente',
  sales_rep: 'Telemarketing',
  viewer: 'Solo lectura',
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
