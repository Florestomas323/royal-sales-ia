import type { Metadata } from "next"
import { Suspense } from "react"
import { PageHeader } from "@/components/shared/page-header"
import { CalendarView } from "@/components/calendar/calendar-view"
import { t } from "@/lib/i18n"

export const metadata: Metadata = { title: t.modules.calendar.title }

/** Operational calendar: real appointments of the active workspace. */
export default function CalendarPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader title={t.modules.calendar.title} description={t.modules.calendar.description} />
      <Suspense fallback={null}>
        <CalendarView />
      </Suspense>
    </div>
  )
}
