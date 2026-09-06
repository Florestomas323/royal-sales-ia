import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/firebase/admin"
import { authenticateRequest, canAccessWorkspace } from "@/lib/firebase/server-auth"
import { listCampaignLinks } from "@/lib/meta/campaign-links"
import { readMetaConnection } from "@/lib/meta/connection-store"
import { getCampaignInsights, type GraphFailure } from "@/lib/meta/graph"
import { normalizeInsight, periodRanges, type CampaignInsight, type InsightsPeriod } from "@/lib/meta/insights"
import type { LeadType, UserRole } from "@/types"

/**
 * GET /api/meta/insights?workspaceId=<id|all>&period=<today|7d|30d|month|all>
 *
 * READ-ONLY. Returns Meta campaign insights for the current period and the
 * equivalent previous one, restricted to campaigns LINKED to the requested
 * workspace(s) via `metaCampaignLinks`. Nothing here can write to Meta.
 *
 * Tenancy: the workspace is validated against `memberships/{uid}`; a member
 * can only read their own workspace, super_admin any or all. Insights of a
 * campaign are only returned if a link ties it to an authorised workspace —
 * so even though one ad account may host several distributors' campaigns,
 * nobody sees spend that is not theirs.
 *
 * Media Buyer is an administrative view: sales_rep and viewer are denied.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const ANALYST_ROLES: UserRole[] = ["super_admin", "client_admin", "manager"]
const PERIODS: InsightsPeriod[] = ["today", "7d", "30d", "month", "all"]

export interface InsightsCampaign extends CampaignInsight {
  workspaceId: string
  objective: LeadType
  /** Local Royal Sales IA campaign id from the link, for CRM matching. */
  localCampaignId: string | null
  previous: CampaignInsight | null
}

export interface InsightsResponse {
  ok: boolean
  period: InsightsPeriod
  range: { since: string; until: string }
  previousRange: { since: string; until: string } | null
  campaigns: InsightsCampaign[]
  /** Linked campaigns that Meta returned no row for in this period. */
  linkedWithoutData: { metaCampaignId: string; name: string | null; workspaceId: string; objective: LeadType }[]
  /** Meta campaigns with data in the ad account but no workspace link (reported, never shown with numbers). */
  unlinkedCount: number
  fetchedAt: string
  errorCode: string | null
  message: string | null
}

