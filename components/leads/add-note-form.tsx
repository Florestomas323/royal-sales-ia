"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Loader2, StickyNote } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { addNote, type ActorContext } from "@/lib/firebase/activities"
import { describeError } from "@/lib/firebase/errors"
import { t } from "@/lib/i18n"
import type { Lead } from "@/types"

/**
 * Internal note. Nothing on the lead changes, so this is the only activity
 * written on its own. Success is reported only after Firestore confirms; a
 * failure keeps the text so nothing is lost.
 */
export function AddNoteForm({ lead, actor }: { lead: Lead; actor: ActorContext }) {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    if (saving) return // double-tap guard
    if (!note.trim()) {
      toast.error(t.leads.detail.noteEmpty)
      return
    }
    setSaving(true)
    try {
      await addNote(lead, actor, note)
      toast.success(t.leads.detail.noteSaved)
      setNote("")
      setOpen(false)
    } catch (err) {
      toast.error(t.leads.detail.noteError, { description: describeError(err).message })
    } finally {
      setSaving(false)
    }
  }

  if (!open) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="h-11 w-full gap-1.5 sm:h-9"
        onClick={() => setOpen(true)}
      >
        <StickyNote className="size-3.5" data-icon="inline-start" />
        {t.leads.detail.addNote}
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Textarea
        autoFocus
        rows={3}
        value={note}
        disabled={saving}
        onChange={(e) => setNote(e.target.value)}
        placeholder={t.leads.detail.notePlaceholder}
        className="min-h-24 text-base sm:text-sm"
      />
      <div className="flex gap-2">
        <Button
          variant="outline"
          size="sm"
          className="h-11 flex-1 sm:h-9"
          disabled={saving}
          onClick={() => {
            setOpen(false)
            setNote("")
          }}
        >
          {t.common.cancel}
        </Button>
        <Button
          size="sm"
          className="h-11 flex-1 sm:h-9"
          disabled={saving || note.trim().length === 0}
          onClick={handleSave}
        >
          {saving && <Loader2 className="animate-spin" data-icon="inline-start" />}
          {saving ? t.common.saving : t.leads.detail.noteSave}
        </Button>
      </div>
    </div>
  )
}
