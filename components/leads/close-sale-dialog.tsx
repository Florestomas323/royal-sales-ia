"use client"

import { useEffect, useState } from "react"
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { isValidClosedValue } from "@/lib/leads"
import { formatCurrency } from "@/lib/format"
import { t } from "@/lib/i18n"
import type { Lead } from "@/types"

/**
 * Closing a sale asks for the REAL amount. `potentialValue` is offered as a
 * starting point but is never stored as revenue without an explicit
 * confirmation — that is the whole point of the dialog.
 */
export function CloseSaleDialog({
  lead,
  open,
  onOpenChange,
  onConfirm,
  busy = false,
}: {
  lead: Lead | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (amount: number) => void | Promise<void>
  busy?: boolean
}) {
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !lead) return
    // Suggestion only: the person must confirm or correct it.
    setValue(lead.potentialValue > 0 ? String(lead.potentialValue) : "")
    setError(null)
  }, [open, lead])

  if (!lead) return null

  function handleConfirm() {
    if (busy) return
    const amount = Number(value.replace(/[^\d.]/g, ""))
    if (!isValidClosedValue(amount)) {
      setError(t.leads.detail.closeSaleInvalid)
      return
    }
    setError(null)
    void onConfirm(amount)
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.leads.detail.closeSaleTitle}</DialogTitle>
          <DialogDescription className="text-pretty">
            {t.leads.detail.closeSaleDescription(lead.name)}
          </DialogDescription>
        </DialogHeader>
        <Field data-invalid={!!error || undefined}>
          <FieldLabel htmlFor="closed-value">{t.leads.detail.closeSaleLabel}</FieldLabel>
          <Input
            id="closed-value"
            type="number"
            inputMode="decimal"
            min={0}
            step="1"
            autoFocus
            value={value}
            disabled={busy}
            onChange={(e) => {
              setValue(e.target.value)
              if (error) setError(null)
            }}
            className="h-11 text-base sm:h-9 sm:text-sm"
          />
          {error ? (
            <FieldError>{error}</FieldError>
          ) : (
            <FieldDescription>
              {t.leads.detail.closeSaleHint(formatCurrency(lead.potentialValue))}
            </FieldDescription>
          )}
        </Field>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 sm:h-9"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {t.common.cancel}
          </Button>
          <Button type="button" className="h-11 sm:h-9" disabled={busy} onClick={handleConfirm}>
            {busy && <Loader2 className="animate-spin" data-icon="inline-start" />}
            {t.leads.detail.closeSaleAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
