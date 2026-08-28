import type { LucideIcon } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { PageHeader } from "@/components/shared/page-header"

interface Feature {
  title: string
  description: string
}

interface ModulePlaceholderProps {
  title: string
  description: string
  icon: LucideIcon
  blurb: string
  features: Feature[]
}

export function ModulePlaceholder({
  title,
  description,
  icon: Icon,
  blurb,
  features,
}: ModulePlaceholderProps) {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={description}
        actions={<Badge variant="secondary">Phase 2</Badge>}
      />

      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon" className="size-12 [&_svg:not([class*='size-'])]:size-6">
            <Icon />
          </EmptyMedia>
          <EmptyTitle className="text-base">{title} is on the roadmap</EmptyTitle>
          <EmptyDescription>{blurb}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="max-w-xl">
          <div className="grid w-full gap-3 sm:grid-cols-2">
            {features.map((f) => (
              <div
                key={f.title}
                className="rounded-lg border bg-card p-4 text-left"
              >
                <p className="text-sm font-medium">{f.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </EmptyContent>
      </Empty>
    </div>
  )
}
