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
import { createCampaign, useClients } from "@/lib/firebase/collections"
import { CAMPAIGN_STATUS_LABELS, PLATFORM_LABELS } from "@/lib/constants"
import { t } from "@/lib/i18n"
import type { Campaign, Platform } from "@/types"

const PLATFORM_OPTIONS: Platform[] = ["meta", "google", "tiktok", "instagram", "facebook"]

const STATUS_OPTIONS: { value: Campaign["status"]; label: string }[] = [
  { value: "learning", label: CAMPAIGN_STATUS_LABELS.learning },
  { value: "active", label: CAMPAIGN_STATUS_LABELS.active },
  { value: "paused", label: CAMPAIGN_STATUS_LABELS.paused },
]

export function NewCampaignDialog() {
  const { clients } = useClients()
  const [open, setOpen] = React.useState(false)
  const [platform, setPlatform] = React.useState<Platform>("meta")
  const [clientId, setClientId] = React.useState("")
  const [status, setStatus] = React.useState<Campaign["status"]>("learning")
  const [submitting, setSubmitting] = React.useState(false)

  // Default to the first client once the live list loads.
  React.useEffect(() => {
    if (!clientId && clients.length > 0) setClientId(clients[0].id)
  }, [clients, clientId])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = (form.get("name") as string)?.trim()
    if (!name || !clientId) return

    setSubmitting(true)
    try {
      await createCampaign({ name, platform, clientId, status })
      toast.success(t.campaigns.createdTitle, {
        description: t.campaigns.createdDescription(name),
      })
      setOpen(false)
      setPlatform("meta")
      setStatus("learning")
    } catch {
      toast.error(t.campaigns.createError)
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
            {t.campaigns.newCampaign}
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.campaigns.dialogTitle}</DialogTitle>
          <DialogDescription>{t.campaigns.dialogDescription}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="campaign-name">{t.campaigns.nameLabel}</FieldLabel>
              <Input
                id="campaign-name"
                name="name"
                placeholder={t.campaigns.namePlaceholder}
                required
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t.campaigns.platformLabel}</FieldLabel>
                <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS.map((p) => (
                      <SelectItem key={p} value={p}>
                        {PLATFORM_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel>{t.campaigns.statusLabel}</FieldLabel>
                <Select
                  value={status}
                  onValueChange={(v) => setStatus(v as Campaign["status"])}
                >
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
            </div>
            <Field>
              <FieldLabel>{t.campaigns.clientLabel}</FieldLabel>
              <Select value={clientId} onValueChange={(v) => setClientId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t.campaigns.clientPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
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
            <Button type="submit" disabled={submitting}>
              {submitting ? t.common.creating : t.campaigns.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
