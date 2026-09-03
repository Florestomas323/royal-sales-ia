import { Briefcase, ShoppingBag } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { LEAD_TYPE_SINGULAR } from "@/lib/constants"
import { cn } from "@/lib/utils"
import type { LeadType } from "@/types"

export function LeadTypeBadge({ type, className }: { type: LeadType; className?: string }) {
  const Icon = type === "recruiting" ? Briefcase : ShoppingBag
  return (
    <Badge
      variant={type === "recruiting" ? "secondary" : "outline"}
      className={cn("gap-1 text-[11px]", className)}
    >
      <Icon className="size-3" />
      {LEAD_TYPE_SINGULAR[type]}
    </Badge>
  )
}
