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
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { describeError } from "@/lib/firebase/errors"
import { CAMPAIGN_OBJECTIVE_LABELS, CAMPAIGN_STATUS_LABELS, LEAD_TYPES, PLATFORM_LABELS } from "@/lib/constants"
import { FieldDescription } from "@/components/ui/field"
import { t } from "@/lib/i18n"
import type { Campaign, LeadType, Platform } from "@/types"

const PLATFORM_OPTIONS: Record<LeadType, Platform[]> = {
  sales: ["meta", "facebook", "instagram", "tiktok", "google", "youtube", "whatsapp", "web", "landing_page"],
  recruiting: ["indeed", "meta", "facebook", "instagram", "tiktok", "google", "youtube", "web", "landing_page"],
}

const STATUS_OPTIONS: { value: Campaign["status"]; label: string }[] = [
  { value: "learning", label: CAMPAIGN_STATUS_LABELS.learning },
  { value: "active", label: CAMPAIGN_STATUS_LABELS.active },
  { value: "paused", label: CAMPAIGN_STATUS_LABELS.paused },
]

export function NewCampaignDialog() {
  const { clients } = useClients()
  const { workspaceId } = useWorkspace()
  const [open, setOpen] = React.useState(false)
  const [objective, setObjective] = React.useState<LeadType>("sales")
  const [platform, setPlatform] = React.useState<Platform>("meta")
  const [clientId, setClientId] = React.useState("")
  const [status, setStatus] = React.useState<Campaign["status"]>("learning")
  const [submitting, setSubmitting] = React.useState(false)

  // Keep the platform valid for the objective (Indeed is recruiting-only).
  React.useEffect(() => {
    if (!PLATFORM_OPTIONS[objective].includes(platform)) setPlatform("meta")
  }, [objective, platform])

  // Default to the first client once the live list loads.
  React.useEffect(() => {
    if (!clientId && clients.length > 0) setClientId(clients[0].id)
  }, [clients, clientId])

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const name = (form.get("name") as string)?.trim()
    if (!name || !clientId) return
    if (!workspaceId) {
      toast.error(t.common.selectWorkspaceFirst)
      return
    }

    setSubmitting(true)
    try {
      await createCampaign({ workspaceId, name, platform, clientId, status, objective })
      toast.success(t.campaigns.createdTitle, {
        description: t.campaigns.createdDescription(name),
      })
      setOpen(false)
      setObjective("sales")
      setPlatform("meta")
      setStatus("learning")
    } catch (err) {
      toast.error(t.campaigns.createError, { description: describeError(err).message })
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
            <Field>
              <FieldLabel>{t.campaigns.objectiveLabel}</FieldLabel>
              <Select value={objective} onValueChange={(v) => setObjective((v ?? "sales") as LeadType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LEAD_TYPES.map((o) => (
                    <SelectItem key={o} value={o}>
                      {CAMPAIGN_OBJECTIVE_LABELS[o]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldDescription>{t.campaigns.objectiveHint}</FieldDescription>
            </Field>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field>
                <FieldLabel>{t.campaigns.platformLabel}</FieldLabel>
                <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PLATFORM_OPTIONS[objective].map((p) => (
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
            <Button type="submit" disabled={submitting || !workspaceId}>
              {submitting ? t.common.creating : t.campaigns.create}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
