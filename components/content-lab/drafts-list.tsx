"use client"

import { useState } from "react"
import { Archive, ArchiveRestore, CheckCircle2, Copy, Eye } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { describeError } from "@/lib/firebase/errors"
import { approveDraft, archiveDraft, duplicateDraft, restoreDraft } from "@/lib/content-lab/drafts"
import type { ContentDraft } from "@/lib/content-lab/types"
import { t } from "@/lib/i18n"

const d = t.modules.contentLab.drafts

/**
 * Saved drafts. A sales_rep or viewer only ever receives approved creatives
 * (enforced by Security Rules) and sees no management actions.
 */
export function DraftsList({
  drafts,
  canManage,
  canArchive,
  userId,
  onOpen,
}: {
  drafts: ContentDraft[]
  canManage: boolean
  canArchive: boolean
  userId: string | null
  onOpen: (draft: ContentDraft) => void
}) {
  const [showArchived, setShowArchived] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const visible = drafts.filter((k) => (showArchived ? true : k.status !== "archived"))

  async function act(id: string, fn: () => Promise<unknown>, message: string) {
    if (busy) return
    setBusy(id)
    try {
      await fn()
      toast.success(message)
    } catch (err) {
      toast.error(d.actionError, { description: describeError(err).message })
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{d.title}</CardTitle>
        <CardDescription>{canManage ? d.description : d.readOnly}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {canManage && drafts.some((k) => k.status === "archived") && (
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={showArchived} onCheckedChange={setShowArchived} />
            {d.showArchived}
          </label>
        )}

        {visible.length === 0 ? (
          <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
            {canManage ? d.empty : d.emptyApproved}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {visible.map((k) => (
              <li key={k.id} className="flex flex-col gap-2 rounded-xl border p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{k.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.modules.contentLab.form[k.objective === "sales" ? "sales" : "recruiting"]}
                      {" · "}
                      {t.modules.contentLab.channels[k.channel]}
                      {" · "}
                      {t.modules.contentLab.formats[k.format]}
                    </p>
                  </div>
                  <Badge variant={k.status === "approved" ? "default" : "secondary"} className="shrink-0 text-[10px]">
                    {d.status[k.status]}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="h-11 gap-1.5 sm:h-8" onClick={() => onOpen(k)}>
                    <Eye className="size-3.5" />
                    {d.open}
                  </Button>
                  {canManage && k.status === "draft" && userId && (
                    <Button
                      variant="outline" size="sm" className="h-11 gap-1.5 sm:h-8"
                      disabled={busy === k.id}
                      onClick={() => void act(k.id, () => approveDraft(k.id, userId), d.approved)}
                    >
                      <CheckCircle2 className="size-3.5" />
                      {d.approve}
                    </Button>
                  )}
                  {canManage && userId && (
                    <Button
                      variant="outline" size="sm" className="h-11 gap-1.5 sm:h-8"
                      disabled={busy === k.id}
                      onClick={() => void act(k.id, () => duplicateDraft(k, userId), d.duplicated)}
                    >
                      <Copy className="size-3.5" />
                      {d.duplicate}
                    </Button>
                  )}
                  {canArchive && k.status !== "archived" && (
                    <Button
                      variant="outline" size="sm" className="h-11 gap-1.5 sm:h-8"
                      disabled={busy === k.id}
                      onClick={() => void act(k.id, () => archiveDraft(k.id), d.archived)}
                    >
                      <Archive className="size-3.5" />
                      {d.archive}
                    </Button>
                  )}
                  {canArchive && k.status === "archived" && (
                    <Button
                      variant="outline" size="sm" className="h-11 gap-1.5 sm:h-8"
                      disabled={busy === k.id}
                      onClick={() => void act(k.id, () => restoreDraft(k.id), d.restored)}
                    >
                      <ArchiveRestore className="size-3.5" />
                      {d.restore}
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
