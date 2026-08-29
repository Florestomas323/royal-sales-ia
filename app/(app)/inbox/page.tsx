import type { Metadata } from "next"
import { Inbox } from "lucide-react"
import { ModulePlaceholder } from "@/components/shared/module-placeholder"
import { t } from "@/lib/i18n"

export const metadata: Metadata = { title: t.nav.items.inbox }

export default function InboxPage() {
  const copy = t.modules.inbox

  return (
    <ModulePlaceholder
      title={copy.title}
      description={copy.description}
      icon={Inbox}
      blurb={copy.blurb}
      features={copy.features}
    />
  )
}
