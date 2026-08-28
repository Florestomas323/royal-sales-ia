'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronsUpDown, Crown, LogOut, Settings, Sparkles } from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { UserAvatar } from '@/components/shared/user-avatar'
import { navSections } from './nav-config'
import { currentUser, currentWorkspace } from '@/lib/mock-data'
import { ROLE_LABELS } from '@/lib/constants'

export function AppSidebar() {
  const pathname = usePathname()

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-1 py-1.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Crown className="size-4" />
          </div>
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
              Royal Sales IA
            </span>
            <span className="text-[11px] text-sidebar-foreground/60">
              Marketing & Sales OS
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {navSections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {section.items.map((item) => {
                  const active =
                    item.href === '/'
                      ? pathname === '/'
                      : pathname.startsWith(item.href)
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.label}
                        render={<Link href={item.href} />}
                      >
                        <item.icon />
                        <span>{item.label}</span>
                      </SidebarMenuButton>
                      {item.badge && (
                        <SidebarMenuBadge>{item.badge}</SidebarMenuBadge>
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <SidebarMenuButton
                    size="lg"
                    className="data-[state=open]:bg-sidebar-accent"
                  />
                }
              >
                <UserAvatar
                  name={currentUser.name}
                  color={currentUser.avatarColor}
                />
                <div className="flex flex-1 flex-col text-left leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate text-sm font-medium text-sidebar-foreground">
                    {currentUser.name}
                  </span>
                  <span className="truncate text-[11px] text-sidebar-foreground/60">
                    {currentWorkspace.name} · {ROLE_LABELS[currentUser.role]}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4 text-sidebar-foreground/60 group-data-[collapsible=icon]:hidden" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="min-w-56"
              >
                <DropdownMenuLabel className="flex items-center gap-2">
                  <UserAvatar
                    name={currentUser.name}
                    color={currentUser.avatarColor}
                  />
                  <div className="flex flex-col leading-tight">
                    <span className="text-sm font-medium">
                      {currentUser.name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {currentUser.email}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    <Sparkles />
                    Upgrade plan
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    render={<Link href="/settings" />}
                  >
                    <Settings />
                    Workspace settings
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive">
                  <LogOut />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
