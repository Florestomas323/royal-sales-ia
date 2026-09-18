/**
 * What a "Guardar" press should actually do.
 *
 * Extracted from the dialog so the decision can be executed by tests instead
 * of being read with a regex. It exists because of a real bug: the dialog
 * checked only `patch` for emptiness, so a submit that changed ONLY the
 * campaign was treated as "no changes" — the dialog closed and
 * `setLeadCampaign` never ran, which is precisely the failure that was
 * reported from production.
 */
export interface SavePlan {
  /** Nothing to do: neither ordinary fields nor the campaign changed. */
  noop: boolean
  /** Call setLeadCampaign with this value. `null` = the campaign did not change. */
  campaign: string | null
  /** Call updateLead with the patch. False when the patch is empty. */
  patch: boolean
}

export function planLeadSave(
  patchKeys: number,
  campaignChange: string | null,
): SavePlan {
  return {
    // "Sin cambios" requires BOTH to be empty. `""` is a real change: it
    // means "Sin campaña", so it must never be mistaken for "unchanged".
    noop: patchKeys === 0 && campaignChange === null,
    campaign: campaignChange,
    // Never call updateLead with an empty patch: it would write nothing and
    // could still emit an audit activity for a change that did not happen.
    patch: patchKeys > 0,
  }
}

/**
 * How a partially completed save is reported.
 *
 * The campaign is written first, through its own authenticated route. If the
 * second write then fails, the campaign IS already saved — pretending
 * otherwise would be a lie, and reporting plain success would hide the loss
 * of the other fields. `partial` says exactly that.
 */
export type SaveOutcome = "saved" | "partial_campaign_saved" | "failed"

export function describeSaveFailure(
  plan: SavePlan,
  failedAt: "campaign" | "patch",
): SaveOutcome {
  // The campaign write is first: if IT failed, nothing was written at all.
  if (failedAt === "campaign") return "failed"
  // The patch failed after the campaign already landed.
  return plan.campaign !== null ? "partial_campaign_saved" : "failed"
}
