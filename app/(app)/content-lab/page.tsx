import type { Metadata } from "next"
import { Sparkles } from "lucide-react"
import { ModulePlaceholder } from "@/components/shared/module-placeholder"

export const metadata: Metadata = { title: "Content Lab" }

export default function ContentLabPage() {
  return (
    <ModulePlaceholder
      title="Content Lab"
      description="Generate and test ad creative, hooks, and landing copy with AI."
      icon={Sparkles}
      blurb="Content Lab will turn your best-performing angles into fresh ad variations and route them straight into campaigns for testing."
      features={[
        { title: "Hook generator", description: "Produce scroll-stopping opening lines tuned to each platform and audience." },
        { title: "Creative variations", description: "Spin winning ads into new formats and aspect ratios automatically." },
        { title: "Copy testing", description: "A/B primary text and headlines, then promote the winners." },
        { title: "Brand voice", description: "Keep every asset on-brand with per-client tone and style rules." },
      ]}
    />
  )
}
