import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { LeadsLive } from "@/components/leads/leads-live"
import { t } from "@/lib/i18n"

export const metadata: Metadata = {
  title: `${t.leads.title} · Royal Sales IA`,
  description: t.leads.metaDescription,
}

export default function LeadsPage() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <PageHeader title={t.leads.title} description={t.leads.description} />
      <LeadsLive />
    </div>
  )
}
