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

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? DEV_FALLBACK.apiKey,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? DEV_FALLBACK.authDomain,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? DEV_FALLBACK.projectId,
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? DEV_FALLBACK.storageBucket,
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? DEV_FALLBACK.messagingSenderId,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? DEV_FALLBACK.appId,
}

// Reuse the existing app during Fast Refresh / repeated imports.
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)

export const auth: Auth = getAuth(app)
export const db: Firestore = getFirestore(app)
export default app
