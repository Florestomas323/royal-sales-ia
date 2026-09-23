"use client"

import { useEffect, useMemo, useState } from "react"
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
import {
  fetchReadReceipts,
  markAllNotificationsRead,
  markReadReceipts,
  useNotifications,
} from "@/lib/firebase/notifications"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { useLeads } from "@/lib/firebase/leads"
import { isActiveLead } from "@/lib/leads"
import {
  notificationsPending,
  unreadCount,
  visibleNotifications,
  type LogicalNotification,
} from "@/lib/notifications"
import { toast } from "sonner"
import { describeError } from "@/lib/firebase/errors"
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
  const { items, loading: notificationsLoading, error } = useNotifications({
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
  /**
   * One row per logical event. Documents created before the deterministic id
   * existed can be duplicated in Firestore; they are collapsed here — newest
   * copy for the content, unread if ANY copy is unread — so the list shows one
   * row and the badge counts the event once. Nothing is deleted.
   */
  /**
   * A super admin reads every workspace's notifications, so the same lead
   * arrives once per recipient. They are collapsed by EVENT, and their read
   * state comes from server-side receipts — the Rule forbids them writing on
   * somebody else's document, and a distributor's read state is not theirs.
   */
  const [receipts, setReceipts] = useState<ReadonlySet<string>>(new Set())
  /**
   * Until this is true, a super admin's receipts are unknown — NOT "none".
   * Treating the empty initial set as the answer made every event look
   * unread for the few frames between the first snapshot and the fetch, which
   * is what made the badge flash a large number.
   */
  const [receiptsLoaded, setReceiptsLoaded] = useState(false)
  /**
   * Receipts belong to ONE person: a different super admin (same role, other
   * account) must never inherit them, so the fetch is keyed by identity, not
   * only by role. And the reset happens before the role check, so switching
   * to a member also drops whatever was held.
   */
  const identityKey = `${membership?.userId ?? ""}|${membership?.role ?? ""}|${isSuperAdmin ? "super" : "member"}`
  useEffect(() => {
    setReceipts((prev) => (prev.size === 0 ? prev : new Set()))
    setReceiptsLoaded(false)
    if (!isSuperAdmin) return
    let cancelled = false
    void fetchReadReceipts().then((keys) => {
      if (cancelled) return
      setReceipts(keys)
      setReceiptsLoaded(true)
    })
    return () => { cancelled = true }
  }, [isSuperAdmin, identityKey])

  /** Leads, notifications and (for a super admin) receipts must all be in. */
  const pending = notificationsPending({ isSuperAdmin, leadsLoading, notificationsLoading, receiptsLoaded })
  const live = useMemo(
    () =>
      visibleNotifications({
        items,
        archivedLeadIds,
        isSuperAdmin,
        readKeys: receipts,
        leadsLoading,
        notificationsLoading,
        receiptsLoaded,
      }),
    [items, archivedLeadIds, isSuperAdmin, receipts, leadsLoading, notificationsLoading, receiptsLoaded],
  )
  const unread = useMemo(() => unreadCount(live), [live])
  const recent = useMemo(() => live.slice(0, 30), [live])
  const workspaceName = (id: string) => workspaces.find((w) => w.id === id)?.name ?? id

  /** Marks a row read: receipts for a super admin, own documents otherwise. */
  async function markRead(rows: LogicalNotification[]) {
    const unread = rows.filter((r) => !r.read)
    if (unread.length === 0) return
    if (isSuperAdmin) {
      const keys = unread.map((r) => r.eventKey)
      // Optimistic: the badge drops now, and the receipt persists it.
      setReceipts((prev) => new Set([...prev, ...keys]))
      try {
        await markReadReceipts(keys)
      } catch (err) {
        setReceipts((prev) => new Set([...prev].filter((k) => !keys.includes(k))))
        throw err
      }
      return
    }
    await markAllNotificationsRead(unread)
  }

  async function open(n: LogicalNotification) {
    if (!n.read) {
      // Every historical copy for a member; a receipt for a super admin.
      // Skipping this entirely for super admins was why their badge never
      // went down.
      void markRead([n]).catch((err) => {
        // Silence hid a failing write behind a badge that never moved.
        toast.error(t.notifications.markError, { description: describeError(err).message })
      })
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
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={(e) => {
                e.preventDefault()
                void markRead(live).catch((err) =>
                  toast.error(t.notifications.markError, { description: describeError(err).message }),
                )
              }}
            >
              <CheckCheck className="size-3.5" />
              {t.notifications.markAllRead}
            </Button>
          )}
        </div>
        <DropdownMenuSeparator className="my-0" />
        {error ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t.notifications.loadError}</p>
        ) : pending ? (
          // Never "no hay notificaciones", and never a row marked unread on
          // an unknown receipt: the menu waits with the rest.
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">{t.common.loading}</p>
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
