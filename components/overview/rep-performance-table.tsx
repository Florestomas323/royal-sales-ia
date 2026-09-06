"use client"

import { useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useUsersForWorkspace, useUsers } from "@/lib/firebase/collections"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { computeRepPerformance, UNASSIGNED_OWNER, type Period } from "@/lib/metrics"
import { formatCurrency, formatNumber } from "@/lib/format"
import { t } from "@/lib/i18n"
import type { Lead } from "@/types"

/**
 * Per-rep performance. It only ever aggregates the leads the viewer already
 * receives from Firestore, so a rep never appears with leads from another
 * workspace and a `sales_rep` only sees their own row.
 */
export function RepPerformanceTable({ leads, period }: { leads: Lead[]; period: Period }) {
  const { workspaceId } = useWorkspace()
  // Names come from the active workspace; unknown ids show as "Sin asignar".
  const scoped = useUsersForWorkspace(workspaceId)
  const ambient = useUsers()
  const users = workspaceId ? scoped.users : ambient.users
  const names = useMemo(() => {
    const map: Record<string, string> = {}
    for (const u of users) map[u.id] = u.name
    return map
  }, [users])

  const rows = useMemo(() => computeRepPerformance(leads, { period }), [leads, period])
  const visible = rows.filter((r) => r.leads > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.overview.reps}</CardTitle>
        <CardDescription>{t.overview.repsDescription}</CardDescription>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {t.overview.repsEmpty}
          </p>
        ) : (
          <ul className="flex flex-col divide-y">
            {visible.map((row) => (
              <li key={row.userId} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-sm font-medium">{ownerLabel(row.userId, names)}</span>
                  <span className="shrink-0 font-mono text-sm tabular-nums">
                    {formatNumber(row.leads)} {t.overview.table.leads.toLowerCase()}
                  </span>
                </div>
                {/* Cards instead of a wide table: readable on a phone. */}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                  <Cell label={t.overview.table.contacted} value={formatNumber(row.contacted)} />
                  <Cell label={t.overview.table.appointments} value={formatNumber(row.inAppointmentStage)} />
                  <Cell label={t.overview.table.sales} value={formatNumber(row.sales)} />
                  <Cell
                    label={t.overview.table.revenue}
                    value={row.revenue === null ? t.overview.dash : formatCurrency(row.revenue, true)}
                  />
                  <Cell
                    label={t.overview.table.contactRate}
                    value={row.contactRate === null ? t.overview.dash : `${Math.round(row.contactRate * 100)}%`}
                  />
                  <Cell
                    label={t.overview.table.closeRate}
                    value={row.closeRate === null ? t.overview.dash : `${Math.round(row.closeRate * 100)}%`}
                  />
                </dl>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * "Sin asignar" is reserved for the single unowned bucket. A lead assigned to
 * a profile we cannot resolve (deleted, or outside the visible workspace) is
 * labelled distinctly with a short id, so two different owners never render
 * as the same row.
 */
function ownerLabel(userId: string, names: Record<string, string>): string {
  if (userId === UNASSIGNED_OWNER) return t.overview.table.unassigned
  const name = names[userId]
  if (name) return name
  return t.overview.table.unknownOwner(userId.slice(-6))
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start sm:justify-start">
      <dt>{label}</dt>
      <dd className="font-mono font-medium tabular-nums text-foreground">{value}</dd>
    </div>
  )
}
