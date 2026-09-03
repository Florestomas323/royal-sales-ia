"use client"

import { useState } from "react"
import { PipelineSummary } from "@/components/pipeline/pipeline-summary"
import { PipelineBoard } from "@/components/pipeline/pipeline-board"
import { LeadTypeSwitch } from "@/components/shared/lead-type-switch"
import { DataErrorState } from "@/components/shared/data-error-state"
import { DemoRowsNotice } from "@/components/shared/demo-data-badge"
import { useLeads } from "@/lib/firebase/leads"
import { Skeleton } from "@/components/ui/skeleton"
import { PIPELINES } from "@/lib/constants"
import { t } from "@/lib/i18n"
import type { LeadType } from "@/types"

/**
 * One board at a time: the lead type is a Firestore filter, so the two
 * pipelines never mix (not even in memory).
 */
export function PipelineLive() {
  const [leadType, setLeadType] = useState<LeadType>("sales")
  const { leads, loading, error } = useLeads(leadType)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <LeadTypeSwitch<false> value={leadType} onChange={setLeadType} />
        <p className="text-xs text-muted-foreground">
          {leadType === "recruiting" ? t.pipeline.recruitingHint : t.pipeline.salesHint}
        </p>
      </div>

      {error && <DataErrorState error={error} />}
      <DemoRowsNotice rows={leads} />

      {loading ? (
        <div className="flex flex-col gap-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {PIPELINES[leadType].stages.map((stage) => (
              <Skeleton key={stage} className="h-80 w-72 shrink-0 rounded-xl" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <PipelineSummary leads={leads} leadType={leadType} />
          <PipelineBoard leads={leads} leadType={leadType} />
        </>
      )}
    </div>
  )
}
