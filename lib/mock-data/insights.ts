import type { AIInsight, FunnelStep, Kpi, LeadQuality } from '@/types'

export const kpis: Kpi[] = [
  { id: 'spend', label: 'Inversión publicitaria', value: 25330, previousValue: 22100, format: 'currency', invertedTrend: true },
  { id: 'leads', label: 'Prospectos', value: 127, previousValue: 104, format: 'number' },
  { id: 'cpl', label: 'Costo por prospecto', value: 199, previousValue: 212, format: 'currency', invertedTrend: true },
  { id: 'contacted', label: 'Contactados', value: 84, previousValue: 79, format: 'number' },
  { id: 'appointments', label: 'Citas', value: 31, previousValue: 26, format: 'number' },
  { id: 'sales', label: 'Ventas', value: 9, previousValue: 7, format: 'number' },
  { id: 'revenue', label: 'Ingresos', value: 54400, previousValue: 41200, format: 'currency' },
  { id: 'cps', label: 'Costo por venta', value: 2814, previousValue: 3157, format: 'currency', invertedTrend: true },
]

export const funnel: FunnelStep[] = [
  { stage: 'Prospectos', count: 127, conversion: 100 },
  { stage: 'Contactados', count: 84, conversion: 66 },
  { stage: 'Citas', count: 31, conversion: 24 },
  { stage: 'Asistencias', count: 22, conversion: 17 },
  { stage: 'Ventas', count: 9, conversion: 7 },
]

export const leadQuality: LeadQuality = {
  score: 82,
  label: 'Excelente',
  responseRate: 71,
  appointmentRate: 37,
  showRate: 71,
  closeRate: 41,
}

export const aiInsights: AIInsight[] = [
  {
    id: 'ai1',
    type: 'performance',
    priority: 'high',
    title: 'Meta convierte mejor aunque traiga menos prospectos',
    explanation:
      'Meta generó 34 % menos prospectos que TikTok esta semana, pero 2.1× más ventas cerradas. La calidad de los prospectos de las audiencias similares de Meta está rindiendo mejor.',
    suggestedAction:
      'Mueve el 15 % del presupuesto de prospección de TikTok al conjunto de audiencias similares de Meta.',
    actionLabel: 'Ver campaña',
    actionHref: '/campaigns',
  },
  {
    id: 'ai2',
    type: 'opportunity',
    priority: 'medium',
    title: 'Healthy Cooking tiene tu mejor puntaje de calidad de prospectos',
    explanation:
      'El cliente Healthy Cooking está en 82/100 de calidad con una tasa de cierre del 41 %, muy por encima del promedio del workspace (24 %).',
    suggestedAction: 'Replica el ángulo creativo de UGC de recetas en FitLife.',
    actionLabel: 'Ver campaña',
    actionHref: '/campaigns',
  },
  {
    id: 'ai3',
    type: 'action',
    priority: 'high',
    title: '12 prospectos nuevos siguen sin contactar',
    explanation:
      '12 prospectos recibidos en las últimas 24 h aún no tienen primer contacto. Los prospectos contactados en menos de 10 minutos tienen 4× más probabilidad de convertir.',
    suggestedAction: 'Asigna y contacta estos prospectos ahora para proteger la tasa de conversión.',
    actionLabel: 'Ver prospectos',
    actionHref: '/leads',
  },
  {
    id: 'ai4',
    type: 'warning',
    priority: 'medium',
    title: 'La tasa de contacto bajó 8 % esta semana',
    explanation:
      'La tasa de contacto de tu equipo cayó de 74 % a 66 %. La mayor parte de la caída se concentra en prospectos asignados después de las 6 p. m.',
    suggestedAction:
      'Revisa las reglas de asignación fuera de horario y rebalancea las asignaciones de la tarde.',
    actionLabel: 'Revisar',
    actionHref: '/team',
  },
]
