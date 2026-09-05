"use client"

import * as React from "react"
import { usePathname } from "next/navigation"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Separator } from "@/components/ui/separator"
import { GlobalSearch } from "./global-search"
import { NotificationsMenu } from "./notifications-menu"
import { NewLeadDialog } from "./new-lead-dialog"
import { navSections } from "./nav-config"
import { t } from "@/lib/i18n"

function useCurrentTitle() {
  const pathname = usePathname()
  const all = navSections.flatMap((s) => s.items)
  const match =
    all.find((i) => i.href !== "/" && pathname.startsWith(i.href)) ??
    all.find((i) => i.href === pathname)
  return match?.label ?? t.nav.sections.overview
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
        <NotificationsMenu />
        <NewLeadDialog />
      </div>
    </header>
  )
}
