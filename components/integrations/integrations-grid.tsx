"use client"

import { useState } from "react"
import { Check, Plug } from "lucide-react"
import { integrations as seed, type IntegrationCard } from "@/lib/mock-data/integrations"
import { PlatformMark } from "@/components/shared/platform-badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { t } from "@/lib/i18n"
import type { Platform } from "@/types"

const KNOWN_PLATFORMS: Platform[] = ["meta", "tiktok", "google", "whatsapp", "instagram", "facebook"]

function isPlatform(id: string): id is Platform {
  return (KNOWN_PLATFORMS as string[]).includes(id)
}

export function IntegrationsGrid() {
  const [items, setItems] = useState<IntegrationCard[]>(seed)

  function toggle(id: string) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id || item.status === "coming_soon") return item
        const next = item.status === "connected" ? "not_connected" : "connected"
        toast[next === "connected" ? "success" : "message"](
          next === "connected"
            ? t.integrations.connectedToast(item.name)
            : t.integrations.disconnectedToast(item.name),
        )
        return { ...item, status: next }
      }),
    )
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => {
        const connected = item.status === "connected"
        const comingSoon = item.status === "coming_soon"
        return (
          <Card key={item.id} className="gap-0">
            <CardHeader className="gap-0">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {isPlatform(item.id) ? (
                    <PlatformMark platform={item.id} className="size-10 rounded-lg" />
                  ) : (
                    <div
                      className="flex size-10 items-center justify-center rounded-lg text-white"
                      style={{ backgroundColor: item.accent }}
                    >
                      <Plug className="size-5" />
                    </div>
                  )}
                  <div>
                    <p className="font-medium leading-tight">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.category}</p>
                  </div>
                </div>
                {connected && (
                  <Badge className="gap-1">
                    <Check className="size-3" />
                    {t.integrations.connected}
                  </Badge>
                )}
                {comingSoon && <Badge variant="outline">{t.integrations.soon}</Badge>}
              </div>
            </CardHeader>
            <CardContent className="mt-3 flex flex-1 flex-col justify-between gap-4">
              <p className="text-sm text-pretty text-muted-foreground">{item.description}</p>
              <Button
                variant={connected ? "outline" : "default"}
                size="sm"
                disabled={comingSoon}
                onClick={() => toggle(item.id)}
                className="w-full"
              >
                {comingSoon
                  ? t.integrations.comingSoon
                  : connected
                    ? t.integrations.disconnect
                    : t.integrations.connect}
              </Button>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
