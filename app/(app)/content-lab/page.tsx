import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { ContentLabView } from "@/components/content-lab/content-lab-view"
import { t } from "@/lib/i18n"

export const metadata: Metadata = { title: t.modules.contentLab.title }

/** Laboratorio de Contenido — AI-assisted creative drafts. Never publishes. */
export default function ContentLabPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader title={t.modules.contentLab.title} description={t.modules.contentLab.description} />
      <ContentLabView />
    </div>
  )
}
