"use client"

import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { t } from "@/lib/i18n"

/**
 * Notifications.
 *
 * Nothing generates notifications yet (they will come from the activity log),
 * so this shows an honest empty state instead of the demo feed it used to
 * render. No unread badge is displayed, because there is nothing unread.
 */
export function NotificationsMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="relative" aria-label={t.notifications.ariaLabel} />
        }
      >
        <Bell className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {/* Panel heading, not a group label: GroupLabel throws outside a Group. */}
        <p className="px-1.5 py-1 text-sm font-medium">{t.notifications.title}</p>
        <DropdownMenuSeparator />
        <div className="flex flex-col gap-1 px-3 py-6 text-center">
          <span className="text-sm font-medium">{t.notifications.emptyTitle}</span>
          <span className="text-xs text-pretty text-muted-foreground">
            {t.notifications.emptyBody}
          </span>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
