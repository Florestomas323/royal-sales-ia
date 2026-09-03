import type { ReactNode } from "react"
import { DemoDataBadge } from "@/components/shared/demo-data-badge"

/**
 * Wraps a widget that still renders illustrative data from lib/mock-data so
 * the user can never mistake it for real numbers. Remove the wrapper when the
 * widget is connected to Firestore.
 */
export function MockWidget({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <DemoDataBadge className="absolute top-3 right-3 z-10 bg-card" />
      {children}
    </div>
  )
}
