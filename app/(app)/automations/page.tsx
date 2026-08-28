import type { Metadata } from "next"
import { Workflow } from "lucide-react"
import { ModulePlaceholder } from "@/components/shared/module-placeholder"

export const metadata: Metadata = { title: "Automations" }

export default function AutomationsPage() {
  return (
    <ModulePlaceholder
      title="Automations"
      description="Trigger-based workflows for lead routing, nurture, and alerts."
      icon={Workflow}
      blurb="Automations will let you build if-this-then-that flows that move leads, send messages, and notify reps without manual work."
      features={[
        { title: "Visual builder", description: "Drag-and-drop triggers, conditions, and actions." },
        { title: "Lead nurture", description: "Multi-step WhatsApp and email sequences by stage and score." },
        { title: "Smart routing", description: "Assign leads by source, value, or rep performance." },
        { title: "Alerts", description: "Notify managers when high-value leads go cold." },
      ]}
    />
  )
}
