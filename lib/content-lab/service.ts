import { openAIProvider } from "./providers/openai"
import type { ContentAIProvider, ProviderFailureKind } from "./providers/types"
import { CREATIVE_OUTPUT_SCHEMA, VARIANT_SET_SCHEMA, parseCreativeOutput, parseVariantSet } from "./schema"
import { SYSTEM_PROMPT, buildUserPrompt, buildVariantPrompt, containsForbiddenData } from "./prompt"
import { buildTemplateOutput, buildTemplateVariants } from "./template"
import type { CampaignContext, CreativeBrief, CreativeOutput, VariantSet, VariantVariable } from "./types"

/**
 * Content AI service — SERVER ONLY.
 *
 * Orchestrates: prompt → provider → OUR validation → result. When the provider
 * is unavailable or answers something invalid, it returns the deterministic
 * template with `source: "template"` so the UI can label it honestly. A
 * fallback is never dressed up as an AI answer.
 */

export interface GenerateResult<T> {
  data: T
  source: "ai" | "template"
  /** Present when AI was attempted and failed; the UI shows a real message. */
  failure: ProviderFailureKind | null
}

let provider: ContentAIProvider = openAIProvider

/** Test seam. Production always uses the OpenAI adapter. */
export function setProvider(next: ContentAIProvider): void {
  provider = next
}

export function isAiConfigured(): boolean {
  return provider.isConfigured()
}

async function run<T>(
  system: string,
  user: string,
  schemaName: string,
  schema: object,
  parse: (raw: unknown) => T | null,
  fallback: () => T,
): Promise<GenerateResult<T>> {
  if (!provider.isConfigured()) {
    return { data: fallback(), source: "template", failure: "not_configured" }
  }
  // Defence in depth: refuse to send anything that looks like a secret or PII.
  if (containsForbiddenData(user) || containsForbiddenData(system)) {
    console.error("[content-lab] payload blocked: forbidden pattern detected")
    return { data: fallback(), source: "template", failure: "invalid_response" }
  }

  const result = await provider.generate({ system, user, schemaName, schema })
  if (!result.ok) {
    // Never log the prompt or the raw answer: they are not needed to debug.
    console.warn(`[content-lab] provider failed: ${result.kind}`)
    return { data: fallback(), source: "template", failure: result.kind }
  }

  const parsed = parse(result.data)
  if (!parsed) {
    console.warn("[content-lab] provider answer rejected by validator")
    return { data: fallback(), source: "template", failure: "invalid_response" }
  }
  return { data: parsed, source: "ai", failure: null }
}

export function generateCreative(
  brief: CreativeBrief,
  context: CampaignContext | null,
): Promise<GenerateResult<CreativeOutput>> {
  return run(
    SYSTEM_PROMPT,
    buildUserPrompt(brief, context),
    "creative_output",
    CREATIVE_OUTPUT_SCHEMA,
    parseCreativeOutput,
    () => buildTemplateOutput(brief),
  )
}

export function generateVariants(
  brief: CreativeBrief,
  variable: VariantVariable,
  baseline: string,
): Promise<GenerateResult<VariantSet>> {
  return run(
    SYSTEM_PROMPT,
    buildVariantPrompt(brief, variable, baseline),
    "variant_set",
    VARIANT_SET_SCHEMA,
    parseVariantSet,
    () => buildTemplateVariants(brief, variable, baseline),
  )
}
