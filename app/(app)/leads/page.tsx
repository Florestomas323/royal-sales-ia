import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { LeadsLive } from "@/components/leads/leads-live"

export const metadata: Metadata = {
  title: "Leads · Royal Sales IA",
  description: "Every lead from every campaign, scored and ready to work.",
}

export default function LeadsPage() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader
        title="Leads"
        description="Every lead from every campaign — scored, attributed and ready to work."
      />
      <LeadsLive />
    </div>
  )
}
