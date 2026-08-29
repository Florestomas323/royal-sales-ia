import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { TeamLive } from "@/components/team/team-live"
import { InviteMemberDialog } from "@/components/team/invite-member-dialog"
import { t } from "@/lib/i18n"

export const metadata: Metadata = {
  title: `${t.team.title} · Royal Sales IA`,
}

export default function TeamPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title={t.team.title}
        description={t.team.description}
        actions={<InviteMemberDialog />}
      />
      <TeamLive />
    </div>
  )
}
