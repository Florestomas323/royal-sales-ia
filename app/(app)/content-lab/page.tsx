import type { Metadata } from "next"
import { Sparkles } from "lucide-react"
import { ModulePlaceholder } from "@/components/shared/module-placeholder"
import { t } from "@/lib/i18n"

export const metadata: Metadata = { title: t.modules.contentLab.title }

export default function ContentLabPage() {
  const copy = t.modules.contentLab

  return (
    <ModulePlaceholder
      title={copy.title}
      description={copy.description}
      icon={Sparkles}
      blurb={copy.blurb}
      features={copy.features}
    />
  )
}
