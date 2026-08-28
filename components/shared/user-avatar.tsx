import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import { initials } from '@/lib/format'

export function UserAvatar({
  name,
  color,
  className,
}: {
  name: string
  color?: string
  className?: string
}) {
  return (
    <Avatar className={cn('size-8', className)}>
      <AvatarFallback
        className="text-xs font-medium text-white"
        style={{ backgroundColor: color ?? 'var(--primary)' }}
      >
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}
