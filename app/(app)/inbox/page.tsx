import type { Metadata } from "next"
import { Inbox } from "lucide-react"
import { ModulePlaceholder } from "@/components/shared/module-placeholder"

export const metadata: Metadata = { title: "Inbox" }

export default function InboxPage() {
  return (
    <ModulePlaceholder
      title="Unified Inbox"
      description="Every WhatsApp, Instagram, and Messenger conversation in one thread."
      icon={Inbox}
      blurb="The unified inbox will merge all messaging channels with AI-drafted replies so no lead waits more than a minute."
      features={[
        { title: "Omnichannel threads", description: "WhatsApp, Instagram DM, and Messenger unified per lead." },
        { title: "AI reply drafts", description: "Suggested responses that match lead context and next best action." },
        { title: "Fast assignment", description: "Route conversations to the right rep with SLA timers." },
        { title: "Templates & snippets", description: "One-tap responses for common questions and booking links." },
      ]}
    />
  )
}
