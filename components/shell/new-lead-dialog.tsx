'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

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
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PLATFORM_LABELS } from '@/lib/constants'
import { createLead } from '@/lib/firebase/leads'
import { useCampaigns, useUsers } from '@/lib/firebase/collections'
import { useWorkspace } from '@/lib/firebase/workspace-context'
import { describeError } from '@/lib/firebase/errors'
import { t } from '@/lib/i18n'

export function NewLeadDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { campaigns } = useCampaigns()
  const { users } = useUsers()
  const { workspaceId, role, membership } = useWorkspace()
  const [open, setOpen] = React.useState(false)
  const [campaignId, setCampaignId] = React.useState('')
  const [assignedToId, setAssignedToId] = React.useState('')
  const [submitting, setSubmitting] = React.useState(false)

  const activeReps = users.filter((u) => u.status === 'active')
  const isRep = role === 'sales_rep'

  // Default selections once live data arrives.
  React.useEffect(() => {
    if (!campaignId && campaigns.length > 0) setCampaignId(campaigns[0].id)
  }, [campaigns, campaignId])
  React.useEffect(() => {
    // A sales rep can only create leads assigned to themselves (Rules enforce it).
    if (isRep && membership?.userId) {
      if (assignedToId !== membership.userId) setAssignedToId(membership.userId)
      return
    }
    if (!assignedToId && activeReps.length > 0) setAssignedToId(activeReps[0].id)
  }, [activeReps, assignedToId, isRep, membership])

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

    setSubmitting(true)
    try {
      await createLead({
        workspaceId,
        leadType: campaign?.campaignType ?? 'sales',
        name,
        phone,
        email,
        assignedToId,
        campaignId,
        campaignName: campaign?.name,
        source: campaign?.platform,
        clientId: campaign?.clientId,
      })
      toast.success(t.leads.createdTitle, {
        description: t.leads.createdDescription(name),
      })
      setOpen(false)
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.leads.dialogTitle}</DialogTitle>
          <DialogDescription>{t.leads.dialogDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
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
                <Input id="phone" name="phone" placeholder="+1 555 000 0000" />
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
            <Field>
              <FieldLabel>{t.leads.campaign}</FieldLabel>
              <Select value={campaignId} onValueChange={(v) => setCampaignId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.leads.campaignPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {campaigns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name} · {PLATFORM_LABELS[c.platform]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>{t.leads.assignTo}</FieldLabel>
              <Select value={assignedToId} onValueChange={(v) => setAssignedToId(v ?? "")} disabled={isRep}>
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
