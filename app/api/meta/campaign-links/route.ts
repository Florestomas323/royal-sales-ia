import { NextResponse } from "next/server"
import { getAdminDb } from "@/lib/firebase/admin"
import { readMetaConnection } from "@/lib/meta/connection-store"
import { getCampaigns } from "@/lib/meta/graph"
import {
  authenticateRequest,
  canAccessWorkspace,
  canManageCampaignLinks,
} from "@/lib/firebase/server-auth"
import {
  deleteCampaignLink,
  ensureLocalCampaign,
  listCampaignLinks,
  upsertCampaignLink,
} from "@/lib/meta/campaign-links"
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

  // READ ONLY. Reconciling local campaign mirrors is a write and lives in
  // POST { action: "reconcile" }, behind the manage permission: loading a
  // page must never perform administrative writes on the caller's behalf.
  const links = await listCampaignLinks(getAdminDb(), scope)
  const body: CampaignLinksResponse = { links }
  return NextResponse.json(body)
}

interface UpsertBody {
  /** "reconcile" runs the local-mirror sync instead of an upsert. */
  action?: "reconcile"
  metaCampaignId?: string
  workspaceId?: string
  objective?: string
  active?: boolean
  metaCampaignName?: string | null
  metaCampaignStatus?: string | null
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

  // Explicit write action: make sure every active link of the scope has its
  // local `campaigns` mirror. Same permission as assigning a campaign, and a
  // super admin may reconcile everything; anyone else only their workspace.
  if (body.action === "reconcile") {
    const isSuperAdmin = auth.user.membership.role === "super_admin"
    const scope = isSuperAdmin ? (body.workspaceId?.trim() || null) : auth.user.membership.workspaceId
    if (!isSuperAdmin && (!scope || !canManageCampaignLinks(auth.user, scope))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }
    const db = getAdminDb()
    const current = await listCampaignLinks(db, scope)
    // Live Meta state for every ad account these links belong to, so a
    // campaign paused in Meta shows as paused in Campañas without anybody
    // having to open Integraciones first. Read-only on Meta; a Graph failure
    // leaves the stored state untouched.
    const statuses = await liveStatusesFor(db, current)
    const links = await reconcileLocalCampaigns(db, current, statuses)
    const out: CampaignLinksResponse = { links }
    return NextResponse.json(out)
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
    metaCampaignStatus: body.metaCampaignStatus ?? null,
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

/**
 * Gives every active link a local `campaigns` document, once.
 *
 * A link with `campaignId` already set is skipped, so this costs one extra
 * read only the first time and nothing afterwards. Failures are logged and
 * swallowed: listing the links must keep working even if one mirror cannot
 * be created.
 */
/**
 * Meta's current status per campaign id, for the ad accounts of these links.
 * One Graph read per distinct workspace connection. Failures are swallowed:
 * the caller then keeps whatever status is stored.
 */
async function liveStatusesFor(
  db: ReturnType<typeof getAdminDb>,
  links: MetaCampaignLink[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const workspaces = [...new Set(links.filter((l) => l.active).map((l) => l.workspaceId))]
  await Promise.all(
    workspaces.map(async (wsId) => {
      try {
        const conn = await readMetaConnection(db, wsId)
        if (!conn?.adAccount?.id) return
        const res = await getCampaigns(conn.adAccount.id)
        if (!res.ok) return
        for (const c of res.data.data ?? []) {
          const s = c.effective_status ?? c.status
          if (s) out.set(c.id, s)
        }
      } catch {
        /* stored status stays */
      }
    }),
  )
  return out
}

async function reconcileLocalCampaigns(
  db: ReturnType<typeof getAdminDb>,
  links: MetaCampaignLink[],
  liveStatuses: Map<string, string> = new Map(),
): Promise<MetaCampaignLink[]> {
  return Promise.all(
    links.map(async (link) => {
      if (!link.active || !link.workspaceId) return link
      // Fresh state wins; the state stored at link time is the fallback.
      const metaStatus = liveStatuses.get(link.metaCampaignId) ?? link.metaCampaignStatus ?? null
      // A link that already has its mirror is only revisited when Meta's
      // state changed; a link without one is created as before.
      if (link.campaignId && (!metaStatus || metaStatus === (link.metaCampaignStatus ?? null))) return link
      try {
        const campaignId = await ensureLocalCampaign(db, {
          workspaceId: link.workspaceId,
          metaCampaignId: link.metaCampaignId,
          name: link.metaCampaignName ?? null,
          objective: link.objective,
          metaStatus,
        })
        await db.collection("metaCampaignLinks").doc(link.metaCampaignId)
          .set(
            { campaignId, metaCampaignStatus: metaStatus, updatedAt: new Date().toISOString() },
            { merge: true },
          )
        return { ...link, campaignId, metaCampaignStatus: metaStatus }
      } catch (err) {
        console.error("[meta/campaign-links] reconcile failed", link.metaCampaignId, err)
        return link
      }
    }),
  )
}
