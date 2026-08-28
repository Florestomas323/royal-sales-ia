"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { CalendarDays } from "lucide-react"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { GlobalSearch } from "./global-search"
import { NotificationsMenu } from "./notifications-menu"
import { NewLeadDialog } from "./new-lead-dialog"
import { navSections } from "./nav-config"
import { periods } from "@/lib/mock-data"

function useCurrentTitle() {
  const pathname = usePathname()
  const all = navSections.flatMap((s) => s.items)
  const match =
    all.find((i) => i.href !== "/" && pathname.startsWith(i.href)) ??
    all.find((i) => i.href === pathname)
  return match?.label ?? "Overview"
}

export function TopBar() {
  const title = useCurrentTitle()

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-border/70 bg-background/80 px-4 backdrop-blur-md md:px-6">
      <SidebarTrigger className="text-muted-foreground" />
      <Separator orientation="vertical" className="h-6" />
      <h1 className="hidden text-base font-semibold tracking-tight sm:block font-serif">
        {title}
      </h1>

      <div className="ml-auto flex items-center gap-2 md:gap-3">
        <div className="hidden md:block">
          <GlobalSearch />
        </div>
        <Select defaultValue="7d">
          <SelectTrigger className="h-9 gap-2" aria-label="Reporting period">
            <CalendarDays className="size-4 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="end">
            {periods.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <NotificationsMenu />
        <NewLeadDialog />
      </div>
    </header>
  )
}
