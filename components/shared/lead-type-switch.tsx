"use client"

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LEAD_TYPE_LABELS } from "@/lib/constants"
import { t } from "@/lib/i18n"
import type { LeadType } from "@/types"

type Value<AllowAll extends boolean> = AllowAll extends true ? LeadType | "all" : LeadType

/**
 * Segmented control "Todos | Ventas | Reclutamiento" (or just the two types).
 * Optional real counts are shown next to each label; `null` hides them.
 */
export function LeadTypeSwitch<AllowAll extends boolean = true>({
  value,
  onChange,
  allowAll,
  counts,
  className,
}: {
  value: Value<AllowAll>
  onChange: (v: Value<AllowAll>) => void
  allowAll?: AllowAll
  counts?: Partial<Record<LeadType | "all", number>> | null
  className?: string
}) {
  const options: { value: LeadType | "all"; label: string }[] = [
    ...(allowAll ? [{ value: "all" as const, label: t.leads.types.all }] : []),
    { value: "sales" as const, label: LEAD_TYPE_LABELS.sales },
    { value: "recruiting" as const, label: LEAD_TYPE_LABELS.recruiting },
  ]
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as Value<AllowAll>)} className={className}>
      <TabsList className="w-full sm:w-auto">
        {options.map((o) => {
          const n = counts?.[o.value]
          return (
            <TabsTrigger key={o.value} value={o.value} className="flex-1 gap-1.5 sm:flex-none">
              {o.label}
              {typeof n === "number" && (
                <span className="rounded-full bg-muted px-1.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {n}
                </span>
              )}
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}
