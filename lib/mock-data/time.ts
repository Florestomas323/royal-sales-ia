/** Deterministic-ish relative timestamps so the demo always looks "live". */
export function minutesAgo(m: number): string {
  return new Date(Date.now() - m * 60_000).toISOString()
}
export function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 3_600_000).toISOString()
}
export function daysAgo(d: number): string {
  return new Date(Date.now() - d * 86_400_000).toISOString()
}
export function inHours(h: number): string {
  return new Date(Date.now() + h * 3_600_000).toISOString()
}
export function inDays(d: number): string {
  return new Date(Date.now() + d * 86_400_000).toISOString()
}
