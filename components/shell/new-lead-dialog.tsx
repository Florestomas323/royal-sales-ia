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

export function NewLeadDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = React.useState(false)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const name =
      (new FormData(e.currentTarget).get('name') as string) || 'New lead'
    toast.success('Lead created', {
      description: `${name} was added to New Lead. (Mock action — no data is persisted yet.)`,
    })
    setOpen(false)
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
            Manually add a lead to the pipeline. This is a mock action for
            Phase 1.
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
              <Select defaultValue={campaigns[0].id}>
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
              <Select defaultValue={users[1].id}>
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
            <Button type="submit">Create lead</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
