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

/**
 * Server-side Graph API token (ads_read / business_management) used to look
 * up ad → campaign. Until OAuth exists it is a manually issued token stored
 * only in Vercel. Never sent to the browser, never logged.
 */
export function getMetaAccessToken(): string {
  return required("META_ACCESS_TOKEN")
}

const DEFAULT_GRAPH_VERSION = "v26.0"

/** Graph API version, e.g. "v26.0". Configurable via META_GRAPH_API_VERSION. */
export function getGraphApiVersion(): string {
  const raw = process.env.META_GRAPH_API_VERSION?.trim()
  if (!raw) return DEFAULT_GRAPH_VERSION
  return /^v\d+\.\d+$/.test(raw) ? raw : DEFAULT_GRAPH_VERSION
}

export function isMissingEnvError(err: unknown): err is MissingEnvError {
  return err instanceof MissingEnvError
}
