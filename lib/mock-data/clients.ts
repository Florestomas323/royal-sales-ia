import type { Client } from '@/types'
import { DEMO_WORKSPACE_ID } from './workspace'

export const clients: Client[] = [
  {
    id: 'c1',
    workspaceId: DEMO_WORKSPACE_ID,
    isDemo: true,
    name: 'Healthy Cooking Co.',
    industry: 'Food & Beverage',
    logoColor: 'var(--chart-2)',
    status: 'active',
    adSpend: 12480,
    leads: 61,
    appointments: 18,
    sales: 6,
    revenue: 28800,
  },
  {
    id: 'c2',
    workspaceId: DEMO_WORKSPACE_ID,
    isDemo: true,
    name: 'FitLife Studios',
    industry: 'Health & Fitness',
    logoColor: 'var(--chart-1)',
    status: 'active',
    adSpend: 9640,
    leads: 44,
    appointments: 9,
    sales: 2,
    revenue: 11400,
  },
  {
    id: 'c3',
    workspaceId: DEMO_WORKSPACE_ID,
    isDemo: true,
    name: 'Casa Bella Real Estate',
    industry: 'Real Estate',
    logoColor: 'var(--chart-4)',
    status: 'onboarding',
    adSpend: 5210,
    leads: 22,
    appointments: 4,
    sales: 1,
    revenue: 14200,
  },
]

export const currentClient = clients[0]
