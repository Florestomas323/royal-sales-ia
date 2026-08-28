import type { Metadata } from "next"
import { BrainCircuit } from "lucide-react"
import { ModulePlaceholder } from "@/components/shared/module-placeholder"

export const metadata: Metadata = { title: "AI Media Buyer" }

export default function MediaBuyerPage() {
  return (
    <ModulePlaceholder
      title="AI Media Buyer"
      description="Autonomous budget allocation and creative optimization across ad platforms."
      icon={BrainCircuit}
      blurb="The AI Media Buyer will continuously reallocate spend toward the highest-ROAS campaigns and flag creative fatigue before it hurts performance."
      features={[
        { title: "Auto budget shifting", description: "Move spend to winning ad sets on Meta, Google, and TikTok in near real time." },
        { title: "Creative fatigue alerts", description: "Detect declining CTR and frequency spikes to rotate creative early." },
        { title: "Bid strategy guidance", description: "Recommend bid caps and targeting expansions based on CPL trends." },
        { title: "Guardrails", description: "Set spend ceilings and ROAS floors the AI must respect per client." },
      ]}
    />
  )
}
