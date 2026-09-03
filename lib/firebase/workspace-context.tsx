"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { sendEmailVerification } from "firebase/auth"
import { toast } from "sonner"
import { useAuth } from "./auth-context"
import { resolveIdentity, type ResolvedIdentity } from "./membership"
import { useWorkspaces } from "./workspaces"
import { describeError, type DataError } from "./errors"
import { Button } from "@/components/ui/button"
import { BrandMark } from "@/components/shared/brand-mark"
import { t } from "@/lib/i18n"
import type { Membership, User, UserRole, Workspace } from "@/types"

/** Key used to remember the super admin's last selected workspace. */
const ACTIVE_WS_KEY = "rsia.activeWorkspaceId"
/** Sentinel for "all workspaces" (super admin only). */
export const ALL_WORKSPACES = "__all__"

export type WorkspaceStatus =
  | "loading"
  | "ready"
  | "no_membership"
  | "unverified_email"
  | "error"

export interface DisplayUser {
  id: string
  name: string
  email: string
  role: UserRole
  avatarColor: string
}

interface WorkspaceContextValue {
  status: WorkspaceStatus
  error: DataError | null
  membership: Membership | null
  /** Team profile (may be null for a bootstrapped super admin without profile). */
  profile: User | null
  /** Always-available identity for the shell (falls back to Firebase Auth data). */
  currentUser: DisplayUser
  role: UserRole | null
  isSuperAdmin: boolean
  /** Active workspace for queries. `null` = all workspaces (super admin only). */
  workspaceId: string | null
  currentWorkspace: Workspace | null
  /** Workspaces the user can switch between (super admin: all; others: own). */
  workspaces: Workspace[]
  selectWorkspace: (id: string | typeof ALL_WORKSPACES) => void
  retry: () => void
}

const WorkspaceContext = createContext<WorkspaceContextValue | undefined>(undefined)

function readStoredWorkspace(): string | null {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage.getItem(ACTIVE_WS_KEY)
  } catch {
    return null
  }
}

function storeWorkspace(id: string) {
  try {
    window.localStorage.setItem(ACTIVE_WS_KEY, id)
  } catch {
    // Storage may be unavailable (private mode); selection is then session-only.
  }
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth()

  const [status, setStatus] = useState<WorkspaceStatus>("loading")
  const [error, setError] = useState<DataError | null>(null)
  const [identity, setIdentity] = useState<ResolvedIdentity | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [selected, setSelected] = useState<string | null>(null)

  // 1. Resolve membership → profile → workspace after login.
  useEffect(() => {
    let cancelled = false
    if (!user) {
      setIdentity(null)
      setStatus("loading")
      return
    }
    setStatus("loading")
    setError(null)
    resolveIdentity(user)
      .then((outcome) => {
        if (cancelled) return
        if (outcome.status === "ready") {
          setIdentity(outcome.identity)
          setStatus("ready")
        } else {
          setIdentity(null)
          setStatus(outcome.status)
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return
        const described = describeError(err)
        console.error("[workspace] resolve failed:", described.detail)
        setError(described)
        setIdentity(null)
        setStatus("error")
      })
    return () => {
      cancelled = true
    }
  }, [user, attempt])

  const membership = identity?.membership ?? null
  const isSuperAdmin = membership?.role === "super_admin"

  // 2. Workspaces available for switching.
  const { workspaces } = useWorkspaces({
    isSuperAdmin,
    ownWorkspaceId: membership?.workspaceId ?? null,
  })

  // 3. Active workspace: members are pinned to their own; super admin picks.
  useEffect(() => {
    if (!membership) return
    if (!isSuperAdmin) {
      setSelected(membership.workspaceId)
      return
    }
    const stored = readStoredWorkspace()
    const storedIsValid =
      stored === ALL_WORKSPACES || (stored !== null && workspaces.some((w) => w.id === stored))
    if (stored && (storedIsValid || workspaces.length === 0)) {
      setSelected(stored)
    } else if (workspaces.length > 0) {
      // No selection yet, or the remembered workspace no longer exists.
      setSelected(workspaces[0].id)
      storeWorkspace(workspaces[0].id)
    }
  }, [membership, isSuperAdmin, workspaces])

  const selectWorkspace = useCallback(
    (id: string | typeof ALL_WORKSPACES) => {
      if (!isSuperAdmin) return
      setSelected(id)
      storeWorkspace(id)
    },
    [isSuperAdmin],
  )

  const workspaceId = useMemo<string | null>(() => {
    if (!membership) return null
    if (!isSuperAdmin) return membership.workspaceId
    if (!selected || selected === ALL_WORKSPACES) return null
    return selected
  }, [membership, isSuperAdmin, selected])

  const currentWorkspace = useMemo<Workspace | null>(() => {
    if (!workspaceId) return null
    return workspaces.find((w) => w.id === workspaceId) ?? identity?.workspace ?? null
  }, [workspaceId, workspaces, identity])

  const currentUser = useMemo<DisplayUser>(() => {
    const profile = identity?.profile
    return {
      id: profile?.id ?? user?.uid ?? "",
      name: profile?.name || user?.displayName || user?.email?.split("@")[0] || "Usuario",
      email: profile?.email || user?.email || "",
      role: membership?.role ?? "viewer",
      avatarColor: profile?.avatarColor ?? "var(--chart-1)",
    }
  }, [identity, user, membership])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      status,
      error,
      membership,
      profile: identity?.profile ?? null,
      currentUser,
      role: membership?.role ?? null,
      isSuperAdmin,
      workspaceId,
      currentWorkspace,
      workspaces,
      selectWorkspace,
      retry,
    }),
    [
      status,
      error,
      membership,
      identity,
      currentUser,
      isSuperAdmin,
      workspaceId,
      currentWorkspace,
      workspaces,
      selectWorkspace,
      retry,
    ],
  )

  if (status !== "ready") {
    return (
      <WorkspaceContext.Provider value={value}>
        <TenancyGate
          status={status}
          error={error}
          email={user?.email ?? ""}
          onRetry={retry}
          onSignOut={signOut}
          onResendVerification={async () => {
            if (!user) return
            try {
              await sendEmailVerification(user)
              toast.success(t.tenancy.verificationSent)
            } catch (err) {
              toast.error(describeError(err).message)
            }
          }}
          onReloadUser={async () => {
            if (!user) return
            await user.reload()
            retry()
          }}
        />
      </WorkspaceContext.Provider>
    )
  }

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error("useWorkspace must be used within a WorkspaceProvider")
  return ctx
}

