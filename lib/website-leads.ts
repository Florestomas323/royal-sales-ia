import { PIPELINES } from "@/lib/constants"
import { normalizePhone } from "@/lib/leads"
import type { Attribution, Lead, LeadType, WebFormSubmission, WebsiteLeadPayload } from "@/types"

/**
 * Pure logic for leads that arrive from a workspace's own website. No I/O
 * here: everything is decidable from values, so it runs the same in the API
 * route and in the tests.
 */

export interface ValidationError {
  field: keyof WebsiteLeadPayload | "body"
  reason: "required" | "invalid" | "too_long"
}

const MAX = {
  name: 120, phone: 32, email: 160, city: 80, form: 80, url: 2048, utm: 200, clickId: 200,
  zip: 16, state: 64, gift: 160, schedule: 240, externalId: 200, answerKey: 80, answerValue: 500,
}
const MAX_ANSWERS = 40
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Keeps a value only when it is a well-formed http(s) URL. */
function httpUrl(v: string | null): string | null {
  if (v === null || v === "") return v
  try {
    const u = new URL(v)
    return u.protocol === "https:" || u.protocol === "http:" ? v : ""
  } catch {
    return ""
  }
}

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

  // Two shapes are accepted on purpose. The documented one is flat
  // (`type`, `utmSource`…); a landing page may instead send `leadType` and a
  // nested `utm` object. Both mean the same thing, and rejecting the second
  // would only force every site to rewrite working code.
  const utmObj = (b.utm && typeof b.utm === "object" && !Array.isArray(b.utm))
    ? (b.utm as Record<string, unknown>) : {}
  const metaObj = (b.meta && typeof b.meta === "object" && !Array.isArray(b.meta))
    ? (b.meta as Record<string, unknown>) : {}
  const pick = (...vals: unknown[]) => vals.find((v) => v !== undefined && v !== null && v !== "")

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

  const type = pick(b.type, b.leadType)
  if (type !== "sales" && type !== "recruiting") errors.push({ field: "type", reason: "invalid" })

  const city = str(b.city, MAX.city)
  const form = str(b.form, MAX.form)
  const pageUrl = str(b.pageUrl, MAX.url)
  const referrer = str(b.referrer, MAX.url)
  const utm = {
    utmSource: str(pick(b.utmSource, utmObj.source), MAX.utm),
    utmMedium: str(pick(b.utmMedium, utmObj.medium), MAX.utm),
    utmCampaign: str(pick(b.utmCampaign, utmObj.campaign), MAX.utm),
    utmContent: str(pick(b.utmContent, utmObj.content), MAX.utm),
    utmTerm: str(pick(b.utmTerm, utmObj.term), MAX.utm),
  }
  const clickId = str(pick(b.clickId, b.fbclid, b.gclid, b.ttclid), MAX.clickId)

  // Platform identifiers, when the landing page captured them.
  const ads = {
    adId: str(pick(b.adId, metaObj.adId), MAX.utm),
    adsetId: str(pick(b.adsetId, metaObj.adsetId), MAX.utm),
    campaignId: str(pick(b.campaignId, metaObj.campaignId), MAX.utm),
    adName: str(pick(b.adName, metaObj.adName), MAX.utm),
    adsetName: str(pick(b.adsetName, metaObj.adsetName), MAX.utm),
    campaignName: str(pick(b.campaignName, metaObj.campaignName), MAX.utm),
    // Only an http(s) URL is kept; anything else is dropped, never repaired.
    adUrl: httpUrl(str(pick(b.adUrl, metaObj.adUrl), MAX.url)),
    adPreviewUrl: httpUrl(str(pick(b.adPreviewUrl, metaObj.adPreviewUrl), MAX.url)),
  }

  // Extra answers of the specific form.
  const zip = str(b.zip, MAX.zip)
  const state = str(b.state, MAX.state)
  const gift = str(b.gift, MAX.gift)
  const giftId = str(b.giftId, MAX.gift)
  const schedulePreference = str(b.schedulePreference, MAX.schedule)
  const externalId = str(pick(b.externalId, b.firestoreId), MAX.externalId)
  const receivedAt = str(b.receivedAt, MAX.utm)
  const consent = typeof b.consent === "boolean" ? b.consent : undefined

  // Answers arrive as an object of short strings. Anything else is dropped
  // rather than stored: this is untrusted input that nobody validates later.
  let answers: Record<string, string> | undefined
  if (b.answers && typeof b.answers === "object" && !Array.isArray(b.answers)) {
    const entries = Object.entries(b.answers as Record<string, unknown>)
      .filter(([k, v]) => k.length <= MAX.answerKey && (typeof v === "string" || typeof v === "number" || typeof v === "boolean"))
      .slice(0, MAX_ANSWERS)
      .map(([k, v]) => [k, String(v).slice(0, MAX.answerValue)] as const)
    if (entries.length > 0) answers = Object.fromEntries(entries)
  }
  for (const [k, v] of Object.entries({ zip, state, gift, giftId, schedulePreference, externalId, receivedAt, ...ads })) {
    if (v === null) errors.push({ field: k as keyof WebsiteLeadPayload, reason: "too_long" })
  }
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
    ...Object.fromEntries(Object.entries(ads).filter(([, v]) => v)),
    ...(zip ? { zip } : {}),
    ...(state ? { state } : {}),
    ...(gift ? { gift } : {}),
    ...(giftId ? { giftId } : {}),
    ...(schedulePreference ? { schedulePreference } : {}),
    ...(externalId ? { externalId } : {}),
    ...(receivedAt ? { receivedAt } : {}),
    ...(consent === undefined ? {} : { consent }),
    ...(answers ? { answers } : {}),
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
    // Platform identifiers go to the fields the model already has for them.
    ...(payload.campaignId ? { externalCampaignId: payload.campaignId } : {}),
    ...(payload.adsetId ? { externalAdSetId: payload.adsetId } : {}),
    ...(payload.adId ? { externalAdId: payload.adId } : {}),
    // Names and links, when the landing captured them. `campaign` keeps its
    // precedence: an explicit campaign name wins over the utm_campaign slug.
    ...(payload.campaignName ? { campaign: payload.campaignName } : {}),
    ...(payload.adsetName ? { adSet: payload.adsetName } : {}),
    ...(payload.adName ? { ad: payload.adName } : {}),
    ...(payload.adUrl ? { adUrl: payload.adUrl } : {}),
    ...(payload.adPreviewUrl ? { adPreviewUrl: payload.adPreviewUrl } : {}),
  }

  // Everything the standard lead fields cannot hold, kept together.
  const webForm: WebFormSubmission | undefined = payload.form
    ? {
        form: payload.form,
        ...(payload.zip ? { zip: payload.zip } : {}),
        ...(payload.state ? { state: payload.state } : {}),
        ...(payload.answers ? { answers: payload.answers } : {}),
        ...(payload.gift ? { gift: payload.gift } : {}),
        ...(payload.giftId ? { giftId: payload.giftId } : {}),
        ...(payload.schedulePreference ? { schedulePreference: payload.schedulePreference } : {}),
        ...(payload.consent === undefined ? {} : { consent: payload.consent }),
        ...(payload.externalId ? { externalId: payload.externalId } : {}),
        ...(payload.receivedAt ? { receivedAt: payload.receivedAt } : {}),
      }
    : undefined
  return {
    workspaceId,
    leadType: payload.type,
    name: payload.name,
    phone: payload.phone,
    email: payload.email ?? "",
    source: "web",
    campaignId: "",
    campaignName: payload.utmCampaign ?? "",
    ...(webForm ? { webForm } : {}),
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
