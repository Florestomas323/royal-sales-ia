/**
 * Basic, in-memory rate limiting for the public lead endpoint.
 *
 * Deliberately simple: a sliding window per bucket kept in this process.
 * On serverless hosting each instance has its own memory, so the effective
 * ceiling is "per instance", not global — enough to blunt a runaway form or
 * a naive script, not a substitute for edge-level protection. Stated here so
 * nobody mistakes it for more.
 */
const WINDOW_MS = 60_000
const buckets = new Map<string, number[]>()

export function allow(bucket: string, limit: number, now = Date.now()): boolean {
  const since = now - WINDOW_MS
  const hits = (buckets.get(bucket) ?? []).filter((t) => t > since)
  if (hits.length >= limit) {
    buckets.set(bucket, hits)
    return false
  }
  hits.push(now)
  buckets.set(bucket, hits)
  // Keep the map from growing without bound between requests.
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (v.every((t) => t <= since)) buckets.delete(k)
  }
  return true
}

/** Test hook. */
export function _resetRateLimit() {
  buckets.clear()
}