/** Small helper for role checks in the UI (Rules remain the authority). */
export function useCan() {
  const { role, isSuperAdmin } = useWorkspace()
  const admin = isSuperAdmin || role === "client_admin" || role === "manager"
  return {
    isSuperAdmin,
    isClientAdmin: isSuperAdmin || role === "client_admin",
    canManageWorkspace: admin,
    canManageTeam: admin,
    canManageClients: admin,
    canManageCampaigns: admin,
    canCreateLeads: admin || role === "sales_rep",
    isReadOnly: role === "viewer",
  }
}

/* -------------------------------------------------------------------------- */
/*  Gate screens (loading / no membership / unverified / error)               */
/* -------------------------------------------------------------------------- */

function TenancyGate({
  status,
  error,
  email,
  onRetry,
  onSignOut,
  onResendVerification,
  onReloadUser,
}: {
  status: WorkspaceStatus
  error: DataError | null
  email: string
  onRetry: () => void
  onSignOut: () => Promise<void>
  onResendVerification: () => Promise<void>
  onReloadUser: () => Promise<void>
}) {
  if (status === "loading") {
    return (
      <div className="flex min-h-svh items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <BrandMark size={48} priority className="size-12" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
            {t.shell.loadingWorkspace}
          </div>
        </div>
      </div>
    )
  }

  const copy =
    status === "no_membership"
      ? { title: t.tenancy.noMembershipTitle, body: t.tenancy.noMembershipBody(email) }
      : status === "unverified_email"
        ? { title: t.tenancy.unverifiedTitle, body: t.tenancy.unverifiedBody(email) }
        : { title: t.tenancy.errorTitle, body: error?.message ?? t.tenancy.errorBody }

  return (
    <div className="flex min-h-svh items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-md flex-col items-center gap-5 rounded-xl border bg-card p-8 text-center">
        <BrandMark size={48} priority className="size-12" />
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="text-sm text-muted-foreground">{copy.body}</p>
          {status === "error" && error?.detail && (
            <p className="mt-2 rounded-md bg-muted px-3 py-2 text-left font-mono text-[11px] text-muted-foreground break-all">
              {error.detail}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          {status === "unverified_email" && (
            <>
              <Button onClick={onResendVerification} variant="outline">
                {t.tenancy.resendVerification}
              </Button>
              <Button onClick={onReloadUser}>{t.tenancy.alreadyVerified}</Button>
            </>
          )}
          {status !== "unverified_email" && (
            <Button onClick={onRetry} variant="outline">
              {t.common.retry}
            </Button>
          )}
          <Button onClick={onSignOut} variant="ghost">
            {t.shell.signOut}
          </Button>
        </div>
      </div>
    </div>
  )
}
