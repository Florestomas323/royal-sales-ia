"use client"

/**
 * TEMPORARY DIAGNOSTIC — remove with lib/diagnostics/.
 *
 * Mounted from more than one place (app layout, Prospectos screen); only the
 * first mounted instance renders. It is portalled straight into
 * <body> with inline styles and the maximum z-index, so no stacking
 * context, theme or open dialog can hide it.
 *
 * In diag mode (`?diag=1`, persisted per tab) it shows a fixed DIAG button
 * from the first render, captures the next rejected save through two
 * independent channels — the Firestore SDK's own write log and the save
 * flow's catch — and runs a READ-ONLY analysis (fresh reads + the server
 * route that compares the published rules and evaluates them).
 * It never writes and never changes what the app does.
 */

import * as React from "react"
import { createPortal } from "react-dom"
import { doc, getDoc } from "firebase/firestore"
import { auth, db } from "@/lib/firebase/client"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { STAGE_LABELS } from "@/lib/constants"
import { closedFieldsFor, normalizePhone } from "@/lib/leads"
import {
  DIAG_BUILD,
  DIAG_SAVE_FAILURE_EVENT,
  buildCommit,
  disableDiag,
  redact,
  syncDiagFlag,
  type SaveFailureReport,
} from "@/lib/diagnostics/diag-mode"
import {
  getCaptureStats,
  getLastFailure,
  getRecentErrors,
  installFirestoreCapture,
  subscribeFailures,
  subscribeStats,
  type CaptureStats,
  type DecodedWrite,
  type FailedCommit,
} from "@/lib/diagnostics/firestore-capture"
import type { Lead, PipelineStage } from "@/types"

/* ---------------------------------------------------------- singleton -- */

const owners: string[] = []
const ownerListeners = new Set<() => void>()
function notifyOwners() {
  ownerListeners.forEach((l) => l())
}

function useIsOwner(id: string, active: boolean): boolean {
  const [own, setOwn] = React.useState(false)
  React.useEffect(() => {
    if (!active) return
    owners.push(id)
    const update = () => setOwn(owners[0] === id)
    ownerListeners.add(update)
    notifyOwners()
    return () => {
      const i = owners.indexOf(id)
      if (i >= 0) owners.splice(i, 1)
      ownerListeners.delete(update)
      notifyOwners()
    }
  }, [id, active])
  return own
}

export function DiagOverlay({ mount = "layout" }: { mount?: string }) {
  const [enabled, setEnabled] = React.useState(false)
  const id = `${mount}:${React.useId()}`
  React.useEffect(() => {
    if (syncDiagFlag()) {
      installFirestoreCapture()
      setEnabled(true)
    }
  }, [])
  const isOwner = useIsOwner(id, enabled)
  const [container, setContainer] = React.useState<HTMLElement | null>(null)
  React.useEffect(() => {
    if (!enabled || !isOwner) return
    let el = document.getElementById("rsia-diag-root")
    if (!el) {
      el = document.createElement("div")
      el.id = "rsia-diag-root"
      document.body.appendChild(el)
    }
    setContainer(el)
  }, [enabled, isOwner])
  if (!enabled || !isOwner || !container) return null
  return createPortal(<DiagUI mount={mount} />, container)
}

/* -------------------------------------------------------------- styles -- */

const Z = 2147483647
const pillStyle: React.CSSProperties = {
  position: "fixed",
  top: "calc(env(safe-area-inset-top, 0px) + 6px)",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: Z,
  pointerEvents: "auto",
  background: "#f59e0b",
  color: "#000",
  border: "2px solid #000",
  borderRadius: 9999,
  padding: "6px 12px",
  font: "600 12px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace",
  boxShadow: "0 4px 14px rgba(0,0,0,.35)",
  whiteSpace: "nowrap",
  maxWidth: "96vw",
  overflow: "hidden",
  textOverflow: "ellipsis",
}
const panelStyle: React.CSSProperties = {
  position: "fixed",
  top: "calc(env(safe-area-inset-top, 0px) + 48px)",
  left: 8,
  right: 8,
  maxHeight: "72vh",
  overflow: "auto",
  WebkitOverflowScrolling: "touch",
  zIndex: Z,
  pointerEvents: "auto",
  background: "#111",
  color: "#f2f2f2",
  border: "2px solid #f59e0b",
  borderRadius: 10,
  padding: 10,
  font: "11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace",
  boxShadow: "0 10px 30px rgba(0,0,0,.5)",
}
const btnStyle: React.CSSProperties = {
  background: "#f59e0b",
  color: "#000",
  border: "none",
  borderRadius: 6,
  padding: "8px 10px",
  font: "600 12px ui-monospace, Menlo, monospace",
  marginRight: 6,
  marginBottom: 6,
}

