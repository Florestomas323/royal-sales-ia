"use client"

import { Phone, Mail, MessageCircle, CalendarPlus, Target, Clock } from "lucide-react"
import type { Lead } from "@/types"
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
import { getActivities } from "@/lib/mock-data"
import { useUsersMap } from "@/lib/firebase/collections"
import { formatCurrency, formatRelativeTime } from "@/lib/format"

interface LeadDetailSheetProps {
  lead: Lead | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LeadDetailSheet({ lead, open, onOpenChange }: LeadDetailSheetProps) {
  const usersMap = useUsersMap()
  if (!lead) return null
  const rep = usersMap[lead.assignedToId]
  const activities = getActivities(lead.id)

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
                  {formatCurrency(lead.potentialValue)} potential
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
              WhatsApp
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5">
              <Phone className="size-3.5" data-icon="inline-start" />
              Call
            </Button>
            <Button size="sm" variant="outline" className="gap-1.5">
              <CalendarPlus className="size-3.5" data-icon="inline-start" />
              Book
            </Button>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-9.5rem)]">
          <div className="flex flex-col gap-5 p-5">
            <LeadAiAssistant lead={lead} />

            <Tabs defaultValue="details">
              <TabsList className="w-full">
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="timeline">Timeline</TabsTrigger>
                <TabsTrigger value="attribution">Attribution</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="pt-4">
                <div className="flex flex-col gap-4">
                  <InfoRow label="Stage" value={<StageBadge stage={lead.stage} />} />
                  <InfoRow label="Phone" value={lead.phone} />
                  <InfoRow label="Email" value={lead.email} />
                  <InfoRow
                    label="Assigned to"
                    value={rep?.name ?? "Unassigned"}
                  />
                  <InfoRow
                    label="Next action"
                    value={<span className="font-medium text-foreground">{lead.nextAction}</span>}
                  />
                  <InfoRow
                    label="Last contact"
                    value={lead.lastContactAt ? formatRelativeTime(lead.lastContactAt) : "Not contacted yet"}
                  />
                </div>
              </TabsContent>

              <TabsContent value="timeline" className="pt-4">
                <LeadTimeline activities={activities} />
              </TabsContent>

              <TabsContent value="attribution" className="pt-4">
                <div className="flex flex-col gap-4">
                  <InfoRow
                    label="Platform"
                    value={<PlatformBadge platform={lead.attribution.platform} />}
                  />
                  <InfoRow label="Campaign" value={lead.attribution.campaign} />
                  <InfoRow label="Ad set" value={lead.attribution.adSet} />
                  <InfoRow label="Ad" value={lead.attribution.ad} />
                  <InfoRow label="Creative" value={<code className="rounded bg-muted px-1.5 py-0.5 text-xs">{lead.attribution.creative}</code>} />
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
