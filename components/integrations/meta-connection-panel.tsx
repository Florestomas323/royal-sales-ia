"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { ArrowLeft, Check, Info, Plug, RefreshCw, Unplug } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { PlatformMark } from "@/components/shared/platform-badge"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { useCan, useWorkspace } from "@/lib/firebase/workspace-context"
import { META_PREREQUISITES, useMetaConnection } from "@/lib/integrations/meta"
import { formatRelativeTime } from "@/lib/format"
import { t } from "@/lib/i18n"
import type { ConnectionStatus } from "@/types"

const m = t.integrations.meta

/**
 * "Administrar Meta". Every value that does not exist yet renders as
 * "Pendiente de conexión". The Conectar button is intentionally disabled in
 * this phase: there is no OAuth, and we never fake one.
 */
export function MetaConnectionPanel() {
  const { workspaceId, currentWorkspace, isSuperAdmin } = useWorkspace()
  const { canManageWorkspace } = useCan()
  const { status, connection } = useMetaConnection(workspaceId)

  const connected = status === "connected"
  const pending = <span className="text-muted-foreground">{m.pending}</span>
  const canConnect = canManageWorkspace && Boolean(workspaceId)

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
              actions={<ConnectionBadge status={status} />}
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

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Estado + Cuenta */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{m.sections.status}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Row label={m.sections.status} value={<ConnectionBadge status={status} />} />
            {isSuperAdmin && (
              <Row label={m.workspaceLabel} value={currentWorkspace?.name ?? pending} />
            )}
            <Separator />
            <Row
              label={m.sections.account}
              hint={m.sections.accountHint}
              value={connection?.account?.name ?? pending}
            />
            <Separator />
            <p className="text-xs font-medium text-muted-foreground">{m.sections.assets}</p>
            <Row label={m.sections.adAccount} value={connection?.adAccount?.name ?? pending} />
            <Row label={m.sections.page} value={connection?.page?.name ?? pending} />
            <Row
              label={m.sections.leadForms}
              value={
                connection && connection.leadForms.length > 0
                  ? connection.leadForms.map((f) => f.name).join(", ")
                  : pending
              }
            />
            <Separator />
            <Row
              label={m.sections.leadAds}
              value={
                connection ? (
                  <Badge variant={connection.leadAdsActive ? "default" : "secondary"}>
                    {connection.leadAdsActive
                      ? m.sections.leadAdsActive
                      : m.sections.leadAdsInactive}
                  </Badge>
                ) : (
                  pending
                )
              }
            />
            <Row
              label={m.sections.lastSync}
              value={
                connection?.lastSyncAt
                  ? formatRelativeTime(connection.lastSyncAt)
                  : connected
                    ? m.sections.never
                    : pending
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
            {!connected && (
              <>
                {/* Disabled on purpose: no OAuth exists in this phase. */}
                <Button className="w-full gap-2" disabled title={m.actions.connectUnavailable}>
                  <Plug className="size-4" />
                  {m.actions.connect}
                </Button>
                <p className="flex gap-2 text-xs text-muted-foreground">
                  <Info className="mt-0.5 size-3.5 shrink-0" />
                  <span>{canConnect ? m.actions.connectUnavailable : m.actions.adminOnly}</span>
                </p>
              </>
            )}
            {connected && (
              <>
                <Button variant="outline" className="w-full gap-2" disabled={!canConnect}>
                  <RefreshCw className="size-4" />
                  {m.actions.reconnect}
                </Button>
                <Button variant="outline" className="w-full gap-2" disabled={!canConnect}>
                  <Unplug className="size-4" />
                  {m.actions.disconnect}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {/* Requisitos */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">{m.prerequisites.title}</CardTitle>
            <CardDescription>{m.prerequisites.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-2">
              {META_PREREQUISITES.map((item) => (
                <li key={item} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border text-muted-foreground">
                    <Check className="size-2.5 opacity-0" />
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
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

function Row({
  label,
  hint,
  value,
}: {
  label: string
  hint?: string
  value: ReactNode
}) {
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
