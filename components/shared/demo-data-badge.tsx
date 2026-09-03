import { FlaskConical } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/** Marks a module that still renders illustrative data from lib/mock-data. */
export function DemoDataBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 text-muted-foreground", className)} title={t.common.demoDataHint}>
      <FlaskConical className="size-3" />
      {t.common.demoData}
    </Badge>
  )
}

/** Inline notice for live lists that contain seeded demo rows. */
export function DemoRowsNotice({ rows }: { rows: { isDemo?: boolean }[] }) {
  if (!rows.some((r) => r.isDemo)) return null
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <FlaskConical className="size-3" />
      {t.common.containsDemoRows}
    </p>
  )
}
