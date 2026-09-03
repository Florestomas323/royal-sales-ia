"use client"

import { useMemo, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Search } from "lucide-react"
import { PlatformMark } from "@/components/shared/platform-badge"
import { CAMPAIGN_OBJECTIVE_LABELS } from "@/lib/constants"
import { campaignObjective } from "@/lib/leads"
import { formatCurrency, formatNumber } from "@/lib/format"
import { CAMPAIGN_STATUS_LABELS, PLATFORM_LABELS } from "@/lib/constants"
import { t } from "@/lib/i18n"
import type { Campaign, CampaignStatus } from "@/types"

const STATUS_VARIANT: Record<CampaignStatus, "default" | "secondary" | "outline"> = {
  active: "default",
  learning: "secondary",
  paused: "secondary",
  ended: "outline",
}

export function CampaignsTable({ campaigns }: { campaigns: Campaign[] }) {
  const [query, setQuery] = useState("")

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return campaigns
    return campaigns.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        PLATFORM_LABELS[c.platform].toLowerCase().includes(q),
    )
  }, [query, campaigns])

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.campaigns.searchPlaceholder}
            className="pl-9"
          />
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.campaigns.table.campaign}</TableHead>
                <TableHead className="hidden sm:table-cell">{t.campaigns.table.objective}</TableHead>
                <TableHead>{t.campaigns.table.status}</TableHead>
                <TableHead className="text-right">{t.campaigns.table.spend}</TableHead>
                <TableHead className="text-right">{t.campaigns.table.leads}</TableHead>
                <TableHead className="text-right">{t.campaigns.table.cpl}</TableHead>
                <TableHead className="text-right">{t.campaigns.table.revenue}</TableHead>
                <TableHead className="text-right">{t.campaigns.table.roas}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => {
                return (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <PlatformMark platform={c.platform} />
                        <div className="flex flex-col">
                          <span className="font-medium leading-tight">{c.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {PLATFORM_LABELS[c.platform]}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Badge variant="outline">{CAMPAIGN_OBJECTIVE_LABELS[campaignObjective(c)]}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[c.status]}>
                        {CAMPAIGN_STATUS_LABELS[c.status]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatCurrency(c.spend, true)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatNumber(c.leads)}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {formatCurrency(c.cpl)}
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm tabular-nums">
                      {formatCurrency(c.revenue, true)}
                    </TableCell>
                    <TableCell className="text-right">
                      <span
                        className="font-mono text-sm font-semibold tabular-nums"
                        style={{
                          color: c.roas >= 3 ? "var(--success)" : c.roas >= 2 ? "var(--warning)" : "var(--destructive)",
                        }}
                      >
                        {c.roas.toFixed(1)}x
                      </span>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  )
}
