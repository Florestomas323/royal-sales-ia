"use client"

/**
 * TEMPORARY DIAGNOSTIC — remove with the rest of lib/diagnostics/.
 *
 * `?diag=1` turns the mode on for this browser tab and `?diag=0` turns it
 * off. The flag lives in sessionStorage so it survives the in-app
 * navigations and redirects that drop the query string (login → "/",
 * `/leads?lead=…` → `/leads`, sidebar links).
 */

export const DIAG_BUILD = "diag-v2"
const KEY = "rsia:diag"

export function syncDiagFlag(): boolean {
  if (typeof window === "undefined") return false
  const param = new URLSearchParams(window.location.search).get("diag")
  try {
    if (param === "1") window.sessionStorage.setItem(KEY, "1")
    if (param === "0") window.sessionStorage.removeItem(KEY)
    return window.sessionStorage.getItem(KEY) === "1"
  } catch {
    return param === "1"
  }
}

export function disableDiag() {
  try {
    window.sessionStorage.removeItem(KEY)
  } catch {
    /* private mode */
  }
}

/** Commit of this build, when Vercel exposes it to the browser. */
export function buildCommit(): string {
  return process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "sin-sha"
}
