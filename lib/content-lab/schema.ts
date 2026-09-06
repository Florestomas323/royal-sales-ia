import type { CreativeOutput, VariantSet } from "./types"

/**
 * JSON Schema sent to the provider (Structured Outputs, strict) AND a local
 * validator that re-checks whatever comes back.
 *
 * The validator is the real gate: even if the provider promises the schema, a
 * malformed or truncated response must be rejected here rather than rendered.
 */

const str = { type: "string" } as const
const strArr = { type: "array", items: str } as const

/**
 * Field guidance lives HERE, in the schema `description`s, instead of being
 * repeated as freeform bullet points in the user prompt (prompt.ts). The
 * schema travels in every request either way, so writing the instruction
 * once — as a short description — costs less than writing it twice: once in
 * prose in the prompt, and implicitly again through the field itself.
 */
export const CREATIVE_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "strategy", "angles", "hooks", "copy", "description", "headline",
    "ctas", "script", "visualConcept", "shotList", "visualPrompt",
  ],
  properties: {
    strategy: {
      type: "object",
      additionalProperties: false,
      required: ["objective", "audience", "intent", "mainAngle"],
      properties: {
        objective: { ...str, description: "Objetivo comercial de este creativo, en una frase." },
        audience: { ...str, description: "Público sugerido al que se dirige." },
        intent: { ...str, description: "Intención principal, en tus propias palabras." },
        mainAngle: { ...str, description: "Ángulo creativo principal elegido." },
      },
    },
    angles: {
      type: "array",
      description: "Exactamente 3 ángulos distintos (por ejemplo problema, transformación, curiosidad).",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description"],
        properties: { name: str, description: str },
      },
    },
    hooks: { ...strArr, description: "Exactamente 5 ganchos cortos, listos para usar como primera línea." },
    copy: { ...str, description: "Texto principal del anuncio, listo para publicar." },
    description: { ...str, description: "Descripción breve de apoyo para el anuncio." },
    headline: {
      type: "object",
      additionalProperties: false,
      required: ["main", "variants"],
      properties: {
        main: { ...str, description: "Titular principal." },
        variants: { ...strArr, description: "Exactamente 2 variantes adicionales del titular." },
      },
    },
    ctas: { ...strArr, description: "Entre 2 y 3 llamadas a la acción distintas." },
    script: {
      type: "array",
      description:
        "SOLO si el formato es video (Reel/Historia): tramos 0-3s, 3-10s, 10-20s, 20-30s y CTA. Si no es video, array vacío.",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["window", "spoken", "onScreen", "visual"],
        properties: {
          window: { ...str, description: "Tramo de tiempo, p. ej. '0-3s'." },
          spoken: { ...str, description: "Texto hablado en ese tramo." },
          onScreen: { ...str, description: "Texto en pantalla en ese tramo." },
          visual: { ...str, description: "Acción visual sugerida en ese tramo." },
        },
      },
    },
    visualConcept: {
      type: "object",
      additionalProperties: false,
      required: ["scene", "protagonist", "setting", "composition", "lighting", "elements", "onScreenText", "style"],
      properties: {
        scene: { ...str, description: "Escena general." },
        protagonist: { ...str, description: "Quién protagoniza la escena." },
        setting: { ...str, description: "Ambiente o locación." },
        composition: { ...str, description: "Composición del encuadre." },
        lighting: { ...str, description: "Iluminación sugerida." },
        elements: { ...strArr, description: "Elementos visuales principales." },
        onScreenText: { ...str, description: "Texto en pantalla, si aplica." },
        style: { ...str, description: "Estilo visual general." },
      },
    },
    shotList: { ...strArr, description: "SOLO si el formato es video: lista de tomas necesarias. Si no, array vacío." },
    visualPrompt: {
      ...str,
      description: "Prompt en INGLÉS para un generador de imágenes, describiendo únicamente la escena visual.",
    },
  },
} as const

export const VARIANT_SET_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["variable", "variants"],
  properties: {
    variable: { type: "string", enum: ["hook", "angle", "cta", "headline"] },
    variants: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "value"],
        properties: { label: { type: "string", enum: ["A", "B", "C"] }, value: str },
      },
    },
  },
} as const

const isStr = (v: unknown): v is string => typeof v === "string"
const isFilled = (v: unknown): v is string => isStr(v) && v.trim().length > 0
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every(isStr)
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v)

/** Shape check for a provider response. `null` means "reject it". */
export function parseCreativeOutput(raw: unknown): CreativeOutput | null {
  if (!isObj(raw)) return null
  const s = raw.strategy
  if (!isObj(s) || !isFilled(s.objective) || !isFilled(s.audience) || !isFilled(s.intent) || !isFilled(s.mainAngle)) {
    return null
  }
  if (
    !Array.isArray(raw.angles) || raw.angles.length === 0 ||
    !raw.angles.every((a) => isObj(a) && isFilled(a.name) && isFilled(a.description))
  ) return null
  if (!isStrArr(raw.hooks) || raw.hooks.length === 0 || !raw.hooks.every(isFilled)) return null
  if (!isFilled(raw.copy) || !isFilled(raw.description)) return null
  const h = raw.headline
  if (!isObj(h) || !isFilled(h.main) || !isStrArr(h.variants)) return null
  if (!isStrArr(raw.ctas) || raw.ctas.length === 0 || !raw.ctas.every(isFilled)) return null
  if (
    !Array.isArray(raw.script) ||
    !raw.script.every((b) => isObj(b) && isStr(b.window) && isStr(b.spoken) && isStr(b.onScreen) && isStr(b.visual))
  ) return null
  const v = raw.visualConcept
  if (
    !isObj(v) ||
    !["scene", "protagonist", "setting", "composition", "lighting", "onScreenText", "style"].every((k) => isStr(v[k])) ||
    !isStrArr(v.elements)
  ) return null
  if (!isStrArr(raw.shotList)) return null
  if (!isFilled(raw.visualPrompt)) return null
  return raw as unknown as CreativeOutput
}

/** A/B/C where exactly one variable changed. Anything else is rejected. */
export function parseVariantSet(raw: unknown): VariantSet | null {
  if (!isObj(raw)) return null
  if (!["hook", "angle", "cta", "headline"].includes(raw.variable as string)) return null
  if (!Array.isArray(raw.variants) || raw.variants.length !== 3) return null
  if (raw.variants.map((x) => (isObj(x) ? x.label : null)).join() !== "A,B,C") return null
  if (!raw.variants.every((x) => isObj(x) && isFilled(x.value))) return null
  return raw as unknown as VariantSet
}
