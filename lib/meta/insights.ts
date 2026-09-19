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
 *
 * THEY ARE NOT ADDITIVE. Meta reports the same conversion under several of
 * these names at once. Measured on the real ad account (30 days, Sept 2026):
 *
 *   lead = 43 · onsite_conversion.lead_grouped = 31 · offsite_conversion.fb_pixel_lead = 12
 *   31 + 12 = 43  →  `lead` is ALREADY the total.
 *
 * Adding them up returned 86 for 43 real leads. See `resolveMetaLeads`.
 */
export const META_LEAD_ACTION_TYPES = [
  "lead",
  "onsite_conversion.lead_grouped",
  "leadgen_grouped",
  "offsite_conversion.fb_pixel_lead",
] as const

/** Meta's own aggregate of every lead of the campaign. Wins over everything. */
const LEAD_TOTAL_ACTION_TYPE = "lead"

/**
 * On-Facebook lead forms. These two are aliases of EACH OTHER (same event,
 * two names), so the fallback takes the largest, never their sum.
 */
const LEAD_ONSITE_ALIASES = ["onsite_conversion.lead_grouped", "leadgen_grouped"] as const

/** Leads that happened on our own site, reported by the Pixel. */
const LEAD_PIXEL_ACTION_TYPE = "offsite_conversion.fb_pixel_lead"

/** How `metaLeads` was obtained, so the number can always be explained. */
export type MetaLeadsSource = "lead" | "onsite" | "pixel" | "onsite_and_pixel"

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
  /**
   * Leads Meta itself reports, DE-DUPLICATED (never the sum of the aliases).
   * null when Meta sent no valid lead signal at all.
   */
  metaLeads: number | null
  /** Which action type actually produced `metaLeads`. null when there is none. */
  metaLeadsSource: MetaLeadsSource | null
  /** Which lead action types were present, for transparency. */
  metaLeadActionTypes: string[]
}

/**
 * Turns Meta's `actions` array into ONE lead count.
 *
 * Precedence, never a sum of equivalents:
 *  1. `lead` — Meta's own total. Used alone, the other names are ignored.
 *  2. No `lead`: the on-Facebook form count (largest of its two aliases,
 *     which are the same event) plus the Pixel count, which is a DIFFERENT
 *     surface (our website). This mirrors exactly how Meta builds `lead`:
 *     31 on-site + 12 pixel = 43.
 *  3. Nothing usable → null. Never 0 by default.
 */
export function resolveMetaLeads(
  actions: readonly { action_type: string; value: string }[],
): { metaLeads: number | null; source: MetaLeadsSource | null; present: string[] } {
  const byType = new Map<string, number>()
  for (const a of actions) {
    if (!(META_LEAD_ACTION_TYPES as readonly string[]).includes(a.action_type)) continue
    const n = num(a.value)
    if (n !== null) byType.set(a.action_type, n)
  }
  const present = [...byType.keys()]

  const total = byType.get(LEAD_TOTAL_ACTION_TYPE)
  if (total !== undefined) return { metaLeads: total, source: "lead", present }

  // Aliases of the same on-Facebook event: take one, never both.
  const onsiteValues = LEAD_ONSITE_ALIASES.map((t) => byType.get(t)).filter((v): v is number => v !== undefined)
  const onsite = onsiteValues.length > 0 ? Math.max(...onsiteValues) : null
  const pixel = byType.get(LEAD_PIXEL_ACTION_TYPE) ?? null

  if (onsite === null && pixel === null) return { metaLeads: null, source: null, present }
  if (onsite !== null && pixel !== null) return { metaLeads: onsite + pixel, source: "onsite_and_pixel", present }
  if (onsite !== null) return { metaLeads: onsite, source: "onsite", present }
  return { metaLeads: pixel, source: "pixel", present }
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

  const leads = resolveMetaLeads(row.actions ?? [])
  // Link clicks: clicks towards the ad's destination, NOT every interaction.
  // `clicks` (all clicks) is never used as a silent substitute.
  const linkClicks = num(row.inline_link_clicks)

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
    linkClicks,
    ctr: num(row.ctr) ?? (clicks !== null && impressions !== null && impressions > 0 ? (clicks / impressions) * 100 : null),
    // CPC DE ENLACE: inversión / clics en enlace. Meta's own `cpc` field is
    // cost per ANY click, which does not match the link-clicks card.
    cpc: spend !== null && linkClicks !== null && linkClicks > 0 ? spend / linkClicks : null,
    cpm: num(row.cpm) ?? (spend !== null && impressions !== null && impressions > 0 ? (spend / impressions) * 1000 : null),
    metaLeads: leads.metaLeads,
    metaLeadsSource: leads.source,
    metaLeadActionTypes: leads.present,
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
