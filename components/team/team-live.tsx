"use client"

import { useState } from "react"
import { toast } from "sonner"
import { MoreHorizontal } from "lucide-react"
import { setMemberStatus, updateMemberRole, useUsers } from "@/lib/firebase/collections"
import { describeError } from "@/lib/firebase/errors"
import { useCan, useWorkspace } from "@/lib/firebase/workspace-context"
import { ASSIGNABLE_ROLES, canManageMember, canToggleStatus, isSelf, memberLabel, nextStatus } from "@/lib/team"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { UserAvatar } from "@/components/shared/user-avatar"
import { MEMBER_STATUS_LABELS, ROLE_LABELS } from "@/lib/constants"
import { t } from "@/lib/i18n"
import type { MemberStatus, User } from "@/types"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { DataErrorState } from "@/components/shared/data-error-state"
import { DemoRowsNotice } from "@/components/shared/demo-data-badge"
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

/**
 * Role and status actions for ONE member.
 *
 * Changing a role rewrites `memberships/{authUid}` too, and only a
 * client_admin may write a membership — so a manager sees the team but does
 * not get an action that Rules would reject halfway through.
 */
function MemberActions({
  member,
  ctx,
  canChangeRole,
}: {
  member: User
  ctx: { role: ReturnType<typeof useWorkspace>["role"]; workspaceId: string | null; isSuperAdmin: boolean; userId: string | null }
  canChangeRole: boolean
}) {
  const [busy, setBusy] = useState(false)
  const manageable = canManageMember(ctx, member)
  const self = isSelf(ctx, member)
  const label = memberLabel(member)

  if (!manageable || self) return null

  async function changeRole(role: (typeof ASSIGNABLE_ROLES)[number]) {
    if (role === member.role) return
    setBusy(true)
    try {
      await updateMemberRole(member.id, role)
      toast.success(t.team.manage.roleUpdated, {
        description: t.team.manage.roleUpdatedDescription(label, ROLE_LABELS[role]),
      })
    } catch (err) {
      toast.error(t.team.manage.roleError, { description: describeError(err).message })
    } finally {
      setBusy(false)
    }
  }

  async function toggleStatus() {
    const target = nextStatus(member.status as MemberStatus)
    setBusy(true)
    try {
      await setMemberStatus(member.id, target)
      toast.success(t.team.manage.statusUpdated, {
        description: target === "inactive"
          ? t.team.manage.deactivated(label)
          : t.team.manage.activated(label),
      })
    } catch (err) {
      toast.error(t.team.manage.statusError, { description: describeError(err).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" disabled={busy} className="size-11 sm:size-8">
            <MoreHorizontal className="size-4" />
            <span className="sr-only">{t.team.manage.actions}</span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-52">
        {canChangeRole ? (
          <>
            <DropdownMenuLabel>{t.team.manage.changeRole}</DropdownMenuLabel>
            {ASSIGNABLE_ROLES.map((r) => (
              <DropdownMenuItem
                key={r}
                disabled={busy || r === member.role}
                onClick={() => changeRole(r)}
              >
                {ROLE_LABELS[r]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>
        ) : (
          <DropdownMenuLabel className="font-normal text-muted-foreground text-pretty">
            {t.team.manage.onlyClientAdmin}
          </DropdownMenuLabel>
        )}
        {canToggleStatus(member) ? (
          <DropdownMenuItem disabled={busy} onClick={toggleStatus}>
            {member.status === "active" ? t.team.manage.deactivate : t.team.manage.activate}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuLabel className="font-normal text-muted-foreground text-pretty">
            {t.team.manage.invitedLocked}
          </DropdownMenuLabel>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function TeamLive() {
  const { users, loading, error } = useUsers()
  const { role, workspaceId, isSuperAdmin, membership } = useWorkspace()
  const { isClientAdmin } = useCan()
  const ctx = { role, workspaceId, isSuperAdmin, userId: membership?.userId ?? null }

  const active = users.filter((u) => u.status === "active")
  const totalLeads = users.reduce((s, u) => s + u.assignedLeads, 0)
  const totalSales = users.reduce((s, u) => s + u.sales, 0)

  const stats = [
    { label: t.team.stats.members, value: users.length },
    { label: t.team.stats.activeSeats, value: active.length },
    { label: t.team.stats.assignedLeads, value: totalLeads },
    { label: t.team.stats.salesClosed, value: totalSales },
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
      {error && <DataErrorState error={error} />}
      <DemoRowsNotice rows={users} />
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

      {!workspaceId && !isSuperAdmin && (
        <p className="text-sm text-muted-foreground">{t.team.manage.noWorkspace}</p>
      )}
      {/* Deactivating is an assignment flag, not a session kill: say so. */}
      <p className="text-xs text-muted-foreground text-pretty">{t.team.manage.deactivateNotice}</p>

      <Card className="overflow-x-auto py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.team.table.member}</TableHead>
              <TableHead>{t.team.table.role}</TableHead>
              <TableHead>{t.team.table.status}</TableHead>
              <TableHead className="text-right">{t.team.table.leads}</TableHead>
              <TableHead className="text-right">{t.team.table.appointments}</TableHead>
              <TableHead className="text-right">{t.team.table.sales}</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <UserAvatar name={memberLabel(user)} color={user.avatarColor} />
                    <div className="min-w-0">
                      {/* Never the document id: a member is a person, not a key. */}
                      <p className="truncate font-medium leading-tight">{memberLabel(user)}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={ROLE_VARIANT[user.role] ?? "outline"}>
                    {ROLE_LABELS[user.role]}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[user.status] ?? "outline"}>
                    {MEMBER_STATUS_LABELS[user.status as MemberStatus] ?? user.status}
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
                <TableCell className="text-right">
                  <MemberActions member={user} ctx={ctx} canChangeRole={isClientAdmin} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
