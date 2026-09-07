"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Loader2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { registerSaleForLead } from "@/lib/firebase/sales"
import { describeError } from "@/lib/firebase/errors"
import { useUsers } from "@/lib/firebase/collections"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { eligibleAssignees } from "@/lib/leads"
import { memberLabel } from "@/lib/team"
import {
  canCreditOthers, hasSaleErrors, parseAmount, validateSaleDraft,
  type SaleDraft, type SaleDraftErrors,
} from "@/lib/sales"
import { t } from "@/lib/i18n"
import type { Lead } from "@/types"

const s = t.sales

/**
 * Registers the FIRST purchase of a lead: customer, sale and the lead's close
 * all land together or not at all.
 *
 * Idempotency is structural. `operationKey` is generated ONCE when the dialog
 * opens and becomes the sale's document id, so a double tap or a retry after a
 * dropped connection writes the same document instead of a second sale. The
 * disabled button is a courtesy; the key is the guarantee.
 */
export function RegisterSaleDialog({
  lead,
  open,
  onOpenChange,
  onRegistered,
}: {
  lead: Lead
  open: boolean
  onOpenChange: (open: boolean) => void
  onRegistered?: (customerId: string) => void
}) {
  const { membership, role, isSuperAdmin } = useWorkspace()
  const { users } = useUsers()
  const [draft, setDraft] = useState<SaleDraft>({ product: "", amount: "", soldById: "", notes: "" })
  const [errors, setErrors] = useState<SaleDraftErrors>({})
  const [saving, setSaving] = useState(false)
  const operationKey = useRef<string | null>(null)

  const sellers = useMemo(
    () => eligibleAssignees(users, lead.workspaceId),
    [users, lead.workspaceId],
  )
  const mayCreditOthers = canCreditOthers(role, isSuperAdmin)

  useEffect(() => {
    if (!open) return
    // ONE key per attempt at this sale; retries reuse it.
    operationKey.current = crypto.randomUUID()
    setDraft({
      product: "",
      amount: lead.potentialValue ? String(lead.potentialValue) : "",
      soldById: mayCreditOthers ? (lead.assignedToId || "") : (membership?.userId ?? ""),
      notes: "",
    })
    setErrors({})
  }, [open, lead.assignedToId, lead.potentialValue, mayCreditOthers, membership?.userId])

  async function handleSave() {
    const problems = validateSaleDraft(draft, sellers.map((u) => u.id))
    if (hasSaleErrors(problems)) {
      setErrors(problems)
      return
    }
    if (!membership?.userId || !operationKey.current) return

    setSaving(true)
    try {
      const result = await registerSaleForLead({
        operationKey: operationKey.current,
        workspaceId: lead.workspaceId,
        leadId: lead.id,
        product: draft.product.trim(),
        amount: parseAmount(draft.amount),
        soldById: draft.soldById,
        soldAt: new Date().toISOString(),
        notes: draft.notes.trim() || undefined,
        createdBy: membership.userId,
        customerDraft: {
          name: lead.name,
          ...(lead.phone ? { phone: lead.phone } : {}),
          ...(lead.email ? { email: lead.email } : {}),
          assignedToId: lead.assignedToId || "",
        },
      })
      toast.success(result.alreadyExisted ? s.alreadyRegistered : s.created, {
        description: result.alreadyExisted ? undefined : s.createdDescription,
      })
      onRegistered?.(result.customerId)
      onOpenChange(false)
    } catch (err) {
      const message = err instanceof Error && err.message === "already_closed_without_customer"
        ? s.alreadyClosed
        : describeError(err).message
      toast.error(s.error, { description: message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{s.dialogTitle}</DialogTitle>
          <DialogDescription className="text-pretty">{s.dialogDescription}</DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <Field data-invalid={errors.product || undefined}>
            <FieldLabel htmlFor="sale-product">{s.product}</FieldLabel>
            <Input
              id="sale-product"
              value={draft.product}
              disabled={saving}
              placeholder={s.productPlaceholder}
              onChange={(e) => setDraft((p) => ({ ...p, product: e.target.value }))}
              className="h-11 text-base sm:h-9 sm:text-sm"
            />
            {errors.product && <FieldError>{s.productRequired}</FieldError>}
          </Field>

          <Field data-invalid={errors.amount || undefined}>
            <FieldLabel htmlFor="sale-amount">{s.amount}</FieldLabel>
            <Input
              id="sale-amount"
              inputMode="decimal"
              value={draft.amount}
              disabled={saving}
              placeholder={s.amountPlaceholder}
              onChange={(e) => setDraft((p) => ({ ...p, amount: e.target.value }))}
              className="h-11 text-base sm:h-9 sm:text-sm"
            />
            {errors.amount && (
              <FieldError>{errors.amount === "required" ? s.amountRequired : s.amountInvalid}</FieldError>
            )}
          </Field>

          <Field data-invalid={errors.soldById || undefined}>
            <FieldLabel>{s.seller}</FieldLabel>
            {mayCreditOthers ? (
              <Select
                value={draft.soldById || undefined}
                disabled={saving}
                onValueChange={(v) => setDraft((p) => ({ ...p, soldById: v ?? "" }))}
              >
                <SelectTrigger className="h-11 w-full sm:h-9">
                  {/* Without a render function Base UI would print the raw id. */}
                  <SelectValue placeholder={s.sellerRequired}>
                    {(v: string) => {
                      const seller = sellers.find((u) => u.id === v)
                      return seller ? memberLabel(seller) : s.sellerRequired
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-[60svh]">
                  {sellers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {memberLabel(u)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                {s.sellerLocked}
              </p>
            )}
            {errors.soldById && (
              <FieldError>
                {errors.soldById === "required" ? s.sellerRequired : s.sellerNotEligible}
              </FieldError>
            )}
          </Field>

          <Field>
            <FieldLabel htmlFor="sale-notes">{s.notes}</FieldLabel>
            <Textarea
              id="sale-notes"
              rows={3}
              value={draft.notes}
              disabled={saving}
              onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
              className="text-base sm:text-sm"
            />
          </Field>
        </FieldGroup>

        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="h-11 w-full sm:h-9 sm:w-auto"
          >
            {saving && <Loader2 className="size-4 animate-spin" data-icon="inline-start" />}
            {saving ? s.saving : s.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
