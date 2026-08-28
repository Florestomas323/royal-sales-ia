import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * Royal Sales IA isotype (rounded app-icon tile).
 * Use `size` in pixels; the source art already includes the dark rounded tile.
 */
export function BrandMark({
  size = 32,
  className,
  priority = false,
}: {
  size?: number
  className?: string
  priority?: boolean
}) {
  return (
    <Image
      src="/royal-sales-icon.png"
      alt="Royal Sales IA"
      width={size}
      height={size}
      priority={priority}
      className={cn('shrink-0 rounded-[22%] object-contain', className)}
    />
  )
}
