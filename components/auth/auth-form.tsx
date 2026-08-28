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
    default:
      return "Algo salió mal. Inténtalo de nuevo."
  }
}

export function AuthForm() {
  const { signIn, signUp } = useAuth()
  const router = useRouter()

  const [mode, setMode] = useState<Mode>("signin")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const isSignup = mode === "signup"

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
      <FieldGroup>
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

        <Button type="submit" className="w-full" disabled={submitting}>
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
