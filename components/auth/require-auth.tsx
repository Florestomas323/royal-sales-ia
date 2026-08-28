"use client"

import { useEffect, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import { Crown } from "lucide-react"
import { useAuth } from "@/lib/firebase/auth-context"

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
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Crown className="size-6" />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="size-4 animate-spin rounded-full border-2 border-muted border-t-primary" />
            Cargando tu workspace…
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
