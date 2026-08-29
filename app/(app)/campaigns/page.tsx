import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { CampaignsLive } from "@/components/campaigns/campaigns-live"
import { NewCampaignDialog } from "@/components/campaigns/new-campaign-dialog"

export const metadata: Metadata = { title: "Campaigns" }

export default function CampaignsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Campaigns"
        description="Cross-platform ad performance across Meta, Google, and TikTok."
        actions={<NewCampaignDialog />}
      />
      <CampaignsLive />
    </div>
  )
}