/* ------------------------------------------------------------- incident -- */

interface Incident {
  at: string
  source: "sdk" | "save-flow" | "sdk+save-flow"
  writes: DecodedWrite[]
  writesOrigin: "sdk-exact" | "reconstructed"
  error: { code?: string; message?: string; raw?: string }
  app?: SaveFailureReport
}

type ServerReport = Record<string, unknown> & {
  error?: string
  rules?: {
    published?: { ruleset?: string; createTime?: string; sha256?: string; error?: string }
    publishedEqualsAudited?: boolean | null
    publishedEqualsAuditedIgnoringWhitespace?: boolean | null
    firstDifferences?: { line: number; published: string; repo: string }[]
  }
  evaluatedAgainst?: string
  projects?: { server?: string; clientConfig?: string | null; clientWritePath?: string | null }
  identity?: { authUid?: string; membership?: Record<string, unknown> | null; coherence?: { coherent?: boolean; problems?: string[] } }
  lead?: { id?: string; before?: Record<string, unknown> | null; changedKeys?: string[] }
  evaluations?: { path: string; kind: string; activityType?: string; allowed: boolean | null; error?: string; leaves: string[]; caveats: string[] }[]
}

function DiagUI({ mount }: { mount: string }) {
  const ws = useWorkspace()
  const wsRef = React.useRef(ws)
  wsRef.current = ws

  const [stats, setStats] = React.useState<CaptureStats>(() => getCaptureStats())
  const [open, setOpen] = React.useState(false)
  const [incident, setIncident] = React.useState<Incident | null>(null)
  const [server, setServer] = React.useState<ServerReport | null>(null)
  const [clientInfo, setClientInfo] = React.useState<Record<string, unknown> | null>(null)
  const [running, setRunning] = React.useState(false)
  const [copyState, setCopyState] = React.useState<"idle" | "ok" | "fallback">("idle")

  // Live counters (plus a slow refresh for the raw log counter).
  React.useEffect(() => {
    const off = subscribeStats(setStats)
    const t = window.setInterval(() => setStats(getCaptureStats()), 2000)
    return () => { off(); window.clearInterval(t) }
  }, [])

  // Both channels feed one pending incident, settled after a short window so
  // the SDK log and the save flow's catch can meet.
  const pending = React.useRef<{ sdk?: FailedCommit; app?: SaveFailureReport; timer?: number }>({})
  const settle = React.useCallback(() => {
    const p = pending.current
    pending.current = {}
    const app = p.app
    // The SDK failure only belongs to this save if it wrote THIS lead.
    const sdk = p.sdk && (!app || touchesLead(p.sdk, app.lead.id)) ? p.sdk : undefined
    if (!sdk && !app) return
    const writes = sdk?.writes ?? (app ? reconstructWrites(app) : [])
    setIncident({
      at: new Date().toISOString(),
      source: sdk && app ? "sdk+save-flow" : sdk ? "sdk" : "save-flow",
      writes,
      writesOrigin: sdk ? "sdk-exact" : "reconstructed",
      error: sdk?.error ?? { code: app?.error.code, message: app?.error.message },
      app,
    })
    setOpen(true)
  }, [])
  const schedule = React.useCallback(() => {
    const p = pending.current
    if (p.timer) window.clearTimeout(p.timer)
    p.timer = window.setTimeout(settle, 900)
    setOpen(true)
  }, [settle])

  React.useEffect(() => {
    const offSdk = subscribeFailures((f) => { pending.current.sdk = f; schedule() })
    const onApp = (e: Event) => {
      const detail = (e as CustomEvent<SaveFailureReport>).detail
      pending.current.app = detail
      const last = getLastFailure()
      if (!pending.current.sdk && last && Date.now() - Date.parse(last.at) < 15_000 && touchesLead(last, detail.lead.id)) {
        pending.current.sdk = last
      }
      schedule()
    }
    window.addEventListener(DIAG_SAVE_FAILURE_EVENT, onApp)
    return () => { offSdk(); window.removeEventListener(DIAG_SAVE_FAILURE_EVENT, onApp) }
  }, [schedule])

  // READ-ONLY analysis of the incident.
  React.useEffect(() => {
    if (!incident) return
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
          const d = snap.data() as Record<string, unknown> | undefined
          freshMembership = d ? { userId: d.userId, workspaceId: d.workspaceId, role: d.role, status: d.status ?? "(ausente)" } : "no existe"
        } catch (e) {
          freshMembership = `lectura rechazada: ${(e as { code?: string }).code ?? String(e)}`
        }
      }
      const info = {
        mount,
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
      if (!incident.writes.length) {
        if (!cancelled) { setServer({ error: "sin escrituras que evaluar" }); setRunning(false) }
        return
      }
      try {
        const token = await auth.currentUser?.getIdToken()
        const res = await fetch("/api/diagnostics/lead-write", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({
            writes: incident.writes,
            error: incident.error,
            client: { projectId: info.clientProjectId, uiWorkspaceId: info.uiWorkspaceId, writesOrigin: incident.writesOrigin },
          }),
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
  }, [incident, mount])

  const text = incident
    ? buildSummary(incident, clientInfo, server, running)
    : statusText(mount, stats, ws)
  const safeIncident = incident
    ? { ...incident, writes: incident.writes.map((w) => ({ ...w, fields: w.fields ? redact(w.fields) : w.fields })) }
    : null
  const fullReport = `${text}\n\n${JSON.stringify({ incident: safeIncident, client: clientInfo, server, stats }, null, 2)}`

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullReport)
      setCopyState("ok")
      window.setTimeout(() => setCopyState("idle"), 2500)
    } catch {
      setCopyState("fallback")
    }
  }

  const state = incident ? (running ? "analizando…" : "FALLO CAPTURADO") : "activo"
  return (
    <>
      <button type="button" style={pillStyle} onClick={() => setOpen((o) => !o)} aria-label="Diagnóstico">
        DIAG {DIAG_BUILD} · {buildCommit()} · {state} · w{stats.writeRequests} e{stats.errors}
      </button>
      {open && (
        <div style={panelStyle} role="dialog" aria-label="Reporte de diagnóstico">
          <div>
            <button type="button" style={btnStyle} onClick={copy}>
              {copyState === "ok" ? "Copiado ✓" : "Copiar reporte completo"}
            </button>
            <button type="button" style={btnStyle} onClick={() => setOpen(false)}>Cerrar</button>
            <button
              type="button"
              style={btnStyle}
              onClick={() => { disableDiag(); window.location.href = window.location.pathname }}
            >
              Desactivar diag
            </button>
          </div>
          {copyState === "fallback" && (
            <textarea
              readOnly
              value={fullReport}
              onFocus={(e) => e.currentTarget.select()}
              style={{ width: "100%", height: 160, background: "#000", color: "#0f0", font: "10px monospace", marginBottom: 8 }}
            />
          )}
          <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", margin: 0 }}>{text}</pre>
        </div>
      )}
    </>
  )
}

