import type { GraphCampaignInsight } from "./graph"

/**
 * SERVER-ONLY normalisation of Meta Insights.
 *
 * Every number Meta did not send stays `null`. Nothing is defaulted to 0:
 * a missing spend is "no data", not "spent nothing".
 */

/**
 * The `actions` array mixes many event types. ONLY these are treated as
 * leads — explicitly, never "any action". Documented so the interpretation
 * can be audited against Meta's action_type list.
 */
export const META_LEAD_ACTION_TYPES = [
  "lead",
  "onsite_conversion.lead_grouped",
  "leadgen_grouped",
  "offsite_conversion.fb_pixel_lead",
] as const

export interface CampaignInsight {
  metaCampaignId: string
  campaignName: string | null
  dateStart: string
  dateStop: string
  spend: number | null
  impressions: number | null
  reach: number | null
  frequency: number | null
  clicks: number | null
  linkClicks: number | null
  /** Percent as Meta reports it (e.g. 1.23 = 1.23 %). */
  ctr: number | null
  cpc: number | null
  cpm: number | null
  /** Leads Meta itself reports (sum of META_LEAD_ACTION_TYPES). null when absent. */
  metaLeads: number | null
  /** Which action types were actually present, for transparency. */
  metaLeadActionTypes: string[]
}

function num(value: string | undefined): number | null {
  if (value === undefined || value === null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export function normalizeInsight(row: GraphCampaignInsight): CampaignInsight {
  const spend = num(row.spend)
  const impressions = num(row.impressions)
  const reach = num(row.reach)
  const clicks = num(row.clicks)

  const leadActions = (row.actions ?? []).filter((a) =>
    (META_LEAD_ACTION_TYPES as readonly string[]).includes(a.action_type),
  )
  const metaLeads =
    leadActions.length > 0 ? leadActions.reduce((sum, a) => sum + (num(a.value) ?? 0), 0) : null

  return {
    metaCampaignId: row.campaign_id,
    campaignName: row.campaign_name ?? null,
    dateStart: row.date_start,
    dateStop: row.date_stop,
    spend,
    impressions,
    reach,
    // Prefer Meta's own frequency; derive only when both inputs exist.
    frequency: num(row.frequency) ?? (impressions !== null && reach !== null && reach > 0 ? impressions / reach : null),
    clicks,
    linkClicks: num(row.inline_link_clicks),
    ctr: num(row.ctr) ?? (clicks !== null && impressions !== null && impressions > 0 ? (clicks / impressions) * 100 : null),
    cpc: num(row.cpc) ?? (spend !== null && clicks !== null && clicks > 0 ? spend / clicks : null),
    cpm: num(row.cpm) ?? (spend !== null && impressions !== null && impressions > 0 ? (spend / impressions) * 1000 : null),
    metaLeads,
    metaLeadActionTypes: leadActions.map((a) => a.action_type),
  }
}

/* -------------------------------------------------------------------------- */
/*  Periods → exact Meta date ranges                                           */
/* -------------------------------------------------------------------------- */

export type InsightsPeriod = "today" | "7d" | "30d" | "month" | "all"

export interface DateRange {
  since: string
  until: string
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setUTCDate(out.getUTCDate() + days)
  return out
}

/**
 * Exact range for the selected period (UTC dates), plus the equivalent
 * period immediately before it for deltas. "all" has no previous period.
 * Dates go to Meta as-is: the filter IS the query window.
 */
export function periodRanges(period: InsightsPeriod, now = new Date()): { current: DateRange; previous: DateRange | null } {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  switch (period) {
    case "today":
      return { current: { since: ymd(today), until: ymd(today) }, previous: { since: ymd(addDays(today, -1)), until: ymd(addDays(today, -1)) } }
    case "7d": {
      const since = addDays(today, -6)
      return { current: { since: ymd(since), until: ymd(today) }, previous: { since: ymd(addDays(since, -7)), until: ymd(addDays(since, -1)) } }
    }
    case "30d": {
      const since = addDays(today, -29)
      return { current: { since: ymd(since), until: ymd(today) }, previous: { since: ymd(addDays(since, -30)), until: ymd(addDays(since, -1)) } }
    }
    case "month": {
      const since = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
      const days = today.getUTCDate()
      const prevEnd = addDays(since, -1)
      const prevStart = addDays(prevEnd, -(days - 1))
      return { current: { since: ymd(since), until: ymd(today) }, previous: { since: ymd(prevStart), until: ymd(prevEnd) } }
    }
    default: {
      // Meta caps time_range at ~37 months; two years covers every real case.
      const since = new Date(Date.UTC(today.getUTCFullYear() - 2, today.getUTCMonth(), today.getUTCDate()))
      return { current: { since: ymd(since), until: ymd(today) }, previous: null }
    }
  }
}
