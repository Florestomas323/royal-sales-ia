import type { Metadata } from "next"
import { FileText } from "lucide-react"
import { ModulePlaceholder } from "@/components/shared/module-placeholder"
import { t } from "@/lib/i18n"

export const metadata: Metadata = { title: t.modules.reports.title }

export default function ReportsPage() {
  const copy = t.modules.reports

  return (
    <ModulePlaceholder
      title={copy.title}
      description={copy.description}
      icon={FileText}
      blurb={copy.blurb}
      features={copy.features}
    />
  )
}
