import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/firebase/admin"
import { authenticateRequest, canAccessWorkspace } from "@/lib/firebase/server-auth"
import { generateCreative, generateVariants, isAiConfigured } from "@/lib/content-lab/service"
import { confirmGeneration, releaseReservation, reserveAttempt } from "@/lib/content-lab/usage"
import {
  CHANNELS, FORMATS, RECRUITING_INTENTS, SALES_INTENTS, TONES,
  type CampaignContext, type ContentChannel, type ContentFormat, type ContentTone,
  type CreativeBrief, type VariantVariable,
} from "@/lib/content-lab/types"
import type { UserRole } from "@/types"

/**
 * POST /api/content-lab/generate
 *
 * The ONLY route that touches the AI provider. The browser never sees the API
 * key, the prompts or the raw provider answer — only the validated result.
 *
 * Authorisation: an ID token identifies the caller; the workspace comes from
 * `memberships/{uid}`, never from the request body. Only super_admin,
 * client_admin and manager may generate: sales_rep and viewer are denied.
 *
 * Quotas are enforced HERE, server-side (see usage.ts): 5 attempts per minute
 * per user and 50 completed generations per day per workspace, super_admin
 * included. Disabling a button would not stop a direct call to this route.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const AUTHOR_ROLES: UserRole[] = ["super_admin", "client_admin", "manager"]
const VARIABLES: VariantVariable[] = ["hook", "angle", "cta", "headline"]

function asString(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : ""
}

/** Rebuilds the brief from an allow-list: unknown fields never travel. */
function readBrief(body: Record<string, unknown>): CreativeBrief | null {
  const raw = (body.brief ?? {}) as Record<string, unknown>
  const objective = raw.objective === "recruiting" ? "recruiting" : raw.objective === "sales" ? "sales" : null
  if (!objective) return null
  const intents: string[] = objective === "sales" ? SALES_INTENTS : RECRUITING_INTENTS
  if (typeof raw.intent !== "string" || !intents.includes(raw.intent)) return null
  const subject = asString(raw.subject, 600).trim()
  if (subject.length === 0) return null
  if (!TONES.includes(raw.tone as ContentTone)) return null
  if (!CHANNELS.includes(raw.channel as ContentChannel)) return null
  if (!FORMATS.includes(raw.format as ContentFormat)) return null

  return {
    objective,
    intent: raw.intent as CreativeBrief["intent"],
    subject,
    offer: asString(raw.offer, 400).trim() || undefined,
    audience: asString(raw.audience, 300).trim() || undefined,
    market: asString(raw.market, 200).trim() || undefined,
    notes: asString(raw.notes, 800).trim() || undefined,
    tone: raw.tone as ContentTone,
    channel: raw.channel as ContentChannel,
    format: raw.format as ContentFormat,
  }
}

/**
 * Campaign context, read SERVER-SIDE from the caller's own workspace. The
 * client sends only a campaign id; anything shown comes from Firestore, so a
 * tampered body cannot pull another distributor's campaign.
 */
async function readCampaignContext(
  campaignId: string,
  workspaceId: string,
): Promise<CampaignContext | null> {
  const snap = await getAdminDb().collection("campaigns").doc(campaignId).get()
  if (!snap.exists) return null
  const data = snap.data() as Record<string, unknown> | undefined
  if (!data || data.workspaceId !== workspaceId) return null // wrong tenant: refuse
  return {
    campaignName: typeof data.name === "string" ? data.name : campaignId,
    objective: data.objective === "recruiting" ? "recruiting" : "sales",
    // Denormalised counters are dead fields (Phase F): never used as metrics.
    metrics: {
      spend: null, impressions: null, reach: null, frequency: null, ctr: null,
      cpc: null, cpm: null, metaLeads: null, crmLeads: null, cplCrm: null,
      sales: null, revenue: null, roas: null,
    },
    health: null,
    findings: [],
    recommendations: [],
  }
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  if (!AUTHOR_ROLES.includes(auth.user.membership.role)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  // The workspace is the caller's own; super_admin must name one explicitly.
  const isSuperAdmin = auth.user.membership.role === "super_admin"
  const requested = asString(body.workspaceId, 128).trim()
  const workspaceId = isSuperAdmin ? requested : auth.user.membership.workspaceId
  if (!workspaceId) {
    return NextResponse.json({ error: isSuperAdmin ? "workspace_required" : "no_workspace" }, { status: 400 })
  }
  if (!canAccessWorkspace(auth.user, workspaceId, true)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const brief = readBrief(body)
  if (!brief) return NextResponse.json({ error: "invalid_brief" }, { status: 400 })

  // Reserve the attempt BEFORE touching the provider. A double tap or a retry
  // loop is stopped here, whatever the provider ends up answering.
  const userId = auth.user.membership.userId
  const quota = await reserveAttempt(workspaceId, userId)
  if (!quota.allowed) {
    console.info(`[content-lab] quota ${quota.kind} ws=${workspaceId}`)
    return NextResponse.json({ error: "quota_exceeded", quota: quota.kind }, { status: 429 })
  }

  // Variants mode: change exactly one variable of an existing creative.
  const variable = body.variable
  if (typeof variable === "string") {
    if (!VARIABLES.includes(variable as VariantVariable)) {
      return NextResponse.json({ error: "invalid_variable" }, { status: 400 })
    }
    const baseline = asString(body.baseline, 400).trim()
    if (!baseline) return NextResponse.json({ error: "invalid_baseline" }, { status: 400 })
    const variants = await generateVariants(brief, variable as VariantVariable, baseline)
    // The reservation becomes a completed generation only for real AI output;
    // otherwise it goes straight back to the pool. Settling always names the
    // exact reservation, so an expired one can never be counted.
    if (variants.source === "ai") await confirmGeneration(workspaceId, quota.reservationId)
    else await releaseReservation(workspaceId, quota.reservationId)
    return NextResponse.json({ ok: true, kind: "variants", ...variants, aiConfigured: isAiConfigured() })
  }

  let context: CampaignContext | null = null
  const campaignId = asString(body.sourceCampaignId, 128).trim()
  if (campaignId) {
    context = await readCampaignContext(campaignId, workspaceId)
    if (!context) {
      await releaseReservation(workspaceId, quota.reservationId) // nothing was generated
      return NextResponse.json({ error: "campaign_not_found" }, { status: 404 })
    }
  }

  const creative = await generateCreative(brief, context)
  if (creative.source === "ai") await confirmGeneration(workspaceId, quota.reservationId)
  else await releaseReservation(workspaceId, quota.reservationId)
  return NextResponse.json({ ok: true, kind: "creative", ...creative, aiConfigured: isAiConfigured() })
}
