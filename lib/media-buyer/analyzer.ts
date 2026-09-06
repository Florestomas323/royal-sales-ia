import type { Lead, LeadType } from "@/types"
import type { InsightsCampaign } from "@/app/api/meta/insights/route"
import { hasClosedAmount, leadTypeOf } from "@/lib/leads"
import type { Period } from "@/lib/metrics"

/**
 * Media Buyer IA — deterministic analysis engine (V1).
 *
 * Pure functions: real Meta insights in, structured findings out. No LLM is
 * involved; an optional adapter (see ai-adapter.ts) may later rephrase the
 * SAME structured output, never invent numbers.
 *
 * Sources of truth:
 *   spend / impressions / clicks / CTR / CPC / CPM / Meta leads → Meta Insights
 *   CRM leads / sales                                            → Firestore leads
 *   revenue                                                      → closedValue
 * `null` always means "no data" and never becomes 0.
 *
 * PERIOD SEMANTICS — identical to Phase F, so both screens agree:
 *   CRM leads → `createdAt` inside the period
 *   sales     → `closedAt`  inside the period
 *   revenue   → `closedValue` of those sales
 * A lead created 40 days ago and closed today is NOT a lead of today, but IS
 * a sale and revenue of today. The period boundaries come from Phase F's
 * `resolvePeriod`; only the tiny predicate below is local, to avoid editing a
 * Phase F file just to export it.
 */

/** Mirrors `inPeriod` in lib/metrics.ts. `null` from = since the beginning. */
function withinPeriod(iso: string | null | undefined, period: Period): boolean {
  if (!period.from) return true
  if (!iso) return false
  const time = Date.parse(iso)
  return Number.isFinite(time) && time >= period.from.getTime()
}

export interface CampaignMetrics {
  metaCampaignId: string
  name: string
  workspaceId: string
  objective: LeadType
  spend: number | null
  impressions: number | null
  reach: number | null
  frequency: number | null
  clicks: number | null
  ctr: number | null
  cpc: number | null
  cpm: number | null
  /** Leads Meta reports (action types listed in lib/meta/insights.ts). */
  metaLeads: number | null
  cplMeta: number | null
  /** Leads that actually arrived in Royal Sales IA attributed to this campaign. */
  crmLeads: number
  cplCrm: number | null
  sales: number
  revenue: number | null
  roas: number | null
  /** sales / crmLeads */
  leadToSaleRate: number | null
  health: Health
  previous: {
    spend: number | null
    crmLeads: number
    cplCrm: number | null
    ctr: number | null
    sales: number
    revenue: number | null
    roas: number | null
  } | null
  deltas: Deltas | null
}

export type Health = "excellent" | "healthy" | "attention" | "critical" | "insufficient"

export interface Deltas {
  spend: number | null
  crmLeads: number | null
  cplCrm: number | null
  ctr: number | null
  sales: number | null
  revenue: number | null
  roas: number | null
}

export type FindingCategory =
  | "delivery"
  | "cost"
  | "engagement"
  | "lead_generation"
  | "conversion"
  | "revenue"
  | "data_quality"

export type Priority = "high" | "medium" | "low"
export type Confidence = "high" | "medium" | "low"

export interface Finding {
  category: FindingCategory
  metaCampaignId: string | null
  campaignName: string | null
  /** What the numbers show. Never a causal claim. */
  observation: string
  evidence: string
}

export interface Recommendation {
  priority: Priority
  metaCampaignId: string | null
  campaignName: string | null
  finding: string
  evidence: string
  recommendation: string
  /** Qualitative only — never a number the data cannot back. */
  expectedImpact: string
  confidence: Confidence
}

export interface DataQualityIssue {
  kind:
    | "campaign_without_crm_leads"
    | "crm_leads_without_insights"
    | "campaign_without_workspace"
    | "leads_without_campaign"
    | "meta_vs_crm_gap"
    | "linked_without_data"
  detail: string
  count: number
}

