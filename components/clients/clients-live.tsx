"use client"

import { Building2, TrendingUp } from "lucide-react"
import { useClients } from "@/lib/firebase/collections"
import { formatCurrency, formatNumber } from "@/lib/format"
import { CLIENT_STATUS_LABELS } from "@/lib/constants"
import { t } from "@/lib/i18n"
import type { ClientStatus } from "@/types"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { DataErrorState } from "@/components/shared/data-error-state"
import { DemoRowsNotice } from "@/components/shared/demo-data-badge"

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  active: "default",
  onboarding: "secondary",
  paused: "outline",
}

export function ClientsLive() {
  const { clients, loading, error } = useClients()

  if (loading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="gap-0">
            <CardHeader className="gap-0">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-lg" />
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            </CardHeader>
            <CardContent className="mt-4 flex flex-col gap-4">
              <Skeleton className="h-9 w-full rounded-lg" />
              <div className="grid grid-cols-3 gap-3">
                {Array.from({ length: 6 }).map((_, j) => (
                  <Skeleton key={j} className="h-9 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return <DataErrorState error={error} />
  }

  if (clients.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Building2 className="size-8 text-muted-foreground" />
          <p className="font-medium">{t.clients.emptyTitle}</p>
          <p className="text-sm text-muted-foreground">{t.clients.emptyDescription}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
    <DemoRowsNotice rows={clients} />
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {clients.map((client) => {
        const roas = client.adSpend > 0 ? client.revenue / client.adSpend : 0
        const cpl = client.leads > 0 ? client.adSpend / client.leads : 0
        const metrics = [
          { label: t.clients.metrics.adSpend, value: formatCurrency(client.adSpend, true) },
          { label: t.clients.metrics.revenue, value: formatCurrency(client.revenue, true) },
          { label: t.clients.metrics.leads, value: formatNumber(client.leads) },
          { label: t.clients.metrics.cpl, value: formatCurrency(cpl) },
          { label: t.clients.metrics.appointments, value: formatNumber(client.appointments) },
          { label: t.clients.metrics.sales, value: formatNumber(client.sales) },
        ]
        return (
          <Card key={client.id} className="gap-0 overflow-hidden">
            <CardHeader className="gap-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex size-10 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: client.logoColor }}
                  >
                    <Building2 className="size-5" />
                  </div>
                  <div>
                    <p className="font-medium leading-tight">{client.name}</p>
                    <p className="text-xs text-muted-foreground">{client.industry}</p>
                  </div>
                </div>
                <Badge variant={STATUS_VARIANT[client.status] ?? "outline"}>
                  {CLIENT_STATUS_LABELS[client.status as ClientStatus] ?? client.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="mt-4 flex flex-col gap-4">
              <div className="flex items-center justify-between rounded-lg bg-accent/60 px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs font-medium text-accent-foreground">
                  <TrendingUp className="size-3.5" />
                  {t.clients.roas}
                </span>
                <span className="font-mono text-sm font-semibold tabular-nums text-accent-foreground">
                  {roas.toFixed(1)}x
                </span>
              </div>
              <div className="grid grid-cols-3 gap-x-3 gap-y-4">
                {metrics.map((m) => (
                  <div key={m.label}>
                    <p className="text-[11px] text-muted-foreground">{m.label}</p>
                    <p className="mt-0.5 font-mono text-sm font-medium tabular-nums">{m.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
    </div>
  )
}
