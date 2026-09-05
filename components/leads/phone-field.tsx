"use client"

import { Input } from "@/components/ui/input"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { PHONE_COUNTRIES } from "@/lib/leads"
import { t } from "@/lib/i18n"

/**
 * Country + national number. The country is always visible and chosen
 * explicitly, so what gets saved (E.164) is never a silent guess.
 */
export function PhoneField({
  countryCode,
  national,
  onCountryChange,
  onNationalChange,
  assumed = false,
  error,
  disabled = false,
  id = "phone",
}: {
  countryCode: string
  national: string
  onCountryChange: (code: string) => void
  onNationalChange: (value: string) => void
  /** Legacy value stored without country code: warn before saving. */
  assumed?: boolean
  error?: string | null
  disabled?: boolean
  id?: string
}) {
  const known = PHONE_COUNTRIES.some((c) => c.code === countryCode)
  return (
    <Field data-invalid={!!error || undefined}>
      <FieldLabel htmlFor={id}>{t.leads.editDialog.phoneLabel}</FieldLabel>
      <div className="grid grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] gap-2">
        <Select value={countryCode} onValueChange={(v) => v && onCountryChange(v)} disabled={disabled}>
          <SelectTrigger className="h-11 w-full sm:h-9" aria-label={t.leads.editDialog.countryLabel}>
            <SelectValue>
              {(value: string) => {
                const c = PHONE_COUNTRIES.find((x) => x.code === value)
                return c ? `${c.iso} +${c.code}` : `+${value}`
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[60svh]">
            {PHONE_COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.label}
              </SelectItem>
            ))}
            {!known && countryCode && (
              <SelectItem value={countryCode}>{`+${countryCode}`}</SelectItem>
            )}
          </SelectContent>
        </Select>
        <Input
          id={id}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="214 555 0198"
          value={national}
          onChange={(e) => onNationalChange(e.target.value)}
          disabled={disabled}
          aria-invalid={!!error || undefined}
          className="h-11 min-w-0 text-base sm:h-9 sm:text-sm"
        />
      </div>
      {error ? (
        <FieldError>{error}</FieldError>
      ) : assumed ? (
        <FieldDescription className="text-warning">{t.leads.editDialog.phoneAssumed}</FieldDescription>
      ) : (
        <FieldDescription>{t.leads.editDialog.phoneHint}</FieldDescription>
      )}
    </Field>
  )
}
