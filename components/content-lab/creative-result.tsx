"use client"

import { useState } from "react"
import { AlertTriangle, Check, Copy, Loader2, Save, Shuffle, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { t } from "@/lib/i18n"
import { isVideoFormat, type CreativeBrief, type CreativeOutput, type OutputSource, type VariantSet, type VariantVariable } from "@/lib/content-lab/types"

const r = t.modules.contentLab.result
const c = t.modules.contentLab

const VARIABLES: VariantVariable[] = ["hook", "angle", "cta", "headline"]

/**
 * Result as collapsible blocks — never a horizontal table. Provenance is
 * always visible: an AI answer and a deterministic template look different
 * and are labelled differently.
 */
export function CreativeResult({
  brief,
  output,
  source,
  variants,
  saving,
  variantBusy,
  canSave,
  onSave,
  onVariants,
}: {
  brief: CreativeBrief
  output: CreativeOutput
  source: OutputSource
  variants: VariantSet | null
  saving: boolean
  variantBusy: boolean
  canSave: boolean
  onSave: () => void
  onVariants: (variable: VariantVariable, baseline: string) => void
}) {
  const [variable, setVariable] = useState<VariantVariable>("hook")
  const video = isVideoFormat(brief.format)

  function baselineFor(v: VariantVariable): string {
    if (v === "hook") return output.hooks[0] ?? ""
    if (v === "angle") return output.angles[0]?.name ?? ""
    if (v === "cta") return output.ctas[0] ?? ""
    return output.headline.main
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={source === "ai" ? "default" : "secondary"} className="gap-1">
          <Sparkles className="size-3" />
          {source === "ai" ? "IA" : "Plantilla sugerida"}
        </Badge>
        <span className="text-xs text-muted-foreground">{c.draftNotice}</span>
        {canSave && (
          <Button size="sm" className="ml-auto h-11 gap-1.5 sm:h-9" disabled={saving} onClick={onSave}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {saving ? r.saving : r.save}
          </Button>
        )}
      </div>

      {source === "template" && (
        <p className="flex items-start gap-2 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
          {c.templateNotice}
        </p>
      )}

      <Block title={r.strategy} defaultOpen>
        <dl className="flex flex-col gap-2 text-sm">
          <Row label={r.strategyObjective} value={output.strategy.objective} />
          <Row label={r.strategyAudience} value={output.strategy.audience} />
          <Row label={r.strategyIntent} value={output.strategy.intent} />
          <Row label={r.strategyAngle} value={output.strategy.mainAngle} />
        </dl>
      </Block>

      <Block title={r.angles}>
        <ul className="flex flex-col gap-2">
          {output.angles.map((a, i) => (
            <li key={i} className="rounded-lg bg-muted/60 px-3 py-2">
              <p className="text-sm font-medium">{a.name}</p>
              <p className="text-sm text-pretty text-muted-foreground">{a.description}</p>
            </li>
          ))}
        </ul>
      </Block>

      <Block title={r.hooks} defaultOpen>
        <ul className="flex flex-col gap-2">
          {output.hooks.map((h, i) => (
            <li key={i} className="flex items-start justify-between gap-2 rounded-lg bg-muted/60 px-3 py-2">
              <span className="text-sm text-pretty break-words">{h}</span>
              <CopyButton value={h} />
            </li>
          ))}
        </ul>
      </Block>

      <Block title={r.copy} defaultOpen action={<CopyButton value={output.copy} />}>
        <p className="text-sm text-pretty break-words whitespace-pre-wrap">{output.copy}</p>
      </Block>

      <Block title={r.descriptionField} action={<CopyButton value={output.description} />}>
        <p className="text-sm text-pretty break-words">{output.description}</p>
      </Block>

      <Block title={r.headline} action={<CopyButton value={output.headline.main} />}>
        <p className="text-sm font-medium text-pretty break-words">{output.headline.main}</p>
        <p className="mt-2 text-xs text-muted-foreground">{r.headlineVariants}</p>
        <ul className="mt-1 flex flex-col gap-1">
          {output.headline.variants.map((v, i) => (
            <li key={i} className="text-sm text-pretty break-words text-muted-foreground">{v}</li>
          ))}
        </ul>
      </Block>

      <Block title={r.ctas}>
        <ul className="flex flex-wrap gap-2">
          {output.ctas.map((cta, i) => (
            <li key={i}><Badge variant="outline" className="text-xs">{cta}</Badge></li>
          ))}
        </ul>
      </Block>

      {video && output.script.length > 0 && (
        <Block title={r.script} defaultOpen>
          <ol className="flex flex-col gap-3">
            {output.script.map((b, i) => (
              <li key={i} className="rounded-lg border p-3">
                <p className="font-mono text-xs text-muted-foreground">{b.window}</p>
                <dl className="mt-1 flex flex-col gap-1 text-sm">
                  <Row label={r.scriptSpoken} value={b.spoken} />
                  <Row label={r.scriptOnScreen} value={b.onScreen} />
                  <Row label={r.scriptVisual} value={b.visual} />
                </dl>
              </li>
            ))}
          </ol>
        </Block>
      )}

      {video && output.shotList.length > 0 && (
        <Block title={r.shotList}>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {output.shotList.map((s, i) => (
              <li key={i} className="text-sm text-pretty break-words">{s}</li>
            ))}
          </ul>
        </Block>
      )}

      <Block title={r.visual}>
        <dl className="flex flex-col gap-2 text-sm">
          <Row label={r.visualScene} value={output.visualConcept.scene} />
          <Row label={r.visualProtagonist} value={output.visualConcept.protagonist} />
          <Row label={r.visualSetting} value={output.visualConcept.setting} />
          <Row label={r.visualComposition} value={output.visualConcept.composition} />
          <Row label={r.visualLighting} value={output.visualConcept.lighting} />
          <Row label={r.visualElements} value={output.visualConcept.elements.join(", ")} />
          <Row label={r.visualOnScreen} value={output.visualConcept.onScreenText} />
          <Row label={r.visualStyle} value={output.visualConcept.style} />
        </dl>
      </Block>

      <Block title={r.prompt} action={<CopyButton value={output.visualPrompt} />}>
        <p className="rounded-lg bg-muted px-3 py-2 font-mono text-xs text-pretty break-words">{output.visualPrompt}</p>
        <p className="mt-2 text-xs text-muted-foreground">{r.promptHint}</p>
      </Block>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{r.variants}</CardTitle>
          <CardDescription>{r.variantsHint(r.variables[variable])}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Select value={variable} onValueChange={(v) => v && setVariable(v as VariantVariable)}>
              <SelectTrigger className="h-11 sm:h-9" aria-label={r.variantVariable}>
                <SelectValue>{(v: string) => r.variables[v as VariantVariable]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {VARIABLES.map((v) => (
                  <SelectItem key={v} value={v}>{r.variables[v]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-1.5 sm:h-9"
              disabled={variantBusy}
              onClick={() => onVariants(variable, baselineFor(variable))}
            >
              {variantBusy ? <Loader2 className="size-4 animate-spin" /> : <Shuffle className="size-4" />}
              {r.createVariants}
            </Button>
          </div>
          {variants && (
            <ul className="flex flex-col gap-2">
              {variants.variants.map((v) => (
                <li key={v.label} className="flex items-start gap-2 rounded-lg border px-3 py-2">
                  <Badge variant="secondary" className="shrink-0">{v.label}</Badge>
                  <span className="flex-1 text-sm text-pretty break-words">{v.value}</span>
                  <CopyButton value={v.value} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function Block({
  title, children, defaultOpen = false, action,
}: {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  action?: React.ReactNode
}) {
  return (
    <Card>
      <details open={defaultOpen} className="group">
        <summary className="flex cursor-pointer items-center justify-between gap-2 px-6 py-4 text-sm font-medium">
          {title}
          <span className="text-xs text-muted-foreground group-open:hidden">+</span>
          <span className="hidden text-xs text-muted-foreground group-open:inline">−</span>
        </summary>
        <CardContent className="pt-0">
          {action && <div className="mb-2 flex justify-end">{action}</div>}
          {children}
        </CardContent>
      </details>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 text-xs text-muted-foreground sm:w-36">{label}</dt>
      <dd className="text-pretty break-words">{value}</dd>
    </div>
  )
}

function CopyButton({ value }: { value: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="size-11 shrink-0 p-0 sm:size-8"
      aria-label={r.copyAction}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setDone(true)
          toast.success(r.copied)
          setTimeout(() => setDone(false), 1500)
        } catch {
          toast.error(r.copyAction)
        }
      }}
    >
      {done ? <Check className="size-4" /> : <Copy className="size-4" />}
    </Button>
  )
}
