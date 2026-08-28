"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { Crown, Sparkles, TrendingUp, Users } from "lucide-react"

import { AuthForm } from "@/components/auth/auth-form"
import { useAuth } from "@/lib/firebase/auth-context"

const HIGHLIGHTS = [
  {
    icon: TrendingUp,
    title: "Pipeline inteligente",
    body: "Prioriza leads con scoring por IA y cierra más rápido.",
  },
  {
    icon: Users,
    title: "Todo tu equipo",
    body: "Media buyers, closers y clientes en un solo comando.",
  },
  {
    icon: Sparkles,
    title: "Asistente Royal AI",
    body: "Recomendaciones accionables sobre cada lead y campaña.",
  },
]

export default function LoginPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.replace("/")
    }
  }, [loading, user, router])

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden flex-col justify-between overflow-hidden bg-primary p-10 text-primary-foreground lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, white 0, transparent 40%), radial-gradient(circle at 80% 60%, white 0, transparent 35%)",
          }}
        />
        <div className="relative flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-lg bg-primary-foreground/15">
            <Crown className="size-5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-semibold tracking-tight">Royal Sales IA</span>
            <span className="text-[11px] text-primary-foreground/70">Marketing & Sales OS</span>
          </div>
        </div>

        <div className="relative flex flex-col gap-8">
          <h1 className="max-w-md text-3xl font-semibold leading-tight text-balance">
            El sistema operativo de IA para equipos de marketing y ventas de alto rendimiento.
          </h1>
          <ul className="flex flex-col gap-5">
            {HIGHLIGHTS.map((h) => (
              <li key={h.title} className="flex items-start gap-3">
                <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-foreground/15">
                  <h.icon className="size-4.5" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{h.title}</span>
                  <span className="text-sm text-primary-foreground/70">{h.body}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-primary-foreground/60">
          © {new Date().getFullYear()} Royal Sales IA. Todos los derechos reservados.
        </p>
      </div>

      {/* Form panel */}
      <div className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center gap-3 text-center lg:hidden">
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Crown className="size-5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Royal Sales IA</span>
          </div>

          <div className="mb-6 flex flex-col gap-1.5">
            <h2 className="text-2xl font-semibold tracking-tight text-balance">
              Bienvenido de vuelta
            </h2>
            <p className="text-sm text-muted-foreground">
              Ingresa a tu command center de ventas.
            </p>
          </div>

          <AuthForm />
        </div>
      </div>
    </div>
  )
}
