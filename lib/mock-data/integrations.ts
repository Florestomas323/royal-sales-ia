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
    category: 'Advertising',
    description: 'Sync spend, campaigns and lead forms from Facebook & Instagram.',
    status: 'not_connected',
    accent: 'var(--chart-1)',
  },
  {
    id: 'tiktok',
    name: 'TikTok Ads',
    category: 'Advertising',
    description: 'Pull ad performance and lead generation from TikTok.',
    status: 'not_connected',
    accent: 'var(--foreground)',
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp Business',
    category: 'Messaging',
    description: 'Two-way conversations and automated first-touch messaging.',
    status: 'not_connected',
    accent: 'var(--chart-2)',
  },
  {
    id: 'instagram',
    name: 'Instagram',
    category: 'Social',
    description: 'DM automation and organic lead capture from Instagram.',
    status: 'coming_soon',
    accent: 'var(--chart-5)',
  },
  {
    id: 'facebook',
    name: 'Facebook Pages',
    category: 'Social',
    description: 'Comment-to-lead and Messenger automation for Pages.',
    status: 'coming_soon',
    accent: 'var(--chart-1)',
  },
  {
    id: 'google',
    name: 'Google Ads',
    category: 'Advertising',
    description: 'Search and Performance Max campaign metrics and attribution.',
    status: 'coming_soon',
    accent: 'var(--chart-3)',
  },
]
