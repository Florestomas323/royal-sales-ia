import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/firebase/admin"
import { authenticateRequest } from "@/lib/firebase/server-auth"
import { listCampaignLinks } from "@/lib/meta/campaign-links"
import { readMetaConnection } from "@/lib/meta/connection-store"
import { getCampaignInsights, type GraphAction, type GraphFailure } from "@/lib/meta/graph"
import { META_LEAD_ACTION_TYPES, normalizeInsight, periodRanges, type InsightsPeriod } from "@/lib/meta/insights"

/**
 * GET /api/meta/insights/diagnostics?workspaceId=<id|all>&period=<today|7d|30d|month|all>
 *
 * DIAGNÓSTICO TEMPORAL — SOLO LECTURA. No cambia ninguna métrica ni el
 * comportamiento de Media Buyer IA: expone tal cual llega el array `actions`
 * de Meta Insights por campaña, para poder comprobar si una misma conversión
 * está siendo reportada bajo varios action_type y por lo tanto sumada varias
 * veces en `metaLeads`.
 *
 * El cálculo actual se obtiene llamando a la MISMA función de producción
 * (`normalizeInsight`), de modo que lo que se ve aquí es exactamente lo que
 * ve Media Buyer IA, sin reimplementarlo.
 *
 * Seguridad: solo `super_admin`. Nunca devuelve tokens, secretos ni
 * credenciales: únicamente campos públicos de Insights (ids, nombres, spend,
 * actions y cost_per_action_type).
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const PERIODS: InsightsPeriod[] = ["today", "7d", "30d", "month", "all"]
const LEAD_TYPES: readonly string[] = META_LEAD_ACTION_TYPES

interface ActionRow {
  action_type: string
  value: string
  /** Valor numérico tal cual lo interpretaría el código actual. */
  valueNumber: number | null
  /** true si HOY este action_type entra en el cálculo de "Leads Meta". */
  usadoComoLead: boolean
}

