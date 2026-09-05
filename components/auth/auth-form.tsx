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
import { checkInvitation } from "@/lib/firebase/invitations"
import { t } from "@/lib/i18n"

/**
 * Access is invitation-only. There is no public sign-up:
 *   "signin"   → existing account
 *   "activate" → the person types the email they were invited with; the server
 *                confirms an unclaimed invitation exists before any account is
 *                created. Without one, no account is created at all.
 *
 * The security boundary is NOT this screen: a Firebase Auth account grants no
 * data access by itself. Reading anything requires `memberships/{uid}`, which
 * Security Rules only allow to be created by matching an invitation.
 */
type Mode = "signin" | "activate"

function friendlyError(code: string): string {
  const e = t.auth.errors
  switch (code) {
    case "auth/invalid-email":
      return e.invalidEmail
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return e.invalidCredential
    case "auth/email-already-in-use":
      return e.emailInUse
    case "auth/weak-password":
      return e.weakPassword
    case "auth/too-many-requests":
      return e.tooManyRequests
    case "auth/operation-not-allowed":
      return e.operationNotAllowed
    case "auth/configuration-not-found":
      return e.configurationNotFound
    case "auth/network-request-failed":
      return e.networkFailed
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return e.popupClosed
    case "auth/popup-blocked":
      return e.popupBlocked
    case "auth/unauthorized-domain":
      return e.unauthorizedDomain
    default:
      return e.generic
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
  const [notice, setNotice] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  /** Set once the server confirmed an invitation for this exact email. */
  const [invitedEmail, setInvitedEmail] = useState<string | null>(null)

  const isActivate = mode === "activate"
  const invitationConfirmed = isActivate && invitedEmail === email.trim().toLowerCase()

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setNotice(null)
    setInvitedEmail(null)
    setPassword("")
  }

  async function handleCheckInvitation() {
    setError(null)
    setNotice(null)
    setSubmitting(true)
    try {
      const target = email.trim().toLowerCase()
      const result = await checkInvitation(target)
      if (result.status === "invited") {
        setInvitedEmail(target)
        setNotice(t.auth.invitationFound(target))
      } else if (result.status === "not_invited") {
        setError(t.auth.invitationNotFound)
      } else {
        setError(t.auth.invitationUnavailable)
      }
    } finally {
      setSubmitting(false)
    }
  }

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
        setError(t.auth.errors.googleFailed)
      }
      setGoogleLoading(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      if (isActivate) {
        // Belt and braces: never create an account without a confirmed invitation.
        if (!invitationConfirmed) {
          setError(t.auth.invitationNotFound)
          setSubmitting(false)
          return
        }
        await signUp(name.trim(), email.trim(), password)
      } else {
        await signIn(email.trim(), password)
      }
      router.replace("/")
    } catch (err) {
      if (err instanceof FirebaseError) {
        setError(friendlyError(err.code))
      } else {
        setError(t.auth.errors.generic)
      }
      setSubmitting(false)
    }
  }

  // In activation mode the first step only verifies the invitation.
  function onSubmit(e: FormEvent) {
    if (isActivate && !invitationConfirmed) {
      e.preventDefault()
      void handleCheckInvitation()
      return
    }
    void handleSubmit(e)
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="mb-6 flex flex-col gap-1.5">
        <h2 className="text-2xl font-semibold tracking-tight text-balance">
          {isActivate ? t.auth.activateAccount : t.auth.welcomeBack}
        </h2>
        <p className="text-sm text-muted-foreground">
          {isActivate ? t.auth.activateSubtitle : t.auth.signInSubtitle}
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
          {t.auth.continueWithGoogle}
        </Button>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">{t.auth.orWithEmail}</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        {invitationConfirmed && (
          <Field>
            <FieldLabel htmlFor="name">{t.auth.fullName}</FieldLabel>
            <Input
              id="name"
              type="text"
              autoComplete="name"
              placeholder={t.auth.fullNamePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </Field>
        )}

        <Field data-invalid={!!error || undefined}>
          <FieldLabel htmlFor="email">{t.auth.workEmail}</FieldLabel>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder={t.auth.emailPlaceholder}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              // Changing the email invalidates a previous confirmation.
              if (invitedEmail) setInvitedEmail(null)
            }}
            readOnly={invitationConfirmed}
            aria-invalid={!!error || undefined}
            required
          />
          {notice && !error && <FieldDescription>{notice}</FieldDescription>}
        </Field>

        {(!isActivate || invitationConfirmed) && (
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="password">{t.auth.password}</FieldLabel>
            <Input
              id="password"
              type="password"
              autoComplete={isActivate ? "new-password" : "current-password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!error || undefined}
              required
            />
            {isActivate && !error && <FieldDescription>{t.auth.passwordHint}</FieldDescription>}
          </Field>
        )}

        {error && (
          <Field data-invalid>
            <FieldError>{error}</FieldError>
          </Field>
        )}

        <Button type="submit" className="w-full" disabled={submitting || googleLoading}>
          {submitting && <Loader2 className="animate-spin" data-icon="inline-start" />}
          {isActivate
            ? invitationConfirmed
              ? t.auth.activate
              : submitting
                ? t.auth.checking
                : t.auth.checkInvitation
            : t.auth.signIn}
        </Button>

        <FieldDescription className="text-center text-pretty">
          {isActivate ? (
            <>
              {t.auth.haveAccount}{" "}
              <button
                type="button"
                className="font-medium text-primary underline underline-offset-4"
                onClick={() => switchMode("signin")}
              >
                {t.auth.goToSignIn}
              </button>
            </>
          ) : (
            <>
              {t.auth.noAccountInvite}{" "}
              <button
                type="button"
                className="font-medium text-primary underline underline-offset-4"
                onClick={() => switchMode("activate")}
              >
                {t.auth.goToActivate}
              </button>
            </>
          )}
        </FieldDescription>

        <FieldDescription className="text-center text-pretty">
          {t.auth.inviteOnlyNotice}
        </FieldDescription>
      </FieldGroup>
    </form>
  )
}
