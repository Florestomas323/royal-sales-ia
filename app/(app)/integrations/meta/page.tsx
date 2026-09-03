import type { Metadata } from "next"
import { MetaConnectionPanel } from "@/components/integrations/meta-connection-panel"
import { t } from "@/lib/i18n"

export const metadata: Metadata = {
  title: `${t.integrations.meta.title} · Royal Sales IA`,
}

export default function MetaIntegrationPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 p-4 md:p-6">
      <MetaConnectionPanel />
    </div>
  )
}
