/**
 * Central mock-data access layer.
 *
 * Import from `@/lib/mock-data` everywhere in the UI. When Phase 2 wires up
 * Firebase, these selectors become async queries with the same return shapes,
 * so components keep working without changes.
 */
import type { Campaign, Client, Lead, User } from '@/types'

export * from './workspace'
export * from './clients'
export * from './campaigns'
export * from './leads'
export * from './activities'
export * from './insights'
export * from './integrations'
export * from './notifications'
export * from './timeseries'

import { users } from './workspace'
import { clients } from './clients'
import { campaigns } from './campaigns'
import { leads } from './leads'

export function getUserById(id: string): User | undefined {
  return users.find((u) => u.id === id)
}

export function getClientById(id: string): Client | undefined {
  return clients.find((c) => c.id === id)
}

export function getCampaignById(id: string): Campaign | undefined {
  return campaigns.find((c) => c.id === id)
}

export function getLeadById(id: string): Lead | undefined {
  return leads.find((l) => l.id === id)
}

export function getLeadsByClient(clientId: string): Lead[] {
  return leads.filter((l) => l.clientId === clientId)
}

export function getCampaignsByClient(clientId: string): Campaign[] {
  return campaigns.filter((c) => c.clientId === clientId)
}
