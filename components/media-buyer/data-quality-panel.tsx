"use client"

import { Info } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import type { DataQualityIssue } from "@/lib/media-buyer/analyzer"
import { t } from "@/lib/i18n"

const d = t.modules.mediaBuyer.dataQuality

/** Meta ↔ CRM discrepancies, reported as things to review — never as errors. */
export function DataQualityPanel({ issues }: { issues: DataQualityIssue[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{d.title}</CardTitle>
        <CardDescription>{d.description}</CardDescription>
      </CardHeader>
      <CardContent>
        {issues.length === 0 ? (
          <p className="text-sm text-muted-foreground">{d.empty}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {issues.map((issue) => (
              <li key={issue.kind} className="flex items-start gap-2 text-sm">
                <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="font-medium">{d.kinds[issue.kind]} · {issue.count}</p>
                  <p className="text-xs text-pretty break-words text-muted-foreground">{issue.detail}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
