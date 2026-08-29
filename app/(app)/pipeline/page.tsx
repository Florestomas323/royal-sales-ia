import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { PipelineLive } from "@/components/pipeline/pipeline-live"
import { t } from "@/lib/i18n"

export const metadata: Metadata = {
  title: `${t.pipeline.title} · Royal Sales IA`,
}

export default function PipelinePage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader title={t.pipeline.title} description={t.pipeline.description} />
      <PipelineLive />
    </div>
  )
}
