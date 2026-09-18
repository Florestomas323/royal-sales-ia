"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { emptyTrash } from "@/lib/firebase/leads"
import { describeError } from "@/lib/firebase/errors"
import { t } from "@/lib/i18n"

const CONFIRM_WORD = "VACIAR"

interface EmptyTrashDialogProps {
  workspaceId: string
  workspaceName: string
  archivedCount: number
  /** Only Distribuidor, Asistente and super admin see the button at all. */
  canEmpty: boolean
}

/**
 * "Vaciar papelera": permanent deletion of the archived prospects of ONE
 * workspace.
 *
 * The button is only rendered inside the trash view and only for roles that
 * may act; the server checks the role again, so hiding it here is convenience,
 * not security. Confirmation requires typing VACIAR exactly, and the request
 * is guarded against double clicks.
 */
export function EmptyTrashDialog({ workspaceId, workspaceName, archivedCount, canEmpty }: EmptyTrashDialogProps) {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const [busy, setBusy] = useState(false)

  // Reopening must never inherit a half-typed confirmation.
  useEffect(() => {
    if (!open) {
      setTyped("")
      setBusy(false)
    }
  }, [open])

  if (!canEmpty) return null

  const matches = typed.trim() === CONFIRM_WORD

  async function handleConfirm() {
    // Double-click guard: the second click finds `busy` already true.
    if (!matches || busy) return
    setBusy(true)
    try {
      const result = await emptyTrash(workspaceId)
      // Order matters: a partial result with deletedCount === 0 must NOT be
      // reported as "already empty". Incompleteness is checked first.
      if (!result.success || result.partial) {
        toast.warning(t.leads.emptyTrash.partial(result.deletedCount, result.pendingCount), {
          description: t.leads.emptyTrash.partialHint,
        })
        // The modal stays OPEN so the person can retry straight away; the
        // operation is idempotent and finishes whatever is left.
        setBusy(false)
        return
      }
      if (result.deletedCount === 0) {
        toast.info(t.leads.emptyTrash.alreadyEmpty)
      } else {
        toast.success(t.leads.emptyTrash.done(result.deletedCount))
      }
      setOpen(false)
    } catch (err) {
      // The dialog stays open so the person can retry safely: the operation
      // is idempotent, a second run deletes whatever is left.
      toast.error(t.leads.emptyTrash.error, { description: describeError(err).message })
      setBusy(false)
    }
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={archivedCount === 0}
        className="h-11 w-full border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive sm:h-9 sm:w-auto"
      >
        <Trash2 className="size-3.5" data-icon="inline-start" />
        {t.leads.emptyTrash.actionFor(workspaceName, archivedCount)}
      </Button>

      <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v) }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t.leads.emptyTrash.title}</DialogTitle>
            <DialogDescription className="text-pretty">
              {t.leads.emptyTrash.warning(archivedCount, workspaceName)}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <label className="text-sm text-muted-foreground" htmlFor="empty-trash-confirm">
              {t.leads.emptyTrash.confirmLabel}
            </label>
            <Input
              id="empty-trash-confirm"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={CONFIRM_WORD}
              autoComplete="off"
              autoCapitalize="characters"
              disabled={busy}
              className="h-11 sm:h-9"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy} className="h-11 sm:h-9">
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirm}
              disabled={!matches || busy}
              className="h-11 sm:h-9"
            >
              {busy ? t.leads.emptyTrash.working : t.leads.emptyTrash.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
