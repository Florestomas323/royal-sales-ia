import { PIPELINES } from "@/lib/constants"
import { normalizePhone } from "@/lib/leads"
import type { Attribution, Lead, LeadType, WebsiteLeadPayload } from "@/types"

/**
 * Pure logic for leads that arrive from a workspace's own website. No I/O
 * here: everything is decidable from values, so it runs the same in the API
 * route and in the tests.
 */

export interface ValidationError {
  field: keyof WebsiteLeadPayload | "body"
  reason: "required" | "invalid" | "too_long"
}

const MAX = { name: 120, phone: 32, email: 160, city: 80, form: 80, url: 2048, utm: 200, clickId: 200 }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function str(v: unknown, max: number): string | null {
  if (v === undefined || v === null) return ""
  if (typeof v !== "string") return null
  const s = v.trim()
  return s.length > max ? null : s
}

/**
 * Turns an untrusted JSON body into a clean payload, or a list of errors.
 * Unknown fields are dropped; nothing from the body reaches Firestore
 * unvalidated.
 */
export function parseWebsiteLead(body: unknown): { ok: true; payload: WebsiteLeadPayload } | { ok: false; errors: ValidationError[] } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, errors: [{ field: "body", reason: "invalid" }] }
  }
  const b = body as Record<string, unknown>
  const errors: ValidationError[] = []

  const name = str(b.name, MAX.name)
  if (name === null) errors.push({ field: "name", reason: "too_long" })
  else if (!name) errors.push({ field: "name", reason: "required" })

  const phoneRaw = str(b.phone, MAX.phone)
  const phone = phoneRaw === null ? null : normalizePhone(phoneRaw)
  if (phone === null) errors.push({ field: "phone", reason: "too_long" })
  else if (!phone) errors.push({ field: "phone", reason: "required" })
  else if (phone.replace(/\D/g, "").length < 7) errors.push({ field: "phone", reason: "invalid" })

  const email = str(b.email, MAX.email)
  if (email === null) errors.push({ field: "email", reason: "too_long" })
  else if (email && !EMAIL.test(email)) errors.push({ field: "email", reason: "invalid" })

  const type = b.type
  if (type !== "sales" && type !== "recruiting") errors.push({ field: "type", reason: "invalid" })

  const city = str(b.city, MAX.city)
  const form = str(b.form, MAX.form)
  const pageUrl = str(b.pageUrl, MAX.url)
  const referrer = str(b.referrer, MAX.url)
  const utm = {
    utmSource: str(b.utmSource, MAX.utm), utmMedium: str(b.utmMedium, MAX.utm),
    utmCampaign: str(b.utmCampaign, MAX.utm), utmContent: str(b.utmContent, MAX.utm),
    utmTerm: str(b.utmTerm, MAX.utm),
  }
  const clickId = str(b.clickId, MAX.clickId)
  for (const [k, v] of Object.entries({ city, form, pageUrl, referrer, clickId, ...utm })) {
    if (v === null) errors.push({ field: k as keyof WebsiteLeadPayload, reason: "too_long" })
  }

  if (errors.length > 0) return { ok: false, errors }

  const payload: WebsiteLeadPayload = {
    name: name as string,
    phone: phone as string,
    type: type as LeadType,
    ...(email ? { email: email.toLowerCase() } : {}),
    ...(city ? { city } : {}),
    ...(form ? { form } : {}),
    ...(pageUrl ? { pageUrl } : {}),
    ...(referrer ? { referrer } : {}),
    ...(clickId ? { clickId } : {}),
    ...Object.fromEntries(Object.entries(utm).filter(([, v]) => v)),
  }
  return { ok: true, payload }
}

/**
 * The lead document a website submission becomes. Mirrors what the app's own
 * `createLead` writes, so a web lead is indistinguishable in shape from one
 * typed by hand: same score defaults, same initial stage of its pipeline,
 * `source: "website"` as the single truth about its origin.
 *
 * `workspaceId` is NOT taken from the payload: it comes from the integration
 * key resolved server-side, which is the whole point.
 */
export function buildWebsiteLead(
  workspaceId: string,
  payload: WebsiteLeadPayload,
  now: string,
): Omit<Lead, "id"> {
  const attribution: Attribution = {
    platform: "web",
    ...(payload.utmCampaign ? { campaign: payload.utmCampaign } : {}),
    ...(payload.utmSource ? { utmSource: payload.utmSource } : {}),
    ...(payload.utmMedium ? { utmMedium: payload.utmMedium } : {}),
    ...(payload.utmCampaign ? { utmCampaign: payload.utmCampaign } : {}),
    ...(payload.utmContent ? { utmContent: payload.utmContent } : {}),
    ...(payload.utmTerm ? { utmTerm: payload.utmTerm } : {}),
    ...(payload.clickId ? { clickId: payload.clickId } : {}),
    ...(payload.pageUrl ? { landingPage: payload.pageUrl } : {}),
    ...(payload.referrer ? { referrer: payload.referrer } : {}),
    ...(payload.form ? { externalFormId: payload.form } : {}),
  }
  return {
    workspaceId,
    leadType: payload.type,
    name: payload.name,
    phone: payload.phone,
    email: payload.email ?? "",
    source: "web",
    campaignId: "",
    campaignName: payload.utmCampaign ?? "",
    score: 50,
    temperature: "warm",
    stage: PIPELINES[payload.type].initial,
    assignedToId: "",
    potentialValue: 0,
    createdAt: now,
    receivedAt: now,
    lastContactAt: null,
    nextFollowUpAt: null,
    nextAction: "Primer contacto",
    attribution,
    clientId: "",
    ...(payload.type === "recruiting"
      ? { recruiting: { ...(payload.city ? { city: payload.city } : {}) } }
      : {}),
  } as Omit<Lead, "id">
}

/**
 * Same person, same workspace: same phone (normalised) or same email
 * (lower-cased). Cross-workspace matches are never even looked at.
 */
export function isSameContact(
  a: Pick<Lead, "phone" | "email">,
  b: Pick<Lead, "phone" | "email">,
): boolean {
  const phoneA = normalizePhone(a.phone ?? ""), phoneB = normalizePhone(b.phone ?? "")
  if (phoneA && phoneB && phoneA === phoneB) return true
  const emailA = (a.email ?? "").trim().toLowerCase(), emailB = (b.email ?? "").trim().toLowerCase()
  return Boolean(emailA && emailB && emailA === emailB)
}

/** Integration keys look like `rsw_` + 40 hex chars. The prefix helps eyeballing. */
export const KEY_PREFIX = "rsw_"

export function keyLooksValid(key: string): boolean {
  return /^rsw_[a-f0-9]{40}$/.test(key)
}

export function displayPrefix(key: string): string {
  return key.slice(0, KEY_PREFIX.length + 6)
}

/** Domains are stored bare and lower-case: no scheme, no path, no port. */
export function normalizeDomain(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/:\d+$/, "")
  if (!s || s.length > 253) return null
  if (!/^(?!-)[a-z0-9-]{1,63}(?<!-)(\.(?!-)[a-z0-9-]{1,63}(?<!-))+$/.test(s)) return null
  return s
}
