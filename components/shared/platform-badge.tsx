import { cn } from '@/lib/utils'
import { PLATFORM_COLOR, PLATFORM_LABELS, PLATFORM_MARK } from '@/lib/constants'
import type { Platform } from '@/types'

export function PlatformMark({
  platform,
  className,
}: {
  platform: Platform
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-white',
        className,
      )}
      style={{ backgroundColor: PLATFORM_COLOR[platform] }}
      aria-hidden="true"
    >
      {PLATFORM_MARK[platform]}
    </span>
  )
}

export function PlatformBadge({
  platform,
  showLabel = true,
  className,
}: {
  platform: Platform
  showLabel?: boolean
  className?: string
}) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <PlatformMark platform={platform} />
      {showLabel && (
        <span className="text-sm font-medium text-foreground">
          {PLATFORM_LABELS[platform]}
        </span>
      )}
    </span>
  )
}
