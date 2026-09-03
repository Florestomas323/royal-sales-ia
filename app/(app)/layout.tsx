import type React from "react"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/shell/app-sidebar"
import { TopBar } from "@/components/shell/top-bar"
import { RequireAuth } from "@/components/auth/require-auth"
import { WorkspaceProvider } from "@/lib/firebase/workspace-context"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <WorkspaceProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <TopBar />
          <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">{children}</main>
        </SidebarInset>
      </SidebarProvider>
      </WorkspaceProvider>
    </RequireAuth>
  )
}
