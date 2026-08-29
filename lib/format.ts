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
  const past = diffMs >= 0
  const ago = (amount: number, unit: string) =>
    past ? `hace ${amount}${unit}` : `en ${amount}${unit}`
  const diffMin = Math.round(diffMs / 60000)
  if (Math.abs(diffMin) < 1) return 'ahora mismo'
  if (Math.abs(diffMin) < 60) return ago(Math.abs(diffMin), 'm')
  const diffHr = Math.round(diffMin / 60)
  if (Math.abs(diffHr) < 24) return ago(Math.abs(diffHr), 'h')
  const diffDay = Math.round(diffHr / 24)
  if (Math.abs(diffDay) < 7) return ago(Math.abs(diffDay), 'd')
  return date.toLocaleDateString('es-419', { month: 'short', day: 'numeric' })
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-419', {
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

/** Format a KPI value according to its declared format. */
export function formatKpi(
  value: number,
  format: 'currency' | 'number' | 'percent',
): string {
  if (format === 'currency') return formatCurrency(value, true)
  if (format === 'percent') return formatPercent(value, 1)
  return formatNumber(value)
}

/** Signed percentage change — alias kept for component readability. */
export const percentChange = changePct

/** Relative time — alias kept for component readability. */
export const relativeTime = formatRelativeTime
