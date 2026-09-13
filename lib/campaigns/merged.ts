import type { CampaignMetrics } from "@/lib/media-buyer/analyzer"
import type { Campaign } from "@/types"

/**
 * What the Campañas screen shows for one campaign.
 *
 * Two sources, never mixed up: Meta owns the money it charged (`spend`), the
 * CRM owns what happened afterwards (leads attributed, sales closed,
 * revenue). Derived figures are `null` — not zero — whenever the inputs do
 * not support them, because "$0 CPL" reads as a measurement while "sin datos"
 * is the truth when nobody has converted yet.
 */
export interface MergedCampaign {
  id: string
  name: string
  platform: Campaign["platform"]
  status: Campaign["status"]
  /** Kept so the table can label Ventas / Reclutamiento as it already did. */
  objective: Campaign["objective"]
  campaignType?: Campaign["campaignType"]
  /** Real Meta spend for the selected period. `null` when Meta reported none. */
  spend: number | null
  /** CRM leads attributed to this campaign inside the period. */
  leads: number
  /** spend / CRM leads — only when both exist. */
  cpl: number | null
  /** Confirmed closed revenue attributed to this campaign. */
  revenue: number | null
  /** revenue / spend — only when there is spend AND attributed revenue. */
  roas: number | null
  /** True when this campaign has a live Meta link backing its numbers. */
  fromMeta: boolean
}

export interface MergedTotals {
  spend: number | null
  leads: number
  revenue: number | null
  roas: number | null
  active: number
}

/**
 * Joins the local `campaigns` documents with the per-campaign metrics Media
 * Buyer already computes from Meta Insights + CRM. The join key is
 * `Campaign.externalId === CampaignMetrics.metaCampaignId`, the same key the
 * link bridge writes, and the workspace isolation is inherited from both
 * inputs: `useCampaigns()` only returns the active workspace's documents, and
 * the insights route only returns links of workspaces the caller may see.
 *
 * A manual campaign (no `externalId`, or no Meta row this period) keeps its
 * stored values, so nothing that already worked starts showing "sin datos".
 */
export function mergeCampaigns(
  campaigns: Campaign[],
  metrics: CampaignMetrics[],
): MergedCampaign[] {
  const byMetaId = new Map(metrics.map((m) => [m.metaCampaignId, m]))
  return campaigns.map((c) => {
    const m = c.externalId ? byMetaId.get(c.externalId) : undefined
    if (!m) {
      // No Meta counterpart: show exactly what the document holds.
      return {
        id: c.id,
        name: c.name,
        platform: c.platform,
        status: c.status,
        objective: c.objective,
        campaignType: c.campaignType,
        spend: c.spend || null,
        leads: c.leads,
        cpl: c.spend > 0 && c.leads > 0 ? c.spend / c.leads : null,
        revenue: c.revenue || null,
        roas: c.spend > 0 && c.revenue > 0 ? c.revenue / c.spend : null,
        fromMeta: false,
      }
    }
    return {
      id: c.id,
      name: m.name || c.name,
      platform: c.platform,
      status: c.status,
      objective: c.objective,
      campaignType: c.campaignType,
      spend: m.spend,
      leads: m.crmLeads,
      // The analyzer already refuses to divide without both sides; reusing its
      // value keeps Campañas and Media Buyer from ever disagreeing.
      cpl: m.cplCrm,
      revenue: m.revenue,
      roas: m.roas,
      fromMeta: true,
    }
  })
}

/** Totals derived from the SAME rows the table shows — never recomputed elsewhere. */
export function mergedTotals(rows: MergedCampaign[]): MergedTotals {
  const spends = rows.map((r) => r.spend).filter((v): v is number => v !== null)
  const revenues = rows.map((r) => r.revenue).filter((v): v is number => v !== null)
  const spend = spends.length > 0 ? spends.reduce((a, b) => a + b, 0) : null
  const revenue = revenues.length > 0 ? revenues.reduce((a, b) => a + b, 0) : null
  return {
    spend,
    leads: rows.reduce((s, r) => s + r.leads, 0),
    revenue,
    // A blended ROAS needs both sides; without attributed revenue it is not
    // "0.0x", it is unknown.
    roas: spend !== null && spend > 0 && revenue !== null ? revenue / spend : null,
    active: rows.filter((r) => r.status === "active").length,
  }
}
