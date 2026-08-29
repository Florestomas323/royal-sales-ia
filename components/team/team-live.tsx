"use client"

import { useUsers } from "@/lib/firebase/collections"
import { UserAvatar } from "@/components/shared/user-avatar"
import { ROLE_LABELS } from "@/lib/constants"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  active: "default",
  invited: "secondary",
  inactive: "outline",
}

const ROLE_VARIANT: Record<string, "default" | "secondary" | "outline"> = {
  super_admin: "default",
  client_admin: "secondary",
  manager: "secondary",
  sales_rep: "outline",
  viewer: "outline",
}

export function TeamLive() {
  const { users, loading } = useUsers()

  const active = users.filter((u) => u.status === "active")
  const totalLeads = users.reduce((s, u) => s + u.assignedLeads, 0)
  const totalSales = users.reduce((s, u) => s + u.sales, 0)

  const stats = [
    { label: "Team members", value: users.length },
    { label: "Active seats", value: active.length },
    { label: "Assigned leads", value: totalLeads },
    { label: "Sales closed", value: totalSales },
  ]

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="gap-0 py-4">
              <CardContent className="flex flex-col gap-2 px-4">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-6 w-10" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Card className="overflow-hidden">
          <CardContent className="flex flex-col gap-4 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="gap-0 py-4">
            <CardContent className="px-4">
              <p className="text-xs text-muted-foreground">{s.label}</p>
              <p className="mt-1 font-mono text-xl font-semibold tabular-nums">{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Appointments</TableHead>
              <TableHead className="text-right">Sales</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <UserAvatar name={user.name} color={user.avatarColor} />
                    <div>
                      <p className="font-medium leading-tight">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={ROLE_VARIANT[user.role] ?? "outline"}>
                    {ROLE_LABELS[user.role]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[user.status] ?? "outline"} className="capitalize">
                    {user.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {user.assignedLeads || "—"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {user.appointments || "—"}
                </TableCell>
                <TableCell className="text-right font-mono tabular-nums">
                  {user.sales || "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
