"use client"

import { useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/lib/firebase/auth-context"
import { BrandMark } from "@/components/shared/brand-mark"
import { t } from "@/lib/i18n"

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/login")
    }
  }, [loading, user, router])

  // While resolving the session, or before the redirect kicks in, show a
  // branded splash so protected content never flashes.
  if (loading || !user) {
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

  return <>{children}</>
}
