"use client"

import { AlertTriangle } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { describeError } from "@/lib/firebase/errors"
import { t } from "@/lib/i18n"

/**
 * Visible, non-blocking error for data subscriptions. Shows the friendly
 * message plus the raw code so support can diagnose (never swallow errors).
 */
export function DataErrorState({ error }: { error: unknown }) {
  const described = describeError(error)
  return (
    <Alert variant="destructive">
      <AlertTriangle />
      <AlertTitle>{t.tenancy.dataErrorTitle}</AlertTitle>
      <AlertDescription>
        <p>{described.message}</p>
        <p className="mt-1 font-mono text-[11px] opacity-80 break-all">{described.detail}</p>
      </AlertDescription>
    </Alert>
  )
}
