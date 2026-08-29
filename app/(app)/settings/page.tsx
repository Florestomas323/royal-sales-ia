import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { SettingsPanel } from "@/components/settings/settings-panel"
import { t } from "@/lib/i18n"

export const metadata: Metadata = { title: t.settings.title }

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t.settings.title} description={t.settings.description} />
      <SettingsPanel />
    </div>
  )
}
