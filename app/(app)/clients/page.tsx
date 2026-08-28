import type { Metadata } from "next"
import { Building2, TrendingUp } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { clients } from "@/lib/mock-data"
import { formatCurrency, formatNumber } from "@/lib/format"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Clients · Royal Sales IA",
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  active: "default",
  onboarding: "secondary",
  paused: "outline",
}

export default function ClientsPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title="Clients"
        description="Every account you manage, with spend and revenue at a glance."
        actions={<Button size="sm">Add client</Button>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {clients.map((client) => {
          const roas = client.adSpend > 0 ? client.revenue / client.adSpend : 0
          const cpl = client.leads > 0 ? client.adSpend / client.leads : 0
          const metrics = [
            { label: "Ad spend", value: formatCurrency(client.adSpend, true) },
            { label: "Revenue", value: formatCurrency(client.revenue, true) },
            { label: "Leads", value: formatNumber(client.leads) },
            { label: "Cost / lead", value: formatCurrency(cpl) },
            { label: "Appointments", value: formatNumber(client.appointments) },
            { label: "Sales", value: formatNumber(client.sales) },
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
                  <Badge variant={STATUS_VARIANT[client.status] ?? "outline"} className="capitalize">
                    {client.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="mt-4 flex flex-col gap-4">
                <div className="flex items-center justify-between rounded-lg bg-accent/60 px-3 py-2">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-accent-foreground">
                    <TrendingUp className="size-3.5" />
                    Return on ad spend
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
