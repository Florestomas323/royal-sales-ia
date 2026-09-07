import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { CustomersLive } from "@/components/customers/customers-live"
import { t } from "@/lib/i18n"

export const metadata: Metadata = {
  title: `${t.customers.title} · Royal Sales IA`,
}

export default function CustomersPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader title={t.customers.title} description={t.customers.description} />
      <CustomersLive />
    </div>
  )
}
