/**
 * SERVER-ONLY access to Meta secrets.
 *
 * Import this module only from Route Handlers / server code. None of these
 * values is prefixed with NEXT_PUBLIC_, so Next.js never bundles them for the
 * browser. Never log the returned values.
 *
 * Every value is trimmed: Vercel (and copy/paste) can introduce trailing
 * spaces or newlines that would otherwise make the verify token never match.
 */

class MissingEnvError extends Error {
  constructor(name: string) {
    super(`Missing required environment variable ${name}`)
    this.name = "MissingEnvError"
  }
}

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new MissingEnvError(name)
  return value
}

/** Needed by GET (subscription verification) only. */
export function getWebhookVerifyToken(): string {
  return required("META_WEBHOOK_VERIFY_TOKEN")
}

/** Needed by POST (X-Hub-Signature-256) only. */
export function getMetaAppSecret(): string {
  return required("META_APP_SECRET")
}

/** Optional for now; becomes relevant with OAuth. */
export function getMetaAppId(): string | null {
  return process.env.META_APP_ID?.trim() || null
}

export function isMissingEnvError(err: unknown): err is MissingEnvError {
  return err instanceof MissingEnvError
}