function touchesLead(f: FailedCommit, leadId: string): boolean {
  return f.writes.some((w) => w.path === `leads/${leadId}` || w.path.startsWith(`leads/${leadId}/`))
}

/* ------------------------------------------------ fallback reconstruction -- */

/**
 * Only when the SDK log was not captured: rebuilds the batch updateLead()
 * would send from the patch the save flow reported. Marked "reconstructed"
 * in the report so it is never mistaken for the exact wire payload.
 */
function reconstructWrites(app: SaveFailureReport): DecodedWrite[] {
  const p = app.patch as Record<string, unknown>
  const data: Record<string, unknown> = {}
  if (typeof p.name === "string") data.name = p.name.trim()
  if (typeof p.phone === "string") data.phone = normalizePhone(p.phone)
  if (typeof p.email === "string") data.email = p.email.trim().toLowerCase()
  if (typeof p.source === "string") data.source = p.source
  if (typeof p.stage === "string") {
    data.stage = p.stage
    if (app.lead.stage !== undefined) {
      Object.assign(
        data,
        closedFieldsFor(
          { leadType: app.lead.leadType as Lead["leadType"], stage: app.lead.stage as PipelineStage },
          p.stage as PipelineStage,
          typeof p.closedValue === "number" ? p.closedValue : undefined,
        ),
      )
    }
  }
  if (typeof p.assignedToId === "string") data.assignedToId = p.assignedToId
  if (typeof p.nextAction === "string") data.nextAction = p.nextAction.trim()
  const base = `leads/${app.lead.id}`
  const writes: DecodedWrite[] = [{ path: base, op: "update", fields: data, updateMask: Object.keys(data) }]
  if (!app.actor || !app.lead.workspaceId) return writes
  const activity = (type: string, payload: Record<string, unknown>): DecodedWrite => ({
    path: `${base}/activities/(reconstruida-${type})`,
    op: "set",
    fields: {
      workspaceId: app.lead.workspaceId,
      leadId: app.lead.id,
      type,
      actorId: app.actor!.userId,
      actorRole: app.actor!.role,
      createdAt: new Date().toISOString(),
      payload: Object.fromEntries(Object.entries(payload).filter(([, v]) => v !== undefined && v !== null)),
    },
    transforms: [{ field: "createdAtServer", server: "REQUEST_TIME" }],
  })
  if (typeof data.stage === "string" && app.lead.stage !== undefined && data.stage !== app.lead.stage) {
    writes.push(activity("stage_change", {
      from: app.lead.stage,
      to: data.stage,
      fromLabel: STAGE_LABELS[app.lead.stage as PipelineStage] ?? app.lead.stage,
      toLabel: STAGE_LABELS[data.stage as PipelineStage],
    }))
  }
  if (typeof data.assignedToId === "string" && app.lead.assignedToId !== undefined && data.assignedToId !== app.lead.assignedToId) {
    writes.push(activity("assignment_change", { from: app.lead.assignedToId, to: data.assignedToId, fromLabel: "", toLabel: "" }))
  }
  return writes
}

