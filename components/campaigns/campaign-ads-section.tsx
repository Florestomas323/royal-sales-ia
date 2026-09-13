"use client"

import { AlertTriangle, ExternalLink, Loader2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AD_STATUS_LABELS, type AdStatusKind } from "@/lib/meta/ads"
import { useCampaignAds } from "@/lib/meta/use-campaign-ads"
import { t } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const a = t.campaigns.ads

/** Colour per bucket, reusing the app's semantic tokens. */
const STATUS_STYLES: Record<AdStatusKind, string> = {
  active: "border-transparent bg-[var(--success)]/15 text-[var(--success)]",
  paused: "border-transparent bg-[var(--warning)]/15 text-[var(--warning)]",
  archived: "border-transparent bg-muted text-muted-foreground",
  other: "border-transparent bg-muted text-muted-foreground",
}

/**
 * The ads that really exist inside one Meta campaign, read live from the
 * Graph API through the server — not derived from leads, so an ad with zero
 * prospects still shows. Paused and archived ads are included on purpose: a
 * campaign should not look empty the moment somebody pauses it.
 *
 * A Meta failure degrades to a message inside this card; the rest of the
 * Campañas page keeps working.
 */
export function CampaignAdsSection({
  metaCampaignId,
  campaignName,
}: {
  metaCampaignId: string | null
  campaignName: string
}) {
  const { ads, loading, errorCode, reload } = useCampaignAds(metaCampaignId)

  if (!metaCampaignId) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base text-pretty">{a.title}</CardTitle>
        <CardDescription className="text-pretty">
          {campaignName} · {a.description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {loading ? (
          <p className="flex items-center justify-center gap-2 px-4 py-8 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {a.loading}
          </p>
        ) : errorCode ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed px-4 py-8 text-center">
            <AlertTriangle className="size-5 text-muted-foreground" />
            <p className="text-sm text-pretty text-muted-foreground">
              {errorCode === "no_ad_account" ? a.noAdAccount : a.error}
            </p>
            {errorCode !== "no_ad_account" && (
              <Button variant="outline" size="sm" onClick={reload} className="h-9">
                {a.retry}
              </Button>
            )}
          </div>
        ) : ads.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground text-pretty">
            {a.empty}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {ads.map((ad) => (
              <li
                key={ad.id}
                className="flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-medium">{ad.name}</span>
                    <Badge className={cn("shrink-0 text-[10px]", STATUS_STYLES[ad.statusKind])}>
                      {AD_STATUS_LABELS[ad.statusKind]}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {a.adId}: <code className="font-mono">{ad.id}</code>
                    {ad.adSetName ? ` · ${a.adSet}: ${ad.adSetName}` : ""}
                    {ad.adSetId ? ` (${ad.adSetId})` : ""}
                  </p>
                </div>
                {/* Only when Meta itself returned a link. */}
                {ad.url ? (
                  <a
                    href={ad.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm hover:bg-muted"
                  >
                    {a.viewAd}
                    <ExternalLink className="size-3.5" />
                  </a>
                ) : (
                  <Badge variant="outline" className="shrink-0 text-[10px]">{a.noLink}</Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
