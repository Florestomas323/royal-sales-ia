import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { IntegrationsGrid } from "@/components/integrations/integrations-grid"
import { t } from "@/lib/i18n"

export const metadata: Metadata = {
  title: `${t.integrations.title} · Royal Sales IA`,
}

export default function IntegrationsPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title={t.integrations.title}
        description={t.integrations.description}
      />
      <IntegrationsGrid />
    </div>
  )
}