export interface Analysis {
  campaigns: CampaignMetrics[]
  totals: {
    spend: number | null
    crmLeads: number
    metaLeads: number | null
    cplCrm: number | null
    sales: number
    revenue: number | null
    roas: number | null
    ctr: number | null
  }
  findings: Finding[]
  recommendations: Recommendation[]
  dataQuality: DataQualityIssue[]
  /** True when there is not enough data for any recommendation. */
  insufficient: boolean
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function ratio(num: number | null, den: number | null): number | null {
  if (num === null || den === null || !Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return null
  return num / den
}

function delta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null
  return (current - previous) / Math.abs(previous)
}

const money = (n: number) => `$${n.toFixed(2)}`
const pct = (n: number) => `${(n * 100).toFixed(0)}%`

/**
 * A lead belongs to a campaign when its Meta attribution matches the Meta
 * campaign id, or its local campaignId matches the link's local campaign.
 * Only leads already authorised for the viewer are ever passed in.
 */
export function leadsForCampaign(leads: Lead[], campaign: Pick<InsightsCampaign, "metaCampaignId" | "localCampaignId" | "workspaceId">): Lead[] {
  return leads.filter(
    (l) =>
      l.archived !== true &&
      l.workspaceId === campaign.workspaceId &&
      (l.attribution?.externalCampaignId === campaign.metaCampaignId ||
        (campaign.localCampaignId !== null && l.campaignId === campaign.localCampaignId)),
  )
}

/** Sales closed INSIDE the period, by `closedAt`. */
function salesInPeriod(leads: Lead[], period: Period): Lead[] {
  return leads.filter(
    (l) => leadTypeOf(l) === "sales" && l.stage === "sale" && withinPeriod(l.closedAt, period),
  )
}

/** Sum of CONFIRMED closed amounts; null when no closed sale carries one. */
function revenueOf(sales: Lead[]): number | null {
  const withAmount = sales.filter(hasClosedAmount)
  return withAmount.length > 0 ? withAmount.reduce((s, l) => s + (l.closedValue ?? 0), 0) : null
}

/* -------------------------------------------------------------------------- */
/*  Health classification — explicit rules, no external benchmarks            */
/* -------------------------------------------------------------------------- */

/**
 * Rules (documented, relative to the SAME workspace's campaigns — the
 * benchmark passed in is always built from that workspace alone, so a super
 * admin viewing every workspace never mixes distributors):
 *   insufficient → spend < $1 or impressions < 100 (nothing to judge)
 *   critical     → spend ≥ $50 and zero CRM leads,
 *                  or CPL CRM ≥ 2× the workspace average (with ≥ 3 leads)
 *   attention    → CPL CRM ≥ 1.3× average, or CTR ≤ 0.7× average CTR,
 *                  or leads but zero sales with spend ≥ $100
 *   excellent    → ROAS ≥ 2, or CPL CRM ≤ 0.7× average with ≥ 3 leads
 *   healthy      → everything else
 */
export function classifyHealth(
  c: Pick<CampaignMetrics, "spend" | "impressions" | "crmLeads" | "cplCrm" | "ctr" | "sales" | "roas">,
  avg: { cplCrm: number | null; ctr: number | null },
): Health {
  if (c.spend === null || c.spend < 1 || c.impressions === null || c.impressions < 100) return "insufficient"
  if (c.spend >= 50 && c.crmLeads === 0) return "critical"
  if (avg.cplCrm !== null && c.cplCrm !== null && c.crmLeads >= 3 && c.cplCrm >= avg.cplCrm * 2) return "critical"
  if (c.roas !== null && c.roas >= 2) return "excellent"
  if (avg.cplCrm !== null && c.cplCrm !== null && c.crmLeads >= 3 && c.cplCrm <= avg.cplCrm * 0.7) return "excellent"
  if (avg.cplCrm !== null && c.cplCrm !== null && c.cplCrm >= avg.cplCrm * 1.3) return "attention"
  if (avg.ctr !== null && c.ctr !== null && c.ctr <= avg.ctr * 0.7) return "attention"
  if (c.crmLeads > 0 && c.sales === 0 && c.spend >= 100) return "attention"
  return "healthy"
}

/* -------------------------------------------------------------------------- */
/*  Main                                                                       */
/* -------------------------------------------------------------------------- */

export function analyzeCampaignPerformance(
  insights: InsightsCampaign[],
  leads: Lead[],
  options: { period: Period; linkedWithoutData?: number },
): Analysis {
  const { period } = options
  const active = leads.filter((l) => l.archived !== true)

  // 1. Per-campaign metrics. CRM leads are counted by `createdAt` inside the
  // period; sales and revenue by `closedAt` — the same rule as Phase F.
  const base = insights.map((c) => {
    const matched = leadsForCampaign(active, c)
    const crm = matched.filter((l) => withinPeriod(l.createdAt, period))
    const closed = salesInPeriod(matched, period)
    return { c, matched, crm, sales: closed.length, revenue: revenueOf(closed) }
  })

  // 2. Benchmarks PER WORKSPACE. A campaign is only ever compared with
  // campaigns of its own workspaceId: with "Todos los workspaces" selected,
  // one distributor's CPL must not shift another's classification.
  const benchmarks = new Map<string, { cplCrm: number | null; ctr: number | null }>()
  for (const workspaceId of new Set(base.map((b) => b.c.workspaceId))) {
    const rows = base.filter((b) => b.c.workspaceId === workspaceId)
    const withCpl = rows.filter((b) => b.c.spend !== null && b.c.spend > 0 && b.crm.length > 0)
    const withCtr = rows.filter((b) => b.c.ctr !== null)
    benchmarks.set(workspaceId, {
      cplCrm: withCpl.length > 0 ? withCpl.reduce((s, b) => s + (b.c.spend as number) / b.crm.length, 0) / withCpl.length : null,
      ctr: withCtr.length > 0 ? withCtr.reduce((s, b) => s + (b.c.ctr as number), 0) / withCtr.length : null,
    })
  }
  const benchmarkFor = (workspaceId: string) => benchmarks.get(workspaceId) ?? { cplCrm: null, ctr: null }
  /** Campaigns of the same workspace, for share-of-spend style findings. */
  const peersOf = (workspaceId: string) => base.filter((b) => b.c.workspaceId === workspaceId)

  const campaigns: CampaignMetrics[] = base.map(({ c, crm, sales, revenue }) => {
    const cplCrm = ratio(c.spend, crm.length)
    const roas = ratio(revenue, c.spend)
    const metrics: CampaignMetrics = {
      metaCampaignId: c.metaCampaignId,
      name: c.campaignName ?? c.metaCampaignId,
      workspaceId: c.workspaceId,
      objective: c.objective,
      spend: c.spend,
      impressions: c.impressions,
      reach: c.reach,
      frequency: c.frequency,
      clicks: c.clicks,
      ctr: c.ctr,
      cpc: c.cpc,
      cpm: c.cpm,
      metaLeads: c.metaLeads,
      cplMeta: ratio(c.spend, c.metaLeads),
      crmLeads: crm.length,
      cplCrm,
      sales,
      revenue,
      roas,
      leadToSaleRate: ratio(sales, crm.length),
      health: "healthy",
      previous: c.previous
        ? {
            spend: c.previous.spend,
            crmLeads: 0,
            cplCrm: null,
            ctr: c.previous.ctr,
            sales: 0,
            revenue: null,
            roas: null,
          }
        : null,
      deltas: null,
    }
    metrics.health = classifyHealth(metrics, benchmarkFor(c.workspaceId))
    if (c.previous) {
      // V1 compares what Meta gives for both windows (spend, CTR). CRM-side
      // deltas need leads of the previous window, which the client does not
      // re-query yet: they stay null rather than being guessed.
      metrics.deltas = {
        spend: delta(c.spend, c.previous.spend),
        ctr: delta(c.ctr, c.previous.ctr),
        crmLeads: null,
        cplCrm: null,
        sales: null,
        revenue: null,
        roas: null,
      }
    }
    return metrics
  })

  // 2. Totals.
  const spendKnown = campaigns.filter((c) => c.spend !== null)
  const totalSpend = spendKnown.length > 0 ? spendKnown.reduce((s, c) => s + (c.spend as number), 0) : null
  const totalCrm = campaigns.reduce((s, c) => s + c.crmLeads, 0)
  const metaKnown = campaigns.filter((c) => c.metaLeads !== null)
  const totalMeta = metaKnown.length > 0 ? metaKnown.reduce((s, c) => s + (c.metaLeads as number), 0) : null
  const totalSales = campaigns.reduce((s, c) => s + c.sales, 0)
  const revKnown = campaigns.filter((c) => c.revenue !== null)
  const totalRevenue = revKnown.length > 0 ? revKnown.reduce((s, c) => s + (c.revenue as number), 0) : null
  const clicksKnown = campaigns.filter((c) => c.clicks !== null && c.impressions !== null)
  const totalCtr =
    clicksKnown.length > 0
      ? ratio(
          clicksKnown.reduce((s, c) => s + (c.clicks as number), 0),
          clicksKnown.reduce((s, c) => s + (c.impressions as number), 0),
        )
      : null

  // 3. Findings & recommendations.
  const findings: Finding[] = []
  const recommendations: Recommendation[] = []
  const judged = campaigns.filter((c) => c.health !== "insufficient")

  for (const c of campaigns) {
    // Every comparison below is against this campaign's OWN workspace.
    const { cplCrm: avgCpl, ctr: avgCtr } = benchmarkFor(c.workspaceId)
    const peers = peersOf(c.workspaceId)
    const peerSpend = peers.filter((b) => b.c.spend !== null).reduce((s, b) => s + (b.c.spend as number), 0)
    const peerCrm = peers.reduce((s, b) => s + b.crm.length, 0)
    const peerJudged = campaigns.filter((x) => x.workspaceId === c.workspaceId && x.health !== "insufficient")
    if (c.health === "insufficient") {
      findings.push({ category: "data_quality", metaCampaignId: c.metaCampaignId, campaignName: c.name, observation: "No hay suficientes datos para evaluar esta campaña.", evidence: `Inversión ${c.spend === null ? "sin datos" : money(c.spend)}, impresiones ${c.impressions ?? "sin datos"}.` })
      continue
    }
    // Spend share vs lead share.
    if (peerSpend > 0 && peerCrm > 0 && c.spend !== null) {
      const spendShare = c.spend / peerSpend
      const leadShare = c.crmLeads / peerCrm
      if (spendShare >= 0.4 && leadShare <= spendShare * 0.5) {
        findings.push({ category: "cost", metaCampaignId: c.metaCampaignId, campaignName: c.name, observation: `Esta campaña concentra el ${pct(spendShare)} del gasto pero solo genera el ${pct(leadShare)} de los prospectos CRM.`, evidence: `${money(c.spend)} de ${money(peerSpend)} · ${c.crmLeads} de ${peerCrm} prospectos.` })
        recommendations.push({ priority: "high", metaCampaignId: c.metaCampaignId, campaignName: c.name, finding: "Gasto desproporcionado frente a los prospectos que genera.", evidence: `${pct(spendShare)} del gasto, ${pct(leadShare)} de los prospectos CRM.`, recommendation: "Revisar primero anuncio, audiencia y formulario antes de mantener o aumentar el presupuesto.", expectedImpact: "Reducir el costo por prospecto del workspace.", confidence: peerCrm >= 10 ? "medium" : "low" })
      }
    }
    // CPL vs workspace average.
    if (avgCpl !== null && c.cplCrm !== null && peerJudged.length >= 2 && c.crmLeads >= 3) {
      const rel = c.cplCrm / avgCpl
      if (rel >= 1.3) {
        findings.push({ category: "cost", metaCampaignId: c.metaCampaignId, campaignName: c.name, observation: `CPL CRM ${pct(rel - 1)} superior al promedio del workspace.`, evidence: `${money(c.cplCrm)} vs ${money(avgCpl)} promedio.` })
        recommendations.push({ priority: rel >= 2 ? "high" : "medium", metaCampaignId: c.metaCampaignId, campaignName: c.name, finding: `CPL CRM ${pct(rel - 1)} superior al promedio del workspace.`, evidence: `${money(c.cplCrm)} vs ${money(avgCpl)} promedio.`, recommendation: "Revisar anuncio, audiencia y formulario antes de aumentar presupuesto.", expectedImpact: "Acercar el CPL al promedio del workspace.", confidence: c.crmLeads >= 10 ? "high" : "medium" })
      } else if (rel <= 0.7) {
        findings.push({ category: "cost", metaCampaignId: c.metaCampaignId, campaignName: c.name, observation: `CPL CRM ${pct(1 - rel)} inferior al promedio del workspace.`, evidence: `${money(c.cplCrm)} vs ${money(avgCpl)} promedio.` })
        recommendations.push({ priority: "medium", metaCampaignId: c.metaCampaignId, campaignName: c.name, finding: "Genera prospectos más baratos que el resto.", evidence: `${money(c.cplCrm)} vs ${money(avgCpl)} promedio.`, recommendation: "Candidata a recibir más presupuesto de forma gradual, vigilando que el CPL se mantenga.", expectedImpact: "Más prospectos al mismo costo promedio.", confidence: c.crmLeads >= 10 ? "medium" : "low" })
      }
    }
    // CTR vs average.
    if (avgCtr !== null && c.ctr !== null && peerJudged.length >= 2 && c.ctr <= avgCtr * 0.7) {
      findings.push({ category: "engagement", metaCampaignId: c.metaCampaignId, campaignName: c.name, observation: "El CTR es inferior al resto de tus campañas.", evidence: `${c.ctr.toFixed(2)}% vs ${avgCtr.toFixed(2)}% promedio.` })
      recommendations.push({ priority: "medium", metaCampaignId: c.metaCampaignId, campaignName: c.name, finding: "CTR por debajo del resto de campañas.", evidence: `${c.ctr.toFixed(2)}% vs ${avgCtr.toFixed(2)}%.`, recommendation: "Conviene revisar creativo, copy, audiencia o ubicación; los datos no indican cuál de ellos.", expectedImpact: "Mejorar el interés del anuncio y abaratar clics.", confidence: "medium" })
    }
    // Good CTR, weak lead conversion.
    if (avgCtr !== null && c.ctr !== null && c.ctr >= avgCtr && c.clicks !== null && c.clicks >= 50 && c.crmLeads === 0) {
      findings.push({ category: "lead_generation", metaCampaignId: c.metaCampaignId, campaignName: c.name, observation: "CTR saludable pero ningún prospecto llegó al CRM.", evidence: `${c.clicks} clics, 0 prospectos CRM.` })
      recommendations.push({ priority: "high", metaCampaignId: c.metaCampaignId, campaignName: c.name, finding: "Los clics no se convierten en prospectos.", evidence: `${c.clicks} clics, 0 prospectos CRM${c.metaLeads !== null ? `, ${c.metaLeads} leads según Meta` : ""}.`, recommendation: c.metaLeads !== null && c.metaLeads > 0 ? "Meta sí reporta leads: revisar la conexión del formulario con Royal Sales IA (webhook / atribución)." : "Revisar el formulario o la página de destino antes de invertir más.", expectedImpact: "Recuperar prospectos que hoy se pierden entre el clic y el CRM.", confidence: "medium" })
    }
    // Leads but no sales.
    if (c.crmLeads >= 5 && c.sales === 0) {
      findings.push({ category: "conversion", metaCampaignId: c.metaCampaignId, campaignName: c.name, observation: "Buena generación de prospectos pero ninguna venta registrada.", evidence: `${c.crmLeads} prospectos CRM, 0 ventas en el periodo.` })
      recommendations.push({ priority: "medium", metaCampaignId: c.metaCampaignId, campaignName: c.name, finding: "Prospectos sin cierre.", evidence: `${c.crmLeads} prospectos, 0 ventas.`, recommendation: "Revisar el seguimiento comercial de estos prospectos antes de juzgar la campaña: el problema puede estar en el embudo, no en el anuncio.", expectedImpact: "Convertir prospectos ya pagados en ventas.", confidence: "medium" })
    }
    // ROAS.
    if (c.roas !== null && c.roas >= 1 && c.sales <= 2) {
      findings.push({ category: "revenue", metaCampaignId: c.metaCampaignId, campaignName: c.name, observation: "ROAS positivo con volumen limitado.", evidence: `ROAS ${c.roas.toFixed(2)}x sobre ${c.sales} venta(s).` })
    }
    // Period deltas (Meta side only in V1).
    if (c.deltas?.spend !== null && c.deltas?.spend !== undefined && Math.abs(c.deltas.spend) >= 0.3) {
      findings.push({ category: "delivery", metaCampaignId: c.metaCampaignId, campaignName: c.name, observation: `La inversión ${c.deltas.spend > 0 ? "aumentó" : "bajó"} ${pct(Math.abs(c.deltas.spend))} frente al periodo anterior.`, evidence: `${money(c.spend ?? 0)} vs ${money(c.previous?.spend ?? 0)}.` })
    }
    if (c.deltas?.ctr !== null && c.deltas?.ctr !== undefined && c.deltas.ctr <= -0.25) {
      findings.push({ category: "engagement", metaCampaignId: c.metaCampaignId, campaignName: c.name, observation: `El CTR cayó ${pct(Math.abs(c.deltas.ctr))} frente al periodo anterior.`, evidence: `${(c.ctr ?? 0).toFixed(2)}% vs ${(c.previous?.ctr ?? 0).toFixed(2)}%.` })
    }
  }

  // 4. Data quality.
  // Data quality is judged INSIDE the period too: a lead from another window
  // must not be reported as an anomaly against today's insights.
  const leadsInPeriod = active.filter((l) => withinPeriod(l.createdAt, period))
  const dataQuality: DataQualityIssue[] = []
  const noCrm = campaigns.filter((c) => c.spend !== null && c.spend > 0 && c.crmLeads === 0)
  if (noCrm.length > 0) dataQuality.push({ kind: "campaign_without_crm_leads", count: noCrm.length, detail: noCrm.map((c) => c.name).join(", ") })
  const gaps = campaigns.filter((c) => c.metaLeads !== null && c.metaLeads > 0 && Math.abs(c.metaLeads - c.crmLeads) / c.metaLeads >= 0.25)
  if (gaps.length > 0) dataQuality.push({ kind: "meta_vs_crm_gap", count: gaps.length, detail: gaps.map((c) => `${c.name}: Meta ${c.metaLeads} · CRM ${c.crmLeads}`).join(" · ") })
  const knownIds = new Set(campaigns.map((c) => c.metaCampaignId))
  const orphanExternal = leadsInPeriod.filter((l) => l.attribution?.externalCampaignId && !knownIds.has(l.attribution.externalCampaignId))
  if (orphanExternal.length > 0) dataQuality.push({ kind: "crm_leads_without_insights", count: orphanExternal.length, detail: `${orphanExternal.length} prospecto(s) con campaña de Meta sin datos de Insights en este periodo.` })
  const noCampaign = leadsInPeriod.filter((l) => !l.campaignId && !l.attribution?.externalCampaignId)
  if (noCampaign.length > 0) dataQuality.push({ kind: "leads_without_campaign", count: noCampaign.length, detail: `${noCampaign.length} prospecto(s) sin campaña ni atribución.` })
  if ((options.linkedWithoutData ?? 0) > 0) dataQuality.push({ kind: "linked_without_data", count: options.linkedWithoutData as number, detail: `${options.linkedWithoutData} campaña(s) asignadas sin datos de Meta en este periodo.` })

  const insufficient = judged.length === 0
  if (insufficient && campaigns.length > 0) {
    recommendations.push({ priority: "low", metaCampaignId: null, campaignName: null, finding: "No hay suficientes datos para recomendar cambios.", evidence: `${campaigns.length} campaña(s) con inversión o impresiones mínimas.`, recommendation: "Esperar a acumular al menos $50 de inversión y 100 impresiones por campaña.", expectedImpact: "Evitar decisiones sobre ruido estadístico.", confidence: "high" })
  }

  const order: Record<Priority, number> = { high: 0, medium: 1, low: 2 }
  recommendations.sort((a, b) => order[a.priority] - order[b.priority])

  return {
    campaigns: campaigns.sort((a, b) => (b.spend ?? -1) - (a.spend ?? -1)),
    totals: { spend: totalSpend, crmLeads: totalCrm, metaLeads: totalMeta, cplCrm: ratio(totalSpend, totalCrm), sales: totalSales, revenue: totalRevenue, roas: ratio(totalRevenue, totalSpend), ctr: totalCtr === null ? null : totalCtr * 100 },
    findings,
    recommendations,
    dataQuality,
    insufficient,
  }
}
