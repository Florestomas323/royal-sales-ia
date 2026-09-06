import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { MediaBuyerView } from "@/components/media-buyer/media-buyer-view"
import { t } from "@/lib/i18n"

export const metadata: Metadata = { title: t.modules.mediaBuyer.title }

/** Media Buyer IA — read-only analysis of real Meta Insights + CRM data. */
export default function MediaBuyerPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader title={t.modules.mediaBuyer.title} description={t.modules.mediaBuyer.description} />
      <MediaBuyerView />
    </div>
  )
}
