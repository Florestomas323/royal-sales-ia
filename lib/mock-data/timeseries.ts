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
  { date: '2026-08-15', label: '15 ago', spend: 1580, leads: 7, sales: 0, revenue: 0 },
  { date: '2026-08-16', label: '16 ago', spend: 1720, leads: 9, sales: 1, revenue: 4800 },
  { date: '2026-08-17', label: '17 ago', spend: 1640, leads: 8, sales: 0, revenue: 0 },
  { date: '2026-08-18', label: '18 ago', spend: 1810, leads: 11, sales: 1, revenue: 5200 },
  { date: '2026-08-19', label: '19 ago', spend: 1900, leads: 10, sales: 1, revenue: 4200 },
  { date: '2026-08-20', label: '20 ago', spend: 1750, leads: 8, sales: 0, revenue: 0 },
  { date: '2026-08-21', label: '21 ago', spend: 1680, leads: 9, sales: 1, revenue: 6400 },
  { date: '2026-08-22', label: '22 ago', spend: 1820, leads: 12, sales: 1, revenue: 5100 },
  { date: '2026-08-23', label: '23 ago', spend: 1930, leads: 10, sales: 0, revenue: 0 },
  { date: '2026-08-24', label: '24 ago', spend: 2010, leads: 13, sales: 1, revenue: 7200 },
  { date: '2026-08-25', label: '25 ago', spend: 1870, leads: 9, sales: 1, revenue: 4800 },
  { date: '2026-08-26', label: '26 ago', spend: 1760, leads: 11, sales: 0, revenue: 0 },
  { date: '2026-08-27', label: '27 ago', spend: 1940, leads: 12, sales: 1, revenue: 6500 },
  { date: '2026-08-28', label: '28 ago', spend: 2120, leads: 8, sales: 1, revenue: 4200 },
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
