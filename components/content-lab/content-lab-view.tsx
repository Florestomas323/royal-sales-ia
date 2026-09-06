"use client"

import { useState } from "react"
import { AlertTriangle, Lock } from "lucide-react"
import { toast } from "sonner"
import { CreativeForm } from "@/components/content-lab/creative-form"
import { CreativeResult } from "@/components/content-lab/creative-result"
import { DraftsList } from "@/components/content-lab/drafts-list"
import { Skeleton } from "@/components/ui/skeleton"
import { auth } from "@/lib/firebase/client"
import { useCampaigns } from "@/lib/firebase/collections"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { describeError } from "@/lib/firebase/errors"
import { canArchiveDrafts, canManageDrafts, createDraft, useContentDrafts } from "@/lib/content-lab/drafts"
import type {
  ContentDraft, CreativeBrief, CreativeOutput, OutputSource, VariantSet, VariantVariable,
} from "@/lib/content-lab/types"
import { t } from "@/lib/i18n"

const c = t.modules.contentLab

type Failure = keyof typeof c.failures

interface GenerateResponse {
  ok?: boolean
  kind?: "creative" | "variants"
  data?: unknown
  source?: OutputSource
  failure?: Failure | null
  error?: string
  /** Which server-side quota rejected the request, when it did. */
  quota?: "user_minute" | "workspace_day"
}

/**
 * Laboratorio de Contenido.
 *
 * The browser never talks to the AI provider: it posts the brief to
 * /api/content-lab/generate with the person's Firebase ID token, and the
 * server decides the workspace, builds the prompt and validates the answer.
 */
export function ContentLabView() {
  const { workspaceId, isSuperAdmin, role, membership, status } = useWorkspace()
  const { campaigns, loading: campaignsLoading } = useCampaigns()
  const { drafts, loading: draftsLoading, approvedOnly } = useContentDrafts()

  const [brief, setBrief] = useState<CreativeBrief | null>(null)
  const [output, setOutput] = useState<CreativeOutput | null>(null)
  const [source, setSource] = useState<OutputSource>("ai")
  const [variants, setVariants] = useState<VariantSet | null>(null)
  const [sourceCampaignId, setSourceCampaignId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [variantBusy, setVariantBusy] = useState(false)
  const [saving, setSaving] = useState(false)

  const canGenerate = canManageDrafts(role)
  // Super admin viewing every workspace must pick one before generating.
  const workspaceMissing = isSuperAdmin && !workspaceId

  async function post(body: Record<string, unknown>): Promise<GenerateResponse | null> {
    const user = auth.currentUser
    if (!user) {
      toast.error(c.aiUnavailable)
      return null
    }
    const token = await user.getIdToken()
    const res = await fetch("/api/content-lab/generate", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, workspaceId: workspaceId ?? "" }),
    })
    const json = (await res.json().catch(() => ({}))) as GenerateResponse
    if (!res.ok) {
      // Quotas are decided by the server; the UI only explains the outcome.
      if (res.status === 429) {
        toast.error(json.quota === "user_minute" ? c.quotaUser : c.quotaWorkspace)
        return null
      }
      toast.error(c.aiUnavailable, { description: json.error ?? `HTTP ${res.status}` })
      return null
    }
    return json
  }

  async function handleGenerate(next: CreativeBrief, campaignId: string | null) {
    if (busy) return
    setBusy(true)
    try {
      const json = await post({ brief: next, sourceCampaignId: campaignId ?? undefined })
      if (!json?.data) return
      // The brief is kept even on a provider failure: nothing typed is lost.
      setBrief(next)
      setSourceCampaignId(campaignId)
      setOutput(json.data as CreativeOutput)
      setSource(json.source ?? "template")
      setVariants(null)
      if (json.failure) toast.warning(c.aiUnavailable, { description: c.failures[json.failure] })
    } catch (err) {
      toast.error(c.aiUnavailable, { description: describeError(err).message })
    } finally {
      setBusy(false)
    }
  }

  async function handleVariants(variable: VariantVariable, baseline: string) {
    if (!brief || variantBusy) return
    setVariantBusy(true)
    try {
      const json = await post({ brief, variable, baseline })
      if (!json?.data) return
      setVariants(json.data as VariantSet)
      if (json.failure) toast.warning(c.aiUnavailable, { description: c.failures[json.failure] })
    } catch (err) {
      toast.error(c.aiUnavailable, { description: describeError(err).message })
    } finally {
      setVariantBusy(false)
    }
  }

  async function handleSave() {
    if (!brief || !output || saving) return
    if (!workspaceId || !membership?.userId) {
      toast.error(c.result.saveError, { description: c.form.workspaceRequired })
      return
    }
    setSaving(true)
    try {
      await createDraft({
        workspaceId,
        createdBy: membership.userId,
        objective: brief.objective,
        channel: brief.channel,
        format: brief.format,
        sourceCampaignId: sourceCampaignId ?? undefined,
        title: brief.subject.slice(0, 80),
        inputs: brief,
        output,
        outputSource: source,
        variants: variants ?? undefined,
      })
      toast.success(c.result.saved)
    } catch (err) {
      toast.error(c.result.saveError, { description: describeError(err).message })
    } finally {
      setSaving(false)
    }
  }

  function openDraft(draft: ContentDraft) {
    setBrief(draft.inputs)
    setOutput(draft.output)
    setSource(draft.outputSource)
    setVariants(draft.variants ?? null)
    setSourceCampaignId(draft.sourceCampaignId ?? null)
  }

  if (status !== "ready" || campaignsLoading || draftsLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {canGenerate ? (
        <CreativeForm
          campaigns={campaigns}
          busy={busy}
          workspaceMissing={workspaceMissing}
          onGenerate={handleGenerate}
        />
      ) : (
        <p className="flex items-start gap-2 rounded-lg border border-dashed px-4 py-4 text-sm text-muted-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" />
          {c.drafts.readOnly}
        </p>
      )}

      {approvedOnly && canGenerate && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
          {c.drafts.readOnly}
        </p>
      )}

      {brief && output && (
        <CreativeResult
          brief={brief}
          output={output}
          source={source}
          variants={variants}
          saving={saving}
          variantBusy={variantBusy}
          canSave={canGenerate && !!workspaceId}
          onSave={handleSave}
          onVariants={handleVariants}
        />
      )}

      <DraftsList
        drafts={drafts}
        canManage={canGenerate}
        canArchive={canArchiveDrafts(role)}
        userId={membership?.userId ?? null}
        onOpen={openDraft}
      />
    </div>
  )
}
