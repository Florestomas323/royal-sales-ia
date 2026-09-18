import { NextResponse } from "next/server"
import { PIPELINES, PLATFORMS } from "@/lib/constants"
import { getAdminDb, isAdminNotConfigured } from "@/lib/firebase/admin"
import { authenticateRequest } from "@/lib/firebase/server-auth"
import { createOrReuseLeadAtomic, leadOutcomeOf } from "@/lib/lead-dedup-server"
import { isValidE164, sourcesFor } from "@/lib/leads"
import { notifyNewLeadServer } from "@/lib/notifications/server"
import type { Attribution, Lead, LeadType, Platform, RecruitingProfile } from "@/types"

export const runtime = "nodejs"

const json = (body: unknown, status = 200) => NextResponse.json(body, { status })
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function text(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return ""
  if (typeof value !== "string") return null
  const clean = value.trim()
  return clean.length <= max ? clean : null
}

function cleanRecruiting(value: unknown): RecruitingProfile | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined
  const raw = value as Record<string, unknown>
  const jobTitle = text(raw.jobTitle, 120)
  const city = text(raw.city, 80)
  const state = text(raw.state, 64)
  const employmentPreference = text(raw.employmentPreference, 120)
  if ([jobTitle, city, state, employmentPreference].some((v) => v === null)) return undefined
  return {
    ...(jobTitle ? { jobTitle } : {}),
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
    ...(employmentPreference ? { employmentPreference } : {}),
    ...(typeof raw.hasVehicle === "boolean" ? { hasVehicle: raw.hasVehicle } : {}),
  }
}

/** Authenticated manual prospect creation. Website submissions use their own key-authenticated route. */
export async function POST(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.ok) return json({ error: auth.error }, auth.status)

  let body: Record<string, unknown>
  try {
    const parsed = await request.json()
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return json({ error: "invalid_body" }, 400)
    body = parsed as Record<string, unknown>
  } catch {
    return json({ error: "invalid_body" }, 400)
  }

  const name = text(body.name, 120)
  const phone = text(body.phone, 32)
  const email = text(body.email, 160)
  const requestedWorkspace = text(body.workspaceId, 160)
  const leadType = body.leadType
  const source = body.source
  const assignedToId = text(body.assignedToId, 160)
  const campaignId = text(body.campaignId, 160)

  if (!name || !phone || !isValidE164(phone)) return json({ error: "invalid_identity" }, 400)
  if (email === null || (email && !EMAIL.test(email))) return json({ error: "invalid_email" }, 400)
  if (leadType !== "sales" && leadType !== "recruiting") return json({ error: "invalid_lead_type" }, 400)
  if (typeof source !== "string" || !PLATFORMS.includes(source as Platform)) return json({ error: "invalid_source" }, 400)
  if (!sourcesFor(leadType).includes(source as Platform)) return json({ error: "invalid_source_for_type" }, 400)
  if (assignedToId === null || campaignId === null) return json({ error: "invalid_body" }, 400)

  const membership = auth.user.membership
  const workspaceId = membership.role === "super_admin" ? requestedWorkspace : membership.workspaceId
  if (!workspaceId) return json({ error: "missing_workspace" }, 400)

  const sameWorkspace = membership.role === "super_admin" || membership.workspaceId === workspaceId
  const roleCanCreate = membership.role === "super_admin"
    || membership.role === "client_admin"
    || membership.role === "manager"
    || membership.role === "sales_rep"
  if (!sameWorkspace || !roleCanCreate) return json({ error: "forbidden" }, 403)
  if (membership.role === "sales_rep" && assignedToId !== membership.userId) {
    return json({ error: "invalid_assignee" }, 403)
  }

  try {
    const db = getAdminDb()

    if (assignedToId) {
      const assigned = await db.collection("users").doc(assignedToId).get()
      const data = assigned.data() as { workspaceId?: string; role?: string; status?: string } | undefined
      if (!assigned.exists || data?.workspaceId !== workspaceId
        || !["client_admin", "manager", "sales_rep"].includes(data.role ?? "")
        || !["active", "invited"].includes(data.status ?? "active")) {
        return json({ error: "invalid_assignee" }, 400)
      }
    }

    let campaignName = ""
    let clientId = ""
    if (campaignId) {
      const campaign = await db.collection("campaigns").doc(campaignId).get()
      const data = campaign.data() as { workspaceId?: string; objective?: LeadType; campaignType?: LeadType; name?: string; clientId?: string } | undefined
      const objective = data?.objective ?? data?.campaignType ?? "sales"
      if (!campaign.exists || data?.workspaceId !== workspaceId || objective !== leadType) {
        return json({ error: "invalid_campaign" }, 400)
      }
      campaignName = data?.name ?? ""
      clientId = data?.clientId ?? ""
    }

    const now = new Date().toISOString()
    const attribution: Attribution = {
      platform: source as Platform,
      ...(campaignName ? { campaign: campaignName } : {}),
    }
    const recruiting = leadType === "recruiting" ? cleanRecruiting(body.recruiting) : undefined
    const lead: Omit<Lead, "id"> = {
      workspaceId,
      leadType,
      name,
      phone,
      email: (email ?? "").toLowerCase(),
      source: source as Platform,
      campaignId: campaignId ?? "",
      campaignName,
      score: 50,
      temperature: "warm",
      stage: PIPELINES[leadType].initial,
      assignedToId: assignedToId ?? "",
      potentialValue: 0,
      createdAt: now,
      lastContactAt: null,
      nextFollowUpAt: null,
      nextAction: "Primer contacto",
      attribution,
      clientId,
      ...(recruiting ? { recruiting } : {}),
    }

    const result = await createOrReuseLeadAtomic({
      lead,
      ...(membership.userId ? { actor: { userId: membership.userId, role: membership.role } } : {}),
    }, db)

    if (result.created) {
      // The central server notification writes in-app alerts and email only
      // for a genuine creation. Duplicate submissions never announce a new lead.
      try {
        await notifyNewLeadServer(
          { ...lead, id: result.leadId },
          null,
          { appUrl: process.env.APP_URL || new URL(request.url).origin },
        )
      } catch (err) {
        console.error("[api/leads] notification failed", err)
      }
    }

    // `outcome` is the single word; `restored`/`enriched`/`enrichedFields`
    // stay in the payload so a restore that also filled gaps reports both.
    return json({ ...result, outcome: leadOutcomeOf(result) }, result.created ? 201 : 200)
  } catch (err) {
    if (isAdminNotConfigured(err)) return json({ error: "server_not_configured" }, 503)
    console.error("[api/leads]", err)
    return json({ error: "internal" }, 500)
  }
}
