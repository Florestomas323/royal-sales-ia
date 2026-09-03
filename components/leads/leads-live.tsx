"use client"

import { useState } from "react"
import { LeadsView } from "@/components/leads/leads-view"
import { LeadTypeSwitch } from "@/components/shared/lead-type-switch"
import { DataErrorState } from "@/components/shared/data-error-state"
import { DemoRowsNotice } from "@/components/shared/demo-data-badge"
import { useLeads, useLeadTypeCounts, type LeadTypeFilter } from "@/lib/firebase/leads"
import { Skeleton } from "@/components/ui/skeleton"

export function LeadsLive() {
  const [leadType, setLeadType] = useState<LeadTypeFilter>("all")
  const { leads, loading, error } = useLeads(leadType)
  // Re-count whenever the visible list or the active tab changes
  // (creation, deletion, normalization, tab switch).
  const { counts } = useLeadTypeCounts(`${leadType}:${leads.length}`)

  return (
    <div className="flex flex-col gap-4">
      <LeadTypeSwitch value={leadType} onChange={setLeadType} allowAll counts={counts} />

      {error && <DataErrorState error={error} />}
      <DemoRowsNotice rows={leads} />

      {loading ? (
        <div className="flex flex-col gap-4">
          <Skeleton className="h-16 w-full rounded-xl" />
          <div className="overflow-hidden rounded-xl border bg-card">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 border-b p-4 last:border-0">
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-6 w-20 rounded-full" />
                <Skeleton className="h-6 w-12 rounded-md" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <LeadsView leads={leads} leadType={leadType} />
      )}
    </div>
  )
}
