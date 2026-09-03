/**
 * SERVER-ONLY access to Meta secrets.
 *
 * Import this module only from Route Handlers / server code. None of these
 * values is prefixed with NEXT_PUBLIC_, so Next.js never bundles them for the
 * browser. Never log the returned values.
 */

export interface MetaServerEnv {
  appId: string | null
  appSecret: string
  webhookVerifyToken: string
}

class MissingEnvError extends Error {
  constructor(name: string) {
    super(`Missing required environment variable ${name}`)
    this.name = "MissingEnvError"
  }
}

function required(name: string): string {
  const value = process.env[name]
  if (!value || value.trim().length === 0) throw new MissingEnvError(name)
  return value
}

export function getMetaServerEnv(): MetaServerEnv {
  return {
    appId: process.env.META_APP_ID?.trim() || null,
    appSecret: required("META_APP_SECRET"),
    webhookVerifyToken: required("META_WEBHOOK_VERIFY_TOKEN"),
  }
}

export function isMissingEnvError(err: unknown): err is MissingEnvError {
  return err instanceof MissingEnvError
}
