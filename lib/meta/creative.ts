import type { GraphAdCreative, GraphAdWithCreative } from "@/lib/meta/graph"
import { statusKind, type AdStatusKind } from "@/lib/meta/ads"

/**
 * What the in-app preview renders. Every field is nullable: a creative that
 * lacks something shows "vista previa no disponible" for that piece, never a
 * guessed value. Nothing here is fabricated from ids.
 */
export interface AdPreview {
  adId: string
  adName: string
  status: string
  statusKind: AdStatusKind
  adSetId: string | null
  campaignId: string | null
  /** What kind of creative this is, as far as Meta told us. */
  kind: "image" | "video" | "dynamic" | "unknown"
  /** Poster/still, when Meta supplied one. */
  imageUrl: string | null
  /** Playable video source, when the token may read it. Filled by the route. */
  videoUrl: string | null
  videoId: string | null
  /** Main text (message / body). */
  body: string | null
  /** Headline (name / title). */
  title: string | null
  description: string | null
  /** Call to action type, e.g. LEARN_MORE, as Meta names it. */
  cta: string | null
  /** Destination URL, when the creative carries one. */
  linkUrl: string | null
  /** Secondary only: Meta's shareable preview, if any. Never the main path. */
  shareableLink: string | null
}

function httpUrl(v: string | undefined | null): string | null {
  if (!v) return null
  try {
    const u = new URL(v)
    return u.protocol === "https:" || u.protocol === "http:" ? v : null
  } catch {
    return null
  }
}

const text = (v: string | undefined | null): string | null => {
  const s = (v ?? "").trim()
  return s ? s : null
}

/** First non-empty variant of a dynamic creative array. */
function first<T>(arr: T[] | undefined, pick: (t: T) => string | undefined | null): string | null {
  for (const item of arr ?? []) {
    const v = text(pick(item))
    if (v) return v
  }
  return null
}

/**
 * Reads the three shapes Meta uses — static link/photo, static video, and
 * dynamic asset feeds — into one flat preview. Precedence is explicit:
 * the story spec (what actually runs) beats the creative's top-level fields,
 * which are often stale copies.
 */
export function normalizeCreative(ad: GraphAdWithCreative): AdPreview {
  const c: GraphAdCreative = ad.creative ?? {}
  const spec = c.object_story_spec
  const feed = c.asset_feed_spec
  const status = ad.effective_status ?? ad.status ?? ""

  const base: AdPreview = {
    adId: ad.id,
    adName: text(ad.name) ?? ad.id,
    status,
    statusKind: statusKind(status),
    adSetId: ad.adset_id ?? null,
    campaignId: ad.campaign_id ?? null,
    kind: "unknown",
    imageUrl: null,
    videoUrl: null,
    videoId: null,
    body: null,
    title: null,
    description: null,
    cta: null,
    linkUrl: null,
    shareableLink: null,
  }

  if (spec?.video_data) {
    const v = spec.video_data
    return {
      ...base,
      kind: "video",
      videoId: v.video_id ?? c.video_id ?? null,
      imageUrl: httpUrl(v.image_url) ?? httpUrl(c.thumbnail_url) ?? httpUrl(c.image_url),
      body: text(v.message) ?? text(c.body),
      title: text(v.title) ?? text(c.title),
      description: text(v.link_description),
      cta: text(v.call_to_action?.type) ?? text(c.call_to_action_type),
      linkUrl: httpUrl(v.call_to_action?.value?.link) ?? httpUrl(c.link_url),
    }
  }

  if (spec?.link_data) {
    const l = spec.link_data
    return {
      ...base,
      kind: "image",
      imageUrl: httpUrl(l.picture) ?? httpUrl(c.image_url) ?? httpUrl(c.thumbnail_url),
      body: text(l.message) ?? text(c.body),
      title: text(l.name) ?? text(c.title),
      description: text(l.description),
      cta: text(l.call_to_action?.type) ?? text(c.call_to_action_type),
      linkUrl: httpUrl(l.link) ?? httpUrl(l.call_to_action?.value?.link) ?? httpUrl(c.link_url),
    }
  }

  if (spec?.photo_data) {
    const p = spec.photo_data
    return {
      ...base,
      kind: "image",
      imageUrl: httpUrl(p.url) ?? httpUrl(c.image_url) ?? httpUrl(c.thumbnail_url),
      body: text(p.caption) ?? text(c.body),
      title: text(c.title),
      cta: text(c.call_to_action_type),
      linkUrl: httpUrl(c.link_url),
    }
  }

  if (feed) {
    const video = feed.videos?.find((v) => v.video_id)
    return {
      ...base,
      kind: "dynamic",
      videoId: video?.video_id ?? null,
      imageUrl:
        httpUrl(video?.thumbnail_url)
        ?? first(feed.images, (i) => i.url)
        ?? httpUrl(c.image_url)
        ?? httpUrl(c.thumbnail_url),
      body: first(feed.bodies, (b) => b.text) ?? text(c.body),
      title: first(feed.titles, (t) => t.text) ?? text(c.title),
      description: first(feed.descriptions, (d) => d.text),
      cta: text(feed.call_to_action_types?.[0]) ?? text(c.call_to_action_type),
      linkUrl: first(feed.link_urls, (l) => l.website_url) ?? httpUrl(c.link_url),
    }
  }

  // No story spec, no feed: fall back to the creative's own flat fields.
  return {
    ...base,
    kind: c.video_id ? "video" : c.image_url || c.thumbnail_url ? "image" : "unknown",
    videoId: c.video_id ?? null,
    imageUrl: httpUrl(c.image_url) ?? httpUrl(c.thumbnail_url),
    body: text(c.body),
    title: text(c.title),
    cta: text(c.call_to_action_type),
    linkUrl: httpUrl(c.link_url),
  }
}

/** Human label for a CTA type Meta names in SCREAMING_SNAKE_CASE. */
export function ctaLabel(cta: string | null): string | null {
  if (!cta) return null
  const map: Record<string, string> = {
    LEARN_MORE: "Más información",
    SIGN_UP: "Registrarte",
    BOOK_NOW: "Reservar",
    CONTACT_US: "Contactar",
    GET_OFFER: "Obtener oferta",
    GET_QUOTE: "Pedir presupuesto",
    APPLY_NOW: "Solicitar",
    SHOP_NOW: "Comprar",
    WHATSAPP_MESSAGE: "Enviar WhatsApp",
    MESSAGE_PAGE: "Enviar mensaje",
    CALL_NOW: "Llamar",
    DOWNLOAD: "Descargar",
    WATCH_MORE: "Ver más",
    SUBSCRIBE: "Suscribirte",
    NO_BUTTON: "",
  }
  const known = map[cta]
  if (known === "") return null
  return known ?? cta.replace(/_/g, " ").toLowerCase().replace(/^./, (ch) => ch.toUpperCase())
}
