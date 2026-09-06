import type { CampaignContext, CreativeBrief, VariantVariable } from "./types"
import { isVideoFormat } from "./types"

/**
 * THE ONLY PLACE that decides what reaches the model.
 *
 * Everything sent is built here from an allow-list of fields. Nothing else in
 * the codebase hands data to a provider, so this file is the single point to
 * audit for leaks.
 *
 * NEVER sent: lead names, phones, emails or ids; Meta tokens; the Firebase
 * service account; auth uids; other workspaces' data; any server secret.
 * The workspace name itself is not sent either — the model does not need it.
 */

const TONE_LABEL: Record<string, string> = {
  professional: "profesional", close: "cercano", direct: "directo",
  educational: "educativo", aspirational: "aspiracional",
}

const CHANNEL_LABEL: Record<string, string> = {
  facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok",
  whatsapp: "WhatsApp", general: "uso general",
}

const FORMAT_LABEL: Record<string, string> = {
  image: "imagen estática", reel: "Reel / video corto", story: "historia",
  carousel: "carrusel", post: "publicación orgánica", ad_copy: "texto para anuncio",
}

const INTENT_LABEL: Record<string, string> = {
  product: "presentar un producto", demo: "invitar a una demostración",
  promotion: "comunicar una promoción que el usuario indicó", education: "educar sobre el producto",
  remarketing: "reimpactar a quien ya mostró interés", lead_gen: "generar prospectos",
  opportunity: "presentar la oportunidad", extra_income: "hablar de ingreso adicional",
  full_time: "hablar de dedicación de tiempo completo", entrepreneurship: "hablar de emprendimiento",
  testimonial: "contar una historia o testimonio que el usuario aporte",
  candidate_gen: "generar candidatos",
}

/**
 * Rules the model must follow. Ordered by how much damage breaking them does.
 */
const GUARDRAILS = [
  "No inventes precios, descuentos, promociones, disponibilidad, premios ni estadísticas. Usa SOLO la oferta que el usuario escribió; si no escribió ninguna, no menciones ninguna.",
  "No inventes testimonios, resultados de clientes ni cifras de ingresos.",
  "No atribuyas propiedades médicas, curativas ni beneficios de salud a ningún producto.",
  "Para reclutamiento, habla de OPORTUNIDAD, nunca de garantía. Prohibido cualquier forma de 'gana X garantizado', 'ingresos asegurados' o similar.",
  "No afirmes causalidad que los datos no demuestren. Si el CTR es bajo, di que conviene probar otro enfoque; no digas que el creativo 'es malo'.",
  "No uses marcas, nombres de empresas ni personas que el usuario no haya escrito en su contexto.",
  "Escribe todo en español neutro de México.",
].join("\n- ")

export const SYSTEM_PROMPT = [
  "Eres un director creativo publicitario que trabaja para distribuidores independientes.",
  "Produces borradores de contenido que un humano revisará y aprobará antes de publicar.",
  "Nunca ejecutas acciones: no publicas, no creas campañas y no modificas presupuestos.",
  "",
  "Reglas obligatorias:",
  `- ${GUARDRAILS}`,
  "",
  "Devuelve exclusivamente el JSON del esquema solicitado, sin texto adicional.",
].join("\n")

function metricLine(label: string, value: number | null, unit = ""): string | null {
  // A missing metric stays missing: never rendered as 0.
  if (value === null || !Number.isFinite(value)) return null
  return `${label}: ${unit === "$" ? `$${value.toFixed(2)}` : `${value}${unit}`}`
}

/** Aggregated campaign block. Only numbers that really exist are included. */
function campaignBlock(context: CampaignContext): string {
  const m = context.metrics
  const lines = [
    metricLine("Inversión", m.spend, "$"),
    metricLine("Impresiones", m.impressions),
    metricLine("Alcance", m.reach),
    metricLine("Frecuencia", m.frequency),
    metricLine("CTR", m.ctr, "%"),
    metricLine("CPC", m.cpc, "$"),
    metricLine("CPM", m.cpm, "$"),
    metricLine("Leads reportados por Meta", m.metaLeads),
    metricLine("Prospectos recibidos en el CRM", m.crmLeads),
    metricLine("Costo por prospecto CRM", m.cplCrm, "$"),
    metricLine("Ventas cerradas", m.sales),
    metricLine("Ingresos reales", m.revenue, "$"),
    metricLine("ROAS", m.roas, "x"),
  ].filter((l): l is string => l !== null)

  return [
    `Campaña de referencia: ${context.campaignName}`,
    `Objetivo de la campaña: ${context.objective === "sales" ? "clientes" : "candidatos"}`,
    context.health ? `Estado según el análisis: ${context.health}` : null,
    lines.length > 0 ? `Métricas reales del periodo:\n  - ${lines.join("\n  - ")}` : "Métricas: sin datos suficientes.",
    context.findings.length > 0 ? `Hallazgos del análisis:\n  - ${context.findings.join("\n  - ")}` : null,
    context.recommendations.length > 0 ? `Recomendaciones del análisis:\n  - ${context.recommendations.join("\n  - ")}` : null,
    "Las métricas ausentes son desconocidas: NO las interpretes como cero ni las menciones.",
  ].filter((l): l is string => l !== null).join("\n")
}