function friendly(f: GraphFailure): string {
  switch (f.kind) {
    case "not_configured": return "El token de Meta no está configurado en el servidor."
    case "auth": return "El token de Meta expiró o no es válido."
    case "permission": return "El token de Meta no tiene permiso para leer insights (ads_read)."
    case "rate_limit": return "Meta limitó temporalmente las consultas. Inténtalo en unos minutos."
    case "not_found": return "La cuenta publicitaria no está disponible para este token."
    default: return "Error temporal de Meta. Inténtalo de nuevo."
  }
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!ANALYST_ROLES.includes(auth.user.membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const url = new URL(request.url)
  const requested = url.searchParams.get("workspaceId")?.trim() || ""
  const periodParam = url.searchParams.get("period")?.trim() as InsightsPeriod
  const period: InsightsPeriod = PERIODS.includes(periodParam) ? periodParam : "30d"

  const isSuperAdmin = auth.user.membership.role === "super_admin"
  // "all" is a super_admin-only scope. Everyone else may only name their own
  // workspace (or nothing); naming another one is an explicit 403, never a
  // silent fallback.
  let scope: string | null
  if (isSuperAdmin) {
    scope = requested === "all" || requested === "" ? null : requested
  } else {
    const own = auth.user.membership.workspaceId
    if (!own) return NextResponse.json({ error: "no_workspace" }, { status: 403 })
    if (requested !== "" && requested !== "all" && requested !== own) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }
    scope = own
  }
  if (scope && !canAccessWorkspace(auth.user, scope, false)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const db = getAdminDb()
  const links = (await listCampaignLinks(db, scope)).filter((l) => l.active)
  // Campaigns nobody has claimed are only counted for super_admin: a
  // distributor must not learn what else lives in the shared ad account.
  const knownEverywhere = isSuperAdmin
    ? new Set((await listCampaignLinks(db, null)).map((l) => l.metaCampaignId))
    : null
  const ranges = periodRanges(period)
  const fetchedAt = new Date().toISOString()

  const base = { ok: true, period, range: ranges.current, previousRange: ranges.previous, fetchedAt, errorCode: null, message: null }
  if (links.length === 0) {
    const body: InsightsResponse = { ...base, campaigns: [], linkedWithoutData: [], unlinkedCount: 0 }
    return NextResponse.json(body)
  }

  // One ad account per workspace connection; group links by the account
  // their workspace uses so a single Insights call covers each account.
  const byAccount = new Map<string, typeof links>()
  const missingAccount: string[] = []
  for (const ws of new Set(links.map((l) => l.workspaceId))) {
    const conn = await readMetaConnection(db, ws)
    const accountId = conn?.adAccount?.id ?? null
    if (!accountId) {
      missingAccount.push(ws)
      continue
    }
    byAccount.set(accountId, [...(byAccount.get(accountId) ?? []), ...links.filter((l) => l.workspaceId === ws)])
  }
  if (byAccount.size === 0) {
    const body: InsightsResponse = {
      ...base, ok: false, campaigns: [], linkedWithoutData: [], unlinkedCount: 0,
      errorCode: "no_ad_account", message: "Ningún workspace tiene cuenta publicitaria seleccionada en Administrar Meta.",
    }
    return NextResponse.json(body)
  }

  const campaigns: InsightsCampaign[] = []
  const linkedWithoutData: InsightsResponse["linkedWithoutData"] = []
  let unlinkedCount = 0

  for (const [accountId, accountLinks] of byAccount) {
    const current = await getCampaignInsights(accountId, ranges.current)
    if (!current.ok) {
      console.warn(`[meta/insights] ${accountId} current: ${current.kind} ${current.detail}`)
      const body: InsightsResponse = {
        ...base, ok: false, campaigns: [], linkedWithoutData: [], unlinkedCount: 0,
        errorCode: current.kind, message: friendly(current),
      }
      return NextResponse.json(body)
    }
    const previous = ranges.previous ? await getCampaignInsights(accountId, ranges.previous) : null
    if (previous && !previous.ok) {
      // A failed comparison never hides the current data; deltas just stay empty.
      console.warn(`[meta/insights] ${accountId} previous: ${previous.kind} ${previous.detail}`)
    }
    const prevRows = new Map<string, CampaignInsight>()
    if (previous && previous.ok) for (const r of previous.data.data ?? []) prevRows.set(r.campaign_id, normalizeInsight(r))

    const linkById = new Map(accountLinks.map((l) => [l.metaCampaignId, l]))
    const seen = new Set<string>()
    for (const row of current.data.data ?? []) {
      const link = linkById.get(row.campaign_id)
      if (!link) {
        // Exists in the account but is not this scope's: never exposed.
        if (knownEverywhere && !knownEverywhere.has(row.campaign_id)) unlinkedCount += 1
        continue
      }
      seen.add(row.campaign_id)
      campaigns.push({
        ...normalizeInsight(row),
        workspaceId: link.workspaceId,
        objective: link.objective,
        localCampaignId: link.campaignId,
        previous: prevRows.get(row.campaign_id) ?? null,
      })
    }
    for (const link of accountLinks) {
      if (!seen.has(link.metaCampaignId)) {
        linkedWithoutData.push({ metaCampaignId: link.metaCampaignId, name: link.metaCampaignName, workspaceId: link.workspaceId, objective: link.objective })
      }
    }
  }

  console.info(`[meta/insights] scope=${scope ?? "all"} period=${period} campaigns=${campaigns.length} unlinked=${unlinkedCount} noData=${linkedWithoutData.length}`)
  const body: InsightsResponse = {
    ...base,
    campaigns,
    linkedWithoutData,
    unlinkedCount,
    message: missingAccount.length > 0 ? `Sin cuenta publicitaria seleccionada en ${missingAccount.length} workspace(s).` : null,
  }
  return NextResponse.json(body)
}
