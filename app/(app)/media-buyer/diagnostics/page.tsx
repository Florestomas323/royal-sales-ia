"use client"

import { useCallback, useEffect, useState } from "react"
import { auth } from "@/lib/firebase/client"

/**
 * DIAGNÓSTICO TEMPORAL de "Leads Meta" — solo lectura.
 *
 * Página no enlazada en el menú. Llama a /api/meta/insights/diagnostics con
 * el ID token de Firebase (la API exige `Authorization: Bearer`, por eso no
 * basta con abrir la URL del endpoint directamente en el navegador) y muestra
 * el JSON crudo que Meta devuelve, para comprobar si una misma conversión
 * llega repetida bajo varios action_type.
 *
 * No modifica ninguna métrica ni la pantalla de Media Buyer IA.
 */

const PERIODOS = ["today", "7d", "30d", "month", "all"] as const
type Periodo = (typeof PERIODOS)[number]

interface Resumen {
  campanasConDatos: number
  spendTotal: number
  leadsMetaCalculoActualTotal: number
  sumaDeMaximosIndividuales: number
  totalesPorActionTypeDeLead: Record<string, number>
  campanasConSospechaDeDuplicacion: string[]
  workspacesSinCuentaPublicitaria: number
}

interface Diagnostico {
  ok: boolean
  generatedAt?: string
  range?: { since: string; until: string }
  actionTypesUsadosHoyComoLead?: string[]
  resumen?: Resumen | null
  message?: string | null
  errorCode?: string | null
}

export default function DiagnosticoLeadsMetaPage() {
  const [periodo, setPeriodo] = useState<Periodo>("30d")
  const [json, setJson] = useState<string>("")
  const [data, setData] = useState<Diagnostico | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  const cargar = useCallback(async () => {
    setLoading(true)
    setError(null)
    setCopiado(false)
    try {
      const user = auth.currentUser
      if (!user) throw new Error("Tu sesión no es válida. Vuelve a iniciar sesión.")
      const token = await user.getIdToken()
      const res = await fetch(
        `/api/meta/insights/diagnostics?workspaceId=all&period=${encodeURIComponent(periodo)}`,
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
      )
      const body: unknown = await res.json().catch(() => null)
      if (!res.ok) {
        const code = (body as { error?: string } | null)?.error ?? `http_${res.status}`
        throw new Error(
          code === "forbidden"
            ? "Este diagnóstico solo está disponible para super_admin."
            : `La petición falló: ${code}`,
        )
      }
      setData(body as Diagnostico)
      setJson(JSON.stringify(body, null, 2))
    } catch (err) {
      setData(null)
      setJson("")
      setError(err instanceof Error ? err.message : "Error desconocido.")
    } finally {
      setLoading(false)
    }
  }, [periodo])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(json)
      setCopiado(true)
    } catch {
      setCopiado(false)
    }
  }

  const resumen = data?.resumen ?? null

  return (
    <div className="flex flex-col gap-4 p-4 md:p-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Diagnóstico temporal — Leads Meta</h1>
        <p className="text-sm text-muted-foreground">
          Solo lectura. Muestra el array <code>actions</code> tal cual lo devuelve Meta por campaña. No cambia
          ninguna métrica de Media Buyer IA.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        {PERIODOS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriodo(p)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              p === periodo ? "bg-foreground text-background" : "bg-background"
            }`}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void cargar()}
          className="rounded-md border px-3 py-1.5 text-sm"
          disabled={loading}
        >
          {loading ? "Cargando…" : "Actualizar"}
        </button>
        <button
          type="button"
          onClick={() => void copiar()}
          className="rounded-md border px-3 py-1.5 text-sm"
          disabled={!json}
        >
          {copiado ? "Copiado ✓" : "Copiar JSON"}
        </button>
      </div>

      {error && (
        <p className="rounded-md border border-dashed px-4 py-3 text-sm text-destructive">{error}</p>
      )}

      {data?.message && (
        <p className="rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground">{data.message}</p>
      )}

      {resumen && (
        <div className="rounded-lg border p-4 text-sm">
          <p className="mb-2 font-medium">Resumen</p>
          <ul className="flex flex-col gap-1">
            <li>Rango: {data?.range?.since} → {data?.range?.until}</li>
            <li>Campañas con datos: {resumen.campanasConDatos}</li>
            <li>Inversión total: {resumen.spendTotal}</li>
            <li>
              <strong>Leads Meta con el cálculo ACTUAL (suma): {resumen.leadsMetaCalculoActualTotal}</strong>
            </li>
            <li>Suma de máximos individuales (referencia, no aplicada): {resumen.sumaDeMaximosIndividuales}</li>
            <li>
              Campañas con sospecha de duplicación: {resumen.campanasConSospechaDeDuplicacion.length}
            </li>
          </ul>
          <p className="mt-3 mb-1 font-medium">Total por action_type de lead</p>
          <ul className="flex flex-col gap-1">
            {Object.entries(resumen.totalesPorActionTypeDeLead).map(([tipo, total]) => (
              <li key={tipo}>
                <code>{tipo}</code>: {total}
              </li>
            ))}
            {Object.keys(resumen.totalesPorActionTypeDeLead).length === 0 && <li>Ninguno presente.</li>}
          </ul>
        </div>
      )}

      {json && (
        <pre className="max-h-[60vh] overflow-auto rounded-lg border bg-muted p-3 text-[11px] leading-snug">
          {json}
        </pre>
      )}
    </div>
  )
}
