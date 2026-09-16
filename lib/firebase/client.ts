import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app"
import { getAuth, type Auth } from "firebase/auth"
import { getFirestore, type Firestore } from "firebase/firestore"

/**
 * Firebase web configuration.
 *
 * Values are read from `NEXT_PUBLIC_FIREBASE_*` environment variables. These
 * are Firebase *web* config values, which are public by design and safe to
 * ship in client code — access control is enforced by Firebase Authentication
 * and Firestore Security Rules, never by keeping these values secret.
 * See: https://firebase.google.com/docs/projects/api-keys
 *
 * A development fallback for the `royal-sales-ia` project is kept so the app
 * runs out-of-the-box (v0 preview, fresh clone) without any setup. For your
 * own deployments, set the environment variables — see `.env.example`.
 */
const DEV_FALLBACK = {
  apiKey: "AIzaSyC5LJu8zaMo-bc6Z009gCFgzZLL4lRlnuc",
  authDomain: "royal-sales-ia.firebaseapp.com",
  projectId: "royal-sales-ia",
  storageBucket: "royal-sales-ia.firebasestorage.app",
  messagingSenderId: "451773625076",
  appId: "1:451773625076:web:f37e721c7f514b0896a4a1",
}

/**
 * All-or-nothing: the fallback is a complete development project, used ONLY
 * when no NEXT_PUBLIC_FIREBASE_* variable is set at all. Mixing one project's
 * variables with another's fallback would point the browser at Firebase A
 * while the server (FIREBASE_SERVICE_ACCOUNT_JSON) talks to Firebase B, and
 * every read would silently miss. In production the fallback is never used:
 * a missing variable fails loudly instead.
 */
const REQUIRED = [
  "NEXT_PUBLIC_FIREBASE_API_KEY",
  "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
  "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
  "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
  "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
  "NEXT_PUBLIC_FIREBASE_APP_ID",
] as const

// `process.env.X` must be spelled out for Next.js to inline it in the browser.
const fromEnv = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

const missing = (Object.keys(fromEnv) as (keyof typeof fromEnv)[]).filter((k) => !fromEnv[k])
const noneSet = missing.length === Object.keys(fromEnv).length

if (missing.length > 0 && !noneSet) {
  // Partial configuration is the dangerous case, in any environment.
  throw new Error(
    `Firebase client config is incomplete: ${missing.length} of ${REQUIRED.length} NEXT_PUBLIC_FIREBASE_* variables are missing. `
    + "Set all of them for the same project — a partial set is never mixed with the development fallback.",
  )
}
if (noneSet && process.env.NODE_ENV === "production") {
  const msg = `Firebase client config is missing in production: set ${REQUIRED.join(", ")}.`
  // In the browser this is fatal: the app must not quietly run against the
  // development project. During `next build` / prerender the module is also
  // evaluated on the server with no browser to protect, so it logs instead
  // of aborting the build.
  if (typeof window !== "undefined") throw new Error(msg)
  console.error(`[firebase/client] ${msg}`)
}

const firebaseConfig = noneSet
  ? DEV_FALLBACK
  : (fromEnv as { [K in keyof typeof fromEnv]: string })

// Reuse the existing app during Fast Refresh / repeated imports.
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)

export const auth: Auth = getAuth(app)
export const db: Firestore = getFirestore(app)
export default app
