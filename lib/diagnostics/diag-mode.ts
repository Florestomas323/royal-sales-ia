"use client"

/**
 * TEMPORARY DIAGNOSTIC — remove with the rest of lib/diagnostics/.
 *
 * `?diag=1` turns the mode on for this browser tab and `?diag=0` turns it
 * off. The flag lives in sessionStorage so it survives the in-app
 * navigations and redirects that drop the query string (login → "/",
 * `/leads?lead=…` → `/leads`, sidebar links).
 *
 * `reportSaveFailure()` is the second, independent channel: the save flow
 * calls it from its existing `catch`, so the overlay opens even if the SDK
 * log capture sees nothing. It is a no-op outside diag mode and never
 * changes what the save flow does.
 */

export const DIAG_BUILD = "diag-v3"
const KEY = "rsia:diag"
export const DIAG_SAVE_FAILURE_EVENT = "rsia:diag-save-failure"

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

export function diagEnabled(): boolean {
  if (typeof window === "undefined") return false
  try {
    return window.sessionStorage.getItem(KEY) === "1" || new URLSearchParams(window.location.search).get("diag") === "1"
  } catch {
    return new URLSearchParams(window.location.search).get("diag") === "1"
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

export interface SaveFailureReport {
  source: string
  at: string
  lead: { id: string; workspaceId?: string; stage?: string; assignedToId?: unknown; leadType?: string }
  patch: Record<string, unknown>
  actor: { userId: string; role: string } | null
  error: { name?: string; code?: string; message?: string }
}

const PII = new Set(["name", "phone", "email"])

/** Names, phones and emails never leave as values: only as "(redactado)". */
export function redact<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, PII.has(k) && typeof v === "string" ? "(redactado)" : v])) as T
}

/** Called from a save flow's catch. Observability only; no-op outside diag mode. */
export function reportSaveFailure(input: Omit<SaveFailureReport, "at" | "error"> & { error: unknown }): void {
  try {
    if (!diagEnabled()) return
    const e = input.error as { name?: unknown; code?: unknown; message?: unknown }
    const detail: SaveFailureReport = {
      source: input.source,
      at: new Date().toISOString(),
      lead: input.lead,
      patch: redact(input.patch),
      actor: input.actor,
      error: {
        name: typeof e?.name === "string" ? e.name : undefined,
        code: typeof e?.code === "string" ? e.code : undefined,
        message: typeof e?.message === "string" ? e.message : String(input.error),
      },
    }
    window.dispatchEvent(new CustomEvent<SaveFailureReport>(DIAG_SAVE_FAILURE_EVENT, { detail }))
  } catch {
    /* never let the diagnostic affect the save flow */
  }
}
