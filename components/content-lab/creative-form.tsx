"use client"

import { useMemo, useState } from "react"
import { Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { t } from "@/lib/i18n"
import {
  CHANNELS, FORMATS, TONES, intentsFor,
  type ContentChannel, type ContentFormat, type ContentIntent,
  type ContentObjective, type ContentTone, type CreativeBrief,
} from "@/lib/content-lab/types"
import type { Campaign } from "@/types"

const f = t.modules.contentLab.form
const c = t.modules.contentLab

/**
 * Mobile-first brief. One column on a phone, two from `sm`, 44px controls and
 * 16px inputs so iOS does not zoom. No horizontal scrolling anywhere.
 */
export function CreativeForm({
  campaigns,
  busy,
  workspaceMissing,
  onGenerate,
}: {
  campaigns: Campaign[]
  busy: boolean
  /** Super admin viewing every workspace must pick one first. */
  workspaceMissing: boolean
  onGenerate: (brief: CreativeBrief, sourceCampaignId: string | null) => void
}) {
  const [objective, setObjective] = useState<ContentObjective>("sales")
  const [campaignId, setCampaignId] = useState<string>("")
  const [intent, setIntent] = useState<ContentIntent>("product")
  const [subject, setSubject] = useState("")
  const [offer, setOffer] = useState("")
  const [audience, setAudience] = useState("")
  const [market, setMarket] = useState("")
  const [notes, setNotes] = useState("")
  const [tone, setTone] = useState<ContentTone>("close")
  const [channel, setChannel] = useState<ContentChannel>("instagram")
  const [format, setFormat] = useState<ContentFormat>("reel")
  const [error, setError] = useState<string | null>(null)

  const intents = useMemo(() => intentsFor(objective), [objective])
  // Sales and recruiting never share intents; switching resets to a valid one.
  const scoped = useMemo(() => campaigns.filter((k) => k.objective === objective), [campaigns, objective])

  function switchObjective(next: ContentObjective) {
    setObjective(next)
    setIntent(intentsFor(next)[0])
    setCampaignId("")
  }

  function submit() {
    if (busy) return
    if (subject.trim().length === 0) {
      setError(f.subjectRequired)
      return
    }
    setError(null)
    onGenerate(
      {
        objective, intent, subject: subject.trim(),
        offer: offer.trim() || undefined,
        audience: audience.trim() || undefined,
        market: market.trim() || undefined,
        notes: notes.trim() || undefined,
        tone, channel, format,
      },
      campaignId || null,
    )
  }

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 pt-6">
        {/* Objective: two big touch targets, never a dropdown. */}
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium">{f.objective}</span>
          <div className="grid grid-cols-2 gap-2">
            {(["sales", "recruiting"] as ContentObjective[]).map((o) => (
              <Button
                key={o}
                type="button"
                variant={objective === o ? "default" : "outline"}
                className="h-11"
                onClick={() => switchObjective(o)}
              >
                {o === "sales" ? f.sales : f.recruiting}
              </Button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="cl-campaign">{f.origin}</FieldLabel>
            <Select value={campaignId || "__none__"} onValueChange={(v) => setCampaignId(v === "__none__" ? "" : (v ?? ""))}>
              <SelectTrigger id="cl-campaign" className="h-11 sm:h-9">
                <SelectValue>
                  {(v: string) => (v === "__none__" ? f.fromScratch : scoped.find((k) => k.id === v)?.name ?? f.fromScratch)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[60svh]">
                <SelectItem value="__none__">{f.fromScratch}</SelectItem>
                {scoped.map((k) => (
                  <SelectItem key={k.id} value={k.id}>{k.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="cl-intent">{f.intent}</FieldLabel>
            <Select value={intent} onValueChange={(v) => v && setIntent(v as ContentIntent)}>
              <SelectTrigger id="cl-intent" className="h-11 sm:h-9">
                <SelectValue>{(v: string) => t.modules.contentLab.intents[v as ContentIntent]}</SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-[60svh]">
                {intents.map((i) => (
                  <SelectItem key={i} value={i}>{t.modules.contentLab.intents[i]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field data-invalid={!!error || undefined}>
          <FieldLabel htmlFor="cl-subject">{f.subject}</FieldLabel>
          <Textarea
            id="cl-subject"
            rows={3}
            value={subject}
            disabled={busy}
            placeholder={f.subjectPlaceholder}
            onChange={(e) => { setSubject(e.target.value); if (error) setError(null) }}
            className="min-h-20 text-base sm:text-sm"
          />
          {error && <FieldError>{error}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="cl-offer">{f.offer}</FieldLabel>
          <Input id="cl-offer" value={offer} disabled={busy} onChange={(e) => setOffer(e.target.value)} className="h-11 text-base sm:h-9 sm:text-sm" />
          <FieldDescription>{f.offerHint}</FieldDescription>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="cl-audience">{f.audience}</FieldLabel>
            <Input id="cl-audience" value={audience} disabled={busy} onChange={(e) => setAudience(e.target.value)} className="h-11 text-base sm:h-9 sm:text-sm" />
          </Field>
          <Field>
            <FieldLabel htmlFor="cl-market">{f.market}</FieldLabel>
            <Input id="cl-market" value={market} disabled={busy} onChange={(e) => setMarket(e.target.value)} className="h-11 text-base sm:h-9 sm:text-sm" />
          </Field>
        </div>

        <Field>
          <FieldLabel htmlFor="cl-notes">{f.notes}</FieldLabel>
          <Textarea id="cl-notes" rows={2} value={notes} disabled={busy} onChange={(e) => setNotes(e.target.value)} className="text-base sm:text-sm" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Picker id="cl-tone" label={f.tone} value={tone} options={TONES} labels={t.modules.contentLab.tones} onChange={(v) => setTone(v as ContentTone)} />
          <Picker id="cl-channel" label={f.channel} value={channel} options={CHANNELS} labels={t.modules.contentLab.channels} onChange={(v) => setChannel(v as ContentChannel)} />
          <Picker id="cl-format" label={f.format} value={format} options={FORMATS} labels={t.modules.contentLab.formats} onChange={(v) => setFormat(v as ContentFormat)} />
        </div>

        {workspaceMissing && (
          <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">{f.workspaceRequired}</p>
        )}

        <Button type="button" className="h-12 w-full gap-2 sm:h-10" disabled={busy || workspaceMissing} onClick={submit}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {busy ? f.generating : f.generate}
        </Button>
        <p className={cn("text-center text-xs text-muted-foreground")}>{c.draftNotice}</p>
      </CardContent>
    </Card>
  )
}

function Picker({
  id, label, value, options, labels, onChange,
}: {
  id: string
  label: string
  value: string
  options: readonly string[]
  labels: Record<string, string>
  onChange: (value: string) => void
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger id={id} className="h-11 sm:h-9">
          <SelectValue>{(v: string) => labels[v]}</SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-[60svh]">
          {options.map((o) => (
            <SelectItem key={o} value={o}>{labels[o]}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}