interface CampaignDiagnostic {
  campaign_id: string
  campaign_name: string | null
  workspaceId: string
  objective: string
  spend: number | null
  date_start: string
  date_stop: string
  /** Array `actions` COMPLETO tal cual lo devuelve Meta, sin filtrar. */
  actionsRaw: GraphAction[]
  /** Igual que el anterior, pero marcando cuáles cuentan como lead hoy. */
  actionsIndexadas: ActionRow[]
  /** `cost_per_action_type` crudo, útil para cruzar valores. */
  costPerActionTypeRaw: GraphAction[]
  /** Solo los action_type de lead presentes en esta campaña. */
  leadActionTypesPresentes: string[]
  /** Valor de cada action_type de lead presente. */
  desgloseLeads: Record<string, number | null>
  /** EXACTAMENTE lo que Media Buyer IA muestra hoy. */
  calculoActualLeadsMeta: number | null
  /** Qué action_type produjo el valor anterior. */
  fuenteDelCalculo: string | null
  /** El mayor de los valores individuales de lead (referencia, NO aplicado). */
  maxIndividual: number | null
  /** true cuando coexisten 2+ action_type de lead en la misma fila. */
  sospechaDuplicacion: boolean
  notaDuplicacion: string | null
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

function num(value: string | undefined): number | null {
  if (value === undefined || value === null || value === "") return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  // Vuelca datos crudos de toda la cuenta publicitaria: solo super_admin.
  if (auth.user.membership.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const url = new URL(request.url)
  const requested = url.searchParams.get("workspaceId")?.trim() || ""
  const periodParam = url.searchParams.get("period")?.trim() as InsightsPeriod
  const period: InsightsPeriod = PERIODS.includes(periodParam) ? periodParam : "30d"
  const scope: string | null = requested === "all" || requested === "" ? null : requested

  const db = getAdminDb()
  const links = (await listCampaignLinks(db, scope)).filter((l) => l.active)
  const ranges = periodRanges(period)
  const generatedAt = new Date().toISOString()

  const base = {
    ok: true as boolean,
    diagnostico: "meta_insights_actions",
    soloLectura: true,
    generatedAt,
    period,
    range: ranges.current,
    scope: scope ?? "all",
    actionTypesUsadosHoyComoLead: [...META_LEAD_ACTION_TYPES],
    formulaActual:
      "metaLeads = si existe `lead`, se usa SOLO ese valor; si no, se usa el mayor alias on-Facebook + el Pixel. Nunca la suma de los 4 (lib/meta/insights.ts).",
    errorCode: null as string | null,
    message: null as string | null,
  }

  if (links.length === 0) {
    return NextResponse.json({
      ...base,
      resumen: null,
      campanas: [],
      campanasVinculadasSinDatos: [],
      campanasSinVincularConDatos: 0,
      message: "No hay campañas vinculadas activas para este alcance.",
    })
  }

  // Una cuenta publicitaria por conexión de workspace: agrupamos los links
  // por cuenta para pedir Insights una sola vez por cuenta.
  const byAccount = new Map<string, typeof links>()
  const workspacesSinCuenta: string[] = []
  for (const ws of new Set(links.map((l) => l.workspaceId))) {
    const conn = await readMetaConnection(db, ws)
    const accountId = conn?.adAccount?.id ?? null
    if (!accountId) {
      workspacesSinCuenta.push(ws)
      continue
    }
    byAccount.set(accountId, [...(byAccount.get(accountId) ?? []), ...links.filter((l) => l.workspaceId === ws)])
  }

  if (byAccount.size === 0) {
    return NextResponse.json({
      ...base,
      ok: false,
      resumen: null,
      campanas: [],
      campanasVinculadasSinDatos: [],
      campanasSinVincularConDatos: 0,
      errorCode: "no_ad_account",
      message: "Ningún workspace tiene cuenta publicitaria seleccionada en Administrar Meta.",
    })
  }

  const campanas: CampaignDiagnostic[] = []
  const campanasVinculadasSinDatos: { campaign_id: string; campaign_name: string | null; workspaceId: string }[] = []
  let campanasSinVincularConDatos = 0

  for (const [accountId, accountLinks] of byAccount) {
    const current = await getCampaignInsights(accountId, ranges.current)
    if (!current.ok) {
      console.warn(`[meta/insights/diagnostics] ${accountId}: ${current.kind} ${current.detail}`)
      return NextResponse.json({
        ...base,
        ok: false,
        resumen: null,
        campanas: [],
        campanasVinculadasSinDatos: [],
        campanasSinVincularConDatos: 0,
        errorCode: current.kind,
        message: friendly(current),
      })
    }

    const linkById = new Map(accountLinks.map((l) => [l.metaCampaignId, l]))
    const seen = new Set<string>()

    for (const row of current.data.data ?? []) {
      const link = linkById.get(row.campaign_id)
      if (!link) {
        campanasSinVincularConDatos += 1
        continue
      }
      seen.add(row.campaign_id)

      const actionsRaw = row.actions ?? []
      const actionsIndexadas: ActionRow[] = actionsRaw.map((a) => ({
        action_type: a.action_type,
        value: a.value,
        valueNumber: num(a.value),
        usadoComoLead: LEAD_TYPES.includes(a.action_type),
      }))

      const leadRows = actionsIndexadas.filter((a) => a.usadoComoLead)
      const desgloseLeads: Record<string, number | null> = {}
      for (const a of leadRows) desgloseLeads[a.action_type] = a.valueNumber

      const valores = leadRows.map((a) => a.valueNumber ?? 0)
      const maxIndividual = valores.length > 0 ? Math.max(...valores) : null
      // Fuente de verdad del "hoy": la MISMA función que usa producción.
      const normalizado = normalizeInsight(row)
      const calculoActualLeadsMeta = normalizado.metaLeads
      const sospechaDuplicacion = leadRows.length > 1

      campanas.push({
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name ?? null,
        workspaceId: link.workspaceId,
        objective: link.objective,
        spend: num(row.spend),
        date_start: row.date_start,
        date_stop: row.date_stop,
        actionsRaw,
        actionsIndexadas,
        costPerActionTypeRaw: row.cost_per_action_type ?? [],
        leadActionTypesPresentes: leadRows.map((a) => a.action_type),
        desgloseLeads,
        calculoActualLeadsMeta,
        fuenteDelCalculo: normalizado.metaLeadsSource,
        maxIndividual,
        sospechaDuplicacion,
        notaDuplicacion: sospechaDuplicacion
          ? `Coexisten ${leadRows.length} action_type de lead. Suma actual = ${calculoActualLeadsMeta ?? 0}; mayor valor individual = ${maxIndividual ?? 0}.`
          : null,
      })
    }

    for (const link of accountLinks) {
      if (!seen.has(link.metaCampaignId)) {
        campanasVinculadasSinDatos.push({
          campaign_id: link.metaCampaignId,
          campaign_name: link.metaCampaignName,
          workspaceId: link.workspaceId,
        })
      }
    }
  }

  // Totales por action_type: permiten comparar, SIN aplicar nada, cuánto
  // daría cada hipótesis frente al cálculo actual.
  const totalesPorActionTypeDeLead: Record<string, number> = {}
  for (const t of META_LEAD_ACTION_TYPES) {
    let total = 0
    let presente = false
    for (const c of campanas) {
      const v = c.desgloseLeads[t]
      if (v !== undefined && v !== null) {
        total += v
        presente = true
      }
    }
    if (presente) totalesPorActionTypeDeLead[t] = total
  }

  const resumen = {
    campanasConDatos: campanas.length,
    spendTotal: campanas.reduce((s, c) => s + (c.spend ?? 0), 0),
    leadsMetaCalculoActualTotal: campanas.reduce((s, c) => s + (c.calculoActualLeadsMeta ?? 0), 0),
    sumaDeMaximosIndividuales: campanas.reduce((s, c) => s + (c.maxIndividual ?? 0), 0),
    totalesPorActionTypeDeLead,
    campanasConSospechaDeDuplicacion: campanas.filter((c) => c.sospechaDuplicacion).map((c) => c.campaign_id),
    workspacesSinCuentaPublicitaria: workspacesSinCuenta.length,
  }

  console.info(
    `[meta/insights/diagnostics] scope=${scope ?? "all"} period=${period} campanas=${campanas.length} sospechosas=${resumen.campanasConSospechaDeDuplicacion.length}`,
  )

  return NextResponse.json({
    ...base,
    resumen,
    campanas,
    campanasVinculadasSinDatos,
    campanasSinVincularConDatos,
  })
}
