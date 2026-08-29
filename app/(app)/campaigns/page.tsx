import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { CampaignsLive } from "@/components/campaigns/campaigns-live"
import { NewCampaignDialog } from "@/components/campaigns/new-campaign-dialog"
import { t } from "@/lib/i18n"

export const metadata: Metadata = { title: t.campaigns.title }

export default function CampaignsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t.campaigns.title}
        description={t.campaigns.description}
        actions={<NewCampaignDialog />}
      />
      <CampaignsLive />
    </div>
  )
}
