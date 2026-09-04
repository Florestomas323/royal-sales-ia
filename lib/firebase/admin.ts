import { cert, getApps, initializeApp, type App } from "firebase-admin/app"
import { getFirestore, type Firestore } from "firebase-admin/firestore"

/**
 * Firebase Admin — SERVER ONLY.
 *
 * Used by Route Handlers (Meta webhook) to write server-side collections that
 * Security Rules keep closed to browsers. Admin bypasses Rules, so this module
 * must never be imported from client components.
 *
 * Credentials come from ONE env var, `FIREBASE_SERVICE_ACCOUNT_JSON`: the full
 * JSON of a service account key, pasted as a single line. It is not prefixed
 * with NEXT_PUBLIC_, so Next.js never bundles it for the browser.
 *
 * Initialisation is guarded with getApps() because Next.js / Vercel can
 * evaluate a module more than once per process (dev HMR, warm lambdas).
 */

export class AdminNotConfiguredError extends Error {
  constructor(detail: string) {
    super(`Firebase Admin is not configured: ${detail}`)
    this.name = "AdminNotConfiguredError"
  }
}

interface ServiceAccountShape {
  project_id: string
  client_email: string
  private_key: string
}

function readServiceAccount(): ServiceAccountShape {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
  if (!raw) throw new AdminNotConfiguredError("missing FIREBASE_SERVICE_ACCOUNT_JSON")

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new AdminNotConfiguredError("FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON")
  }
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    typeof (parsed as ServiceAccountShape).project_id !== "string" ||
    typeof (parsed as ServiceAccountShape).client_email !== "string" ||
    typeof (parsed as ServiceAccountShape).private_key !== "string"
  ) {
    throw new AdminNotConfiguredError("service account JSON is missing required fields")
  }
  const sa = parsed as ServiceAccountShape
  // Vercel's UI often stores the key with literal "\n" sequences.
  return { ...sa, private_key: sa.private_key.replace(/\\n/g, "\n") }
}

let app: App | null = null
let cachedProjectId: string | null = null

export function getAdminApp(): App {
  if (app) return app
  const existing = getApps()
  if (existing.length > 0) {
    app = existing[0]
    return app
  }
  const sa = readServiceAccount()
  cachedProjectId = sa.project_id
  app = initializeApp({
    credential: cert({
      projectId: sa.project_id,
      clientEmail: sa.client_email,
      privateKey: sa.private_key,
    }),
    projectId: sa.project_id,
  })
  return app
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp())
}

/**
 * Firebase project id from the service account. Needed to validate the
 * `aud` / `iss` claims of ID tokens (see lib/firebase/verify-id-token.ts).
 */
export function getAdminProjectId(): string {
  if (cachedProjectId) return cachedProjectId
  const sa = readServiceAccount()
  cachedProjectId = sa.project_id
  return cachedProjectId
}

export function isAdminNotConfigured(err: unknown): err is AdminNotConfiguredError {
  return err instanceof AdminNotConfiguredError
}
