"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Phone, Mail, MessageCircle, CalendarPlus, Target, Clock, ArrowRightLeft } from "lucide-react"
import type { Activity, Lead, LeadType } from "@/types"
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
import { LeadTypeBadge } from "@/components/shared/lead-type-badge"
import { ScoreRing } from "@/components/shared/score-badge"
import { StageBadge } from "@/components/shared/score-badge"
import { TemperatureDot } from "@/components/shared/score-badge"
import { LeadTimeline } from "@/components/leads/lead-timeline"
import { LeadAiAssistant } from "@/components/leads/lead-ai-assistant"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { useUsersMap } from "@/lib/firebase/collections"
import { updateLeadType } from "@/lib/firebase/leads"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { describeError } from "@/lib/firebase/errors"
import { LEAD_TYPE_SINGULAR, PLATFORM_LABELS, TEMPERATURE_LABELS } from "@/lib/constants"
import { displayStage, leadTypeOf, telHref, whatsappHref } from "@/lib/leads"
import { formatCurrency, formatRelativeTime } from "@/lib/format"
import { t } from "@/lib/i18n"

interface LeadDetailSheetProps {
  lead: Lead | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function LeadDetailSheet({ lead, open, onOpenChange }: LeadDetailSheetProps) {
  const usersMap = useUsersMap()
  const { isSuperAdmin, workspaces, role } = useWorkspace()
  const [changingType, setChangingType] = useState(false)
  const [confirmTypeOpen, setConfirmTypeOpen] = useState(false)
  if (!lead) return null
  const rep = usersMap[lead.assignedToId]
  const type = leadTypeOf(lead)
  const isRecruiting = type === "recruiting"
  const canChangeType = isSuperAdmin || role === "client_admin" || role === "manager"
  const workspaceName = workspaces.find((w) => w.id === lead.workspaceId)?.name ?? lead.workspaceId
  const rec = lead.recruiting
  const hasExtraAttribution = Boolean(
    lead.attribution.utmSource ||
      lead.attribution.utmMedium ||
      lead.attribution.utmCampaign ||
      lead.attribution.landingPage ||
      lead.attribution.referrer ||
      lead.attribution.externalCampaignId ||
      lead.attribution.externalAdId,
  )

  const nextType: LeadType = isRecruiting ? "sales" : "recruiting"
  const tel = telHref(lead.phone)
  const wa = whatsappHref(lead.phone, t.leads.detail.whatsappGreeting(lead.name.split(" ")[0]))

  async function handleChangeType() {
    if (!lead) return
    setChangingType(true)
    try {
      await updateLeadType(lead.id, nextType)
      toast.success(t.leads.detail.typeChanged)
      setConfirmTypeOpen(false)
    } catch (err) {
      toast.error(t.leads.detail.typeChangeError, { description: describeError(err).message })
    } finally {
      setChangingType(false)
    }
  }
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
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="shrink-0 gap-3 border-b p-4 pr-12 sm:p-5 sm:pr-14">
          <div className="flex items-start gap-3 sm:gap-4">
            <ScoreRing score={lead.score} size={52} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <SheetTitle className="text-lg break-words">{lead.name}</SheetTitle>
                <LeadTypeBadge type={type} />
                <TemperatureDot temperature={lead.temperature} withLabel />
              </div>
              <SheetDescription className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <PlatformBadge platform={lead.source} />
                <span className="text-muted-foreground">·</span>
                <span className="truncate">{lead.campaignName || t.leads.noCampaign}</span>
              </SheetDescription>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {!isRecruiting && (
                  <span className="flex items-center gap-1">
                    <Target className="size-3.5" />
                    {formatCurrency(lead.potentialValue)} {t.leads.detail.potential}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="size-3.5" />
                  {formatRelativeTime(lead.createdAt)}
                </span>
              </div>
            </div>
          </div>
          {/*
            Real actions: WhatsApp and Llamar are plain links to wa.me / tel:
            built from the stored phone. Without a phone they are disabled with
            an explanation. Agendar has no calendar behind it yet, so it is
            disabled and says so — it never reports a success it did not do.
          */}
          <div className="grid grid-cols-3 gap-2">
            {wa ? (
              <Button
                size="sm"
                className="h-10 gap-1.5 sm:h-8"
                nativeButton={false}
                render={<a href={wa} target="_blank" rel="noopener noreferrer" />}
              >
                <MessageCircle className="size-3.5" data-icon="inline-start" />
                {t.leads.detail.whatsapp}
              </Button>
            ) : (
              <Button size="sm" className="h-10 gap-1.5 sm:h-8" disabled title={t.leads.detail.noPhone}>
                <MessageCircle className="size-3.5" data-icon="inline-start" />
                {t.leads.detail.whatsapp}
              </Button>
            )}
            {tel ? (
              <Button
                size="sm"
                variant="outline"
                className="h-10 gap-1.5 sm:h-8"
                nativeButton={false}
                render={<a href={tel} />}
              >
                <Phone className="size-3.5" data-icon="inline-start" />
                {t.leads.detail.call}
              </Button>
            ) : (
              <Button size="sm" variant="outline" className="h-10 gap-1.5 sm:h-8" disabled title={t.leads.detail.noPhone}>
                <Phone className="size-3.5" data-icon="inline-start" />
                {t.leads.detail.call}
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              className="h-10 gap-1.5 sm:h-8"
              disabled
              title={t.leads.detail.bookPending}
              aria-describedby="book-pending"
            >
              <CalendarPlus className="size-3.5" data-icon="inline-start" />
              {t.leads.detail.book}
            </Button>
          </div>
          {!lead.phone && (
            <p className="text-xs text-muted-foreground">{t.leads.detail.noPhone}</p>
          )}
          <p id="book-pending" className="text-xs text-muted-foreground">
            {t.leads.detail.bookPending}
          </p>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-5 p-4 sm:p-5">
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
                    label={t.leads.detail.type}
                    value={
                      <span className="flex items-center justify-end gap-2">
                        <LeadTypeBadge type={type} />
                        {canChangeType && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 px-2 text-xs"
                            onClick={() => setConfirmTypeOpen(true)}
                            disabled={changingType}
                          >
                            <ArrowRightLeft className="size-3" />
                            {t.leads.detail.changeType}
                          </Button>
                        )}
                      </span>
                    }
                  />
                  <InfoRow
                    label={t.leads.detail.source}
                    value={<PlatformBadge platform={lead.source} />}
                  />
                  <InfoRow
                    label={t.leads.detail.campaign}
                    value={lead.campaignName || t.leads.detail.notAvailable}
                  />
                  <InfoRow
                    label={t.leads.detail.stage}
                    value={<StageBadge stage={displayStage(lead)} />}
                  />
                  <InfoRow
                    label={t.leads.detail.temperature}
                    value={TEMPERATURE_LABELS[lead.temperature]}
                  />
                  <InfoRow
                    label={t.leads.detail.createdAt}
                    value={new Date(lead.createdAt).toLocaleString("es", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  />
                  {isSuperAdmin && (
                    <InfoRow label={t.leads.detail.workspace} value={workspaceName} />
                  )}
                  <InfoRow label={t.leads.detail.phone} value={lead.phone || t.leads.detail.notAvailable} />
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

                  {isRecruiting && (
                    <>
                      <Separator />
                      <p className="text-xs font-medium text-muted-foreground">
                        {t.leads.detail.candidate.title}
                      </p>
                      <InfoRow
                        label={t.leads.detail.candidate.jobTitle}
                        value={rec?.jobTitle || t.leads.detail.notAvailable}
                      />
                      <InfoRow
                        label={t.leads.detail.candidate.location}
                        value={[rec?.city, rec?.state].filter(Boolean).join(", ") || t.leads.detail.notAvailable}
                      />
                      <InfoRow
                        label={t.leads.detail.candidate.employmentPreference}
                        value={rec?.employmentPreference || t.leads.detail.notAvailable}
                      />
                      <InfoRow
                        label={t.leads.detail.candidate.hasVehicle}
                        value={
                          rec?.hasVehicle === undefined
                            ? t.leads.detail.notAvailable
                            : rec.hasVehicle
                              ? t.leads.detail.candidate.yes
                              : t.leads.detail.candidate.no
                        }
                      />
                      <InfoRow
                        label={t.leads.detail.candidate.interviewDate}
                        value={rec?.interviewDate ? formatRelativeTime(rec.interviewDate) : t.leads.detail.notAvailable}
                      />
                      <InfoRow
                        label={t.leads.detail.candidate.orientationDate}
                        value={rec?.orientationDate ? formatRelativeTime(rec.orientationDate) : t.leads.detail.notAvailable}
                      />
                      <InfoRow
                        label={t.leads.detail.candidate.hiredAt}
                        value={rec?.hiredAt ? formatRelativeTime(rec.hiredAt) : t.leads.detail.notAvailable}
                      />
                      {(lead.source === "indeed" || rec?.indeedCandidateId) && (
                        <InfoRow
                          label={t.leads.detail.candidate.indeedCandidate}
                          value={rec?.indeedCandidateId ?? PLATFORM_LABELS.indeed}
                        />
                      )}
                    </>
                  )}
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
                  {hasExtraAttribution ? (
                    <>
                      <Separator />
                      {(lead.attribution.utmSource || lead.attribution.utmMedium || lead.attribution.utmCampaign) && (
                        <InfoRow
                          label={t.leads.detail.utm}
                          value={[lead.attribution.utmSource, lead.attribution.utmMedium, lead.attribution.utmCampaign]
                            .filter(Boolean)
                            .join(" / ")}
                        />
                      )}
                      {lead.attribution.landingPage && (
                        <InfoRow label={t.leads.detail.landingPage} value={lead.attribution.landingPage} />
                      )}
                      {lead.attribution.referrer && (
                        <InfoRow label={t.leads.detail.referrer} value={lead.attribution.referrer} />
                      )}
                      {(lead.attribution.externalCampaignId || lead.attribution.externalAdId) && (
                        <InfoRow
                          label={t.leads.detail.externalIds}
                          value={
                            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                              {[lead.attribution.externalCampaignId, lead.attribution.externalAdSetId, lead.attribution.externalAdId]
                                .filter(Boolean)
                                .join(" · ")}
                            </code>
                          }
                        />
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">{t.leads.detail.noAttribution}</p>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </ScrollArea>
      </SheetContent>

      <ConfirmDialog
        open={confirmTypeOpen}
        onOpenChange={setConfirmTypeOpen}
        title={t.leads.detail.changeTypeTitle}
        description={t.leads.detail.changeTypeConfirm(LEAD_TYPE_SINGULAR[nextType])}
        actionLabel={t.leads.detail.changeTypeAction(LEAD_TYPE_SINGULAR[nextType])}
        busy={changingType}
        onConfirm={handleChangeType}
      />
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
