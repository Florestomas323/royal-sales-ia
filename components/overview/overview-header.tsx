"use client"

import { PageHeader } from "@/components/shared/page-header"
import { DemoDataBadge } from "@/components/shared/demo-data-badge"
import { useWorkspace } from "@/lib/firebase/workspace-context"
import { t } from "@/lib/i18n"

export function OverviewHeader() {
  const { currentUser } = useWorkspace()
  const firstName = currentUser.name.split(" ")[0]
  return (
    <PageHeader
      title={t.overview.welcome(firstName)}
      description={t.overview.description}
      actions={<DemoDataBadge />}
    />
  )
}
