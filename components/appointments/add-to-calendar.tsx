"use client"

import { useState } from "react"
import { CalendarPlus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { buildGoogleCalendarUrl, buildIcs, icsFileName } from "@/lib/calendar-export"
import { t } from "@/lib/i18n"
import type { Appointment } from "@/types"

const c = t.modules.calendar.addToCalendar

/**
 * Exports the meeting to the person's own calendar. Apple gets a .ics file,
 * Google its pre-filled form. Neither is a sync: the person confirms the
 * event themselves, so the copy never claims it was added automatically.
 */
export function AddToCalendar({
  appointment,
  size = "sm",
  className,
}: {
  appointment: Appointment
  size?: "sm" | "default"
  className?: string
}) {
  const [open, setOpen] = useState(false)

  function downloadIcs() {
    try {
      const blob = new Blob([buildIcs(appointment)], { type: "text/calendar;charset=utf-8" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = icsFileName(appointment)
      document.body.appendChild(a)
      a.click()
      a.remove()
      // Revoked late so iOS has time to hand the file to the system sheet.
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      toast.success(c.appleDone, { description: c.appleHint })
    } catch {
      toast.error(c.error)
    }
    setOpen(false)
  }

  function openGoogle() {
    window.open(buildGoogleCalendarUrl(appointment), "_blank", "noopener,noreferrer")
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size={size} className={className ?? "h-11 gap-1.5 sm:h-8"}>
            <CalendarPlus className="size-3.5" data-icon="inline-start" />
            {c.label}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-56 p-1.5">
        <p className="px-2 pb-1.5 pt-1 text-xs text-muted-foreground text-pretty">{c.hint}</p>
        <Button variant="ghost" className="h-11 w-full justify-start sm:h-9" onClick={downloadIcs}>
          {c.apple}
        </Button>
        <Button variant="ghost" className="h-11 w-full justify-start sm:h-9" onClick={openGoogle}>
          {c.google}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
