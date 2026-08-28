import type { Metadata } from "next"
import { Calendar } from "lucide-react"
import { ModulePlaceholder } from "@/components/shared/module-placeholder"

export const metadata: Metadata = { title: "Calendar" }

export default function CalendarPage() {
  return (
    <ModulePlaceholder
      title="Calendar"
      description="Appointments, follow-ups, and rep availability in one schedule."
      icon={Calendar}
      blurb="The calendar will sync booked appointments from your funnels and let reps manage follow-ups with automated reminders."
      features={[
        { title: "Appointment sync", description: "Pull booked calls from funnels and messaging into one view." },
        { title: "Follow-up reminders", description: "Automated nudges so hot leads never slip through the cracks." },
        { title: "Rep availability", description: "Round-robin booking based on load and working hours." },
        { title: "No-show recovery", description: "Trigger re-engagement sequences when a lead misses a call." },
      ]}
    />
  )
}
