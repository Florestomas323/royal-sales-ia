import type { Metadata } from "next"
import { Calendar } from "lucide-react"
import { ModulePlaceholder } from "@/components/shared/module-placeholder"
import { t } from "@/lib/i18n"

export const metadata: Metadata = { title: t.modules.calendar.title }

export default function CalendarPage() {
  const copy = t.modules.calendar

  return (
    <ModulePlaceholder
      title={copy.title}
      description={copy.description}
      icon={Calendar}
      blurb={copy.blurb}
      features={copy.features}
    />
  )
}
