import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import path from "node:path"
import { NextResponse } from "next/server"
import { Timestamp } from "firebase-admin/firestore"
import { getSecurityRules } from "firebase-admin/security-rules"
import { getAdminApp, getAdminDb, getAdminProjectId, isAdminNotConfigured } from "@/lib/firebase/admin"
import { authenticateRequest, canAccessWorkspace } from "@/lib/firebase/server-auth"
import { inspectIdentity } from "@/lib/server/mutation-errors"
import {
  changedTopLevelKeys,
  evaluateActivityCreate,
  evaluateLeadUpdate,
  failingLeaves,
  type Doc,
  type WriteEval,
} from "@/lib/diagnostics/rules-eval"

/**
 * TEMPORARY DIAGNOSTIC — READ-ONLY. Remove with lib/diagnostics/.
 *
 * GET  → deployment marker (no auth, no data): proves this build is live and
 *        that the files which MOUNT the diagnostic UI are the diag versions.
 * POST → for a batch the browser just saw rejected:
 *   - fetches the Firestore rules PUBLISHED in this project (Admin SDK) and
 *     compares them with the audited repo file;
 *   - reads the lead, the caller's membership and profile FRESH;
 *   - executes the published rules text against those documents and the
 *     exact writes the browser sent, and reports the false predicates.
 *
 * It never writes. It only answers for a lead the caller can already read.
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const DIAG_BUILD = "diag-v3"
/** sha256 of the firestore.rules audited in chat (1995 lines). */
const AUDITED_RULES_SHA256 = "f7b7941282cd1e12e50433e7c05260fb41f9acf6582a2e7d55b5158374f4eb03"
/** Same file with CRLF→LF, trailing spaces removed and trimmed (see normText). */
const AUDITED_RULES_NORM_SHA256 = "e10e44e7013620b1e228da63d502a86a261f39feafb7326a4a513f49428e5092"

/** Values shown as-is; everything else is reported by type only. */
const SHOW = new Set([
  "workspaceId", "leadId", "leadType", "stage", "source", "assignedToId", "campaignId", "attributionSource",
  "archived", "customerId", "purgeClaimId", "type", "actorId", "actorRole", "from", "to",
])

interface DecodedWrite {
  path: string
  project?: string
  database?: string
  op: "update" | "set" | "delete" | "unknown"
  fields?: Doc
  updateMask?: string[]
  transforms?: { field: string; server: string }[]
  precondition?: unknown
}

interface Body {
  writes?: DecodedWrite[]
  error?: { code?: string; message?: string; raw?: string }
  client?: Record<string, unknown>
}

export async function GET() {
  return NextResponse.json({
    diag: DIAG_BUILD,
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    commitMessage: process.env.VERCEL_GIT_COMMIT_MESSAGE?.slice(0, 120) ?? null,
    env: process.env.VERCEL_ENV ?? null,
    // true = the deployed source of that file contains the diag hook.
    mounts: {
      layout: hasMarker(path.join(process.cwd(), "app/(app)/layout.tsx"), "DiagOverlay"),
      leadsScreen: hasMarker(path.join(process.cwd(), "components/leads/leads-live.tsx"), "DiagOverlay"),
      editDialog: hasMarker(path.join(process.cwd(), "components/leads/edit-lead-dialog.tsx"), "reportSaveFailure"),
      overlayVersion: hasMarker(path.join(process.cwd(), "components/diagnostics/diag-overlay.tsx"), "rsia-diag-root"),
    },
  })
}

function hasMarker(file: string, marker: string): boolean | string {
  try {
    return readFileSync(file, "utf8").includes(marker)
  } catch {
    return "no disponible"
  }
}

