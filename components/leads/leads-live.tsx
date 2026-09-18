"use client"

import { Suspense, useCallback, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { LeadsView } from "@/components/leads/leads-view"
import { LeadTypeSwitch } from "@/components/shared/lead-type-switch"
import { DataErrorState } from "@/components/shared/data-error-state"
import { DemoRowsNotice } from "@/components/shared/demo-data-badge"
import { useLeads, useLeadTypeCounts, type LeadTypeFilter } from "@/lib/firebase/leads"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { initialWorkspaceFilter } from "@/lib/leads/workspace-switch"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * `useSearchParams` needs a Suspense boundary on statically rendered pages,
 * hence the two-layer component.
 */
export function LeadsLive() {
  return (
    <Suspense fallback={<Skeleton className="h-16 w-full rounded-xl" />}>
      <LeadsLiveInner />
    </Suspense>
  )
}

function LeadsLiveInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const openLeadId = searchParams.get("lead")
  const [leadType, setLeadType] = useState<LeadTypeFilter>("all")
  const { workspaceId } = useWorkspace()
  /**
   * The globally selected workspace is the source of truth: starting at
   * `null` made the screen say "Todos los workspaces" while the query was
   * already scoped, and left the trash without a target to empty.
   * `null` here only ever means the global selection IS "Todos".
   */
  const [workspaceFilter, setWorkspaceFilter] = useState<string | null>(() =>
    initialWorkspaceFilter(workspaceId),
  )

  // Switching workspace re-points the screen immediately, without a reload.
  useEffect(() => {
    setWorkspaceFilter(initialWorkspaceFilter(workspaceId))
  }, [workspaceId])

  // Once the deep-linked lead is open, drop the param so a refresh doesn't reopen it.
  const clearOpenLead = useCallback(() => {
    if (openLeadId) router.replace("/leads", { scroll: false })
  }, [openLeadId, router])
  const { leads, loading, error } = useLeads(leadType, workspaceFilter)
  // Re-count whenever the visible list or the active tab changes
  // (creation, deletion, normalization, tab switch).
  const { counts } = useLeadTypeCounts(`${leadType}:${workspaceFilter ?? "all"}:${leads.length}`, workspaceFilter)

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
        <LeadsView
          leads={leads}
          leadType={leadType}
          openLeadId={openLeadId}
          onOpenedLead={clearOpenLead}
          workspaceFilter={workspaceFilter}
          onWorkspaceFilterChange={setWorkspaceFilter}
        />
      )}
    </div>
  )
}
