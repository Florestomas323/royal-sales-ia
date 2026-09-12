import type { UserRole, Workspace } from "@/types"

/**
 * Editable company profile of a workspace. `name` is the only required field:
 * everything else is contact data the distributor fills in over time.
 */
export interface WorkspaceSettingsDraft {
  name: string
  phone: string
  ownerEmail: string
  city: string
  state: string
  timezone: string
}

/**
 * Zones the distributors actually work in (Mexico and the US border states).
 * A closed list keeps the value a valid IANA zone without adding a dependency.
 */
export const TIMEZONES = [
  "America/Mexico_City",
  "America/Cancun",
  "America/Monterrey",
  "America/Chihuahua",
  "America/Mazatlan",
  "America/Hermosillo",
  "America/Tijuana",
  "America/Chicago",
  "America/New_York",
  "America/Denver",
  "America/Los_Angeles",
] as const

export type Timezone = (typeof TIMEZONES)[number]

export function isValidTimezone(value: string): boolean {
  return (TIMEZONES as readonly string[]).includes(value)
}

/**
 * Who may edit the company profile. Mirrors the Rules exactly: only the
 * super admin and the workspace's own client_admin. A manager administers
 * day-to-day work but does not own the company data, so the screen stays
 * read-only for them rather than failing on save.
 */
export function canEditWorkspaceSettings(
  role: UserRole | null,
  isSuperAdmin: boolean,
  callerWorkspaceId: string | null,
  targetWorkspaceId: string | null,
): boolean {
  if (!targetWorkspaceId) return false
  if (isSuperAdmin) return true
  if (callerWorkspaceId !== targetWorkspaceId) return false
  // Distribuidor and Asistente share operational rights.
  return role === "client_admin" || role === "manager"
}

export function toDraft(workspace: Pick<Workspace,
  "name" | "phone" | "ownerEmail" | "city" | "state" | "timezone"> | null): WorkspaceSettingsDraft {
  return {
    name: workspace?.name ?? "",
    phone: workspace?.phone ?? "",
    ownerEmail: workspace?.ownerEmail ?? "",
    city: workspace?.city ?? "",
    state: workspace?.state ?? "",
    timezone: workspace?.timezone ?? "",
  }
}

export interface WorkspaceSettingsErrors {
  name?: "required"
  ownerEmail?: "invalid"
  timezone?: "invalid"
}

/** Same shape a plain email check would use; deliberately permissive. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function validateSettings(draft: WorkspaceSettingsDraft): WorkspaceSettingsErrors {
  const errors: WorkspaceSettingsErrors = {}
  if (draft.name.trim().length === 0) errors.name = "required"
  if (draft.ownerEmail.trim().length > 0 && !EMAIL.test(draft.ownerEmail.trim())) {
    errors.ownerEmail = "invalid"
  }
  if (draft.timezone.length > 0 && !isValidTimezone(draft.timezone)) errors.timezone = "invalid"
  return errors
}

export function hasSettingsErrors(errors: WorkspaceSettingsErrors): boolean {
  return Object.keys(errors).length > 0
}

/**
 * Trims everything and turns cleared fields into `null`, which the data layer
 * translates into a real field removal. Empty strings would leave hollow
 * values behind that look like data.
 */
export function normalizeSettings(draft: WorkspaceSettingsDraft): {
  name: string
  phone: string | null
  ownerEmail: string | null
  city: string | null
  state: string | null
  timezone: string | null
} {
  const orNull = (v: string) => (v.trim().length > 0 ? v.trim() : null)
  return {
    name: draft.name.trim(),
    phone: orNull(draft.phone),
    ownerEmail: draft.ownerEmail.trim() ? draft.ownerEmail.trim().toLowerCase() : null,
    city: orNull(draft.city),
    state: orNull(draft.state),
    timezone: orNull(draft.timezone),
  }
}

export function isDirty(draft: WorkspaceSettingsDraft, original: WorkspaceSettingsDraft): boolean {
  return (Object.keys(draft) as (keyof WorkspaceSettingsDraft)[])
    .some((k) => draft[k].trim() !== original[k].trim())
}
