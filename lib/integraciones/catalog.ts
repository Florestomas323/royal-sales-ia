import type { IntegrationAvailability, IntegrationProvider, Platform } from "@/types"

/**
 * Static catalog of integrations Royal Sales IA offers. This is NOT demo data:
 * it only describes what each connector is and whether it can be managed yet.
 * The real connection status of a workspace comes from `useMetaConnection`
 * (and, later, one hook per provider) — never from this file.
 */
export interface IntegrationDefinition {
  provider: IntegrationProvider
  /** Platform used for the icon / colors. */
  platform: Platform
  name: string
  category: "advertising" | "messaging" | "social" | "recruiting"
  description: string
  availability: IntegrationAvailability
  /** Internal management route when `availability === "available"`. */
  manageHref?: string
}

export const INTEGRATIONS: IntegrationDefinition[] = [
  {
    provider: "meta_ads",
    platform: "meta",
    name: "Meta Ads",
    category: "advertising",
    description:
      "Conecta Meta para sincronizar campañas, inversión y prospectos de Facebook e Instagram.",
    availability: "available",
    manageHref: "/integrations/meta",
  },
  {
    provider: "tiktok_ads",
    platform: "tiktok",
    name: "TikTok Ads",
    category: "advertising",
    description: "Rendimiento de anuncios y generación de prospectos desde TikTok.",
    availability: "coming_soon",
  },
  {
    provider: "whatsapp",
    platform: "whatsapp",
    name: "WhatsApp Business",
    category: "messaging",
    description: "Conversaciones en dos vías y mensajes automáticos de primer contacto.",
    availability: "coming_soon",
  },
  {
    provider: "indeed",
    platform: "indeed",
    name: "Indeed",
    category: "recruiting",
    description: "Sincroniza vacantes y candidatos para el embudo de reclutamiento.",
    availability: "coming_soon",
  },
  {
    provider: "google_ads",
    platform: "google",
    name: "Google Ads",
    category: "advertising",
    description: "Métricas y atribución de campañas de Búsqueda y Performance Max.",
    availability: "coming_soon",
  },
  {
    provider: "instagram",
    platform: "instagram",
    name: "Instagram",
    category: "social",
    description: "Mensajes directos y captura de prospectos orgánicos desde Instagram.",
    availability: "coming_soon",
  },
  {
    provider: "facebook",
    platform: "facebook",
    name: "Facebook Pages",
    category: "social",
    description: "De comentario a prospecto y automatización de Messenger para páginas.",
    availability: "coming_soon",
  },
]
