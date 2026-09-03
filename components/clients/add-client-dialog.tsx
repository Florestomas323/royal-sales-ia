"use client"

import * as React from "react"
import { toast } from "sonner"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createClient } from "@/lib/firebase/collections"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { describeError } from "@/lib/firebase/errors"
import { CLIENT_STATUS_LABELS } from "@/lib/constants"
import { t } from "@/lib/i18n"
import type { ClientStatus } from "@/types"

const STATUS_OPTIONS: { value: ClientStatus; label: string }[] = [
  { value: "onboarding", label: CLIENT_STATUS_LABELS.onboarding },
  { value: "active", label: CLIENT_STATUS_LABELS.active },
  { value: "paused", label: CLIENT_STATUS_LABELS.paused },
]

export function AddClientDialog() {
  const { workspaceId } = useWorkspace()
  const [open, setOpen] = React.useState(false)
  const [status, setStatus] = React.useState<ClientStatus>("onboarding")
  const [submitting, setSubmitting] = React.useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = (form.get("name") as string)?.trim()
    const industry = (form.get("industry") as string)?.trim()
    if (!name) return
    if (!workspaceId) {
      toast.error(t.common.selectWorkspaceFirst)
      return
    }

    setSubmitting(true)
    try {
      await createClient({ workspaceId, name, industry, status })
      toast.success(t.clients.createdTitle, {
        description: t.clients.createdDescription(name),
      })
      setOpen(false)
      setStatus("onboarding")
    } catch (err) {
      toast.error(t.clients.createError, { description: describeError(err).message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm">
            <Plus data-icon="inline-start" />
            {t.clients.addClient}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.clients.dialogTitle}</DialogTitle>
          <DialogDescription>{t.clients.dialogDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="client-name">{t.clients.nameLabel}</FieldLabel>
              <Input
                id="client-name"
                name="name"
                placeholder={t.clients.namePlaceholder}
                required
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="client-industry">{t.clients.industryLabel}</FieldLabel>
              <Input
                id="client-industry"
                name="industry"
                placeholder={t.clients.industryPlaceholder}
              />
            </Field>
            <Field>
              <FieldLabel>{t.clients.statusLabel}</FieldLabel>
              <Select value={status} onValueChange={(v) => setStatus(v as ClientStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
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
              {submitting ? t.common.creating : t.clients.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
