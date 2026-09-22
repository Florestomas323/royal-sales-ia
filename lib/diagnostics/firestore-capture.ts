"use client"

/**
 * TEMPORARY DIAGNOSTIC — OBSERVABILITY ONLY. Remove with lib/diagnostics/.
 *
 * Raises the Firestore SDK log level to `debug` and listens to its log
 * stream. The SDK already logs every write request it sends
 * (`RPC 'Write' stream … sending: {"writes":[…]}`) and every error the
 * server returns. That is the EXACT batch `writeBatch().commit()` put on the
 * wire — built by the real updateLead(), untouched — so nothing in the app's
 * write path is modified or wrapped.
 *
 * When a write request is followed by an error, the pair is published as a
 * `FailedCommit` for the diagnostic overlay.
 */

import { onLog } from "firebase/app"
import { setLogLevel } from "firebase/firestore"

export interface DecodedWrite {
  path: string
  project?: string
  database?: string
  op: "update" | "set" | "delete" | "unknown"
  fields?: Record<string, unknown>
  updateMask?: string[]
  transforms?: { field: string; server: string }[]
  precondition?: unknown
}

export interface FailedCommit {
  at: string
  stream: string | null
  writes: DecodedWrite[]
  error: { code?: string; message?: string; raw: string }
}

type Listener = (c: FailedCommit) => void

let installed = false
const listeners = new Set<Listener>()
let lastSend: { at: number; stream: string | null; writes: DecodedWrite[] } | null = null
let lastFailure: FailedCommit | null = null
const recentErrors: string[] = []

export function getLastFailure(): FailedCommit | null {
  return lastFailure
}

export function getRecentErrors(): string[] {
  return [...recentErrors]
}

export function subscribeFailures(fn: Listener): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function installFirestoreCapture(): void {
  if (installed || typeof window === "undefined") return
  installed = true
  setLogLevel("debug")
  onLog(
    (entry) => {
      try {
        handle(entry.message ?? "")
      } catch {
        /* never let the diagnostic break the app */
      }
    },
    { level: "debug" },
  )
}

function handle(message: string) {
  if (!message.includes("@firebase/firestore") && !message.includes("Firestore (")) return

  // A write request (streaming Write RPC, or a unary Commit).
  const send = /RPC '(Write|Commit)' (?:stream )?(\S+) sending(?: request)?:\s*([\s\S]*)$/.exec(message)
  if (send && send[3].includes('"writes"')) {
    const parsed = JSON.parse(send[3]) as { writes?: unknown[] }
    if (Array.isArray(parsed.writes) && parsed.writes.length) {
      lastSend = { at: Date.now(), stream: send[2], writes: parsed.writes.map(decodeWrite) }
    }
    return
  }

  const isError =
    /received error|close with error|permission-denied|Missing or insufficient permissions|failed with error/i.test(message)
  if (!isError) return
  recentErrors.push(message.slice(0, 600))
  if (recentErrors.length > 10) recentErrors.shift()

  if (!lastSend || Date.now() - lastSend.at > 30_000) return
  const code = /code=([a-z-]+)/i.exec(message)?.[1] ?? (/permission/i.test(message) ? "permission-denied" : undefined)
  const text = /\]:\s*([^\n"]+)/.exec(message)?.[1] ?? (/Missing or insufficient permissions/.test(message) ? "Missing or insufficient permissions." : undefined)
  const failure: FailedCommit = {
    at: new Date().toISOString(),
    stream: lastSend.stream,
    writes: lastSend.writes,
    error: { code, message: text, raw: message.slice(0, 600) },
  }
  // One failure per request: the stream logs both "received error" and "close".
  if (lastFailure && lastFailure.stream === failure.stream && lastFailure.writes === failure.writes) {
    if (!lastFailure.error.code && failure.error.code) lastFailure.error = failure.error
    return
  }
  lastFailure = failure
  listeners.forEach((l) => l(failure))
}

/* ------------------------------------------------------------ decoding -- */

type ProtoValue = Record<string, unknown>

function decodeValue(v: ProtoValue): unknown {
  if (v == null || typeof v !== "object") return v
  if ("nullValue" in v) return null
  if ("booleanValue" in v) return v.booleanValue
  if ("integerValue" in v) return Number(v.integerValue)
  if ("doubleValue" in v) return Number(v.doubleValue)
  if ("stringValue" in v) return v.stringValue
  if ("timestampValue" in v) {
    const t = v.timestampValue as string | { seconds?: number | string; nanos?: number }
    if (typeof t === "string") return { __ts: t }
    const ms = Number(t?.seconds ?? 0) * 1000 + Math.floor(Number(t?.nanos ?? 0) / 1e6)
    return { __ts: new Date(ms).toISOString() }
  }
  if ("mapValue" in v) return decodeFields(((v.mapValue as { fields?: Record<string, ProtoValue> }) ?? {}).fields ?? {})
  if ("arrayValue" in v) return (((v.arrayValue as { values?: ProtoValue[] }) ?? {}).values ?? []).map(decodeValue)
  if ("referenceValue" in v) return { __ref: v.referenceValue }
  if ("geoPointValue" in v) return { __geo: true }
  if ("bytesValue" in v) return { __bytes: true }
  return { __unknown: Object.keys(v) }
}

function decodeFields(fields: Record<string, ProtoValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decodeValue(v)]))
}

function splitName(name: string): { path: string; project?: string; database?: string } {
  const m = /^projects\/([^/]+)\/databases\/([^/]+)\/documents\/(.+)$/.exec(name)
  return m ? { project: m[1], database: m[2], path: m[3] } : { path: name }
}

function decodeWrite(raw: unknown): DecodedWrite {
  const w = raw as {
    update?: { name: string; fields?: Record<string, ProtoValue> }
    delete?: string
    updateMask?: { fieldPaths?: string[] }
    updateTransforms?: { fieldPath: string; setToServerValue?: string }[]
    currentDocument?: unknown
  }
  if (w.update) {
    return {
      ...splitName(w.update.name),
      op: w.updateMask ? "update" : "set",
      fields: decodeFields(w.update.fields ?? {}),
      ...(w.updateMask ? { updateMask: w.updateMask.fieldPaths ?? [] } : {}),
      ...(w.updateTransforms?.length
        ? { transforms: w.updateTransforms.map((t) => ({ field: t.fieldPath, server: t.setToServerValue ?? Object.keys(t).join(",") })) }
        : {}),
      ...(w.currentDocument ? { precondition: w.currentDocument } : {}),
    }
  }
  if (w.delete) return { ...splitName(w.delete), op: "delete" }
  return { path: "(desconocido)", op: "unknown" }
}
