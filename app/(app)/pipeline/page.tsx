import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { PipelineLive } from "@/components/pipeline/pipeline-live"

export const metadata: Metadata = {
  title: "Pipeline · Royal Sales IA",
}

export default function PipelinePage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title="Pipeline"
        description="Drag leads across stages to keep every deal moving forward."
      />
      <PipelineLive />
    </div>
  )
}
