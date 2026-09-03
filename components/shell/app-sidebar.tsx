'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ChevronsUpDown, LogOut, Settings, Sparkles } from 'lucide-react'

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
import { BrandMark } from '@/components/shared/brand-mark'
import { navSections } from './nav-config'
import { t } from '@/lib/i18n'
import { ROLE_LABELS } from '@/lib/constants'
import { useAuth } from '@/lib/firebase/auth-context'
import { useWorkspace } from '@/lib/firebase/workspace-context'
import { WorkspaceSwitcher } from './workspace-switcher'

export function AppSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useAuth()
  const { currentUser, currentWorkspace, isSuperAdmin } = useWorkspace()

  const displayName = currentUser.name
  const displayEmail = currentUser.email
  const workspaceLabel = currentWorkspace?.name ?? (isSuperAdmin ? t.tenancy.superAdminGlobal : t.tenancy.workspace)

  async function handleLogout() {
    await signOut()
    router.replace('/login')
  }

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-1 py-1.5">
          <BrandMark size={32} priority className="size-8" />
          <div className="flex flex-col leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">
              Royal Sales IA
            </span>
            <span className="text-[11px] text-sidebar-foreground/60">
              {t.shell.brandTagline}
            </span>
          </div>
        </div>
        <WorkspaceSwitcher />
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
                  name={displayName}
                  color={currentUser.avatarColor}
                />
                <div className="flex flex-1 flex-col text-left leading-tight group-data-[collapsible=icon]:hidden">
                  <span className="truncate text-sm font-medium text-sidebar-foreground">
                    {displayName}
                  </span>
                  <span className="truncate text-[11px] text-sidebar-foreground/60">
                    {workspaceLabel} · {ROLE_LABELS[currentUser.role]}
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
                    name={displayName}
                    color={currentUser.avatarColor}
                  />
                  <div className="flex flex-col leading-tight">
                    <span className="text-sm font-medium">
                      {displayName}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {displayEmail}
                    </span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem>
                    <Sparkles />
                    {t.shell.upgradePlan}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    render={<Link href="/settings" />}
                  >
                    <Settings />
                    {t.shell.workspaceSettings}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={handleLogout}>
                  <LogOut />
                  {t.shell.signOut}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
