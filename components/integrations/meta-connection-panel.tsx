"use client"

import Link from "next/link"
import { useState, type ReactNode } from "react"
import { toast } from "sonner"
import { AlertTriangle, ArrowLeft, Check, Info, RefreshCw, X } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { PlatformMark } from "@/components/shared/platform-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useCan, useWorkspace } from "@/lib/firebase/workspace-context"
import { syncMetaConnection, useMetaConnection } from "@/lib/integrations/meta"
import { formatRelativeTime } from "@/lib/format"
import { t } from "@/lib/i18n"
import type { ConnectionStatus, MetaCapabilities, MetaConnection } from "@/types"

const m = t.integrations.meta

/**
 * "Administrar Meta" — real data from the server-side token via
 * /api/meta/status; "Sincronizar Meta" persists a fresh inventory via
 * /api/meta/sync. Anything Meta did not return renders as
 * "Pendiente de conexión". No tokens ever reach this component.
 */
export function MetaConnectionPanel() {
  const { workspaceId, currentWorkspace, isSuperAdmin } = useWorkspace()
  const { canManageWorkspace } = useCan()
  const { status, connection, loading, error, warnings, refresh } = useMetaConnection(workspaceId)
  const [syncing, setSyncing] = useState(false)
  const [adAccountId, setAdAccountId] = useState<string | null>(null)
  const [pageId, setPageId] = useState<string | null>(null)

  const connected = status === "connected"
  const canManage = canManageWorkspace && Boolean(workspaceId)
  const pending = <span className="text-muted-foreground">{m.pending}</span>

  const selectedAd = adAccountId ?? connection?.adAccount?.id ?? null
  const selectedPage = pageId ?? connection?.page?.id ?? null
  const adAccounts = connection?.adAccounts ?? []
  const pages = connection?.pages ?? []

  async function handleSync() {
    if (!workspaceId) return
    setSyncing(true)
    try {
      const res = await syncMetaConnection(workspaceId, { adAccountId: selectedAd, pageId: selectedPage })
      if (res.connected && res.connection) {
        toast.success(m.actions.syncDone, {
          description: m.actions.syncDoneDescription(res.connection.adAccounts.length, res.connection.campaigns.length),
        })
      } else {
        toast.error(m.actions.syncError, { description: res.message ?? undefined })
      }
      await refresh()
    } catch (err) {
      toast.error(m.actions.syncError, { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit gap-1 px-2 text-xs"
          nativeButton={false}
          render={<Link href="/integrations" />}
        >
          <ArrowLeft className="size-3.5" />
          {m.back}
        </Button>
        <div className="flex items-start gap-3">
          <PlatformMark platform="meta" className="mt-1 size-9 shrink-0 rounded-lg" />
          <div className="flex-1">
            <PageHeader
              title={m.title}
              description={m.description}
              actions={loading ? <Skeleton className="h-5 w-24 rounded-full" /> : <ConnectionBadge status={status} />}
            />
          </div>
        </div>
      </div>

      {!workspaceId && (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            {t.integrations.selectWorkspace}
          </CardContent>
        </Card>
      )}

      {error && (
        <p className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Estado + Cuenta + Activos */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{m.sections.status}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Row label={m.sections.status} value={loading ? <Skeleton className="h-5 w-24" /> : <ConnectionBadge status={status} />} />
            {isSuperAdmin && <Row label={m.workspaceLabel} value={currentWorkspace?.name ?? pending} />}
            <Separator />
            <Row
              label={m.sections.account}
              hint={m.sections.accountHint}
              value={
                loading ? <Skeleton className="h-5 w-40" /> : connection?.account ? (
                  <span>
                    {connection.account.name}
                    <span className="ml-1 font-mono text-xs text-muted-foreground">{connection.account.id}</span>
                  </span>
                ) : (
                  pending
                )
              }
            />
            <Separator />
            <p className="text-xs font-medium text-muted-foreground">{m.sections.assets}</p>
            <Row
              label={m.sections.adAccount}
              value={
                loading ? (
                  <Skeleton className="h-5 w-48" />
                ) : adAccounts.length === 0 ? (
                  connected ? <span className="text-muted-foreground">{m.sections.adAccountNone}</span> : pending
                ) : adAccounts.length === 1 || !canManage ? (
                  <AdAccountLabel account={connection?.adAccount ?? adAccounts[0]} />
                ) : (
                  <Select value={selectedAd ?? ""} onValueChange={(v) => setAdAccountId(v || null)}>
                    <SelectTrigger className="w-full sm:w-72">
                      <SelectValue placeholder={m.sections.adAccountChoose} />
                    </SelectTrigger>
                    <SelectContent>
                      {adAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name} · {a.accountId}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }
            />
            <Row
              label={m.sections.page}
              hint={connected && pages.length > 1 ? m.sections.pagesCount(pages.length) : undefined}
              value={
                loading ? (
                  <Skeleton className="h-5 w-40" />
                ) : pages.length === 0 ? (
                  connected ? <span className="text-muted-foreground">{m.sections.pageNone}</span> : pending
                ) : pages.length === 1 || !canManage ? (
                  (connection?.page ?? pages[0]).name
                ) : (
                  <Select value={selectedPage ?? ""} onValueChange={(v) => setPageId(v || null)}>
                    <SelectTrigger className="w-full sm:w-72">
                      <SelectValue placeholder={m.sections.adAccountChoose} />
                    </SelectTrigger>
                    <SelectContent>
                      {pages.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )
              }
            />
            <Row
              label={m.sections.campaigns}
              value={
                loading ? (
                  <Skeleton className="h-5 w-32" />
                ) : !connection?.adAccount ? (
                  pending
                ) : connection.campaigns.length === 0 ? (
                  <span className="text-muted-foreground">{m.sections.campaignsNone}</span>
                ) : (
                  <CampaignList campaigns={connection.campaigns} />
                )
              }
            />
            <Row
              label={m.sections.leadForms}
              value={
                loading ? (
                  <Skeleton className="h-5 w-32" />
                ) : !connection ? (
                  pending
                ) : connection.leadForms.length > 0 ? (
                  <span>
                    {m.sections.leadFormsCount(connection.leadForms.length)}
                    <span className="block text-xs text-muted-foreground">
                      {connection.leadForms.map((f) => f.name).join(", ")}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground">{leadAdsLabel(connection)}</span>
                )
              }
            />
            <Separator />
            <Row
              label={m.sections.leadAds}
              value={loading ? <Skeleton className="h-5 w-40" /> : connection ? <LeadAdsBadge connection={connection} /> : pending}
            />
            <Row
              label={m.sections.lastSync}
              value={
                loading ? (
                  <Skeleton className="h-5 w-28" />
                ) : connection?.lastSyncAt ? (
                  formatRelativeTime(connection.lastSyncAt)
                ) : connected ? (
                  m.sections.never
                ) : (
                  pending
                )
              }
            />
          </CardContent>
        </Card>

        {/* Acciones */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{m.sections.actions}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Button className="w-full gap-2" onClick={handleSync} disabled={!canManage || syncing || loading}>
              <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? m.actions.syncing : connected ? m.actions.sync : m.actions.verify}
            </Button>
            <p className="flex gap-2 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              <span>{canManage ? m.actions.tokenHint : m.actions.adminOnly}</span>
            </p>
            {warnings.length > 0 && isSuperAdmin && (
              <ul className="flex flex-col gap-1 rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                {warnings.map((w) => (
                  <li key={w} className="break-all">{w}</li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Permisos del token */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{m.permissions.title}</CardTitle>
            <CardDescription>{m.permissions.description}</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex flex-col gap-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-5 w-64" />
                ))}
              </div>
            ) : (
              <ul className="flex flex-col gap-2">
                {CAPABILITY_ROWS.map(({ key, label }) => {
                  const granted = connection?.capabilities[key] ?? false
                  return (
                    <li key={key} className="flex items-start gap-2 text-sm">
                      <span
                        className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                          granted ? "border-success text-success" : "text-muted-foreground"
                        }`}
                      >
                        {granted ? <Check className="size-2.5" /> : <X className="size-2.5" />}
                      </span>
                      <span className="flex-1">{label}</span>
                      <span className="text-xs text-muted-foreground">
                        {connection ? (granted ? m.permissions.granted : m.permissions.missing) : m.pending}
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Regla de propiedad */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{m.ownership.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-pretty text-muted-foreground">{m.ownership.body}</p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}

const CAPABILITY_ROWS: { key: keyof MetaCapabilities; label: string }[] = [
  { key: "adsRead", label: m.permissions.adsRead },
  { key: "adsManagement", label: m.permissions.adsManagement },
  { key: "businessManagement", label: m.permissions.businessManagement },
  { key: "leadsRetrieval", label: m.permissions.leadsRetrieval },
  { key: "pagesAccess", label: m.permissions.pagesAccess },
]

function leadAdsLabel(c: MetaConnection): string {
  switch (c.leadAdsStatus) {
    case "active":
      return m.sections.leadAdsActive
    case "permissions_required":
      return m.sections.leadAdsPermissions
    case "no_pages":
      return m.sections.leadAdsNoPages
    case "error":
      return m.sections.leadAdsError
    default:
      return m.sections.leadAdsUnknown
  }
}

function LeadAdsBadge({ connection }: { connection: MetaConnection }) {
  const active = connection.leadAdsStatus === "active"
  return (
    <span className="flex flex-col items-start gap-1 sm:items-end">
      <Badge variant={active ? "default" : "secondary"}>{leadAdsLabel(connection)}</Badge>
      {connection.missingPermissions.length > 0 && (
        <span className="font-mono text-[11px] text-muted-foreground">
          {m.sections.missingPermissions(connection.missingPermissions.join(", "))}
        </span>
      )}
    </span>
  )
}

function AdAccountLabel({ account }: { account: MetaConnection["adAccount"] }) {
  if (!account) return null
  return (
    <span>
      {account.name}
      <span className="ml-1 font-mono text-xs text-muted-foreground">{account.accountId}</span>
    </span>
  )
}

function CampaignList({ campaigns }: { campaigns: MetaConnection["campaigns"] }) {
  const shown = campaigns.slice(0, 5)
  const rest = campaigns.length - shown.length
  return (
    <span className="flex flex-col items-start gap-1 sm:items-end">
      <span>{m.sections.campaignsCount(campaigns.length)}</span>
      <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground sm:text-right">
        {shown.map((c) => (
          <li key={c.id} className="truncate">
            {c.name}
            {c.effectiveStatus && <span className="ml-1 font-mono">· {c.effectiveStatus.toLowerCase()}</span>}
          </li>
        ))}
        {rest > 0 && <li>{m.sections.campaignsMore(rest)}</li>}
      </ul>
    </span>
  )
}

function ConnectionBadge({ status }: { status: ConnectionStatus }) {
  if (status === "connected") {
    return (
      <Badge className="gap-1">
        <Check className="size-3" />
        {t.integrations.status.connected}
      </Badge>
    )
  }
  if (status === "expired" || status === "error") {
    return <Badge variant="destructive">{t.integrations.status[status]}</Badge>
  }
  return <Badge variant="secondary">{t.integrations.status.not_connected}</Badge>
}

function Row({ label, hint, value }: { label: string; hint?: string; value: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
      <div className="flex flex-col">
        <span className="text-sm text-muted-foreground">{label}</span>
        {hint && <span className="text-xs text-muted-foreground/70">{hint}</span>}
      </div>
      <div className="text-sm font-medium sm:text-right">{value}</div>
    </div>
  )
}
