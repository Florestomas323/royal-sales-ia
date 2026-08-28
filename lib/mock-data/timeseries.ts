import type { Platform } from '@/types'

export interface TrendPoint {
  date: string
  label: string
  spend: number
  leads: number
  sales: number
  revenue: number
}

/** 14-day performance trend for the workspace. */
export const performanceTrend: TrendPoint[] = [
  { date: '2026-08-15', label: 'Aug 15', spend: 1580, leads: 7, sales: 0, revenue: 0 },
  { date: '2026-08-16', label: 'Aug 16', spend: 1720, leads: 9, sales: 1, revenue: 4800 },
  { date: '2026-08-17', label: 'Aug 17', spend: 1640, leads: 8, sales: 0, revenue: 0 },
  { date: '2026-08-18', label: 'Aug 18', spend: 1810, leads: 11, sales: 1, revenue: 5200 },
  { date: '2026-08-19', label: 'Aug 19', spend: 1900, leads: 10, sales: 1, revenue: 4200 },
  { date: '2026-08-20', label: 'Aug 20', spend: 1750, leads: 8, sales: 0, revenue: 0 },
  { date: '2026-08-21', label: 'Aug 21', spend: 1680, leads: 9, sales: 1, revenue: 6400 },
  { date: '2026-08-22', label: 'Aug 22', spend: 1820, leads: 12, sales: 1, revenue: 5100 },
  { date: '2026-08-23', label: 'Aug 23', spend: 1930, leads: 10, sales: 0, revenue: 0 },
  { date: '2026-08-24', label: 'Aug 24', spend: 2010, leads: 13, sales: 1, revenue: 7200 },
  { date: '2026-08-25', label: 'Aug 25', spend: 1870, leads: 9, sales: 1, revenue: 4800 },
  { date: '2026-08-26', label: 'Aug 26', spend: 1760, leads: 11, sales: 0, revenue: 0 },
  { date: '2026-08-27', label: 'Aug 27', spend: 1940, leads: 12, sales: 1, revenue: 6500 },
  { date: '2026-08-28', label: 'Aug 28', spend: 2120, leads: 8, sales: 1, revenue: 4200 },
]

export interface PlatformSplit {
  platform: Platform
  leads: number
  sales: number
  spend: number
}

export const platformSplit: PlatformSplit[] = [
  { platform: 'meta', leads: 82, sales: 6, spend: 16460 },
  { platform: 'tiktok', leads: 39, sales: 3, spend: 8870 },
]