/** Trims free text so an oversized paste cannot blow up the request. */
function clip(value: string | undefined, max: number): string | null {
  const trimmed = (value ?? "").trim()
  if (trimmed.length === 0) return null
  return trimmed.length > max ? `${trimmed.slice(0, max)}…` : trimmed
}

export function buildUserPrompt(brief: CreativeBrief, context: CampaignContext | null): string {
  const video = isVideoFormat(brief.format)
  const parts = [
    `Objetivo: ${brief.objective === "sales" ? "VENTAS (conseguir clientes)" : "RECLUTAMIENTO (conseguir candidatos)"}`,
    `Intención: ${INTENT_LABEL[brief.intent] ?? brief.intent}`,
    `Producto, servicio u oportunidad: ${clip(brief.subject, 600)}`,
    clip(brief.offer, 400) ? `Oferta que el usuario indicó: ${clip(brief.offer, 400)}` : "Oferta: ninguna. No inventes ninguna.",
    clip(brief.audience, 300) ? `Público objetivo: ${clip(brief.audience, 300)}` : null,
    clip(brief.market, 200) ? `Ciudad o mercado: ${clip(brief.market, 200)}` : null,
    clip(brief.notes, 800) ? `Observaciones: ${clip(brief.notes, 800)}` : null,
    `Tono: ${TONE_LABEL[brief.tone] ?? brief.tone}`,
    `Canal: ${CHANNEL_LABEL[brief.channel] ?? brief.channel}`,
    `Formato: ${FORMAT_LABEL[brief.format] ?? brief.format}`,
    "",
    context ? campaignBlock(context) : "Sin campaña de referencia: crea desde cero.",
    "",
    "Entrega:",
    "- strategy: objetivo, público sugerido, intención y ángulo creativo principal.",
    "- angles: exactamente 3 ángulos distintos (por ejemplo problema, transformación, curiosidad).",
    "- hooks: exactamente 5 ganchos cortos.",
    "- copy: texto principal listo para publicar.",
    "- description: descripción breve de apoyo para el anuncio.",
    "- headline: 1 titular principal y 2 variantes.",
    "- ctas: entre 2 y 3 llamadas a la acción.",
    video
      ? "- script: guion con los tramos 0-3s, 3-10s, 10-20s, 20-30s y CTA, cada uno con texto hablado, texto en pantalla y acción visual.\n- shotList: lista de tomas necesarias."
      : "- script: array vacío.\n- shotList: array vacío.",
    "- visualConcept: escena, protagonista, ambiente, composición, iluminación, elementos, texto en pantalla y estilo.",
    "- visualPrompt: un prompt profesional en inglés para un generador de imágenes, describiendo únicamente la escena visual.",
  ]
  return parts.filter((p): p is string => p !== null).join("\n")
}

const VARIABLE_LABEL: Record<VariantVariable, string> = {
  hook: "el gancho inicial", angle: "el ángulo creativo",
  cta: "la llamada a la acción", headline: "el titular",
}

/**
 * Variants change ONE variable. The rest of the creative is held constant, so
 * an A/B test measures that variable and not three different ads.
 */
export function buildVariantPrompt(
  brief: CreativeBrief,
  variable: VariantVariable,
  baseline: string,
): string {
  return [
    `Genera 3 variantes (A, B, C) cambiando ÚNICAMENTE ${VARIABLE_LABEL[variable]}.`,
    "Todo lo demás del creativo permanece igual: no cambies el producto, la oferta, el tono ni el resto del texto.",
    `Versión actual de ${VARIABLE_LABEL[variable]}: ${baseline}`,
    "",
    `Objetivo: ${brief.objective === "sales" ? "ventas" : "reclutamiento"}`,
    `Producto u oportunidad: ${clip(brief.subject, 400)}`,
    `Tono: ${TONE_LABEL[brief.tone] ?? brief.tone}`,
    `Canal: ${CHANNEL_LABEL[brief.channel] ?? brief.channel}`,
    "",
    `La variante A puede ser la versión actual o una reformulación cercana. B y C deben explorar enfoques distintos de ${VARIABLE_LABEL[variable]}.`,
    `Devuelve variable = "${variable}".`,
  ].filter((p): p is string => p !== null).join("\n")
}

/**
 * Defence in depth: nothing built above should contain these, but the service
 * refuses to send a payload if any secret-looking pattern slipped in.
 */
export function containsForbiddenData(payload: string): boolean {
  return (
    /EAA[A-Za-z0-9]{20,}/.test(payload) ||            // Meta access token
    /sk-[A-Za-z0-9_-]{20,}/.test(payload) ||          // OpenAI key
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(payload) || // service account
    /"private_key"|service_account/.test(payload) ||
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(payload) || // any email
    /\+?\d[\d\s().-]{8,}\d/.test(payload)             // any phone-like number
  )
}
