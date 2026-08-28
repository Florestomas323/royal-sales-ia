import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { IntegrationsGrid } from "@/components/integrations/integrations-grid"

export const metadata: Metadata = {
  title: "Integrations · Royal Sales IA",
}

export default function IntegrationsPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title="Integrations"
        description="Connect ad platforms and messaging channels to power your lead engine."
      />
      <IntegrationsGrid />
    </div>
  )
}
