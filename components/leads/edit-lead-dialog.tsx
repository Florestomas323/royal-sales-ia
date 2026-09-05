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
import { useUsers } from "@/lib/firebase/collections"
import { LeadValidationError, updateLead, type LeadPatch } from "@/lib/firebase/leads"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { describeError } from "@/lib/firebase/errors"
import { PIPELINES, STAGE_LABELS } from "@/lib/constants"
import { canReassignLead, isValidE164, leadTypeOf, splitPhone, toE164 } from "@/lib/leads"
import { t } from "@/lib/i18n"
import type { Lead, PipelineStage } from "@/types"

const NO_OWNER = "__none__"

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
  const { users } = useUsers()
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
  const [value, setValue] = React.useState(String(lead.potentialValue ?? 0))
  const [stage, setStage] = React.useState<PipelineStage>(
    (PIPELINES[type].stages as string[]).includes(lead.stage) ? lead.stage : PIPELINES[type].initial,
  )
  const [assignedToId, setAssignedToId] = React.useState(lead.assignedToId || NO_OWNER)
  const [nextAction, setNextAction] = React.useState(lead.nextAction ?? "")
  const [errors, setErrors] = React.useState<Partial<Record<keyof LeadPatch, string>>>({})
  const [formError, setFormError] = React.useState<string | null>(null)
  const [saving, setSaving] = React.useState(false)

  // Re-seed the form whenever a different lead is opened.
  React.useEffect(() => {
    if (!open) return
    const p = splitPhone(lead.phone)
    setName(lead.name)
    setEmail(lead.email)
    setCountryCode(p.countryCode)
    setNational(p.national)
    setValue(String(lead.potentialValue ?? 0))
    setStage((PIPELINES[type].stages as string[]).includes(lead.stage) ? lead.stage : PIPELINES[type].initial)
    setAssignedToId(lead.assignedToId || NO_OWNER)
    setNextAction(lead.nextAction ?? "")
    setErrors({})
    setFormError(null)
  }, [open, lead, type])

  // Only active members of this workspace (the hook is already scoped by Rules).
  const members = users.filter((u) => u.status === "active" && u.workspaceId === lead.workspaceId)

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
    const numericValue = Number(value.replace(/[^\d.]/g, "") || 0)

    const patch: LeadPatch = {}
    if (name.trim() !== lead.name) patch.name = name
    if (email.trim().toLowerCase() !== lead.email) patch.email = email
    if (phone !== lead.phone) patch.phone = phone
    if (type === "sales" && numericValue !== lead.potentialValue) patch.potentialValue = numericValue
    if (stage !== lead.stage) patch.stage = stage
    if (canReassign) {
      const next = assignedToId === NO_OWNER ? "" : assignedToId
      if (next !== lead.assignedToId) patch.assignedToId = next
    }
    if (nextAction.trim() !== (lead.nextAction ?? "")) patch.nextAction = nextAction

    if (Object.keys(patch).length === 0) {
      toast.info(t.leads.editDialog.nothingChanged)
      onOpenChange(false)
      return
    }

    setSaving(true)
    try {
      await updateLead(lead.id, lead, patch)
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

            {type === "sales" && (
              <Field data-invalid={!!errors.potentialValue || undefined}>
                <FieldLabel htmlFor="edit-value">{t.leads.editDialog.valueLabel}</FieldLabel>
                <Input
                  id="edit-value"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="1"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  disabled={saving}
                  className="h-11 text-base sm:h-9 sm:text-sm"
                />
                <FieldError>{errors.potentialValue}</FieldError>
              </Field>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field data-invalid={!!errors.stage || undefined}>
                <FieldLabel>{t.leads.editDialog.stageLabel}</FieldLabel>
                <Select value={stage} onValueChange={(v) => v && setStage(v as PipelineStage)} disabled={saving}>
                  <SelectTrigger className="h-11 w-full sm:h-9">
                    <SelectValue />
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
                          : (members.find((m) => m.id === v)?.name ?? t.common.unassigned)
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent className="max-h-[60svh]">
                    <SelectItem value={NO_OWNER}>{t.common.unassigned}</SelectItem>
                    {members.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!canReassign && <FieldDescription>{t.leads.editDialog.assignLocked}</FieldDescription>}
              </Field>
            </div>

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
