import type { MetaConnection } from "@/types"
import type { GraphFailure } from "./graph"

/**
 * Shape returned by /api/meta/status and /api/meta/sync. Shared with the
 * client hook. Never carries tokens, headers or raw Meta error bodies.
 */
export interface MetaStatusResponse {
  connected: boolean
  connection: MetaConnection | null
  /** Set when the live check failed. */
  errorCode: string | null
  /** User-facing message (Spanish). */
  message: string | null
  /** Non-fatal notes from the last inventory (safe strings). */
  warnings: string[]
}

export function friendlyGraphMessage(f: GraphFailure): string {
  switch (f.kind) {
    case "not_configured":
      return "El token de Meta no está configurado en el servidor."
    case "auth":
      return "El token de Meta es inválido o expiró. Genera uno nuevo en Meta Business."
    case "permission":
      return "El token de Meta no tiene permisos suficientes para esta operación."
    case "rate_limit":
      return "Meta limitó temporalmente las consultas. Inténtalo en unos minutos."
    case "timeout":
    case "network":
    case "server":
      return "Meta no respondió a tiempo. Inténtalo de nuevo."
    default:
      return "Meta devolvió un error inesperado."
  }
}
