"use client"

import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { t } from "@/lib/i18n"
import type { LocationErrors } from "@/lib/appointments"
import type { AppointmentLocation } from "@/types"

const a = t.modules.calendar.address

/**
 * Physical address of the meeting. Shown for every appointment; required only
 * for a sales demo, which happens at the customer's home.
 *
 * One column on a phone, two from `sm`. City / state / ZIP share a row on
 * wider screens but stack on iPhone so nothing gets cut off.
 */
export function AddressFields({
  value,
  errors,
  required,
  disabled,
  onChange,
}: {
  value: AppointmentLocation
  errors?: LocationErrors
  required: boolean
  disabled?: boolean
  onChange: (next: AppointmentLocation) => void
}) {
  const set = (patch: Partial<AppointmentLocation>) => onChange({ ...value, ...patch })

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium">{required ? a.titleRequired : a.titleOptional}</p>
        <p className="text-xs text-muted-foreground text-pretty">
          {required ? a.hintRequired : a.hintOptional}
        </p>
      </div>

      <Field data-invalid={errors?.addressLine1 || undefined}>
        <FieldLabel htmlFor="appt-line1">{a.line1}</FieldLabel>
        <Input
          id="appt-line1"
          value={value.addressLine1}
          disabled={disabled}
          autoComplete="address-line1"
          placeholder={a.line1Placeholder}
          onChange={(e) => set({ addressLine1: e.target.value })}
          className="h-11 text-base sm:h-9 sm:text-sm"
        />
        {errors?.addressLine1 && <FieldError>{a.requiredField}</FieldError>}
      </Field>

      <Field>
        <FieldLabel htmlFor="appt-line2">{a.line2}</FieldLabel>
        <Input
          id="appt-line2"
          value={value.addressLine2 ?? ""}
          disabled={disabled}
          autoComplete="address-line2"
          placeholder={a.line2Placeholder}
          onChange={(e) => set({ addressLine2: e.target.value })}
          className="h-11 text-base sm:h-9 sm:text-sm"
        />
      </Field>

      <Field data-invalid={errors?.city || undefined}>
        <FieldLabel htmlFor="appt-city">{a.city}</FieldLabel>
        <Input
          id="appt-city"
          value={value.city}
          disabled={disabled}
          autoComplete="address-level2"
          onChange={(e) => set({ city: e.target.value })}
          className="h-11 text-base sm:h-9 sm:text-sm"
        />
        {errors?.city && <FieldError>{a.requiredField}</FieldError>}
      </Field>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field data-invalid={errors?.state || undefined}>
          <FieldLabel htmlFor="appt-state">{a.state}</FieldLabel>
          <Input
            id="appt-state"
            value={value.state}
            disabled={disabled}
            autoComplete="address-level1"
            onChange={(e) => set({ state: e.target.value })}
            className="h-11 text-base sm:h-9 sm:text-sm"
          />
          {errors?.state && <FieldError>{a.requiredField}</FieldError>}
        </Field>
        <Field data-invalid={errors?.postalCode || undefined}>
          <FieldLabel htmlFor="appt-zip">{a.postalCode}</FieldLabel>
          <Input
            id="appt-zip"
            value={value.postalCode}
            disabled={disabled}
            inputMode="numeric"
            autoComplete="postal-code"
            onChange={(e) => set({ postalCode: e.target.value })}
            className="h-11 text-base sm:h-9 sm:text-sm"
          />
          {errors?.postalCode && <FieldError>{a.requiredField}</FieldError>}
        </Field>
      </div>

      {!required && <FieldDescription>{a.optionalNote}</FieldDescription>}
    </div>
  )
}
