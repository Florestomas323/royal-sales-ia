"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { toast } from "sonner"
import { Link2Off } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { assignCampaign, fetchCampaignLinks, reconcileCampaignLinks, unassignCampaign } from "@/lib/integrations/meta"
import { useCan, useWorkspace } from "@/lib/firebase/workspace-context"
import { CAMPAIGN_OBJECTIVE_LABELS, LEAD_TYPES } from "@/lib/constants"
import { t } from "@/lib/i18n"
import type { LeadType, MetaCampaignLink, MetaCampaignSummary } from "@/types"

const c = t.integrations.meta.campaignsTable
const UNASSIGNED = "__unassigned__"

/**
 * Campaign → workspace ownership. This is the table that decides which
 * distribuidor receives the leads of each Meta campaign: a shared Facebook
 * page never determines ownership, the campaign does.
 */
export function MetaCampaignsTable({
  campaigns,
  adAccountId,
  loading,
}: {
  campaigns: MetaCampaignSummary[]
  adAccountId: string | null
  loading: boolean
}) {
  const { workspaceId, workspaces, isSuperAdmin } = useWorkspace()
  const { canManageCampaignLinks } = useCan()
  const [links, setLinks] = useState<Record<string, MetaCampaignLink>>({})
  const [loadingLinks, setLoadingLinks] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  // Super admin may assign to any workspace; everyone else only to their own.
  const assignableWorkspaces = useMemo(
    () => (isSuperAdmin ? workspaces : workspaces.filter((w) => w.id === workspaceId)),
    [isSuperAdmin, workspaces, workspaceId],
  )
  // Server-side `canManageCampaignLinks` is the authority; this only hides controls.
  const canAssign = canManageCampaignLinks && assignableWorkspaces.length > 0

  const reload = useCallback(async () => {
    setLoadingLinks(true)
    try {
      // Admins run the explicit mirror sync (a POST behind the manage
      // permission); everyone else only lists. Reading never writes.
      const rows =
        (canManageCampaignLinks ? await reconcileCampaignLinks(isSuperAdmin ? null : workspaceId) : null)
        ?? (await fetchCampaignLinks(isSuperAdmin ? null : workspaceId))
      const map: Record<string, MetaCampaignLink> = {}
      for (const l of rows) map[l.metaCampaignId] = l
      setLinks(map)

      // Meta may have paused (or resumed) a campaign since it was linked. The
      // inventory on this screen carries the fresh state; a link whose stored
      // state differs is re-upserted so the local mirror — what Campañas and
      // the "Campañas activas" counter read — follows Meta. Admins only, and
      // only when something actually changed.
      if (canManageCampaignLinks) {
        for (const l of rows) {
          const fresh = campaigns.find((c) => c.id === l.metaCampaignId)
          const status = fresh?.effectiveStatus ?? fresh?.status ?? null
          if (!l.active || !status || status === (l.metaCampaignStatus ?? null)) continue
          const updated = await assignCampaign({
            metaCampaignId: l.metaCampaignId,
            workspaceId: l.workspaceId,
            objective: l.objective,
            active: true,
            metaCampaignName: fresh?.name ?? l.metaCampaignName,
            metaCampaignStatus: status,
          })
          map[l.metaCampaignId] = updated
        }
        setLinks({ ...map })
      }
    } catch (err) {
      console.error("[meta] campaign links:", err instanceof Error ? err.message : "unknown")
      toast.error(c.loadError)
    } finally {
      setLoadingLinks(false)
    }
  }, [isSuperAdmin, workspaceId, canManageCampaignLinks, campaigns])

  useEffect(() => {
    void reload()
  }, [reload])

  async function handleAssign(campaign: MetaCampaignSummary, targetWorkspaceId: string, objective: LeadType) {
    setBusyId(campaign.id)
    try {
      const link = await assignCampaign({
        metaCampaignId: campaign.id,
        workspaceId: targetWorkspaceId,
        objective,
        active: true,
        metaCampaignName: campaign.name,
        // The real Meta state, so the local mirror is born and kept as
        // active / paused instead of always "active".
        metaCampaignStatus: campaign.effectiveStatus ?? campaign.status ?? null,
        adAccountId,
      })
      setLinks((prev) => ({ ...prev, [campaign.id]: link }))
      const wsName = workspaces.find((w) => w.id === targetWorkspaceId)?.name ?? targetWorkspaceId
      toast.success(c.assigned, { description: c.assignedDescription(campaign.name, wsName) })
    } catch (err) {
      toast.error(c.assignError, { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusyId(null)
    }
  }

  async function handleRemove(campaignId: string) {
    setBusyId(campaignId)
    try {
      await unassignCampaign(campaignId)
      setLinks((prev) => {
        const next = { ...prev }
        delete next[campaignId]
        return next
      })
      toast.success(c.removed)
    } catch (err) {
      toast.error(c.assignError, { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusyId(null)
    }
  }

  return (
    <Card className="lg:col-span-3">
      <CardHeader>
        <CardTitle className="text-base">{c.title}</CardTitle>
        <CardDescription>{c.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {loading || loadingLinks ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : campaigns.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {adAccountId ? c.empty : c.emptyNoAccount}
          </p>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {campaigns.map((campaign) => {
              const link = links[campaign.id]
              const busy = busyId === campaign.id
              return (
                <li key={campaign.id} className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{campaign.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{campaign.id}</p>
                  </div>

                  <div className="shrink-0">
                    <Badge variant={campaign.effectiveStatus === "ACTIVE" ? "default" : "secondary"}>
                      {(campaign.effectiveStatus ?? campaign.status ?? "—").toLowerCase()}
                    </Badge>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row lg:w-[28rem]">
                    <Select
                      value={link?.workspaceId ?? UNASSIGNED}
                      disabled={!canAssign || busy}
                      onValueChange={(v) => {
                        if (!v || v === UNASSIGNED) return
                        void handleAssign(campaign, v, link?.objective ?? "sales")
                      }}
                    >
                      <SelectTrigger className="w-full sm:flex-1">
                        <SelectValue placeholder={c.unassigned} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={UNASSIGNED} disabled>
                          {c.unassigned}
                        </SelectItem>
                        {assignableWorkspaces.map((w) => (
                          <SelectItem key={w.id} value={w.id}>
                            {w.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={link?.objective ?? "sales"}
                      disabled={!canAssign || busy || !link}
                      onValueChange={(v) => {
                        if (!v || !link) return
                        void handleAssign(campaign, link.workspaceId, v as LeadType)
                      }}
                    >
                      <SelectTrigger className="w-full sm:w-40">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {LEAD_TYPES.map((o) => (
                          <SelectItem key={o} value={o}>
                            {CAMPAIGN_OBJECTIVE_LABELS[o]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {link && canAssign && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={c.remove}
                        title={c.remove}
                        disabled={busy}
                        onClick={() => void handleRemove(campaign.id)}
                      >
                        <Link2Off className="size-4" />
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          {canAssign ? c.existingOnly : c.readOnly}
        </p>
      </CardContent>
    </Card>
  )
}
