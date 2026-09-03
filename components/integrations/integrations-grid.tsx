"use client"

import Link from "next/link"
import { Check } from "lucide-react"
import { INTEGRATIONS, type IntegrationDefinition } from "@/lib/integrations/catalog"
import { useMetaConnection } from "@/lib/integrations/meta"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { PlatformMark } from "@/components/shared/platform-badge"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { t } from "@/lib/i18n"
import type { ConnectionStatus } from "@/types"

/**
 * Catalog of integrations with the REAL connection status of the active
 * workspace. Nothing here can flip a card to "Conectado": that state only
 * comes from a persisted connection written by the server-side OAuth flow.
 */
export function IntegrationsGrid() {
  const { workspaceId } = useWorkspace()
  const meta = useMetaConnection(workspaceId)

  function statusFor(def: IntegrationDefinition): ConnectionStatus | null {
    if (def.availability !== "available") return null
    if (def.provider === "meta_ads") return meta.status
    return "not_connected"
  }

  return (
    <div className="flex flex-col gap-4">
      {!workspaceId && (
        <p className="text-sm text-muted-foreground">{t.integrations.selectWorkspace}</p>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {INTEGRATIONS.map((def) => {
          const status = statusFor(def)
          const connected = status === "connected"
          const available = def.availability === "available"
          return (
            <Card key={def.provider} className="gap-0">
              <CardHeader className="gap-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <PlatformMark platform={def.platform} className="size-10 rounded-lg" />
                    <div>
                      <p className="font-medium leading-tight">{def.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.integrations.categories[def.category]}
                      </p>
                    </div>
                  </div>
                  <StatusBadge availability={def.availability} status={status} />
                </div>
              </CardHeader>
              <CardContent className="mt-3 flex flex-1 flex-col justify-between gap-4">
                <p className="text-sm text-pretty text-muted-foreground">{def.description}</p>
                {available && def.manageHref ? (
                  <Button
                    variant={connected ? "outline" : "default"}
                    size="sm"
                    className="w-full"
                    disabled={!workspaceId}
                    nativeButton={false}
                    render={<Link href={def.manageHref} />}
                  >
                    {connected ? t.integrations.manage : t.integrations.connect(def.name.split(" ")[0])}
                  </Button>
                ) : (
                  <Button variant="outline" size="sm" className="w-full" disabled>
                    {def.availability === "unavailable"
                      ? t.integrations.unavailable
                      : t.integrations.comingSoon}
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}

function StatusBadge({
  availability,
  status,
}: {
  availability: IntegrationDefinition["availability"]
  status: ConnectionStatus | null
}) {
  if (availability === "coming_soon") {
    return <Badge variant="outline">{t.integrations.status.coming_soon}</Badge>
  }
  if (availability === "unavailable") {
    return <Badge variant="outline">{t.integrations.status.unavailable}</Badge>
  }
  if (status === "connected") {
    return (
      <Badge className="gap-1">
        <Check className="size-3" />
        {t.integrations.status.connected}
      </Badge>
    )
  }
  if (status === "expired" || status === "error") {
    return <Badge variant="destructive">{t.integrations.status[status]}</Badge>
  }
  return <Badge variant="secondary">{t.integrations.status.not_connected}</Badge>
}
