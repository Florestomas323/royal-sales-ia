import { initializeApp, getApp, getApps, type FirebaseApp } from "firebase/app"
import { getAuth, type Auth } from "firebase/auth"
import { getFirestore, type Firestore } from "firebase/firestore"

/**
 * Firebase web configuration.
 *
 * These values are public by design — Firebase web API keys are safe to expose
 * in client code. Access control is enforced by Firebase Auth and Firestore
 * security rules, not by keeping these values secret.
 * See: https://firebase.google.com/docs/projects/api-keys
 */
const firebaseConfig = {
  apiKey: "AIzaSyC5LJu8zaMo-bc6Z009gCFgzZLL4lRlnuc",
  authDomain: "royal-sales-ia.firebaseapp.com",
  projectId: "royal-sales-ia",
  storageBucket: "royal-sales-ia.firebasestorage.app",
  messagingSenderId: "451773625076",
  appId: "1:451773625076:web:f37e721c7f514b0896a4a1",
}

// Reuse the existing app during Fast Refresh / repeated imports.
const app: FirebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig)

export const auth: Auth = getAuth(app)
export const db: Firestore = getFirestore(app)
export default app
