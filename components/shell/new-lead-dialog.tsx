'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Briefcase, Plus, ShoppingBag } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PLATFORM_LABELS } from '@/lib/constants'
import { campaignObjective, sourcesFor } from '@/lib/leads'
import { createLead } from '@/lib/firebase/leads'
import { useCampaigns, useUsers } from '@/lib/firebase/collections'
import { useWorkspace } from '@/lib/firebase/workspace-context'
import { describeError } from '@/lib/firebase/errors'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'
import type { LeadType, Platform, RecruitingProfile } from '@/types'

const NO_CAMPAIGN = '__none__'

const TYPE_OPTIONS: { value: LeadType; label: string; hint: string; icon: typeof Plus }[] = [
  { value: 'sales', label: t.leads.types.sales, hint: t.leads.types.salesHint, icon: ShoppingBag },
  {
    value: 'recruiting',
    label: t.leads.types.recruiting,
    hint: t.leads.types.recruitingHint,
    icon: Briefcase,
  },
]

export function NewLeadDialog({
  trigger,
  defaultLeadType = 'sales',
}: {
  trigger?: React.ReactNode
  defaultLeadType?: LeadType
}) {
  const { campaigns } = useCampaigns()
  const { users } = useUsers()
  const { workspaceId, role, membership } = useWorkspace()
  const [open, setOpen] = React.useState(false)
  const [leadType, setLeadType] = React.useState<LeadType>(defaultLeadType)
  const [source, setSource] = React.useState<Platform>('manual')
  const [campaignId, setCampaignId] = React.useState<string>(NO_CAMPAIGN)
  const [assignedToId, setAssignedToId] = React.useState('')
  const [hasVehicle, setHasVehicle] = React.useState(false)
  const [submitting, setSubmitting] = React.useState(false)

  const activeReps = users.filter((u) => u.status === 'active')
  const isRep = role === 'sales_rep'
  const sources = sourcesFor(leadType)
  // Only campaigns whose objective matches the lead type are offered.
  const matchingCampaigns = campaigns.filter((c) => campaignObjective(c) === leadType)

  React.useEffect(() => {
    if (open) setLeadType(defaultLeadType)
  }, [open, defaultLeadType])

  // Keep source valid for the selected type (e.g. Indeed → not allowed for sales).
  React.useEffect(() => {
    if (!sources.includes(source)) setSource('manual')
  }, [sources, source])

  // Drop the campaign when the type changes and the current one no longer matches.
  React.useEffect(() => {
    if (campaignId !== NO_CAMPAIGN && !matchingCampaigns.some((c) => c.id === campaignId)) {
      setCampaignId(NO_CAMPAIGN)
    }
  }, [matchingCampaigns, campaignId])

  React.useEffect(() => {
    // A sales rep can only create leads assigned to themselves (Rules enforce it).
    if (isRep && membership?.userId) {
      if (assignedToId !== membership.userId) setAssignedToId(membership.userId)
      return
    }
    if (!assignedToId && activeReps.length > 0) setAssignedToId(activeReps[0].id)
  }, [activeReps, assignedToId, isRep, membership])

  function handleCampaignChange(value: string | null) {
    const next = value ?? NO_CAMPAIGN
    setCampaignId(next)
    const campaign = campaigns.find((c) => c.id === next)
    // Default the source to the campaign platform when it is a valid source.
    if (campaign && sources.includes(campaign.platform)) setSource(campaign.platform)
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = (form.get('name') as string)?.trim() || t.leads.defaultName
    const phone = (form.get('phone') as string)?.trim()
    const email = (form.get('email') as string)?.trim()
    const campaign = campaigns.find((c) => c.id === campaignId)
    if (!workspaceId) {
      toast.error(t.common.selectWorkspaceFirst)
      return
    }

    const recruiting: RecruitingProfile | undefined =
      leadType === 'recruiting'
        ? {
            jobTitle: (form.get('jobTitle') as string)?.trim() || undefined,
            city: (form.get('city') as string)?.trim() || undefined,
            state: (form.get('state') as string)?.trim() || undefined,
            employmentPreference:
              (form.get('employmentPreference') as string)?.trim() || undefined,
            hasVehicle,
          }
        : undefined

    setSubmitting(true)
    try {
      await createLead({
        workspaceId,
        leadType,
        source,
        name,
        phone,
        email,
        assignedToId,
        campaignId: campaign?.id,
        campaignName: campaign?.name,
        clientId: campaign?.clientId,
        recruiting,
      })
      toast.success(t.leads.createdTitle, {
        description: t.leads.createdDescription(name),
      })
      setOpen(false)
      setCampaignId(NO_CAMPAIGN)
      setSource('manual')
      setHasVehicle(false)
    } catch (err) {
      toast.error(t.leads.createError, { description: describeError(err).message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          trigger ? (
            (trigger as React.ReactElement)
          ) : (
            <Button size="sm">
              <Plus data-icon="inline-start" />
              {t.leads.newLead}
            </Button>
          )
        }
      />
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.leads.dialogTitle}</DialogTitle>
          <DialogDescription>{t.leads.dialogDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            {/* Tipo de prospecto — obligatorio */}
            <Field>
              <FieldLabel>{t.leads.types.label}</FieldLabel>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t.leads.types.label}>
                {TYPE_OPTIONS.map((opt) => {
                  const active = leadType === opt.value
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setLeadType(opt.value)}
                      className={cn(
                        'flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
                        active
                          ? 'border-primary bg-primary/5 text-foreground'
                          : 'border-input text-muted-foreground hover:bg-muted/50',
                      )}
                    >
                      <span className="flex items-center gap-1.5 text-sm font-medium">
                        <opt.icon className="size-4" />
                        {opt.label}
                      </span>
                      <span className="text-[11px] leading-snug">{opt.hint}</span>
                    </button>
                  )
                })}
              </div>
            </Field>

            <Field>
              <FieldLabel htmlFor="name">{t.leads.fullName}</FieldLabel>
              <Input
                id="name"
                name="name"
                placeholder={t.leads.fullNamePlaceholder}
                required
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="phone">{t.leads.phone}</FieldLabel>
                <Input id="phone" name="phone" inputMode="tel" placeholder="+1 555 000 0000" />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">{t.leads.email}</FieldLabel>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder={t.leads.emailPlaceholder}
                />
              </Field>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t.leads.source}</FieldLabel>
                <Select value={source} onValueChange={(v) => setSource((v ?? 'manual') as Platform)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t.leads.sourcePlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {sources.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PLATFORM_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {leadType === 'sales' && (
                  <FieldDescription>{t.leads.sourceIndeedHint}</FieldDescription>
                )}
              </Field>
              <Field>
                <FieldLabel>{t.leads.campaign}</FieldLabel>
                <Select value={campaignId} onValueChange={handleCampaignChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={t.leads.campaignPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_CAMPAIGN}>{t.leads.noCampaign}</SelectItem>
                    {matchingCampaigns.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} · {PLATFORM_LABELS[c.platform]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <Field>
              <FieldLabel>{t.leads.assignTo}</FieldLabel>
              <Select
                value={assignedToId}
                onValueChange={(v) => setAssignedToId(v ?? '')}
                disabled={isRep}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.leads.assignPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {activeReps.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {leadType === 'recruiting' && (
              <div className="flex flex-col gap-4 rounded-lg border p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {t.leads.recruitingFields.title}
                </p>
                <Field>
                  <FieldLabel htmlFor="jobTitle">{t.leads.recruitingFields.jobTitle}</FieldLabel>
                  <Input
                    id="jobTitle"
                    name="jobTitle"
                    placeholder={t.leads.recruitingFields.jobTitlePlaceholder}
                  />
                </Field>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field>
                    <FieldLabel htmlFor="city">{t.leads.recruitingFields.city}</FieldLabel>
                    <Input id="city" name="city" />
                  </Field>
                  <Field>
                    <FieldLabel htmlFor="state">{t.leads.recruitingFields.state}</FieldLabel>
                    <Input id="state" name="state" />
                  </Field>
                </div>
                <Field>
                  <FieldLabel htmlFor="employmentPreference">
                    {t.leads.recruitingFields.employmentPreference}
                  </FieldLabel>
                  <Input
                    id="employmentPreference"
                    name="employmentPreference"
                    placeholder={t.leads.recruitingFields.employmentPreferencePlaceholder}
                  />
                </Field>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="hasVehicle">{t.leads.recruitingFields.hasVehicle}</FieldLabel>
                  <Switch id="hasVehicle" checked={hasVehicle} onCheckedChange={setHasVehicle} />
                </Field>
              </div>
            )}
          </FieldGroup>
          <DialogFooter className="mt-6">
            <DialogClose render={<Button variant="outline" type="button" />}>
              {t.common.cancel}
            </DialogClose>
            <Button type="submit" disabled={submitting || !workspaceId}>
              {submitting ? t.common.creating : t.leads.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
