"use client"

import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { AD_STATUS_LABELS } from "@/lib/meta/ads"
import { ctaLabel } from "@/lib/meta/creative"
import { useAdPreview } from "@/lib/meta/use-ad-preview"
import { t } from "@/lib/i18n"

const p = t.campaigns.ads.preview
const a = t.campaigns.ads

/**
 * In-app preview of one ad: the creative Meta returned, rendered here. Opens
 * nothing external on its own; the shareable link, when Meta gave one, is a
 * secondary button and nothing more.
 *
 * Every piece is optional. A creative without media shows a placeholder for
 * the media and still shows its text; one without text shows the media and
 * says there is no text. Nothing is invented to fill a gap.
 */
export function AdPreviewDialog({
  open,
  onOpenChange,
  adId,
  metaCampaignId,
  campaignName,
  adSetName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  adId: string
  metaCampaignId: string
  campaignName: string
  adSetName: string | null
}) {
  const { preview, loading, errorCode, detail } = useAdPreview({ adId, metaCampaignId }, open)
  const cta = ctaLabel(preview?.cta ?? null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-pretty">{preview?.adName ?? p.title}</DialogTitle>
          <DialogDescription className="text-pretty">
            {p.campaign}: {campaignName}
            {adSetName ? ` · ${p.adSet}: ${adSetName}` : ""}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {p.loading}
          </p>
        ) : errorCode || !preview ? (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-10 text-center">
            <AlertTriangle className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{p.unavailable}</p>
            {errorCode && <p className="font-mono text-xs text-muted-foreground">{a.errorWithCode(errorCode)}</p>}
            {detail && <p className="font-mono text-xs text-muted-foreground">{detail}</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="secondary">{AD_STATUS_LABELS[preview.statusKind]}</Badge>
              <span>
                {a.adId}: <code className="font-mono">{preview.adId}</code>
              </span>
            </div>

            {/* Media: video when playable, image otherwise, placeholder when neither. */}
            <div className="overflow-hidden rounded-lg border bg-muted">
              {preview.videoUrl ? (
                <video
                  src={preview.videoUrl}
                  poster={preview.imageUrl ?? undefined}
                  controls
                  playsInline
                  className="aspect-video w-full bg-black"
                />
              ) : preview.imageUrl ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={preview.imageUrl} alt="" className="max-h-[50svh] w-full object-contain" />
                  {preview.kind === "video" && (
                    <p className="border-t px-3 py-2 text-xs text-muted-foreground text-pretty">{p.videoUnavailable}</p>
                  )}
                </>
              ) : (
                <p className="px-4 py-10 text-center text-sm text-muted-foreground text-pretty">{p.mediaUnavailable}</p>
              )}
            </div>

            {/* Copy, as it runs: body, then headline and description. */}
            {preview.body || preview.title || preview.description ? (
              <div className="flex flex-col gap-1">
                {preview.body && <p className="whitespace-pre-line text-sm text-pretty">{preview.body}</p>}
                {preview.title && <p className="text-sm font-semibold text-pretty">{preview.title}</p>}
                {preview.description && <p className="text-xs text-muted-foreground text-pretty">{preview.description}</p>}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{p.noText}</p>
            )}

            {(cta || preview.linkUrl) && (
              <div className="flex flex-col gap-1 rounded-lg border px-3 py-2">
                {cta && <span className="text-sm font-medium">{cta}</span>}
                {preview.linkUrl && (
                  <span className="truncate text-xs text-muted-foreground">
                    {p.destination}: {preview.linkUrl}
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              {/* Secondary only: Meta's own link, when it exists. */}
              {preview.shareableLink && (
                <Button
                  variant="outline"
                  className="h-11 sm:h-9"
                  render={<a href={preview.shareableLink} target="_blank" rel="noopener noreferrer" />}
                >
                  {p.openInMeta}
                  <ExternalLink className="size-3.5" />
                </Button>
              )}
              <Button className="h-11 sm:h-9" onClick={() => onOpenChange(false)}>
                {p.close}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
