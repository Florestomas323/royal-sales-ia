import type { Metadata } from "next"
import { PageHeader } from "@/components/shared/page-header"
import { TeamLive } from "@/components/team/team-live"
import { InviteMemberDialog } from "@/components/team/invite-member-dialog"

export const metadata: Metadata = {
  title: "Team · Royal Sales IA",
}

export default function TeamPage() {
  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <PageHeader
        title="Team"
        description="Manage roles, seats and performance across your sales team."
        actions={<InviteMemberDialog />}
      />
      <TeamLive />
    </div>
  )
}
