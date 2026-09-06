"use client"

import {
  ArchiveRestore,
  Archive,
  ArrowRightLeft,
  Inbox,
  MessageCircle,
  Phone,
  StickyNote,
  UserCog,
} from "lucide-react"
import type { Activity, ActivityType } from "@/types"
import { activityTime, sortActivities } from "@/lib/firebase/activities"
import { formatRelativeTime } from "@/lib/format"
import { t } from "@/lib/i18n"

const ICONS: Record<ActivityType, typeof Inbox> = {
  lead_created: Inbox,
  whatsapp: MessageCircle,
  call: Phone,
  stage_change: ArrowRightLeft,
  assignment_change: UserCog,
  note: StickyNote,
  archived: Archive,
  restored: ArchiveRestore,
}

const a = t.leads.detail.activity

/** Human description. Labels were resolved when the activity was written. */
function describe(activity: Activity): string {
  const p = activity.payload
  switch (activity.type) {
    case "stage_change":
      return a.stage_change(p?.fromLabel ?? p?.from ?? "—", p?.toLabel ?? p?.to ?? "—")
    case "assignment_change":
      return a.assignment_change(
        p?.fromLabel || t.common.unassigned,
        p?.toLabel || t.common.unassigned,
      )
    default:
      return a[activity.type]
  }
}

/**
 * Real audit trail, newest first. Ordering comes from `createdAtServer`
 * (server-signed); `sortActivities` re-sorts defensively so an activity whose
 * server timestamp has not resolved yet cannot jump ahead.
 *
 * `resolveActor` maps `actorId` → name via `users`. When there is no
 * resolvable profile — the super admin lives outside any workspace by design —
 * the row falls back to the role recorded with the activity (`actorRole`,
 * pinned by Security Rules), so it reads "Super admin" instead of an unhelpful
 * "Usuario no disponible".
 */
function actorLabel(activity: Activity, resolved: string | undefined): string {
  if (resolved) return resolved
  const byRole = t.leads.detail.actorByRole
  if (activity.actorRole && activity.actorRole in byRole) {
    return byRole[activity.actorRole as keyof typeof byRole]
  }
  return t.leads.detail.unknownActor
}

export function LeadTimeline({
  activities,
  resolveActor,
}: {
  activities: Activity[]
  resolveActor: (actorId: string) => string | undefined
}) {
  if (activities.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-pretty text-muted-foreground">
        {t.leads.detail.activityEmpty}
      </p>
    )
  }

  return (
    <ol className="flex flex-col">
      {sortActivities(activities).map((activity, index, all) => {
        const Icon = ICONS[activity.type] ?? Inbox
        const actor = actorLabel(activity, resolveActor(activity.actorId))
        const when = activityTime(activity)
        return (
          <li key={activity.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full border bg-background">
                <Icon className="size-3.5 text-muted-foreground" />
              </span>
              {index < all.length - 1 && <span className="w-px flex-1 bg-border" />}
            </div>
            <div className="min-w-0 flex-1 pb-4">
              <p className="text-sm text-pretty break-words">{describe(activity)}</p>
              {activity.type === "note" && activity.payload?.note && (
                <p className="mt-1 rounded-md bg-muted px-2.5 py-2 text-sm text-pretty break-words whitespace-pre-wrap">
                  {activity.payload.note}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="break-words">{actor}</span>
                {when > 0 && <> · {formatRelativeTime(new Date(when).toISOString())}</>}
              </p>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
