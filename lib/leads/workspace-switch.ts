import { isActiveLead } from "@/lib/leads"

/**
 * The decisions that must be re-made every time the active workspace changes.
 *
 * They live here, outside the components, for one reason: both production
 * failures they fix were decisions taken inside a component, where the only
 * way to check them was to read the JSX. Here they can be EXECUTED by a test.
 *
 *  1. "No se pudo crear el prospecto" right after switching workspace: the
 *     dialog kept the assignee (and could keep the campaign) of the previous
 *     workspace, and the server correctly rejected it with `invalid_assignee`.
 *  2. The trash emptied nothing — or asked which workspace again — even though
 *     a concrete workspace was selected globally.
 *
 * Nothing here talks to Firestore or React: same input, same answer.
 */

/** Sentinel the "Campaña" select uses for "sin campaña". */
export const NO_CAMPAIGN = "__none__"

/**
 * The key that decides WHEN the operational shell is remounted.
 *
 * Any change to this string unmounts the whole subtree below `WorkspaceScope`
 * — dialogs, sheets, form state and `onSnapshot` listeners included — so two
 * different workspaces must never produce the same key.
 */
export function workspaceScopeKey(
  status: string,
  workspaceId: string | null,
  isSuperAdmin: boolean,
  allWorkspacesSentinel: string,
): string {
  if (status !== "ready") return "loading"
  return workspaceId ?? (isSuperAdmin ? allWorkspacesSentinel : "none")
}

/* ------------------------------------------------------ nuevo prospecto ---- */

/** Whether the selected assignee still exists in the CURRENT workspace. */
export function assigneeBelongs(
  assignedToId: string,
  activeRepIds: readonly string[],
): boolean {
  return assignedToId !== "" && activeRepIds.includes(assignedToId)
}

/**
 * The assignee that may actually be submitted.
 *
 * A sales rep can only create leads for themselves (Rules enforce it). For
 * everybody else: keep the selection when it belongs to this workspace,
 * otherwise fall back to the first valid member — never to a `users/{id}` of
 * the workspace we just left, which is exactly what produced
 * `invalid_assignee`.
 */
export function resolveAssignee(
  assignedToId: string,
  activeRepIds: readonly string[],
  self?: { isRep: boolean; userId?: string },
): string {
  if (self?.isRep) return self.userId ?? ""
  if (assigneeBelongs(assignedToId, activeRepIds)) return assignedToId
  return activeRepIds[0] ?? ""
}

/**
 * The campaign that may actually be submitted. `availableIds` is the list the
 * current workspace offers for the selected lead type; anything else becomes
 * "sin campaña" instead of travelling to a server that would reject it.
 */
export function resolveCampaignId(
  campaignId: string,
  availableIds: readonly string[],
): string {
  if (!campaignId || campaignId === NO_CAMPAIGN) return NO_CAMPAIGN
  return availableIds.includes(campaignId) ? campaignId : NO_CAMPAIGN
}

/** Why "Guardar" is disabled, or `null` when it may be pressed. */
export type SubmitBlock = "no_workspace" | "loading_workspace" | "submitting" | null

/**
 * Saving while the new workspace is still loading is what let a stale
 * assignee through: with no members loaded yet, "first valid member" is
 * nothing, and the previous selection was the only value left on screen.
 */
export function newLeadSubmitBlock(state: {
  workspaceId: string | null
  loadingReps: boolean
  loadingCampaigns: boolean
  submitting: boolean
}): SubmitBlock {
  if (!state.workspaceId) return "no_workspace"
  if (state.loadingReps || state.loadingCampaigns) return "loading_workspace"
  if (state.submitting) return "submitting"
  return null
}

/* -------------------------------------------------------------- papelera ---- */

export interface WorkspaceRef {
  id: string
  name: string
}

/**
 * The workspace the Prospectos screen starts on.
 *
 * It used to start at `null` ("todos los workspaces") even when a concrete
 * workspace was selected globally, so the screen said "Todos" while the query
 * was already scoped — and the trash had no target to empty.
 */
export function initialWorkspaceFilter(activeWorkspaceId: string | null): string | null {
  return activeWorkspaceId
}

/**
 * The per-screen workspace selector only makes sense when the global
 * selection is "Todos los workspaces". With a concrete workspace active it
 * could only contradict it.
 */
export function showsLocalWorkspaceFilter(
  isSuperAdmin: boolean,
  workspaceCount: number,
  activeWorkspaceId: string | null,
): boolean {
  return isSuperAdmin && workspaceCount > 1 && activeWorkspaceId === null
}

/**
 * The ONE workspace whose trash the button empties: the local selection when
 * there is one, otherwise the globally active workspace. `null` means there
 * is no single target — "Todos los workspaces" with nothing chosen — and the
 * action must stay disabled. There is deliberately no "all" branch: a global
 * wipe must never be reachable.
 */
export function resolveTrashTarget(
  workspaceFilter: string | null,
  activeWorkspaceId: string | null,
  workspaces: readonly WorkspaceRef[],
): WorkspaceRef | null {
  const id = workspaceFilter ?? activeWorkspaceId
  if (!id) return null
  const ws = workspaces.find((w) => w.id === id)
  return ws ? { id: ws.id, name: ws.name } : null
}

/**
 * Archived prospects of ONE workspace. The button and the modal must promise
 * exactly the number the server will delete, so the count is never taken from
 * a list that may span several workspaces.
 */
export function countArchivedIn(
  leads: readonly { workspaceId: string; archived?: boolean }[],
  workspaceId: string | null,
): number {
  if (!workspaceId) return 0
  return leads.filter((l) => !isActiveLead(l) && l.workspaceId === workspaceId).length
}
