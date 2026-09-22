import type React from "react"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/shell/app-sidebar"
import { TopBar } from "@/components/shell/top-bar"
import { RequireAuth } from "@/components/auth/require-auth"
import { WorkspaceProvider } from "@/lib/firebase/workspace-context"
import { WorkspaceScope } from "@/components/shell/workspace-scope"
// TEMPORARY DIAGNOSTIC (?diag=1). Remove with lib/diagnostics/.
import { DiagOverlay } from "@/components/diagnostics/diag-overlay"

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireAuth>
      <WorkspaceProvider>
      <DiagOverlay mount="layout" />
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {/* Remounts on workspace change: no stale state, dialogs or
              listeners survive the switch. TopBar is INSIDE on purpose —
              NewLeadDialog lives there, and while it stayed outside it kept
              the assignee and the campaign of the previous workspace, which
              the server then rejected as `invalid_assignee`.
              AppSidebar and the providers stay outside, so the workspace
              switcher keeps working and nobody is signed out. */}
          <WorkspaceScope>
            <TopBar />
            <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">{children}</main>
          </WorkspaceScope>
        </SidebarInset>
      </SidebarProvider>
      </WorkspaceProvider>
    </RequireAuth>
  )
}
