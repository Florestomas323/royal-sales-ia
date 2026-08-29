import type { Metadata } from "next"
import { Workflow } from "lucide-react"
import { ModulePlaceholder } from "@/components/shared/module-placeholder"
import { t } from "@/lib/i18n"

export const metadata: Metadata = { title: t.modules.automations.title }

export default function AutomationsPage() {
  const copy = t.modules.automations

  return (
    <ModulePlaceholder
      title={copy.title}
      description={copy.description}
      icon={Workflow}
      blurb={copy.blurb}
      features={copy.features}
    />
  )
}
