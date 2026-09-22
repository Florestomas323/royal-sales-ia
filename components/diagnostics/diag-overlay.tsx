"use client"

/**
 * TEMPORARY DIAGNOSTIC — remove with lib/diagnostics/.
 *
 * Rendered on every app page, but does nothing unless the tab is in diag
 * mode (`?diag=1`). In diag mode it shows a small badge (proof that this
 * build is live and the flag reached the app), captures the next rejected
 * Firestore commit from the SDK's own log, and runs a READ-ONLY analysis:
 * fresh reads in the browser plus the server route that compares the
 * published rules and evaluates them against the real documents.
 */

import * as React from "react"
import { doc, getDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase/client"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { DIAG_BUILD, buildCommit, disableDiag, syncDiagFlag } from "@/lib/diagnostics/diag-mode"
import {
  getLastFailure,
  getRecentErrors,
  installFirestoreCapture,
  subscribeFailures,
  type FailedCommit,
} from "@/lib/diagnostics/firestore-capture"

type ServerReport = Record<string, unknown> & {
  error?: string
  rules?: {
    published?: { ruleset?: string; createTime?: string; sha256?: string; error?: string }
    publishedEqualsAudited?: boolean | null
    publishedEqualsAuditedIgnoringWhitespace?: boolean | null
    firstDifferences?: { line: number; published: string; repo: string }[]
  }
  projects?: { server?: string; clientConfig?: string | null; clientWritePath?: string | null }
  identity?: { authUid?: string; membership?: Record<string, unknown> | null; coherence?: { coherent?: boolean; problems?: string[] } }
  lead?: { id?: string; before?: Record<string, unknown> | null; changedKeys?: string[] }
  writes?: { path: string; op: string; updateMask?: string[] | null; fields?: Record<string, unknown> }[]
  evaluations?: { path: string; kind: string; activityType?: string; allowed: boolean | null; error?: string; leaves: string[]; caveats: string[] }[]
}

export function DiagOverlay() {
  const [enabled, setEnabled] = React.useState(false)
  React.useEffect(() => {
    if (syncDiagFlag()) {
      installFirestoreCapture()
      setEnabled(true)
    }
  }, [])
  if (!enabled) return null
  return <DiagPanel />
}

function DiagPanel() {
  const ws = useWorkspace()
  const [failure, setFailure] = React.useState<FailedCommit | null>(() => getLastFailure())
  const [server, setServer] = React.useState<ServerReport | null>(null)
  const [clientInfo, setClientInfo] = React.useState<Record<string, unknown> | null>(null)
  const [running, setRunning] = React.useState(false)
  const [open, setOpen] = React.useState(true)
  const [copied, setCopied] = React.useState(false)

  const wsRef = React.useRef(ws)
  wsRef.current = ws

  React.useEffect(() => subscribeFailures((f) => { setFailure(f); setOpen(true) }), [])

  React.useEffect(() => {
    if (!failure) return
    let cancelled = false
    ;(async () => {
      setRunning(true)
      setServer(null)
      const w = wsRef.current
      const uid = auth.currentUser?.uid ?? null
      let freshMembership: unknown = null
      if (uid) {
        try {
          const snap = await getDoc(doc(db, "memberships", uid))
          freshMembership = snap.exists()
            ? (({ userId, workspaceId, role, status }) => ({ userId, workspaceId, role, status: status ?? "(ausente)" }))(snap.data() as Record<string, unknown>)
            : "no existe"
        } catch (e) {
          freshMembership = `lectura rechazada: ${(e as { code?: string }).code ?? String(e)}`
        }
      }
      const info = {
        authUid: uid,
        clientProjectId: db.app.options.projectId ?? null,
        uiWorkspaceId: w.workspaceId,
        sessionMembership: w.membership
          ? { userId: w.membership.userId, workspaceId: w.membership.workspaceId, role: w.membership.role, status: w.membership.status ?? "(ausente)" }
          : null,
        freshMembershipFromBrowser: freshMembership,
        recentSdkErrors: getRecentErrors(),
      }
      if (!cancelled) setClientInfo(info)
      try {
        const token = await auth.currentUser?.getIdToken()
        const res = await fetch("/api/diagnostics/lead-write", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ writes: failure.writes, error: failure.error, client: { projectId: info.clientProjectId, uiWorkspaceId: info.uiWorkspaceId } }),
        })
        const json = (await res.json().catch(() => ({ error: `HTTP ${res.status} sin JSON` }))) as ServerReport
        if (!cancelled) setServer(res.ok ? json : { ...json, error: `${res.status} ${json.error ?? ""}`.trim() })
      } catch (e) {
        if (!cancelled) setServer({ error: `fetch: ${String(e)}` })
      } finally {
        if (!cancelled) setRunning(false)
      }
    })()
    return () => { cancelled = true }
  }, [failure])

  const summary = failure ? buildSummary(failure, clientInfo, server, running) : null

  async function copy() {
    const full = { summary, failure, client: clientInfo, server }
    try {
      await navigator.clipboard.writeText(`${summary ?? ""}\n\n${JSON.stringify(full, null, 2)}`)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-2 left-2 z-[200] rounded-md bg-amber-500 px-2 py-1 font-mono text-[11px] text-black shadow"
      >
        DIAG {DIAG_BUILD} · {buildCommit()} · {failure ? (running ? "analizando…" : "capturado") : "esperando guardado"}
      </button>
      {failure && open && (
        <div className="fixed inset-x-2 bottom-10 z-[200] max-h-[70svh] overflow-auto rounded-lg border bg-background p-3 font-mono text-[11px] shadow-2xl">
          <pre className="whitespace-pre-wrap break-words">{summary}</pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={copy} className="rounded border px-2 py-1">
              {copied ? "Copiado" : "Copiar reporte completo"}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="rounded border px-2 py-1">Ocultar</button>
            <button type="button" onClick={() => { disableDiag(); window.location.href = window.location.pathname }} className="rounded border px-2 py-1">
              Desactivar diag
            </button>
          </div>
        </div>
      )}
    </>
  )
}

