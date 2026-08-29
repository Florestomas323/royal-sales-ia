import type { IntegrationStatus, Platform } from '@/types'

export interface IntegrationCard {
  id: Platform | string
  name: string
  category: string
  description: string
  status: IntegrationStatus
  accent: string
}

export const integrations: IntegrationCard[] = [
  {
    id: 'meta',
    name: 'Meta Ads',
    category: 'Publicidad',
    description: 'Sincroniza inversión, campañas y formularios de prospectos de Facebook e Instagram.',
    status: 'not_connected',
    accent: 'var(--chart-1)',
  },
  {
    id: 'tiktok',
    name: 'TikTok Ads',
    category: 'Publicidad',
    description: 'Trae el rendimiento de anuncios y la generación de prospectos de TikTok.',
    status: 'not_connected',
    accent: 'var(--foreground)',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    category: 'Mensajería',
    description: 'Conversaciones en dos vías y mensajes automáticos de primer contacto.',
    status: 'not_connected',
    accent: 'var(--chart-2)',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    category: 'Redes sociales',
    description: 'Automatización de mensajes directos y captura de prospectos orgánicos desde Instagram.',
    status: 'coming_soon',
    accent: 'var(--chart-5)',
  },
  {
    id: 'facebook',
    name: 'Facebook Pages',
    category: 'Redes sociales',
    description: 'De comentario a prospecto y automatización de Messenger para páginas.',
    status: 'coming_soon',
    accent: 'var(--chart-1)',
  },
  {
    id: 'google',
    name: 'Google Ads',
    category: 'Publicidad',
    description: 'Métricas y atribución de campañas de Búsqueda y Performance Max.',
    status: 'coming_soon',
    accent: 'var(--chart-3)',
  },
]
