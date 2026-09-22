"use client"

/**
 * TEMPORARY DIAGNOSTIC — rendered only with `?diag=1` in the URL and only
 * after a failed save. Remove together with lib/diagnostics/lead-save-probe.ts.
 */

import * as React from "react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { LeadPatch } from "@/lib/firebase/leads"
import type { ActorContext } from "@/lib/firebase/activities"
import { diagnoseLeadSave, probeLeadSaveSteps, type LeadSaveReport } from "@/lib/diagnostics/lead-save-probe"
import type { Lead } from "@/types"

export interface LeadSaveAttempt {
  patch: LeadPatch
  actor: ActorContext | null
  error: unknown
}

export function LeadSaveDiagnostic({
  lead,
  attempt,
  memberName,
}: {
  lead: Lead
  attempt: LeadSaveAttempt
  memberName?: (id: string) => string
}) {
  const [report, setReport] = React.useState<LeadSaveReport | null>(null)
  const [running, setRunning] = React.useState<"none" | "phase1" | "phase2">("none")
  const [phase2Done, setPhase2Done] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  async function runPhase1() {
    setRunning("phase1")
    try {
      const r = await diagnoseLeadSave({ lead, patch: attempt.patch, actor: attempt.actor, originalError: attempt.error })
      console.info("[diag lead-save] fase 1", r)
      setReport(r)
    } finally {
      setRunning("none")
    }
  }

  async function runPhase2() {
    if (!report) return
    const ok = window.confirm(
      "La fase 2 aplica el mismo cambio que intentaste guardar, pero en pasos separados y auditados (etapa, responsable, resto). Se detiene en el primer rechazo. ¿Continuar?",
    )
    if (!ok) return
    setRunning("phase2")
    try {
      const r = await probeLeadSaveSteps(report, { lead, patch: attempt.patch, actor: attempt.actor, memberName })
      console.info("[diag lead-save] fase 2", r)
      setReport(r)
      setPhase2Done(true)
    } finally {
      setRunning("none")
    }
  }

  async function copy() {
    if (!report) return
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2))
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="mt-4 min-w-0 rounded-md border border-dashed p-3 text-xs">
      <p className="mb-2 font-medium">Diagnóstico temporal del guardado</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="outline" onClick={runPhase1} disabled={running !== "none"}>
          {running === "phase1" && <Loader2 className="animate-spin" data-icon="inline-start" />}
          Fase 1 · sin cambios
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={runPhase2} disabled={!report || phase2Done || running !== "none"}>
          {running === "phase2" && <Loader2 className="animate-spin" data-icon="inline-start" />}
          Fase 2 · por pasos
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={copy} disabled={!report}>
          {copied ? "Copiado" : "Copiar reporte"}
        </Button>
      </div>
      {report && (
        <>
          <p className="mt-3 font-medium">{report.verdict}</p>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all rounded bg-muted p-2">
            {JSON.stringify(report, null, 2)}
          </pre>
        </>
      )}
    </div>
  )
}
