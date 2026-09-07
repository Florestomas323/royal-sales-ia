"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Check, MoreHorizontal } from "lucide-react"
import { setMemberStatus, updateMemberRole, useUsers } from "@/lib/firebase/collections"
import { describeError } from "@/lib/firebase/errors"
import { useCan, useWorkspace } from "@/lib/firebase/workspace-context"
import { ASSIGNABLE_ROLES, canManageMember, canToggleStatus, isSelf, memberLabel, nextStatus } from "@/lib/team"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
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
interface MemberContext {
  role: ReturnType<typeof useWorkspace>["role"]
  workspaceId: string | null
  isSuperAdmin: boolean
  userId: string | null
}

function MemberActions({
  member,
  ctx,
  canChangeRole,
}: {
  member: User
  ctx: MemberContext
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
      // The workspace comes from the member's own loaded document, so the
      // memberships query is bounded exactly as the Rules require.
      await updateMemberRole(member.id, role, member.workspaceId || null)
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
      await setMemberStatus(member.id, target, member.workspaceId || null)
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
            {/* GroupLabel is a group HEADING: Base UI throws if it is not
                inside a Group, which crashed the menu on open. Here it does
                label a group — the roles — so the Group is what was missing. */}
            <DropdownMenuGroup>
              <DropdownMenuLabel>{t.team.manage.changeRole}</DropdownMenuLabel>
              {ASSIGNABLE_ROLES.map((r) => (
                // The current role is ticked, not disabled: a greyed-out line
                // reads like a broken option instead of "this is the one".
                <DropdownMenuItem key={r} disabled={busy} onClick={() => changeRole(r)}>
                  <Check
                    className={cn("size-4", r === member.role ? "opacity-100" : "opacity-0")}
                  />
                  {ROLE_LABELS[r]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        ) : (
          // Plain text, not a group heading: it labels nothing.
          <p className="px-1.5 py-1 text-xs text-muted-foreground text-pretty">
            {t.team.manage.onlyClientAdmin}
          </p>
        )}
        {canToggleStatus(member) ? (
          <DropdownMenuItem disabled={busy} onClick={toggleStatus}>
            {member.status === "active" ? t.team.manage.deactivate : t.team.manage.activate}
          </DropdownMenuItem>
        ) : (
          <p className="px-1.5 py-1 text-xs text-muted-foreground text-pretty">
            {t.team.manage.invitedLocked}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Phone layout. A six-column table cannot fit an iPhone without pushing the
 * page sideways, so each member becomes a card: identity on top, role and
 * status as badges, the three counters in a row, actions within thumb reach.
 */
function MemberCard({
  user,
  ctx,
  canChangeRole,
}: {
  user: User
  ctx: MemberContext
  canChangeRole: boolean
}) {
  const counters: [string, number][] = [
    [t.team.table.leads, user.assignedLeads],
    [t.team.table.appointments, user.appointments],
    [t.team.table.sales, user.sales],
  ]

  return (
    <Card className="gap-0 py-4">
      <CardContent className="flex flex-col gap-3 px-4">
        <div className="flex items-start gap-3">
          <UserAvatar name={memberLabel(user)} color={user.avatarColor} />
          {/* min-w-0 lets a long name truncate instead of widening the row. */}
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium leading-tight">{memberLabel(user)}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
          <MemberActions member={user} ctx={ctx} canChangeRole={canChangeRole} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge variant={ROLE_VARIANT[user.role] ?? "outline"}>{ROLE_LABELS[user.role]}</Badge>
          <Badge variant={STATUS_VARIANT[user.status] ?? "outline"}>
            {MEMBER_STATUS_LABELS[user.status as MemberStatus] ?? user.status}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t pt-3">
          {counters.map(([label, value]) => (
            <div key={label} className="flex flex-col">
              <span className="text-xs text-muted-foreground">{label}</span>
              <span className="font-mono text-sm font-semibold tabular-nums">{value || "—"}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
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
      {/* Deactivating really revokes access (Rules + server-auth): say so. */}
      <p className="text-xs text-muted-foreground text-pretty">{t.team.manage.deactivateNotice}</p>

      {/* Phone: one card per member, nothing to scroll sideways. */}
      <div className="flex flex-col gap-3 md:hidden">
        {users.map((user) => (
          <MemberCard key={user.id} user={user} ctx={ctx} canChangeRole={isClientAdmin} />
        ))}
      </div>

      <Card className="hidden py-0 md:block">
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
