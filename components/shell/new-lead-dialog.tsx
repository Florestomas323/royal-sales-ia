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
import { campaigns, users } from '@/lib/mock-data'
import { PLATFORM_LABELS } from '@/lib/constants'
import { createLead } from '@/lib/firebase/leads'

export function NewLeadDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)
  const [campaignId, setCampaignId] = React.useState(campaigns[0].id)
  const [assignedToId, setAssignedToId] = React.useState(users[1].id)
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = (form.get('name') as string)?.trim() || 'Nuevo lead'
    const phone = (form.get('phone') as string)?.trim()
    const email = (form.get('email') as string)?.trim()
    const campaign = campaigns.find((c) => c.id === campaignId)

    setSubmitting(true)
    try {
      await createLead({
        name,
        phone,
        email,
        assignedToId,
        campaignId,
        campaignName: campaign?.name,
        source: campaign?.platform,
        clientId: campaign?.clientId,
      })
      toast.success('Lead creado', {
        description: `${name} se añadió a Nuevo Lead.`,
      })
      setOpen(false)
    } catch {
      toast.error('No se pudo crear el lead. Inténtalo de nuevo.')
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
              New Lead
            </Button>
          )
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New lead</DialogTitle>
          <DialogDescription>
            Añade un lead manualmente al pipeline. Se guarda en tiempo real.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="name">Full name</FieldLabel>
              <Input id="name" name="name" placeholder="e.g. Marta Díaz" required />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel htmlFor="phone">Phone</FieldLabel>
                <Input id="phone" name="phone" placeholder="+34 600 000 000" />
              </Field>
              <Field>
                <FieldLabel htmlFor="email">Email</FieldLabel>
                <Input id="email" name="email" type="email" placeholder="name@email.com" />
              </Field>
            </div>
            <Field>
              <FieldLabel>Campaign</FieldLabel>
              <Select value={campaignId} onValueChange={setCampaignId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select campaign" />
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
              <FieldLabel>Assign to</FieldLabel>
              <Select value={assignedToId} onValueChange={setAssignedToId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select rep" />
                </SelectTrigger>
                <SelectContent>
                  {users
                    .filter((u) => u.status === 'active')
                    .map((u) => (
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
              Cancel
            </DialogClose>
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Creando…' : 'Create lead'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
