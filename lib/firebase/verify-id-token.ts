import { X509Certificate, createVerify, timingSafeEqual } from "node:crypto"

/**
 * SERVER-ONLY verification of Firebase Auth ID tokens.
 *
 * WHY NOT `firebase-admin/auth`:
 * that entry point pulls `jwks-rsa` (CommonJS), which does `require('jose')`,
 * and `jose@6` is ESM-only. On any Node without `require(esm)` support
 * (< 20.19 / < 22.12 — which is what Vercel may run) that throws
 * ERR_REQUIRE_ESM at runtime. `firebase-admin/app` and `firebase-admin/firestore`
 * are unaffected, so Firestore still uses the Admin SDK; only token
 * verification is done here with Node's built-in crypto and zero dependencies.
 *
 * This performs the full standard check documented by Firebase for verifying
 * ID tokens with a third-party library:
 *   alg = RS256, kid present in Google's public certs,
 *   signature valid, exp in the future, iat/auth_time not in the future,
 *   aud = <projectId>, iss = https://securetoken.google.com/<projectId>,
 *   sub non-empty.
 */

const CERTS_URL =
  "https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com"

/** Small clock tolerance for skew between Vercel and Google. */
const CLOCK_SKEW_SECONDS = 60

export interface VerifiedIdToken {
  uid: string
  email: string | null
  emailVerified: boolean
}

export type VerifyFailure =
  | "malformed"
  | "unsupported_alg"
  | "unknown_kid"
  | "bad_signature"
  | "expired"
  | "not_yet_valid"
  | "wrong_audience"
  | "wrong_issuer"
  | "no_subject"
  | "certs_unavailable"

export type VerifyResult =
  | { ok: true; token: VerifiedIdToken }
  | { ok: false; reason: VerifyFailure }

interface JwtHeader {
  alg?: string
  kid?: string
}

interface JwtPayload {
  aud?: string
  iss?: string
  sub?: string
  exp?: number
  iat?: number
  auth_time?: number
  email?: string
  email_verified?: boolean
}

/* -------------------------------------------------------------------------- */
/*  Google public certs, cached until their max-age                            */
/* -------------------------------------------------------------------------- */

let certCache: { certs: Record<string, string>; expiresAt: number } | null = null

function parseMaxAge(cacheControl: string | null): number {
  const match = cacheControl?.match(/max-age=(\d+)/)
  const seconds = match ? Number(match[1]) : NaN
  // Google rotates every few hours; fall back to 1 hour if the header is absent.
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 3600
}

export interface VerifyOptions {
  /** Injected in tests. */
  fetchImpl?: typeof fetch
  certsUrl?: string
  /** Injected in tests (seconds since epoch). */
  now?: number
}

async function getGoogleCerts(options: VerifyOptions): Promise<Record<string, string> | null> {
  const nowMs = Date.now()
  if (certCache && certCache.expiresAt > nowMs) return certCache.certs

  const doFetch = options.fetchImpl ?? fetch
  try {
    const res = await doFetch(options.certsUrl ?? CERTS_URL, { cache: "no-store" })
    if (!res.ok) return certCache?.certs ?? null
    const certs = (await res.json()) as Record<string, string>
    if (typeof certs !== "object" || certs === null) return certCache?.certs ?? null
    certCache = {
      certs,
      expiresAt: nowMs + parseMaxAge(res.headers?.get?.("cache-control") ?? null) * 1000,
    }
    return certs
  } catch {
    // Keep serving the previous certs rather than locking everyone out.
    return certCache?.certs ?? null
  }
}

/* -------------------------------------------------------------------------- */

function decodeSegment<T>(segment: string): T | null {
  try {
    const json = Buffer.from(segment, "base64url").toString("utf8")
    const parsed: unknown = JSON.parse(json)
    return typeof parsed === "object" && parsed !== null ? (parsed as T) : null
  } catch {
    return null
  }
}

export async function verifyFirebaseIdToken(
  idToken: string,
  projectId: string,
  options: VerifyOptions = {},
): Promise<VerifyResult> {
  const parts = idToken.split(".")
  if (parts.length !== 3) return { ok: false, reason: "malformed" }
  const [headerB64, payloadB64, signatureB64] = parts

  const header = decodeSegment<JwtHeader>(headerB64)
  const payload = decodeSegment<JwtPayload>(payloadB64)
  if (!header || !payload) return { ok: false, reason: "malformed" }

  if (header.alg !== "RS256") return { ok: false, reason: "unsupported_alg" }
  if (typeof header.kid !== "string" || header.kid.length === 0) {
    return { ok: false, reason: "unknown_kid" }
  }

  const certs = await getGoogleCerts(options)
  if (!certs) return { ok: false, reason: "certs_unavailable" }
  const cert = certs[header.kid]
  if (typeof cert !== "string") return { ok: false, reason: "unknown_kid" }

  // Signature over "<header>.<payload>" with the public key of Google's cert.
  let signatureValid = false
  try {
    const publicKey = new X509Certificate(cert).publicKey
    const verifier = createVerify("RSA-SHA256")
    verifier.update(`${headerB64}.${payloadB64}`)
    verifier.end()
    signatureValid = verifier.verify(publicKey, Buffer.from(signatureB64, "base64url"))
  } catch {
    signatureValid = false
  }
  if (!signatureValid) return { ok: false, reason: "bad_signature" }

  const now = options.now ?? Math.floor(Date.now() / 1000)
  if (typeof payload.exp !== "number" || payload.exp + CLOCK_SKEW_SECONDS < now) {
    return { ok: false, reason: "expired" }
  }
  if (typeof payload.iat !== "number" || payload.iat - CLOCK_SKEW_SECONDS > now) {
    return { ok: false, reason: "not_yet_valid" }
  }
  if (typeof payload.auth_time === "number" && payload.auth_time - CLOCK_SKEW_SECONDS > now) {
    return { ok: false, reason: "not_yet_valid" }
  }

  if (typeof payload.aud !== "string" || !safeEqual(payload.aud, projectId)) {
    return { ok: false, reason: "wrong_audience" }
  }
  if (
    typeof payload.iss !== "string" ||
    !safeEqual(payload.iss, `https://securetoken.google.com/${projectId}`)
  ) {
    return { ok: false, reason: "wrong_issuer" }
  }
  if (typeof payload.sub !== "string" || payload.sub.length === 0) {
    return { ok: false, reason: "no_subject" }
  }

  return {
    ok: true,
    token: {
      uid: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
      emailVerified: payload.email_verified === true,
    },
  }
}

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** Test helper: drops the cached Google certs. */
export function resetCertCacheForTests(): void {
  certCache = null
}
