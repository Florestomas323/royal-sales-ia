"use client"

import type React from "react"
import { useWorkspace, ALL_WORKSPACES } from "@/lib/firebase/workspace-context"

/**
 * Remounts everything below it when the selected workspace changes.
 *
 * Switching workspace used to leave the previous one's state behind: an open
 * prospect sheet, a half-filled dialog, a selection, and listeners whose late
 * results arrived after the switch and repopulated stale data. Several
 * screens stopped responding until the app was closed and reopened.
 *
 * A `key` derived from the selection is the smallest fix that actually works:
 * React unmounts the whole subtree, so every `useState`, every dialog and
 * every `onSnapshot` inside it is disposed, and a late callback from the old
 * subscription lands on an unmounted component instead of on live state.
 *
 * It sits INSIDE the providers on purpose: Firebase Auth, the workspace
 * context and the sidebar are not remounted, so nobody is signed out and the
 * workspace switcher itself keeps working.
 */
export function WorkspaceScope({ children }: { children: React.ReactNode }) {
  const { workspaceId, isSuperAdmin, status } = useWorkspace()

  // A super admin browsing every workspace at once is its own scope: moving
  // in or out of "Todos" must clear the per-workspace state just the same.
  const scope =
    status !== "ready"
      ? "loading"
      : workspaceId ?? (isSuperAdmin ? ALL_WORKSPACES : "none")

  return <div key={scope} className="contents">{children}</div>
}
