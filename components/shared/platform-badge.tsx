'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { PLATFORM_COLOR, PLATFORM_LABELS, PLATFORM_MARK } from '@/lib/constants'
import type { Platform } from '@/types'

/**
 * Official logo files, dropped by hand into /public/logos/<platform>.svg from
 * each brand's own press kit. When the file is there it is shown; when it is
 * not, the lettermark in the brand's colour stays. Nothing here draws or
 * redistributes a trademark — the files come from the brand.
 */
const LOGO_SRC: Partial<Record<Platform, string>> = {
  meta: '/logos/meta.svg',
  facebook: '/logos/facebook.svg',
  instagram: '/logos/instagram.svg',
  tiktok: '/logos/tiktok.svg',
  google: '/logos/google.svg',
  youtube: '/logos/youtube.svg',
  indeed: '/logos/indeed.svg',
  whatsapp: '/logos/whatsapp.svg',
}

export function PlatformMark({
  platform,
  className,
}: {
  platform: Platform
  className?: string
}) {
  const [logoFailed, setLogoFailed] = useState(false)
  const src = LOGO_SRC[platform]

  // Same box for every platform, so a real logo and a lettermark line up.
  const box = cn(
    'inline-flex size-6 shrink-0 items-center justify-center overflow-hidden rounded-md',
    className,
  )

  if (src && !logoFailed) {
    return (
      <span className={cn(box, 'bg-white ring-1 ring-border')} aria-hidden="true">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          className="size-4 object-contain"
          onError={() => setLogoFailed(true)}
        />
      </span>
    )
  }

  return (
    <span
      className={cn(box, 'text-[10px] font-semibold text-white')}
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
