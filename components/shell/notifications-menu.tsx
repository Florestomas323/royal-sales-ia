"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { Bell, CheckCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { markAllNotificationsRead, markNotificationRead, useNotifications } from "@/lib/firebase/notifications"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { useLeads } from "@/lib/firebase/leads"
import { isActiveLead } from "@/lib/leads"
import { unreadCount } from "@/lib/notifications"
import { formatRelativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"
import type { AppNotification } from "@/types"

/**
 * The bell. Real documents from `notifications`, live. Tapping one marks it
 * read and opens the lead's sheet; the super admin also sees which workspace
 * each one belongs to, since they may be looking at all of them.
 */
export function NotificationsMenu() {
  const router = useRouter()
  const { membership, isSuperAdmin, workspaceId, workspaces } = useWorkspace()
  const { leads, loading: leadsLoading } = useLeads("all")
  const { items, error } = useNotifications({
    userId: membership?.userId ?? null,
    isSuperAdmin,
    workspaceId,
  })
  /**
   * Notifications whose lead is in the trash are dropped from the menu and
   * from the badge: an archived lead takes part in nothing, and tapping one
   * would open a prospect that no longer exists operationally. The documents
   * stay in Firestore — restoring the lead simply stops hiding them, and no
   * old notification is regenerated.
   *
   * A lead missing from `leads` for any OTHER reason (permissions, another
   * workspace) is left alone; only a lead we can read AND see archived counts.
   */
  const archivedLeadIds = useMemo(
    () => new Set(leads.filter((l) => !isActiveLead(l)).map((l) => l.id)),
    [leads],
  )
  // Nothing is shown or counted until the leads are known: otherwise the badge
  // would briefly include a notification about an archived lead.
  const live = useMemo(
    () => (leadsLoading ? [] : items.filter((n) => !archivedLeadIds.has(n.leadId))),
    [items, archivedLeadIds, leadsLoading],
  )
  const unread = useMemo(() => unreadCount(live), [live])
  const recent = useMemo(() => live.slice(0, 30), [live])
  const workspaceName = (id: string) => workspaces.find((w) => w.id === id)?.name ?? id

  async function open(n: AppNotification) {
    if (!n.read && !isSuperAdmin) {
      // Best-effort: navigation must not wait on the write.
      void markNotificationRead(n.id).catch(() => {})
    }
    router.push(`/leads?lead=${encodeURIComponent(n.leadId)}`)
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="relative" aria-label={t.notifications.ariaLabel} />
        }
      >
        <Bell className="size-4" />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-none text-primary-foreground"
            aria-label={t.notifications.unread(unread)}
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[min(92vw,22rem)] p-0">
        <div className="flex items-center justify-between gap-2 px-3 py-2">
          <p className="text-sm font-medium">{t.notifications.title}</p>
          {unread > 0 && !isSuperAdmin && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={(e) => { e.preventDefault(); void markAllNotificationsRead(live) }}
            >
              <CheckCheck className="size-3.5" />
              {t.notifications.markAllRead}
            </Button>
          )}
        </div>
        <DropdownMenuSeparator className="my-0" />
        {error ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t.notifications.loadError}</p>
        ) : recent.length === 0 ? (
          <div className="flex flex-col gap-1 px-3 py-6 text-center">
            <span className="text-sm font-medium">{t.notifications.emptyTitle}</span>
            <span className="text-xs text-pretty text-muted-foreground">{t.notifications.emptyBody}</span>
          </div>
        ) : (
          <DropdownMenuGroup className="max-h-[60svh] overflow-y-auto p-1">
            {recent.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onClick={() => open(n)}
                className={cn("flex flex-col items-start gap-0.5 py-2", !n.read && "bg-primary/5")}
              >
                <div className="flex w-full items-center gap-2">
                  {!n.read && <span className="size-2 shrink-0 rounded-full bg-primary" aria-hidden="true" />}
                  <span className={cn("truncate text-sm", !n.read && "font-medium")}>{n.title}</span>
                  <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                    {formatRelativeTime(n.createdAt)}
                  </span>
                </div>
                <span className="w-full truncate text-xs text-muted-foreground">{n.message}</span>
                {isSuperAdmin && (
                  <Badge variant="outline" className="mt-0.5 text-[10px]">{workspaceName(n.workspaceId)}</Badge>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
