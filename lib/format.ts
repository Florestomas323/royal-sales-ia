export function formatCurrency(value: number, compact = false): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: compact && Math.abs(value) >= 1000 ? 1 : 0,
    notation: compact ? 'compact' : 'standard',
  }).format(value)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US').format(value)
}

export function formatPercent(value: number, digits = 0): string {
  return `${value.toFixed(digits)}%`
}

/** Returns the signed percentage change between current and previous. */
export function changePct(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100
  return ((current - previous) / previous) * 100
}

export function formatRelativeTime(iso: string | null): string {
  if (!iso) return '—'
  const date = new Date(iso)
  const diffMs = Date.now() - date.getTime()
  const diffMin = Math.round(diffMs / 60000)
  if (Math.abs(diffMin) < 1) return 'just now'
  if (Math.abs(diffMin) < 60) return `${diffMin}m ago`
  const diffHr = Math.round(diffMin / 60)
  if (Math.abs(diffHr) < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  if (Math.abs(diffDay) < 7) return `${diffDay}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function initials(name: string): string {
  return name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}
