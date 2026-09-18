"use client"

import * as React from "react"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PhoneField } from "@/components/leads/phone-field"
import { useCampaignsForWorkspace, useUsersForWorkspace } from "@/lib/firebase/collections"
import { CAMPAIGN_STATUS_LABELS, PLATFORMS, PLATFORM_LABELS } from "@/lib/constants"
import { LeadValidationError, updateLead, type LeadPatch } from "@/lib/firebase/leads"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { describeError } from "@/lib/firebase/errors"
import { PIPELINES, STAGE_LABELS } from "@/lib/constants"
import { canReassignLead, displayStage, eligibleAssignees, isValidE164, leadTypeOf, splitPhone, toE164 } from "@/lib/leads"
import { memberLabel } from "@/lib/team"
import { t } from "@/lib/i18n"
import type { Lead, PipelineStage, Platform } from "@/types"

const NO_OWNER = "__none__"
const NO_CAMPAIGN = "__no_campaign__"

/**
 * Edit a lead. Only fields that exist in the model are editable; workspace,
 * type, source and attribution are never part of the form. Stage options are
 * limited to the lead's own pipeline; the assignee list is limited to active
 * members of the SAME workspace (`useUsers` is already workspace-scoped).
 * Success is only reported after Firestore confirms the write.
 */
