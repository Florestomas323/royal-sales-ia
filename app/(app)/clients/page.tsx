import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { ClientsLive } from "@/components/clients/clients-live"
import { AddClientDialog } from "@/components/clients/add-client-dialog"
import { t } from "@/lib/i18n"

export const metadata: Metadata = {
  title: `${t.clients.title} · Royal Sales IA`,
}

export default function ClientsPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title={t.clients.title}
        description={t.clients.description}
        actions={<AddClientDialog />}
      />
      <ClientsLive />
    </div>
  )
}
