import type {
  MetaAdAccountRef,
  MetaAssetRef,
  MetaCampaignSummary,
  MetaCapabilities,
  MetaLeadAdsStatus,
  MetaLeadFormRef,
  MetaResourceStatus,
  MetaSyncReport,
} from "@/types"
import {
  getAdAccounts,
  getBusinessPages,
  getBusinesses,
  getCampaigns,
  getLeadForms,
  getMe,
  getMyPages,
  getPermissions,
  type GraphFailure,
} from "./graph"

/**
 * SERVER-ONLY. Reads everything the current META_ACCESS_TOKEN can see and
 * returns a structured, honest picture. Nothing is hardcoded; missing scopes
 * are reported, never assumed.
 */

/** Scopes needed to list Lead Ads forms and later download leads. */
export const LEAD_ADS_SCOPES = ["leads_retrieval", "pages_show_list", "pages_manage_ads"] as const

export interface MetaInventory {
  account: MetaAssetRef
  permissions: string[]
  capabilities: MetaCapabilities
  businesses: MetaAssetRef[]
  adAccounts: MetaAdAccountRef[]
  pages: MetaAssetRef[]
  /** Campaigns of `campaignsFor` (an ad account id) or [] when none was selected. */
  campaigns: MetaCampaignSummary[]
  campaignsFor: string | null
  campaignsError: string | null
  leadForms: MetaLeadFormRef[]
  leadAdsStatus: MetaLeadAdsStatus
  /** Per-resource outcome: a missing permission never fails the whole sync. */
  syncReport: MetaSyncReport
  missingPermissions: string[]
  /** Non-fatal problems encountered (safe strings, no secrets). */
  warnings: string[]
}

export type InventoryResult = { ok: true; inventory: MetaInventory } | { ok: false; failure: GraphFailure }

function capabilitiesFrom(granted: Set<string>): MetaCapabilities {
  return {
    adsRead: granted.has("ads_read") || granted.has("ads_management"),
    adsManagement: granted.has("ads_management"),
    businessManagement: granted.has("business_management"),
    leadsRetrieval: granted.has("leads_retrieval"),
    pagesAccess: granted.has("pages_show_list") || granted.has("pages_manage_ads"),
  }
}

function safeDetail(f: GraphFailure): string {
  return `${f.kind} (${f.detail})`
}

const ok = (count: number): MetaResourceStatus => ({ state: "ok", count, note: null })
const skipped = (note: string): MetaResourceStatus => ({ state: "skipped", count: 0, note })
const needsPermission = (scopes: string): MetaResourceStatus => ({
  state: "permission_required",
  count: 0,
  note: `Requiere ${scopes} en el token de Meta.`,
})
const failed = (note: string): MetaResourceStatus => ({ state: "error", count: 0, note })

/** Maps a Graph failure to a per-resource status without losing the reason. */
function statusFromFailure(f: GraphFailure, scopes: string): MetaResourceStatus {
  if (f.kind === "permission") return needsPermission(scopes)
  return failed(`Meta respondió ${f.kind}.`)
}

function summarizeCampaign(c: {
  id: string
  name?: string
  status?: string
  objective?: string
  effective_status?: string
  daily_budget?: string
  lifetime_budget?: string
  created_time?: string
  updated_time?: string
}): MetaCampaignSummary {
  return {
    id: c.id,
    name: c.name ?? c.id,
    status: c.status ?? null,
    objective: c.objective ?? null,
    effectiveStatus: c.effective_status ?? null,
    dailyBudget: c.daily_budget ?? null,
    lifetimeBudget: c.lifetime_budget ?? null,
    createdTime: c.created_time ?? null,
    updatedTime: c.updated_time ?? null,
  }
}

export interface InventoryOptions {
  /** Ad account to list campaigns for (with or without "act_"). */
  campaignsFor?: string | null
  /** Limit lead-form lookups to these page ids (default: all reachable pages, max 10). */
  pageIds?: string[]
}

