import { FirebaseError } from "firebase/app"

/**
 * Normalized error categories the UI knows how to explain.
 * Never swallow Firestore errors: map them here and show them.
 */
export type DataErrorKind =
  | "permission_denied"
  | "missing_workspace"
  | "missing_profile"
  | "invalid_role"
  | "unverified_email"
  | "unavailable"
  | "failed_precondition"
  | "unknown"

export interface DataError {
  kind: DataErrorKind
  /** Short, user-facing explanation (Spanish). */
  message: string
  /** Raw detail for support / console. */
  detail: string
}

export class TenancyError extends Error {
  readonly kind: DataErrorKind
  constructor(kind: DataErrorKind, message: string) {
    super(message)
    this.name = "TenancyError"
    this.kind = kind
  }
}

const MESSAGES: Record<DataErrorKind, string> = {
  permission_denied:
    "No tienes permiso para ver esta información. Si crees que es un error, revisa que las reglas de Firestore estén publicadas y que tu cuenta esté asignada al workspace correcto.",
  missing_workspace:
    "Tu cuenta no está asignada a ningún workspace. Pide a un administrador que te invite.",
  missing_profile:
    "No encontramos tu perfil de equipo. Pide a un administrador que te invite con este correo.",
  invalid_role:
    "Tu rol no es válido para esta acción.",
  unverified_email:
    "Verifica tu correo electrónico para activar tu acceso.",
  unavailable:
    "No se pudo conectar con la base de datos. Revisa tu conexión e inténtalo de nuevo.",
  failed_precondition:
    "La consulta necesita un índice de Firestore que aún no existe. Revisa firestore.indexes.json y créalo en la consola de Firebase.",
  unknown: "Ocurrió un error inesperado al cargar los datos.",
}

export function describeError(err: unknown): DataError {
  if (err instanceof TenancyError) {
    return { kind: err.kind, message: MESSAGES[err.kind], detail: err.message }
  }
  if (err instanceof FirebaseError) {
    const code = err.code.replace(/^firestore\//, "")
    switch (code) {
      case "permission-denied":
        return { kind: "permission_denied", message: MESSAGES.permission_denied, detail: err.message }
      case "unavailable":
        return { kind: "unavailable", message: MESSAGES.unavailable, detail: err.message }
      case "failed-precondition":
        return { kind: "failed_precondition", message: MESSAGES.failed_precondition, detail: err.message }
      default:
        return { kind: "unknown", message: MESSAGES.unknown, detail: `${err.code}: ${err.message}` }
    }
  }
  if (err instanceof Error) {
    return { kind: "unknown", message: MESSAGES.unknown, detail: err.message }
  }
  return { kind: "unknown", message: MESSAGES.unknown, detail: String(err) }
}

/** Convenience: message for the given kind (used by screens that already know the kind). */
export function messageFor(kind: DataErrorKind): string {
  return MESSAGES[kind]
}
