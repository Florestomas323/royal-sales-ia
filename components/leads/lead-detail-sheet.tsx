"use client"

import { Phone, Mail, MessageCircle, CalendarPlus, Target, Clock } from "lucide-react"
import type { Activity, Lead } from "@/types"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import { PlatformBadge } from "@/components/shared/platform-badge"
import { ScoreRing } from "@/components/shared/score-badge"
import { StageBadge } from "@/components/shared/score-badge"
import { TemperatureDot } from "@/components/shared/score-badge"
import { LeadTimeline } from "@/components/leads/lead-timeline"
import { LeadAiAssistant } from "@/components/leads/lead-ai-assistant"
import { useUsersMap } from "@/lib/firebase/collections"
import { formatCurrency, formatRelativeTime } from "@/lib/format"
import { t } from "@/lib/i18n"

interface LeadDetailSheetProps {
  lead: Lead | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LeadDetailSheet({ lead, open, onOpenChange }: LeadDetailSheetProps) {
  const usersMap = useUsersMap()
  if (!lead) return null
  const rep = usersMap[lead.assignedToId]
  // Activities are not persisted yet (roadmap). Until then the timeline only
  // shows the real creation event derived from the lead itself — never mock
  // conversations mixed with real data.
  const activities: Activity[] = [
    {
      id: `${lead.id}-received`,
      leadId: lead.id,
      type: "lead_received",
      title: t.leads.detail.receivedTitle,
      description: t.leads.detail.receivedDescription(lead.campaignName),
      actor: t.leads.detail.systemActor,
      timestamp: lead.createdAt,
    },
  ]

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="gap-3 border-b p-5">
          <div className="flex items-start gap-4">
            <ScoreRing score={lead.score} size={52} />
            <div className="flex flex-1 flex-col gap-1">
              <div className="flex items-center gap-2">
                <SheetTitle className="text-lg">{lead.name}</SheetTitle>
                <TemperatureDot temperature={lead.temperature} withLabel />
              </div>
              <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <PlatformBadge platform={lead.source} />
                <span className="text-muted-foreground">·</span>
                <span>{lead.campaignName}</span>
              </SheetDescription>
              <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <Target className="size-3.5" />
                  {formatCurrency(lead.potentialValue)} {t.leads.detail.potential}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {formatRelativeTime(lead.createdAt)}
                </span>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" className="gap-1.5">
              <MessageCircle className="size-3.5" data-icon="inline-start" />
              {t.leads.detail.whatsapp}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5">
              <Phone className="size-3.5" data-icon="inline-start" />
              {t.leads.detail.call}
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5">
              <CalendarPlus className="size-3.5" data-icon="inline-start" />
              {t.leads.detail.book}
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-9.5rem)]">
          <div className="flex flex-col gap-5 p-5">
            <LeadAiAssistant lead={lead} />

            <Tabs defaultValue="details">
              <TabsList className="w-full">
                <TabsTrigger value="details">{t.leads.detail.tabs.details}</TabsTrigger>
                <TabsTrigger value="timeline">{t.leads.detail.tabs.timeline}</TabsTrigger>
                <TabsTrigger value="attribution">
                  {t.leads.detail.tabs.attribution}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="pt-4">
                <div className="flex flex-col gap-4">
                  <InfoRow
                    label={t.leads.detail.stage}
                    value={<StageBadge stage={lead.stage} />}
                  />
                  <InfoRow label={t.leads.detail.phone} value={lead.phone} />
                  <InfoRow label={t.leads.detail.email} value={lead.email} />
                  <InfoRow
                    label={t.leads.detail.assignedTo}
                    value={rep?.name ?? t.common.unassigned}
                  />
                  <InfoRow
                    label={t.leads.detail.nextAction}
                    value={<span className="font-medium text-foreground">{lead.nextAction}</span>}
                  />
                  <InfoRow
                    label={t.leads.detail.lastContact}
                    value={
                      lead.lastContactAt
                        ? formatRelativeTime(lead.lastContactAt)
                        : t.leads.detail.notContacted
                    }
                  />
                </div>
              </TabsContent>

              <TabsContent value="timeline" className="pt-4">
                <LeadTimeline activities={activities} />
              </TabsContent>

              <TabsContent value="attribution" className="pt-4">
                <div className="flex flex-col gap-4">
                  <InfoRow
                    label={t.leads.detail.platform}
                    value={<PlatformBadge platform={lead.attribution.platform} />}
                  />
                  <InfoRow label={t.leads.detail.campaign} value={lead.attribution.campaign} />
                  <InfoRow label={t.leads.detail.adSet} value={lead.attribution.adSet} />
                  <InfoRow label={t.leads.detail.ad} value={lead.attribution.ad} />
                  <InfoRow
                    label={t.leads.detail.creative}
                    value={
                      <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {lead.attribution.creative}
                      </code>
                    }
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  )
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="text-right text-sm">{value}</div>
      <Separator className="sr-only" />
    </div>
  )
}