/* -------------------------------------------------------------- summary -- */

function mark(ok: boolean | null | undefined): string {
  return ok === true ? "PASS" : ok === false ? "FAIL" : "NO EVALUADO"
}

function buildSummary(f: FailedCommit, c: Record<string, unknown> | null, s: ServerReport | null, running: boolean): string {
  const L: string[] = []
  L.push(`DIAG ${DIAG_BUILD} · build ${buildCommit()} · ${f.at}`)
  L.push(`FIRESTORE REAL: ${f.error.code ?? "?"} — ${f.error.message ?? f.error.raw.slice(0, 140)}`)
  L.push(`BATCH (${f.writes.length} escrituras):`)
  for (const w of f.writes) {
    const keys = w.updateMask ?? Object.keys(w.fields ?? {})
    L.push(`  · ${w.op} ${w.path}  [${keys.join(", ")}]${w.transforms?.length ? ` +${w.transforms.map((t) => `${t.field}=${t.server}`).join(",")}` : ""}`)
  }
  if (running || !s) {
    L.push("", running ? "Analizando con el servidor…" : "Sin respuesta del servidor todavía.")
    return L.join("\n")
  }
  if (s.error) {
    L.push("", `SERVIDOR: ${s.error}`)
    return L.join("\n")
  }

  const mem = s.identity?.membership ?? null
  const lead = s.lead?.before ?? null
  const acts = f.writes.filter((w) => /\/activities\//.test(w.path))
  const actorOk = acts.every((a) => a.fields?.actorId === mem?.userId && a.fields?.actorRole === mem?.role)
  const statusOk = mem ? ["active", "(ausente)"].includes(String(mem.status)) : false
  const coherent = s.identity?.coherence?.coherent
  L.push("")
  L.push(`IDENTIDAD: ${mark(Boolean(mem) && statusOk && actorOk)}  uid=${s.identity?.authUid} membership=${JSON.stringify(mem)}${acts.length ? ` actor=${JSON.stringify(acts.map((a) => ({ actorId: a.fields?.actorId, actorRole: a.fields?.actorRole })))}` : ""}${coherent === false ? ` coherencia=FAIL ${JSON.stringify(s.identity?.coherence?.problems)}` : ""}`)

  const leadWs = lead?.workspaceId
  const wsOk = mem?.role === "super_admin" || (mem?.workspaceId === leadWs)
  const p = s.projects ?? {}
  const projOk = p.server && p.server === p.clientConfig && (!p.clientWritePath || p.clientWritePath === p.server)
  L.push(`WORKSPACE: ${mark(Boolean(wsOk && projOk))}  lead=${leadWs} membership=${mem?.workspaceId} ui=${c?.uiWorkspaceId ?? "?"} · proyecto servidor=${p.server} cliente=${p.clientConfig} escritura=${p.clientWritePath}`)

  const ev = s.evaluations ?? []
  const line = (label: string, e?: (typeof ev)[number]) => {
    if (!e) return `${label}: NO INCLUIDA EN EL BATCH`
    const head = `${label}: ${mark(e.allowed)}${e.error ? ` (${e.error})` : ""}`
    const leaves = e.allowed === false ? e.leaves.map((x) => `    ↳ ${x}`) : []
    const cav = e.caveats.length ? [`    (aviso: ${e.caveats.join("; ")})`] : []
    return [head, ...leaves, ...cav].join("\n")
  }
  L.push(line("UPDATE LEAD", ev.find((e) => e.kind === "lead_update")))
  L.push(line("STAGE ACTIVITY", ev.find((e) => e.activityType === "stage_change")))
  L.push(line("ASSIGNMENT ACTIVITY", ev.find((e) => e.activityType === "assignment_change")))
  const others = ev.filter((e) => e.kind === "other" || (e.kind === "activity_create" && !["stage_change", "assignment_change"].includes(e.activityType ?? "")))
  L.push(others.length ? others.map((e) => line(`OTRA ESCRITURA ${e.path}`, e)).join("\n") : "OTRA ESCRITURA: NINGUNA")

  const r = s.rules
  const rulesVerdict = r?.publishedEqualsAudited
    ? "CONFIRMADO (idénticas byte a byte)"
    : r?.publishedEqualsAuditedIgnoringWhitespace
      ? "CONFIRMADO (idénticas salvo espacios/saltos de línea)"
      : r?.published?.error
        ? `NO CONFIRMADO (no se pudieron leer las publicadas: ${r.published.error})`
        : `NO CONFIRMADO (difieren)${r?.firstDifferences?.length ? "\n" + r.firstDifferences.map((d) => `    L${d.line} publicada: ${d.published}\n    L${d.line} repo:      ${d.repo}`).join("\n") : ""}`
  L.push(`REGLAS REPO = REGLAS PRODUCCIÓN: ${rulesVerdict}`)
  if (r?.published?.createTime) L.push(`  publicadas: ${r.published.ruleset} · ${r.published.createTime}`)
  L.push(`EVALUADO CONTRA: ${String(s.evaluatedAgainst)}`)

  L.push("")
  L.push(`LEAD ANTES: ${JSON.stringify(lead)}`)
  L.push(`CAMPOS QUE CAMBIA EL BATCH: ${JSON.stringify(s.lead?.changedKeys ?? [])}`)
  L.push(`MEMBERSHIP (navegador): ${JSON.stringify(c?.freshMembershipFromBrowser)} · sesión: ${JSON.stringify(c?.sessionMembership)}`)

  const denied = ev.filter((e) => e.allowed === false)
  L.push("")
  if (denied.length) {
    L.push(`CONCLUSIÓN: el rechazo lo explica ${denied.map((e) => e.activityType ?? e.kind).join(" + ")} con las reglas ${String(s.evaluatedAgainst)}.`)
  } else if (ev.length && ev.every((e) => e.allowed === true)) {
    L.push("CONCLUSIÓN: DISCREPANCIA — con las reglas evaluadas todas las escrituras pasan, pero Firestore rechazó el batch. No aplicar ningún arreglo: revisar primero la sección de reglas y de proyecto.")
  } else {
    L.push("CONCLUSIÓN: evaluación incompleta (ver NO EVALUADO).")
  }
  return L.join("\n")
}
