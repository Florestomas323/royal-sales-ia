'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { PLATFORM_COLOR, PLATFORM_LABELS, PLATFORM_MARK } from '@/lib/constants'
import type { Platform } from '@/types'

/**
 * Official logos supplied by the distributor, stored in /public/logos and
 * cropped to the SYMBOL only — no wordmarks, so every platform occupies the
 * same square. A platform with no file here (youtube, web) keeps the
 * lettermark in its brand colour. Nothing is drawn or redrawn here.
 */
const LOGO_SRC: Partial<Record<Platform, string>> = {
  meta: '/logos/meta.png',
  facebook: '/logos/facebook.png',
  instagram: '/logos/instagram.png',
  tiktok: '/logos/tiktok.png',
  google: '/logos/google.png',
  indeed: '/logos/indeed.png',
  whatsapp: '/logos/whatsapp.png',
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
          // Fills whatever box the caller asked for (size-6 inline, size-10 on
          // an integration card) instead of a fixed 16px that looked lost in
          // the larger one. `object-contain` keeps every logo at its own
          // proportions — none is cropped or stretched — and the padding gives
          // them the breathing room brand guidelines ask for.
          className="size-full object-contain p-[12%]"
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