export async function POST(request: Request) {
  const auth = await authenticateRequest(request)
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { uid, membership } = auth.user

  let body: Body
  try {
    body = (await request.json()) as Body
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })
  }
  const writes = Array.isArray(body.writes) ? body.writes.slice(0, 20) : []
  const requestTime = new Date()
  const revived = writes.map((w) => ({ ...w, fields: revive(w.fields ?? {}, requestTime, w.transforms) as Doc }))

  const leadWrite = revived.find((w) => /^leads\/[^/]+$/.test(w.path))
  const leadId = (leadWrite?.path ?? revived.find((w) => w.path.startsWith("leads/"))?.path ?? "").split("/")[1]
  if (!leadId) return NextResponse.json({ error: "no_lead_write" }, { status: 400 })

  try {
    const db = getAdminDb()
    const leadSnap = await db.collection("leads").doc(leadId).get()
    if (!leadSnap.exists) return NextResponse.json({ error: "lead_not_found" }, { status: 404 })
    const before = normalize(leadSnap.data() ?? {}) as Doc
    const workspaceId = String(before.workspaceId ?? "")
    // Nothing is disclosed about a lead the caller could not read anyway.
    if (!canAccessWorkspace(auth.user, workspaceId, false)) {
      return NextResponse.json({ error: "wrong_workspace" }, { status: 403 })
    }

    // Fresh membership exactly as the Rules read it (without the authUid the
    // auth helper adds), plus identity coherence across membership/profile/seat.
    const memSnap = await db.collection("memberships").doc(uid).get()
    const memDoc = memSnap.exists ? (normalize(memSnap.data() ?? {}) as Doc) : null
    const identity = await inspectIdentity(db, uid, membership).catch((e) => ({ error: String(e) }))

    // --- Published rules vs audited repo file.
    const rules = await rulesComparison()

    // --- Lead after the batch.
    const after = leadWrite ? applyWrite(before, leadWrite) : before
    let campaign: Doc | null = null
    const campaignId = after?.campaignId
    if (typeof campaignId === "string" && campaignId && after?.campaignId !== before.campaignId) {
      const c = await db.collection("campaigns").doc(campaignId).get()
      campaign = c.exists ? (normalize(c.data() ?? {}) as Doc) : null
    }
    let customerAfter: Doc | null = null
    const customerId = after?.customerId
    if (typeof customerId === "string" && customerId && customerId !== before.customerId) {
      const inBatch = revived.find((w) => w.path === `customers/${customerId}`)
      if (inBatch) customerAfter = inBatch.fields ?? null
      else {
        const c = await db.collection("customers").doc(customerId).get()
        customerAfter = c.exists ? (normalize(c.data() ?? {}) as Doc) : null
      }
    }

    const evalRules = rules.published?.content ?? rules.repo?.content ?? null
    const input = {
      rules: evalRules ?? "",
      uid,
      membership: memDoc,
      leadBefore: before,
      leadAfter: after,
      leadId,
      requestTime,
      campaign,
      customerAfter,
    }

    const results: (WriteEval & { leaves: string[] })[] = []
    for (const w of revived) {
      if (!evalRules) break
      let r: WriteEval
      if (w.path === `leads/${leadId}`) r = evaluateLeadUpdate(input, w.path)
      else if (w.path.startsWith(`leads/${leadId}/activities/`)) r = evaluateActivityCreate(input, w.path, w.fields ?? {})
      else r = { path: w.path, kind: "other", allowed: null, error: "escritura no evaluada por este diagnóstico", clauses: 0, failing: [], caveats: [] }
      results.push({ ...r, leaves: failingLeaves(r.failing) })
    }

    const pick = (d: Doc | null, keys: string[]) =>
      d ? Object.fromEntries(keys.map((k) => [k, describe(k, d[k])])) : null

    return NextResponse.json({
      diag: DIAG_BUILD,
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      evaluatedAgainst: rules.published ? "published" : rules.repo ? "repo (publicadas no disponibles)" : "none",
      projects: {
        server: safe(() => getAdminProjectId()),
        clientConfig: body.client?.projectId ?? null,
        clientWritePath: writes[0]?.project ?? null,
        writeDatabase: writes[0]?.database ?? null,
      },
      rules: {
        published: rules.published
          ? { ruleset: rules.published.name, createTime: rules.published.createTime, sha256: rules.published.sha256, lines: rules.published.lines }
          : { error: rules.publishedError },
        repo: rules.repo ? { sha256: rules.repo.sha256, lines: rules.repo.lines } : { error: rules.repoError },
        auditedSha256: AUDITED_RULES_SHA256,
        publishedEqualsAudited: rules.published ? rules.published.sha256 === AUDITED_RULES_SHA256 : null,
        publishedEqualsAuditedIgnoringWhitespace: rules.published ? rules.published.normSha === AUDITED_RULES_NORM_SHA256 : null,
        firstDifferences: rules.diffs,
      },
      identity: {
        authUid: uid,
        membership: memDoc ? pick(memDoc, ["userId", "workspaceId", "role", "status"]) : null,
        coherence: identity,
      },
      lead: {
        id: leadId,
        before: pick(before, ["workspaceId", "stage", "assignedToId", "leadType", "closedAt", "closedValue", "archived", "purgeClaimId", "customerId"]),
        changedKeys: changedTopLevelKeys(before, after),
      },
      writes: revived.map((w) => ({
        path: w.path,
        op: w.op,
        updateMask: w.updateMask ?? null,
        transforms: w.transforms ?? [],
        precondition: w.precondition ?? null,
        fields: Object.fromEntries(Object.entries(w.fields ?? {}).map(([k, v]) => [k, describe(k, v)])),
      })),
      error: body.error ?? null,
      client: body.client ?? null,
      evaluations: results,
    })
  } catch (err) {
    if (isAdminNotConfigured(err)) return NextResponse.json({ error: "server_not_configured" }, { status: 503 })
    return NextResponse.json({ error: "internal", detail: err instanceof Error ? err.message : String(err) }, { status: 500 })
  }
}

/* -------------------------------------------------------------- helpers -- */

