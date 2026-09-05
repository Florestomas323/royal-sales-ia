"use client"

import { MessageCircle, Phone } from "lucide-react"
import type { Lead, User } from "@/types"
import { ScoreBadge, StageBadge } from "@/components/shared/score-badge"
import { PlatformMark } from "@/components/shared/platform-badge"
import { LeadTypeBadge } from "@/components/shared/lead-type-badge"
import { PLATFORM_LABELS } from "@/lib/constants"
import { displayStage, leadTypeOf, telHref, whatsappHref } from "@/lib/leads"
import { formatCurrency, formatRelativeTime, initials } from "@/lib/format"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"

/**
 * Mobile / narrow-screen representation of a lead. Shows everything the table
 * shows on desktop — nothing is hidden — in the priority order that matters
 * on a phone: name, phone, source, stage, score, owner. Quick actions open the
 * dialer / WhatsApp directly; tapping the card opens the detail sheet.
 */
export function LeadCard({
  lead,
  owner,
  showType,
  onOpen,
}: {
  lead: Lead
  owner: User | undefined
  showType: boolean
  onOpen: (lead: Lead) => void
}) {
  const type = leadTypeOf(lead)
  const tel = telHref(lead.phone)
  const wa = whatsappHref(lead.phone, t.leads.detail.whatsappGreeting(lead.name.split(" ")[0]))

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(lead)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault()
          onOpen(lead)
        }
      }}
      aria-label={`${t.leads.detail.openLead}: ${lead.name}`}
      className="flex flex-col gap-3 rounded-xl border bg-card p-4 text-left transition-colors active:bg-muted/60"
    >
      {/* Nombre + puntuación */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-base font-medium">{lead.name}</p>
          <p className="text-sm text-muted-foreground">
            {lead.phone || t.leads.detail.noPhone}
          </p>
        </div>
        <ScoreBadge score={lead.score} temperature={lead.temperature} className="shrink-0" />
      </div>

      {/* Fuente + tipo + etapa */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <PlatformMark platform={lead.source} />
          {PLATFORM_LABELS[lead.source]}
        </span>
        {showType && <LeadTypeBadge type={type} />}
        <StageBadge stage={displayStage(lead)} />
      </div>

      {/* Responsable, valor, fecha */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        {owner ? (
          <span className="flex items-center gap-1.5">
            <span
              className="flex size-5 items-center justify-center rounded-full text-[10px] font-semibold text-white"
              style={{ backgroundColor: owner.avatarColor }}
            >
              {initials(owner.name)}
            </span>
            {owner.name.split(" ")[0]}
          </span>
        ) : (
          <span>{t.common.unassigned}</span>
        )}
        {type === "sales" && (
          <span className="font-medium tabular-nums text-foreground">
            {formatCurrency(lead.potentialValue)}
          </span>
        )}
        <span className="ml-auto">{formatRelativeTime(lead.createdAt)}</span>
      </div>

      {/* Acciones rápidas — enlaces reales, no botones decorativos */}
      <div className="grid grid-cols-2 gap-2">
        <QuickAction href={wa} icon={MessageCircle} label={t.leads.detail.whatsapp} primary />
        <QuickAction href={tel} icon={Phone} label={t.leads.detail.call} />
      </div>
    </div>
  )
}

function QuickAction({
  href,
  icon: Icon,
  label,
  primary = false,
}: {
  href: string | null
  icon: typeof Phone
  label: string
  primary?: boolean
}) {
  const base =
    "flex h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-colors"
  if (!href) {
    return (
      <span
        aria-disabled="true"
        title={t.leads.detail.noPhone}
        className={cn(base, "cursor-not-allowed border border-dashed text-muted-foreground/60")}
      >
        <Icon className="size-4" />
        {label}
      </span>
    )
  }
  return (
    <a
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        base,
        primary
          ? "bg-primary text-primary-foreground active:bg-primary/90"
          : "border bg-background active:bg-muted",
      )}
    >
      <Icon className="size-4" />
      {label}
    </a>
  )
}
