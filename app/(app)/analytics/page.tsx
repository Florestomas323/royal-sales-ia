import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { CommandCenter } from "@/components/overview/command-center"
import { t } from "@/lib/i18n"

export const metadata: Metadata = { title: t.analytics.title }

/**
 * Analytics shares the command center: the same real metrics with the same
 * period filter. The previous demo charts were removed in Phase F.
 */
export default function AnalyticsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.analytics.title} description={t.analytics.description} />
      <CommandCenter />
    </div>
  )
}