function safe<T>(fn: () => T): T | string {
  try {
    return fn()
  } catch (e) {
    return `error: ${e instanceof Error ? e.message : String(e)}`
  }
}

function sha(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex")
}

function normText(text: string): string {
  return text.replace(/\r\n/g, "\n").split("\n").map((l) => l.replace(/\s+$/, "")).join("\n").trim()
}

async function rulesComparison() {
  let published: { name: string; createTime: string; content: string; sha256: string; normSha: string; lines: number } | null = null
  let publishedError: string | null = null
  try {
    const rs = await getSecurityRules(getAdminApp()).getFirestoreRuleset()
    const content = rs.source.map((f) => f.content).join("\n")
    published = { name: rs.name, createTime: rs.createTime, content, sha256: sha(content), normSha: sha(normText(content)), lines: content.split("\n").length }
  } catch (e) {
    publishedError = e instanceof Error ? `${(e as { code?: string }).code ?? e.name}: ${e.message}` : String(e)
  }

  let repo: { content: string; sha256: string; lines: number } | null = null
  let repoError: string | null = null
  try {
    const content = readFileSync(path.join(process.cwd(), "firestore.rules"), "utf8")
    repo = { content, sha256: sha(content), lines: content.split("\n").length }
  } catch (e) {
    repoError = e instanceof Error ? e.message : String(e)
  }

  const diffs: { line: number; published: string; repo: string }[] = []
  if (published && repo) {
    const a = normText(published.content).split("\n")
    const b = normText(repo.content).split("\n")
    for (let i = 0; i < Math.max(a.length, b.length) && diffs.length < 8; i++) {
      if (a[i] !== b[i]) diffs.push({ line: i + 1, published: (a[i] ?? "(fin)").slice(0, 200), repo: (b[i] ?? "(fin)").slice(0, 200) })
    }
  }
  return { published, publishedError, repo, repoError, diffs }
}

/** Admin Timestamps → Date, recursively. */
function normalize(v: unknown): unknown {
  if (v instanceof Timestamp) return v.toDate()
  if (Array.isArray(v)) return v.map(normalize)
  if (v && typeof v === "object" && !(v instanceof Date)) {
    return Object.fromEntries(Object.entries(v as Doc).map(([k, x]) => [k, normalize(x)]))
  }
  return v
}

/** Browser-decoded values → evaluator values (timestamps as Date, REQUEST_TIME transforms). */
function revive(fields: Doc, requestTime: Date, transforms?: { field: string; server: string }[]): Doc {
  const walk = (v: unknown): unknown => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const o = v as Doc
      if (typeof o.__ts === "string") return new Date(o.__ts)
      return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, walk(x)]))
    }
    if (Array.isArray(v)) return v.map(walk)
    return v
  }
  const out = walk(fields) as Doc
  for (const t of transforms ?? []) {
    if (t.server === "REQUEST_TIME") setPath(out, t.field, requestTime)
  }
  return out
}

function setPath(target: Doc, fieldPath: string, value: unknown) {
  const parts = fieldPath.replace(/`/g, "").split(".")
  let cur = target
  for (let i = 0; i < parts.length - 1; i++) {
    if (!cur[parts[i]] || typeof cur[parts[i]] !== "object") cur[parts[i]] = {}
    cur = cur[parts[i]] as Doc
  }
  if (value === undefined) delete cur[parts[parts.length - 1]]
  else cur[parts[parts.length - 1]] = value
}

function getPath(source: Doc, fieldPath: string): unknown {
  let cur: unknown = source
  for (const p of fieldPath.replace(/`/g, "").split(".")) {
    if (!cur || typeof cur !== "object") return undefined
    cur = (cur as Doc)[p]
  }
  return cur
}

function applyWrite(before: Doc, w: DecodedWrite & { fields?: Doc }): Doc | null {
  if (w.op === "delete") return null
  if (w.updateMask && w.updateMask.length) {
    const after: Doc = structuredClone(before)
    for (const fp of w.updateMask) setPath(after, fp, getPath(w.fields ?? {}, fp))
    for (const t of w.transforms ?? []) if (t.server === "REQUEST_TIME") setPath(after, t.field, getPath(w.fields ?? {}, t.field))
    return after
  }
  return { ...(w.fields ?? {}) }
}

function typeName(v: unknown): string {
  if (v === undefined) return "(ausente)"
  if (v === null) return "null"
  if (v instanceof Date) return "timestamp"
  if (Array.isArray(v)) return "list"
  return typeof v === "object" ? "map" : typeof v
}

function describe(key: string, v: unknown): unknown {
  if (key === "payload" && v && typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Doc).map(([k, x]) => [k, SHOW.has(k) ? x : typeName(x)]))
  }
  if (SHOW.has(key)) return v instanceof Date ? v.toISOString() : v === undefined ? "(ausente)" : v
  if (key === "closedAt" || key === "closedValue") return `${typeName(v)}${v != null ? " (con valor)" : ""}`
  return typeName(v)
}
