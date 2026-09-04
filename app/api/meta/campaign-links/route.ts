import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/firebase/admin"
import {
  authenticateRequest,
  canAccessWorkspace,
  canManageCampaignLinks,
} from "@/lib/firebase/server-auth"
import { deleteCampaignLink, listCampaignLinks, upsertCampaignLink } from "@/lib/meta/campaign-links"
import type { LeadType, MetaCampaignLink } from "@/types"

/**
 * Campaign → workspace ownership links.
 *
 *   GET    /api/meta/campaign-links            → links the caller may see
 *   POST   /api/meta/campaign-links            → assign / reassign a campaign
 *   DELETE /api/meta/campaign-links?campaignId → remove an assignment
 *
 * The workspace in the body is NEVER trusted blindly: it is checked against
 * `memberships/{uid}` on the server.
 *
 * Reading  → `canAccessWorkspace(user, ws, false)` (any member of the workspace).
 * Writing  → `canManageCampaignLinks(user, ws)`: super_admin anywhere,
 *            client_admin only in their own workspace. manager, sales_rep and
 *            viewer are read-only here, even though `manager` may write other
 *            resources — this one decides where leads land.
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export interface CampaignLinksResponse {
  links: MetaCampaignLink[]
}

function isLeadType(v: unknown): v is LeadType {
  return v === "sales" || v === "recruiting"
}

export async function GET(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const isSuperAdmin = auth.user.membership.role === "super_admin"
  const requested = new URL(request.url).searchParams.get("workspaceId")?.trim() || null

  // Super admin may list everything (requested === null) or one workspace.
  const scope = isSuperAdmin ? requested : auth.user.membership.workspaceId
  if (!isSuperAdmin && !scope) return NextResponse.json({ error: "no_workspace" }, { status: 403 })
  if (scope && !canAccessWorkspace(auth.user, scope, false)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const links = await listCampaignLinks(getAdminDb(), scope)
  const body: CampaignLinksResponse = { links }
  return NextResponse.json(body)
}

interface UpsertBody {
  metaCampaignId?: string
  workspaceId?: string
  objective?: string
  active?: boolean
  metaCampaignName?: string | null
  adAccountId?: string | null
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let body: UpsertBody
  try {
    body = (await request.json()) as UpsertBody
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }

  const metaCampaignId = body.metaCampaignId?.trim()
  const workspaceId = body.workspaceId?.trim()
  if (!metaCampaignId || !workspaceId) return NextResponse.json({ error: "missing_fields" }, { status: 400 })
  if (!isLeadType(body.objective)) return NextResponse.json({ error: "invalid_objective" }, { status: 400 })
  // Assigning ownership is a write on the TARGET workspace.
  if (!canManageCampaignLinks(auth.user, workspaceId)) {
    console.warn(
      `[meta/campaign-links] denied assign role=${auth.user.membership.role} target=${workspaceId}`,
    )
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const link = await upsertCampaignLink(getAdminDb(), {
    metaCampaignId,
    workspaceId,
    objective: body.objective,
    active: body.active !== false,
    metaCampaignName: body.metaCampaignName ?? null,
    adAccountId: body.adAccountId ?? null,
    assignedByUserId: auth.user.membership.userId,
  })
  console.info(
    `[meta/campaign-links] ${metaCampaignId} → workspace=${workspaceId} objective=${link.objective} active=${link.active}`,
  )
  return NextResponse.json({ link })
}

export async function DELETE(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const metaCampaignId = new URL(request.url).searchParams.get("campaignId")?.trim()
  if (!metaCampaignId) return NextResponse.json({ error: "missing_fields" }, { status: 400 })

  const db = getAdminDb()
  const existing = await listCampaignLinks(db, null).then((links) =>
    links.find((l) => l.metaCampaignId === metaCampaignId),
  )
  if (!existing) return NextResponse.json({ ok: true })
  // Only someone who could assign it may remove it.
  if (!canManageCampaignLinks(auth.user, existing.workspaceId)) {
    console.warn(
      `[meta/campaign-links] denied delete role=${auth.user.membership.role} target=${existing.workspaceId}`,
    )
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  await deleteCampaignLink(db, metaCampaignId)
  console.info(`[meta/campaign-links] removed ${metaCampaignId}`)
  return NextResponse.json({ ok: true })
}
