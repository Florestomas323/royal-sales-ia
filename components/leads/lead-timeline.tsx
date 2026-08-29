import {
  MessageCircle,
  Phone,
  Mail,
  CalendarCheck,
  StickyNote,
  ArrowRightLeft,
  Trophy,
  Inbox,
} from "lucide-react"
import type { Activity, ActivityType } from "@/types"
import { formatRelativeTime } from "@/lib/format"
import { t } from "@/lib/i18n"

const ICONS: Record<ActivityType, typeof Inbox> = {
  lead_received: Inbox,
  whatsapp: MessageCircle,
  call: Phone,
  email: Mail,
  appointment: CalendarCheck,
  note: StickyNote,
  stage_change: ArrowRightLeft,
  sale: Trophy,
}

export function LeadTimeline({ activities }: { activities: Activity[] }) {
  return (
    <ol className="flex flex-col">
      {activities
        .slice()
        .reverse()
        .map((a, i, arr) => {
          const Icon = ICONS[a.type]
          const isLast = i === arr.length - 1
          const isSale = a.type === "sale"
          return (
            <li key={a.id} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border"
                  style={
                    isSale
                      ? { backgroundColor: "var(--success)", color: "var(--success-foreground)", borderColor: "transparent" }
                      : { backgroundColor: "var(--muted)", color: "var(--muted-foreground)", borderColor: "var(--border)" }
                  }
                >
                  <Icon className="size-4" />
                </div>
                {!isLast && <div className="my-1 w-px flex-1 bg-border" />}
              </div>
              <div className="flex flex-col gap-0.5 pb-5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{a.title}</span>
                  <span className="text-xs text-muted-foreground">{formatRelativeTime(a.timestamp)}</span>
                </div>
                <p className="text-sm text-muted-foreground text-pretty">{a.description}</p>
                <span className="text-xs text-muted-foreground">
                  {t.common.by} {a.actor}
                </span>
              </div>
            </li>
          )
        })}
    </ol>
  )
}
