"use client"

import { Building2, Check, ChevronsUpDown, Globe } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenuButton } from "@/components/ui/sidebar"
import { ALL_WORKSPACES, useWorkspace } from "@/lib/firebase/workspace-context"
import { t } from "@/lib/i18n"

/**
 * Sidebar workspace selector. Only interactive for super_admin; members see
 * their own workspace name as a static label.
 */
export function WorkspaceSwitcher() {
  const { isSuperAdmin, workspaces, workspaceId, currentWorkspace, selectWorkspace } =
    useWorkspace()

  const label = currentWorkspace?.name ?? (isSuperAdmin ? t.tenancy.allWorkspaces : t.tenancy.workspace)

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-sidebar-foreground/70 group-data-[collapsible=icon]:hidden">
        <Building2 className="size-3.5" />
        <span className="truncate">{label}</span>
      </div>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<SidebarMenuButton size="sm" className="data-[state=open]:bg-sidebar-accent" />}
      >
        {workspaceId ? <Building2 /> : <Globe />}
        <span className="truncate">{label}</span>
        <ChevronsUpDown className="ml-auto size-3.5 text-sidebar-foreground/60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="start" className="min-w-56">
        <DropdownMenuLabel>{t.tenancy.switchWorkspace}</DropdownMenuLabel>
        <DropdownMenuItem onClick={() => selectWorkspace(ALL_WORKSPACES)}>
          <Globe />
          {t.tenancy.allWorkspaces}
          {!workspaceId && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {workspaces.map((ws) => (
          <DropdownMenuItem key={ws.id} onClick={() => selectWorkspace(ws.id)}>
            <span
              className="size-3 shrink-0 rounded-sm"
              style={{ backgroundColor: ws.logoColor }}
              aria-hidden="true"
            />
            <span className="truncate">{ws.name}</span>
            {workspaceId === ws.id && <Check className="ml-auto size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