export async function buildMetaInventory(options: InventoryOptions = {}): Promise<InventoryResult> {
  const warnings: string[] = []

  // 1. Token validity + identity.
  const me = await getMe()
  if (!me.ok) return { ok: false, failure: me }
  const account: MetaAssetRef = { id: me.data.id, name: me.data.name ?? me.data.id }

  // 2. Permissions (granted only).
  const granted = new Set<string>()
  const perms = await getPermissions()
  if (perms.ok) {
    for (const p of perms.data.data ?? []) if (p.status === "granted") granted.add(p.permission)
  } else {
    warnings.push(`permissions: ${safeDetail(perms)}`)
  }
  const capabilities = capabilitiesFrom(granted)

  const report: MetaSyncReport = {
    businesses: skipped("Sin consultar."),
    adAccounts: skipped("Sin consultar."),
    pages: skipped("Sin consultar."),
    campaigns: skipped("Selecciona una cuenta publicitaria."),
    leadForms: skipped("Sin consultar."),
    leadRetrieval: capabilities.leadsRetrieval
      ? ok(0)
      : needsPermission("leads_retrieval"),
  }

  // 3. Ad accounts.
  const adAccounts: MetaAdAccountRef[] = []
  const accounts = await getAdAccounts()
  if (accounts.ok) {
    for (const a of accounts.data.data ?? []) {
      adAccounts.push({
        id: a.id,
        accountId: a.account_id ?? a.id.replace(/^act_/, ""),
        name: a.name ?? a.id,
        status: typeof a.account_status === "number" ? a.account_status : null,
        currency: a.currency ?? null,
      })
    }
    report.adAccounts = ok(adAccounts.length)
  } else {
    warnings.push(`adaccounts: ${safeDetail(accounts)}`)
    report.adAccounts = statusFromFailure(accounts, "ads_read")
  }

  // 4. Pages: direct grant first, then via businesses (business_management).
  const pageMap = new Map<string, MetaAssetRef>()
  const businessList: MetaAssetRef[] = []
  let pagesFailure: GraphFailure | null = null
  const myPages = await getMyPages()
  if (myPages.ok) {
    for (const p of myPages.data.data ?? []) pageMap.set(p.id, { id: p.id, name: p.name ?? p.id })
  } else {
    pagesFailure = myPages
    if (myPages.kind !== "permission") warnings.push(`pages: ${safeDetail(myPages)}`)
  }
  if (!capabilities.businessManagement) {
    report.businesses = needsPermission("business_management")
  } else {
    const businesses = await getBusinesses()
    if (businesses.ok) {
      for (const b of businesses.data.data ?? []) {
        businessList.push({ id: b.id, name: b.name ?? b.id })
        for (const edge of ["owned_pages", "client_pages"] as const) {
          const res = await getBusinessPages(b.id, edge)
          if (res.ok) {
            for (const p of res.data.data ?? []) pageMap.set(p.id, { id: p.id, name: p.name ?? p.id })
          } else if (res.kind !== "permission" && res.kind !== "not_found") {
            warnings.push(`${edge}: ${safeDetail(res)}`)
          }
        }
      }
      report.businesses = ok(businessList.length)
    } else {
      warnings.push(`businesses: ${safeDetail(businesses)}`)
      report.businesses = statusFromFailure(businesses, "business_management")
    }
  }
  const pages = [...pageMap.values()].sort((a, b) => a.name.localeCompare(b.name))
  report.pages =
    pages.length > 0
      ? ok(pages.length)
      : pagesFailure
        ? statusFromFailure(pagesFailure, "pages_show_list")
        : ok(0)

  // 5. Campaigns of the selected ad account.
  let campaigns: MetaCampaignSummary[] = []
  let campaignsError: string | null = null
  const campaignsFor = options.campaignsFor ?? null
  if (campaignsFor) {
    const res = await getCampaigns(campaignsFor)
    if (res.ok) {
      campaigns = (res.data.data ?? []).map(summarizeCampaign)
      report.campaigns = ok(campaigns.length)
    } else {
      campaignsError = safeDetail(res)
      report.campaigns = statusFromFailure(res, "ads_read")
    }
  }

  // 6. Lead Ads forms — only attempted when the token declares the scopes.
  const missingPermissions = LEAD_ADS_SCOPES.filter((s) => !granted.has(s))
  const leadForms: MetaLeadFormRef[] = []
  let leadAdsStatus: MetaLeadAdsStatus = "unknown"
  const targetPages = (options.pageIds?.length ? pages.filter((p) => options.pageIds?.includes(p.id)) : pages).slice(0, 10)

  if (missingPermissions.length > 0) {
    leadAdsStatus = "permissions_required"
    report.leadForms = needsPermission(missingPermissions.join(", "))
  } else if (targetPages.length === 0) {
    leadAdsStatus = "no_pages"
    report.leadForms = skipped("No hay páginas accesibles con este token.")
  } else {
    let anyOk = false
    let anyPermissionError = false
    for (const page of targetPages) {
      const res = await getLeadForms(page.id)
      if (res.ok) {
        anyOk = true
        for (const f of res.data.data ?? []) {
          leadForms.push({
            id: f.id,
            name: f.name ?? f.id,
            pageId: page.id,
            status: f.status === "ACTIVE" ? "active" : "inactive",
            leadsCount: typeof f.leads_count === "number" ? f.leads_count : null,
          })
        }
      } else {
        if (res.kind === "permission") anyPermissionError = true
        warnings.push(`leadgen_forms ${page.id}: ${safeDetail(res)}`)
      }
    }
    leadAdsStatus = anyOk ? "active" : anyPermissionError ? "permissions_required" : "error"
    report.leadForms = anyOk
      ? ok(leadForms.length)
      : anyPermissionError
        ? needsPermission(LEAD_ADS_SCOPES.join(", "))
        : failed("Meta rechazó la lectura de formularios.")
  }

  return {
    ok: true,
    inventory: {
      account,
      permissions: [...granted].sort(),
      capabilities,
      businesses: businessList.sort((a, b) => a.name.localeCompare(b.name)),
      adAccounts,
      pages,
      campaigns,
      campaignsFor,
      campaignsError,
      leadForms,
      leadAdsStatus,
      syncReport: report,
      missingPermissions,
      warnings,
    },
  }
}
