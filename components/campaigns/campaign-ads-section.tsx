"use client"

import { ExternalLink } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { PlatformMark } from "@/components/shared/platform-badge"
import { PLATFORM_LABELS } from "@/lib/constants"
import { t } from "@/lib/i18n"
import type { CampaignAd, MergedCampaign } from "@/lib/campaigns/merged"

const a = t.campaigns.ads

/**
 * The ads behind each campaign, as seen in the attribution of real leads.
 * "Ver anuncio" appears only when a lead carried a real link; an id alone
 * never becomes a button, so nothing here can point at a broken URL.
 */
export function CampaignAdsSection({
  campaigns,
  ads,
}: {
  campaigns: MergedCampaign[]
  ads: Map<string, CampaignAd[]>
}) {
  const withAds = campaigns.filter((c) => (ads.get(c.id)?.length ?? 0) > 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{a.title}</CardTitle>
        <CardDescription className="text-pretty">{a.description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {withAds.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground text-pretty">
            {a.empty}
          </p>
        ) : (
          withAds.map((c) => (
            <div key={c.id} className="flex flex-col gap-2">
              <p className="text-sm font-medium text-pretty">{c.name}</p>
              <ul className="flex flex-col gap-2">
                {ads.get(c.id)!.map((ad) => (
                  <li
                    key={ad.id}
                    className="flex flex-col gap-2 rounded-lg border px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <PlatformMark platform={ad.platform} />
                      <div className="min-w-0">
                        <p className="truncate text-sm">{ad.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {PLATFORM_LABELS[ad.platform]}
                          {ad.adSet ? ` · ${ad.adSet}` : ""}
                          {` · ${a.leads(ad.leads)}`}
                        </p>
                      </div>
                    </div>
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
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
}
