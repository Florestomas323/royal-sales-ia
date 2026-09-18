/**
 * Canonical identity used to prevent duplicate prospects.
 *
 * Business rule: two submissions are the same prospect only when the
 * workspace, the normalised phone AND the normalised name all match. The
 * lead type is deliberately not part of the identity: the product must keep
 * one contact record per distributor, not one copy per pipeline.
 */

export interface LeadIdentityInput {
  workspaceId: string
  name: string
  phone: string
}

export interface LeadIdentity {
  workspaceId: string
  nameKey: string
  phoneKey: string
}

export function normalizeLeadName(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
}

/**
 * Digits-only phone identity. A bare US/Canada 10-digit number and its +1
 * E.164 representation become the same key; other country codes are kept.
 */
export function normalizeLeadPhone(raw: string): string {
  const trimmed = raw.trim()
  const digits = trimmed.replace(/\D/g, "")
  if (!digits) return ""
  if (trimmed.startsWith("+")) return digits
  if (digits.length === 10) return `1${digits}`
  return digits
}

export function leadIdentity(input: LeadIdentityInput): LeadIdentity {
  return {
    workspaceId: input.workspaceId.trim(),
    nameKey: normalizeLeadName(input.name),
    phoneKey: normalizeLeadPhone(input.phone),
  }
}

export function sameLeadIdentity(a: LeadIdentityInput, b: LeadIdentityInput): boolean {
  const left = leadIdentity(a)
  const right = leadIdentity(b)
  return Boolean(
    left.workspaceId &&
      left.nameKey &&
      left.phoneKey &&
      left.workspaceId === right.workspaceId &&
      left.nameKey === right.nameKey &&
      left.phoneKey === right.phoneKey,
  )
}

/** Stored phone variants that may exist on legacy prospect documents. */
export function legacyPhoneVariants(raw: string): string[] {
  const key = normalizeLeadPhone(raw)
  if (!key) return []
  const variants = new Set<string>([key, `+${key}`])
  if (key.length === 11 && key.startsWith("1")) variants.add(key.slice(1))
  return [...variants]
}
