import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { ClientsLive } from "@/components/clients/clients-live"
import { AddClientDialog } from "@/components/clients/add-client-dialog"

export const metadata: Metadata = {
  title: "Clients · Royal Sales IA",
}

export default function ClientsPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title="Clients"
        description="Every account you manage, with spend and revenue at a glance."
        actions={<AddClientDialog />}
      />
      <ClientsLive />
    </div>
  )
}
