"use client"

import { Bell } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { notifications } from "@/lib/mock-data"
import { relativeTime } from "@/lib/format"
import { cn } from "@/lib/utils"

const toneStyles: Record<string, string> = {
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  info: "bg-primary",
}

export function NotificationsMenu() {
  const unread = notifications.filter((n) => !n.read).length

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="icon" className="relative" aria-label="Notifications" />
        }
      >
        <Bell />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 flex size-2 items-center justify-center">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-70" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>Notifications</span>
          <Badge variant="secondary">{unread} new</Badge>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {notifications.map((n) => (
            <DropdownMenuItem key={n.id} className="items-start gap-3 py-2.5">
              <span
                className={cn(
                  "mt-1.5 size-2 shrink-0 rounded-full",
                  toneStyles[n.tone] ?? "bg-muted-foreground",
                  n.read && "opacity-30",
                )}
              />
              <div className="flex flex-col gap-0.5">
                <span className={cn("text-sm leading-snug", !n.read && "font-medium")}>{n.title}</span>
                <span className="text-xs text-muted-foreground leading-snug">{n.body}</span>
                <span className="text-xs text-muted-foreground/70">{relativeTime(n.createdAt)}</span>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
