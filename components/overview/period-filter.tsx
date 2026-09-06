"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { PeriodKey } from "@/lib/metrics"
import { t } from "@/lib/i18n"

const KEYS: PeriodKey[] = ["today", "7d", "30d", "month", "all"]

/** Period selector. Unlike the old top-bar control, this one really filters. */
export function PeriodFilter({
  value,
  onChange,
}: {
  value: PeriodKey
  onChange: (value: PeriodKey) => void
}) {
  return (
    <Select value={value} onValueChange={(v) => v && onChange(v as PeriodKey)}>
      <SelectTrigger className="h-11 w-full sm:h-9 sm:w-44" aria-label={t.overview.period.label}>
        <SelectValue>{(v: string) => t.overview.period[v as PeriodKey]}</SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[60svh]">
        {KEYS.map((k) => (
          <SelectItem key={k} value={k}>
            {t.overview.period[k]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