/* -------------------------------------------------------------- summary -- */

function statusText(mount: string, s: CaptureStats, ws: ReturnType<typeof useWorkspace>): string {
  return [
    `DIAG ${DIAG_BUILD} · build ${buildCommit()} · montado desde: ${mount}`,
    `Modo diagnóstico: ACTIVO (esta pestaña)`,
    `Captura SDK instalada: ${s.installed ? "sí" : "NO"} · eventos de log: ${s.logEvents} · escrituras vistas: ${s.writeRequests} · errores vistos: ${s.errors}`,
    `Última escritura vista: ${s.lastWrite ?? "ninguna"}`,
    `Último error visto: ${s.lastError ?? "ninguno"}`,
    `Sesión: uid=${auth.currentUser?.uid ?? "?"} workspace UI=${ws.workspaceId ?? "?"} rol=${ws.role ?? "?"} userId=${ws.membership?.userId ?? "?"}`,
    "",
    "Esperando un guardado rechazado. Al ocurrir, este panel se abre solo.",
  ].join("\n")
}

function mark(ok: boolean | null | undefined): string {
  return ok === true ? "PASS" : ok === false ? "FAIL" : "NO EVALUADO"
}

function buildSummary(f: Incident, c: Record<string, unknown> | null, s: ServerReport | null, running: boolean): string {
  const L: string[] = []
  L.push(`DIAG ${DIAG_BUILD} · build ${buildCommit()} · ${f.at}`)
  L.push(`CAPTURADO POR: ${f.source} · escrituras: ${f.writesOrigin === "sdk-exact" ? "EXACTAS (log del SDK)" : "RECONSTRUIDAS desde el patch (el log del SDK no las vio)"}`)
  L.push(`FIRESTORE REAL: ${f.error.code ?? "?"} — ${f.error.message ?? f.error.raw?.slice(0, 140) ?? "?"}`)
  if (f.app) {
    L.push(`FLUJO: ${f.app.source} · lead=${f.app.lead.id} ws=${f.app.lead.workspaceId} stage=${f.app.lead.stage} assignedToId=${JSON.stringify(f.app.lead.assignedToId)} leadType=${f.app.lead.leadType ?? "(ausente)"}`)
    L.push(`PATCH (keys): ${JSON.stringify(Object.keys(f.app.patch))} · ACTOR: ${JSON.stringify(f.app.actor)}`)
  }
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
  const wsOk = mem?.role === "super_admin" || mem?.workspaceId === leadWs
  const p = s.projects ?? {}
  const projOk = Boolean(p.server) && p.server === p.clientConfig && (!p.clientWritePath || p.clientWritePath === p.server)
  L.push(`WORKSPACE: ${mark(Boolean(wsOk && projOk))}  lead=${leadWs} membership=${mem?.workspaceId} ui=${c?.uiWorkspaceId ?? "?"} · proyecto servidor=${p.server} cliente=${p.clientConfig} escritura=${p.clientWritePath ?? "(reconstruida)"}`)

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
    L.push("CONCLUSIÓN: DISCREPANCIA — con las reglas evaluadas todas las escrituras pasan, pero Firestore rechazó el batch. No aplicar ningún arreglo: revisar primero reglas y proyecto.")
  } else {
    L.push("CONCLUSIÓN: evaluación incompleta (ver NO EVALUADO).")
  }
  return L.join("\n")
}
