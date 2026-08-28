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
import { campaigns } from "@/lib/mock-data"
import { PlatformMark } from "@/components/shared/platform-badge"
import { formatCurrency, formatNumber } from "@/lib/format"
import { PLATFORM_LABELS } from "@/lib/constants"
import type { CampaignStatus } from "@/types"

const STATUS_VARIANT: Record<CampaignStatus, "default" | "secondary" | "outline"> = {
  active: "default",
  learning: "secondary",
  paused: "secondary",
  ended: "outline",
}

export function CampaignsTable() {
  const [query, setQuery] = useState("")

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return campaigns
    return campaigns.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        PLATFORM_LABELS[c.platform].toLowerCase().includes(q),
    )
  }, [query])

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-4">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search campaigns"
            className="pl-9"
          />
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campaign</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Spend</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">CPL</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">ROAS</TableHead>
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
                    <TableCell>
                      <Badge variant={STATUS_VARIANT[c.status]} className="capitalize">
                        {c.status}
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
