"use client"

import { PipelineSummary } from "@/components/pipeline/pipeline-summary"
import { PipelineBoard } from "@/components/pipeline/pipeline-board"
import { useLeads } from "@/lib/firebase/leads"
import { Skeleton } from "@/components/ui/skeleton"
import { STAGE_ORDER } from "@/lib/constants"
import { DataErrorState } from "@/components/shared/data-error-state"
import { DemoRowsNotice } from "@/components/shared/demo-data-badge"

export function PipelineLive() {
  const { leads, loading, error } = useLeads()

  if (loading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <div className="flex gap-4 overflow-x-auto pb-4">
          {STAGE_ORDER.map((stage) => (
            <Skeleton key={stage} className="h-80 w-72 shrink-0 rounded-xl" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <>
      {error && <DataErrorState error={error} />}
      <DemoRowsNotice rows={leads} />
      <PipelineSummary leads={leads} />
      <PipelineBoard leads={leads} />
    </>
  )
}
