import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { SettingsPanel } from "@/components/settings/settings-panel"

export const metadata: Metadata = { title: "Settings" }

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Settings"
        description="Manage your workspace, profile, and notification preferences."
      />
      <SettingsPanel />
    </div>
  )
}
