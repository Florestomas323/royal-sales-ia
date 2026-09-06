import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { CommandCenter } from "@/components/overview/command-center"
import { t } from "@/lib/i18n"

export const metadata: Metadata = {
  title: `${t.nav.items.commandCenter} · Royal Sales IA`,
}

/**
 * Command center. This route used to render the Integrations page by mistake,
 * so the dashboard was unreachable from the sidebar.
 */
export default function CommandCenterPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader title={t.nav.items.commandCenter} description={t.overview.description} />
      <CommandCenter />
    </div>
  )
}
