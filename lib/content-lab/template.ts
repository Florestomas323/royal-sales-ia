import type { CreativeBrief, CreativeOutput, VariantSet, VariantVariable } from "./types"
import { isVideoFormat } from "./types"

/**
 * Deterministic fallback — "Plantilla sugerida", NEVER presented as AI.
 *
 * It only rearranges what the person typed: it invents no price, no offer, no
 * result and no testimonial. For recruiting it speaks of opportunity, never
 * of guaranteed income.
 */

const TONE_OPENER: Record<string, string> = {
  professional: "Conoce", close: "Te cuento sobre", direct: "Esto es",
  educational: "Así funciona", aspirational: "Imagina",
}

const CTA_SALES = ["Escríbeme por mensaje", "Agenda una demostración", "Pregunta sin compromiso"]
const CTA_RECRUITING = ["Escríbeme para conocer más", "Agenda una llamada informativa", "Cuéntame tu caso"]

export function buildTemplateOutput(brief: CreativeBrief): CreativeOutput {
  const subject = brief.subject.trim()
  const audience = brief.audience?.trim() || (brief.objective === "sales" ? "personas interesadas en el producto" : "personas que buscan una nueva oportunidad")
  const market = brief.market?.trim()
  const offer = brief.offer?.trim()
  const opener = TONE_OPENER[brief.tone] ?? "Conoce"
  const isSales = brief.objective === "sales"

  const copyLines = [
    `${opener} ${subject}.`,
    isSales
      ? `Pensado para ${audience}${market ? ` en ${market}` : ""}.`
      : `Una oportunidad para ${audience}${market ? ` en ${market}` : ""}.`,
    offer ? `${offer}.` : null,
    brief.notes?.trim() || null,
    isSales ? "Si quieres más detalles, escríbeme." : "Si quieres saber cómo funciona, escríbeme.",
  ].filter((l): l is string => Boolean(l))

  const script = isVideoFormat(brief.format)
    ? [
        { window: "0–3 s", spoken: `${opener} ${subject}.`, onScreen: subject.slice(0, 40), visual: "Plano cercano del protagonista mirando a cámara." },
        { window: "3–10 s", spoken: `Está pensado para ${audience}.`, onScreen: "¿Para quién es?", visual: "Muestra el producto u oportunidad en contexto real." },
        { window: "10–20 s", spoken: offer ? `${offer}.` : "Te explico cómo funciona.", onScreen: offer ? offer.slice(0, 40) : "Cómo funciona", visual: "Detalle de uso o de la actividad." },
        { window: "20–30 s", spoken: "Si te interesa, hablemos.", onScreen: "Hablemos", visual: "Protagonista sonriendo hacia cámara." },
        { window: "CTA", spoken: isSales ? "Escríbeme por mensaje." : "Escríbeme para conocer más.", onScreen: isSales ? "Escríbeme" : "Conoce más", visual: "Texto grande sobre fondo limpio." },
      ]
    : []

  return {
    strategy: {
      objective: isSales ? "Generar interés y conversación de venta" : "Generar interés en la oportunidad",
      audience,
      intent: brief.intent,
      mainAngle: isSales ? "Beneficio concreto explicado con claridad" : "Oportunidad explicada sin promesas",
    },
    angles: [
      { name: "Problema", description: `Parte de una necesidad concreta que ${audience} reconoce.` },
      { name: "Transformación", description: "Muestra el antes y el después, sin prometer resultados." },
      { name: "Curiosidad", description: "Abre con una pregunta que invite a seguir viendo." },
    ],
    hooks: [
      `${opener} ${subject}.`,
      `Esto es para ${audience}.`,
      `Lo que nadie te cuenta sobre ${subject}.`,
      market ? `Si estás en ${market}, esto te interesa.` : "Si te interesa, sigue leyendo.",
      isSales ? "Antes de decidir, mira esto." : "Antes de descartarlo, mira esto.",
    ],
    copy: copyLines.join("\n\n"),
    description: isSales
      ? `Información sobre ${subject} para ${audience}.`
      : `Información sobre la oportunidad para ${audience}.`,
    headline: {
      main: subject.slice(0, 60),
      variants: [`${opener} ${subject}`.slice(0, 60), isSales ? `${subject}: lo esencial` : `${subject}: cómo empezar`].map((v) => v.slice(0, 60)),
    },
    ctas: isSales ? CTA_SALES : CTA_RECRUITING,
    script,
    visualConcept: {
      scene: `Presentación de ${subject} en un entorno cotidiano.`,
      protagonist: "Una persona real, sin estilizar en exceso.",
      setting: market ? `Ambiente cotidiano en ${market}.` : "Ambiente cotidiano y luminoso.",
      composition: "Sujeto a un tercio del encuadre, espacio libre para el texto.",
      lighting: "Luz natural suave, sin sombras duras.",
      elements: [subject, "protagonista", "espacio para texto"],
      onScreenText: subject.slice(0, 40),
      style: "Realista, cercano, sin apariencia de anuncio corporativo.",
    },
    shotList: isVideoFormat(brief.format)
      ? ["Plano medio del protagonista a cámara", "Detalle del producto u actividad", "Plano general del entorno", "Plano de cierre con texto"]
      : [],
    visualPrompt: [
      `Realistic lifestyle photo: a person presenting ${subject}`,
      market ? `in an everyday setting in ${market}` : "in a bright everyday setting",
      "soft natural light, subject on the left third, clean negative space on the right for text",
      "candid documentary style, no corporate stock look, 4:5 aspect ratio",
    ].join(", "),
  }
}

/** A/B/C changing exactly one variable, derived from the baseline. */
export function buildTemplateVariants(
  brief: CreativeBrief,
  variable: VariantVariable,
  baseline: string,
): VariantSet {
  const subject = brief.subject.trim()
  const audience = brief.audience?.trim() || "tu público"
  const byVariable: Record<VariantVariable, [string, string]> = {
    hook: [`¿Y si ${subject} fuera más sencillo de lo que crees?`, `Esto cambió la forma en que ${audience} ve ${subject}.`],
    angle: [`Enfoque en el problema que resuelve ${subject}.`, `Enfoque en la transformación que vive ${audience}.`],
    cta: ["Escríbeme y te cuento", "Agenda una llamada breve"],
    headline: [`${subject}: lo esencial`.slice(0, 60), `Descubre ${subject}`.slice(0, 60)],
  }
  const [b, c] = byVariable[variable]
  return { variable, variants: [{ label: "A", value: baseline }, { label: "B", value: b }, { label: "C", value: c }] }
}
