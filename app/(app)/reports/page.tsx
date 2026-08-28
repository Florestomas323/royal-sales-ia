import type { Metadata } from "next"
import { FileText } from "lucide-react"
import { ModulePlaceholder } from "@/components/shared/module-placeholder"

export const metadata: Metadata = { title: "Reports" }

export default function ReportsPage() {
  return (
    <ModulePlaceholder
      title="Reports"
      description="Automated client-ready performance reports and exports."
      icon={FileText}
      blurb="Reports will generate branded PDF and live dashboards for each client on the cadence you choose."
      features={[
        { title: "White-label PDFs", description: "Branded monthly reports generated automatically per client." },
        { title: "Live share links", description: "Give clients a read-only dashboard that updates in real time." },
        { title: "Scheduled delivery", description: "Email reports weekly or monthly without lifting a finger." },
        { title: "Custom metrics", description: "Choose the KPIs each client cares about most." },
      ]}
    />
  )
}
