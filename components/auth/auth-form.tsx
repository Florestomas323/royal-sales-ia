"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Loader2 } from "lucide-react"
import { FirebaseError } from "firebase/app"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { useAuth } from "@/lib/firebase/auth-context"

type Mode = "signin" | "signup"

function friendlyError(code: string): string {
  switch (code) {
    case "auth/invalid-email":
      return "El correo no tiene un formato válido."
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Correo o contraseña incorrectos."
    case "auth/email-already-in-use":
      return "Ya existe una cuenta con este correo. Inicia sesión."
    case "auth/weak-password":
      return "La contraseña debe tener al menos 6 caracteres."
    case "auth/too-many-requests":
      return "Demasiados intentos. Espera un momento e inténtalo de nuevo."
    case "auth/operation-not-allowed":
      return "El acceso con email/contraseña aún no está habilitado en Firebase. Actívalo en Authentication → Sign-in method."
    case "auth/configuration-not-found":
      return "Falta configurar Authentication en Firebase. Habilita el proveedor Email/Password en la consola."
    case "auth/network-request-failed":
      return "Error de red. Revisa tu conexión e inténtalo de nuevo."
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Se cerró la ventana de Google antes de terminar. Inténtalo de nuevo."
    case "auth/popup-blocked":
      return "El navegador bloqueó la ventana de Google. Permite las ventanas emergentes."
    case "auth/unauthorized-domain":
      return "Este dominio no está autorizado en Firebase. Agrégalo en Authentication → Settings → Authorized domains."
    default:
      return "Algo salió mal. Inténtalo de nuevo."
  }
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-4" data-icon="inline-start">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

export function AuthForm() {
  const { signIn, signUp, signInWithGoogle } = useAuth()
  const router = useRouter()

  const [mode, setMode] = useState<Mode>("signin")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const isSignup = mode === "signup"

  async function handleGoogle() {
    setError(null)
    setGoogleLoading(true)
    try {
      await signInWithGoogle()
      router.replace("/")
    } catch (err) {
      if (err instanceof FirebaseError) {
        setError(friendlyError(err.code))
      } else {
        setError("No se pudo continuar con Google. Inténtalo de nuevo.")
      }
      setGoogleLoading(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (isSignup) {
        await signUp(name.trim(), email.trim(), password)
      } else {
        await signIn(email.trim(), password)
      }
      router.replace("/")
    } catch (err) {
      if (err instanceof FirebaseError) {
        setError(friendlyError(err.code))
      } else {
        setError("Algo salió mal. Inténtalo de nuevo.")
      }
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="mb-6 flex flex-col gap-1.5">
        <h2 className="text-2xl font-semibold tracking-tight text-balance">
          {isSignup ? "Crea tu cuenta" : "Bienvenido de vuelta"}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isSignup
            ? "Empieza a operar tu marketing y ventas con IA."
            : "Ingresa a tu command center de ventas."}
        </p>
      </div>

      <FieldGroup>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogle}
          disabled={googleLoading || submitting}
        >
          {googleLoading ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <GoogleMark />
          )}
          Continuar con Google
        </Button>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">o con tu correo</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {isSignup && (
          <Field>
            <FieldLabel htmlFor="name">Nombre completo</FieldLabel>
            <Input
              id="name"
              type="text"
              autoComplete="name"
              placeholder="Ana Torres"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
        )}

        <Field data-invalid={!!error || undefined}>
          <FieldLabel htmlFor="email">Correo de trabajo</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="tu@agencia.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            aria-invalid={!!error || undefined}
            required
          />
        </Field>

        <Field data-invalid={!!error || undefined}>
          <FieldLabel htmlFor="password">Contraseña</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={!!error || undefined}
            required
          />
          {isSignup && !error && (
            <FieldDescription>Mínimo 6 caracteres.</FieldDescription>
          )}
          <FieldError>{error}</FieldError>
        </Field>

        <Button type="submit" className="w-full" disabled={submitting || googleLoading}>
          {submitting && <Loader2 className="animate-spin" data-icon="inline-start" />}
          {isSignup ? "Crear cuenta" : "Iniciar sesión"}
        </Button>

        <FieldDescription className="text-center">
          {isSignup ? "¿Ya tienes cuenta?" : "¿Aún no tienes cuenta?"}{" "}
          <button
            type="button"
            className="font-medium text-primary underline underline-offset-4"
            onClick={() => {
              setMode(isSignup ? "signin" : "signup")
              setError(null)
            }}
          >
            {isSignup ? "Inicia sesión" : "Crea una gratis"}
          </button>
        </FieldDescription>
      </FieldGroup>
    </form>
  )
}