export function EditLeadDialog({
  lead,
  open,
  onOpenChange,
}: {
  lead: Lead
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { role, membership, isSuperAdmin } = useWorkspace()
  // Assignees come from the LEAD's workspace, not the sidebar selection.
  const { users, loading: usersLoading } = useUsersForWorkspace(lead.workspaceId)
  const type = leadTypeOf(lead)
  const canReassign = canReassignLead(
    { role, userId: membership?.userId ?? null, workspaceId: membership?.workspaceId ?? null, isSuperAdmin },
    lead,
  )

  const initialPhone = splitPhone(lead.phone)
  const [name, setName] = React.useState(lead.name)
  const [email, setEmail] = React.useState(lead.email)
  const [countryCode, setCountryCode] = React.useState(initialPhone.countryCode)
  const [national, setNational] = React.useState(initialPhone.national)
  const [stage, setStage] = React.useState<PipelineStage>(
    displayStage(lead),
  )
  const [assignedToId, setAssignedToId] = React.useState(lead.assignedToId || NO_OWNER)
  /**
   * Manual campaign attribution. The list is `useCampaigns()`, which is
   * scoped to the active workspace by construction, and it includes paused
   * campaigns on purpose: a lead can belong to a campaign that was paused
   * later. Only Distribuidor / Asistente may attribute; the Rules whitelist
   * for a Telemarketing user does not include `campaignId`.
   */
  // Scoped to the LEAD's workspace, never to the one being browsed: a
  // campaign of another workspace would be refused by the Rules.
  const { campaigns, loading: campaignsLoading } = useCampaignsForWorkspace(lead.workspaceId)
  const canAttribute = isSuperAdmin || role === "client_admin" || role === "manager"
  const [campaignId, setCampaignId] = React.useState(lead.campaignId || NO_CAMPAIGN)
  /**
   * Channel = the existing `lead.source` (Platform). No parallel field: the
   * badge, the filters and Media Buyer already read it. Changing it never
   * touches `attribution`, so the Meta ids and the original trail survive and
   * the campaign is not silently reassigned.
   */
  const [source, setSource] = React.useState<Platform>(lead.source)
  const [nextAction, setNextAction] = React.useState(lead.nextAction ?? "")
  const [errors, setErrors] = React.useState<Partial<Record<keyof LeadPatch, string>>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  /**
   * Re-seed the form whenever a DIFFERENT lead is opened — keyed by id, not
   * by the object.
   *
   * `leads-view` replaces `selected` with a fresh object on every Firestore
   * snapshot, so depending on `lead` re-ran this effect constantly and wiped
   * whatever was being edited. A campaign picked a moment earlier was reset
   * to the stored value before Guardar ran, the patch came out empty, and the
   * change appeared to "not save".
   */
  React.useEffect(() => {
    if (!open) return
    const p = splitPhone(lead.phone)
    setName(lead.name)
    setEmail(lead.email)
    setCountryCode(p.countryCode)
    setNational(p.national)
    setStage(displayStage(lead))
    setAssignedToId(lead.assignedToId || NO_OWNER)
    setCampaignId(lead.campaignId || NO_CAMPAIGN)
    setSource(lead.source)
    setNextAction(lead.nextAction ?? "")
    setErrors({})
    setFormError(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lead.id, type])

  // Already scoped to lead.workspaceId by the query; eligibleAssignees drops
  // inactive members and keeps the workspace check as a second guard.
  const members = eligibleAssignees(users, lead.workspaceId)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (saving) return // double-submit guard
    setErrors({})
    setFormError(null)

    const phone = toE164(countryCode, national)
    if (phone && !isValidE164(phone)) {
      setErrors({ phone: t.leads.editDialog.phoneInvalid })
      return
    }

    const patch: LeadPatch = {}
    if (name.trim() !== lead.name) patch.name = name
    if (email.trim().toLowerCase() !== lead.email) patch.email = email
    if (phone !== lead.phone) patch.phone = phone
    if (stage !== lead.stage) patch.stage = stage
    if (canReassign) {
      const next = assignedToId === NO_OWNER ? "" : assignedToId
      if (next !== lead.assignedToId) patch.assignedToId = next
    }
    if (nextAction.trim() !== (lead.nextAction ?? "")) patch.nextAction = nextAction
    if (canAttribute && source !== lead.source) patch.source = source
    if (canAttribute) {
      const nextCampaign = campaignId === NO_CAMPAIGN ? "" : campaignId
      if (nextCampaign !== (lead.campaignId ?? "")) {
        // Never a campaign outside this workspace: the list is scoped, and
        // this re-checks the id against it before anything is written.
        // Re-checked against the lead's own workspace before writing, so a
        // stale list can never produce a cross-tenant attribution.
        const chosen = nextCampaign
          ? campaigns.find((c) => c.id === nextCampaign && c.workspaceId === lead.workspaceId)
          : undefined
        if (nextCampaign && !chosen) {
          toast.error(t.leads.editDialog.campaignInvalid)
          return
        }
        patch.campaignId = nextCampaign
        patch.campaignName = chosen?.name ?? ""
      }
    }

    if (Object.keys(patch).length === 0) {
      toast.info(t.leads.editDialog.nothingChanged)
      onOpenChange(false)
      return
    }

    setSaving(true)
    try {
      await updateLead(
        lead.id,
        lead,
        patch,
        // Stage / assignment changes are audited in the same batch.
        membership?.userId && role
          ? {
              actor: { userId: membership.userId, role },
              memberName: (id) => members.find((m) => m.id === id)?.name ?? "",
            }
          : undefined,
      )
      // Firestore confirmed: the live subscription refreshes the sheet/list.
      toast.success(t.leads.editDialog.saved)
      onOpenChange(false)
    } catch (err) {
      // Keep everything the person typed; show what failed.
      if (err instanceof LeadValidationError) setErrors({ [err.field]: err.message })
      else setFormError(describeError(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !saving && onOpenChange(next)}>
      <DialogContent className="max-h-[92svh] overflow-y-auto overflow-x-hidden sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.leads.editDialog.title}</DialogTitle>
          <DialogDescription>{t.leads.editDialog.description}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate className="min-w-0">
          <FieldGroup>
            <Field data-invalid={!!errors.name || undefined}>
              <FieldLabel htmlFor="edit-name">{t.leads.fullName}</FieldLabel>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
                required
                className="h-11 text-base sm:h-9 sm:text-sm"
              />
              <FieldError>{errors.name}</FieldError>
            </Field>

            <PhoneField
              id="edit-phone"
              countryCode={countryCode}
              national={national}
              onCountryChange={setCountryCode}
              onNationalChange={setNational}
              assumed={initialPhone.assumed && national === initialPhone.national}
              error={errors.phone}
              disabled={saving}
            />

            <Field data-invalid={!!errors.email || undefined}>
              <FieldLabel htmlFor="edit-email">{t.leads.email}</FieldLabel>
              <Input
                id="edit-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={saving}
                className="h-11 text-base sm:h-9 sm:text-sm"
              />
              <FieldError>{errors.email}</FieldError>
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.stage || undefined}>
                <FieldLabel>{t.leads.editDialog.stageLabel}</FieldLabel>
                <Select value={stage} onValueChange={(v) => v && setStage(v as PipelineStage)} disabled={saving}>
                  <SelectTrigger className="h-11 w-full sm:h-9">
                    <SelectValue>{(v: string) => STAGE_LABELS[v as PipelineStage] ?? v}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[60svh]">
                    {/* Only this lead's pipeline — never the other one. */}
                    {PIPELINES[type].stages.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STAGE_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldError>{errors.stage}</FieldError>
              </Field>

              <Field>
                <FieldLabel>{t.leads.editDialog.assignLabel}</FieldLabel>
                <Select
                  value={assignedToId}
                  onValueChange={(v) => setAssignedToId(v ?? NO_OWNER)}
                  disabled={saving || !canReassign}
                >
                  <SelectTrigger className="h-11 w-full sm:h-9">
                    <SelectValue>
                      {(v: string) =>
                        v === NO_OWNER
                          ? t.common.unassigned
                          : (() => {
                              const owner = members.find((m) => m.id === v) ?? users.find((u) => u.id === v)
                              return owner ? memberLabel(owner) : t.common.unassigned
                            })()
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[60svh]">
                    <SelectItem value={NO_OWNER}>{t.common.unassigned}</SelectItem>
                    {/* value is `users/{id}` — the id leads reference, never authUid. */}
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {memberLabel(m)}
                        {m.status === "invited" && ` · ${t.leads.editDialog.assignInvitedSuffix}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!canReassign ? (
                  <FieldDescription>{t.leads.editDialog.assignLocked}</FieldDescription>
                ) : usersLoading ? (
                  <FieldDescription>{t.leads.editDialog.assignLoading}</FieldDescription>
                ) : members.length === 0 ? (
                  <FieldDescription>{t.leads.editDialog.assignEmpty}</FieldDescription>
                ) : members.some((m) => m.status === "invited") ? (
                  <FieldDescription>{t.leads.editDialog.assignInvitedHint}</FieldDescription>
                ) : null}
              </Field>
            </div>

            {canAttribute && (
              <Field>
                <FieldLabel>{t.leads.editDialog.sourceLabel}</FieldLabel>
                <Select value={source} onValueChange={(v) => v && setSource(v as Platform)} disabled={saving}>
                  <SelectTrigger className="h-11 w-full sm:h-9">
                    <SelectValue>{(v: string) => PLATFORM_LABELS[v as Platform] ?? v}</SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[60svh]">
                    {PLATFORMS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PLATFORM_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>{t.leads.editDialog.sourceHint}</FieldDescription>
              </Field>
            )}

            {canAttribute && (
              <Field>
                <FieldLabel>{t.leads.editDialog.campaignLabel}</FieldLabel>
                <Select value={campaignId} onValueChange={(v) => v && setCampaignId(v)} disabled={saving || campaignsLoading}>
                  <SelectTrigger className="h-11 w-full sm:h-9">
                    <SelectValue>
                      {(v: string) =>
                        v === NO_CAMPAIGN
                          ? t.leads.editDialog.noCampaign
                          : (campaigns.find((c) => c.id === v)?.name ?? v)}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[60svh]">
                    <SelectItem value={NO_CAMPAIGN}>{t.leads.editDialog.noCampaign}</SelectItem>
                    {/* Active AND paused: a lead may belong to a campaign paused later. */}
                    {campaigns
                      .filter((c) => c.status === "active" || c.status === "paused")
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name} · {CAMPAIGN_STATUS_LABELS[c.status]}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <FieldDescription>
                  {lead.attributionSource !== "manual" && lead.attribution?.externalCampaignId
                    ? t.leads.editDialog.campaignFromMeta
                    : t.leads.editDialog.campaignHint}
                </FieldDescription>
              </Field>
            )}

            <Field>
              <FieldLabel htmlFor="edit-next">{t.leads.editDialog.nextActionLabel}</FieldLabel>
              <Input
                id="edit-next"
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                disabled={saving}
                className="h-11 text-base sm:h-9 sm:text-sm"
              />
            </Field>

            {formError && (
              <Field data-invalid>
                <FieldError>{formError}</FieldError>
              </Field>
            )}
          </FieldGroup>

          <DialogFooter className="mt-6 gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-11 sm:h-9"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              {t.common.cancel}
            </Button>
            <Button type="submit" className="h-11 sm:h-9" disabled={saving}>
              {saving && <Loader2 className="animate-spin" data-icon="inline-start" />}
              {saving ? t.common.saving : t.common.saveChanges}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
