import type { ContentAIProvider, ProviderRequest, ProviderResult } from "./types"

/**
 * OpenAI adapter — SERVER ONLY.
 *
 * Uses the Responses API with Structured Outputs (strict JSON Schema), called
 * with native `fetch`: no SDK, no new dependency. The key travels in the
 * Authorization header, never in a query string, and never leaves the server.
 *
 *   POST https://api.openai.com/v1/responses
 *   Authorization: Bearer $OPENAI_API_KEY
 *   text.format = { type: "json_schema", name, schema, strict: true }
 *
 * Model comes from OPENAI_MODEL so it can be switched (terra → sol → luna)
 * without a deploy.
 *
 * COST CONTROLS (per request, all server-side, none configurable by the
 * browser):
 *   reasoning.effort = "low"   — this is a formatting/copywriting task, not a
 *                                reasoning-heavy one; low effort is enough
 *                                and noticeably cheaper on reasoning tokens.
 *   text.verbosity   = "low"   — shortest phrasing compatible with filling
 *                                the required JSON fields.
 *   max_output_tokens          — capped per schemaName, see MAX_OUTPUT_TOKENS.
 *   prompt_cache_key           — a STATIC string per schemaName (e.g.
 *                                "content-lab:creative_output"), never a
 *                                workspace id, user id or anything dynamic:
 *                                it only tells OpenAI's cache which feature
 *                                is calling, so the identical system prompt
 *                                and schema across requests can be reused.
 */

const ENDPOINT = "https://api.openai.com/v1/responses"
export const DEFAULT_MODEL = "gpt-5.6-terra"
const TIMEOUT_MS = 45_000

/**
 * Output caps per schema. These are APPROXIMATE worst-case estimates by hand
 * (word count × ~1.3–1.5 tokens/word + JSON structural overhead) — no
 * tokenizer library was added to measure this exactly.
 *
 *   creative_output ≈ 1400–1550 tokens worst case: a video creative fills a
 *     5-beat script (4 short fields each), an 8-field visual concept, 5
 *     hooks, 3 angles and a full copy paragraph. 3500 leaves roughly 2x
 *     headroom so a verbose answer does not get cut off mid-JSON.
 *   variant_set ≈ 150–250 tokens worst case: 3 short variants of ONE field
 *     (a hook, an angle name, a CTA or a headline). 800 leaves close to 3x
 *     headroom while staying far below the creative cap, as required.
 */
const MAX_OUTPUT_TOKENS: Record<string, number> = {
  creative_output: 3500,
  variant_set: 800,
}
const DEFAULT_MAX_OUTPUT_TOKENS = 1500

interface ResponsesOutputContent {
  type?: string
  text?: string
  refusal?: string
}

interface ResponsesOutputItem {
  type?: string
  content?: ResponsesOutputContent[]
}

interface ResponsesBody {
  status?: string
  incomplete_details?: { reason?: string }
  output_text?: string
  output?: ResponsesOutputItem[]
  error?: { message?: string; type?: string }
}

/** Concatenated text of the answer, or a refusal if the model declined. */
function extractText(body: ResponsesBody): { text: string | null; refusal: string | null } {
  if (typeof body.output_text === "string" && body.output_text.trim().length > 0) {
    return { text: body.output_text, refusal: null }
  }
  let text = ""
  for (const item of body.output ?? []) {
    for (const part of item.content ?? []) {
      // A safety refusal is programmatically detectable and must not be parsed.
      if (typeof part.refusal === "string" && part.refusal.trim().length > 0) {
        return { text: null, refusal: part.refusal }
      }
      if (part.type === "output_text" && typeof part.text === "string") text += part.text
    }
  }
  return { text: text.trim().length > 0 ? text : null, refusal: null }
}

export const openAIProvider: ContentAIProvider = {
  name: "openai",

  isConfigured() {
    return typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.trim().length > 0
  },

  async generate(request: ProviderRequest): Promise<ProviderResult> {
    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) return { ok: false, kind: "not_configured", detail: "OPENAI_API_KEY missing" }
    const model = process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          input: [
            { role: "system", content: request.system },
            { role: "user", content: request.user },
          ],
          reasoning: { effort: "low" },
          max_output_tokens: MAX_OUTPUT_TOKENS[request.schemaName] ?? DEFAULT_MAX_OUTPUT_TOKENS,
          prompt_cache_key: `content-lab:${request.schemaName}`,
          text: {
            verbosity: "low",
            format: {
              type: "json_schema",
              name: request.schemaName,
              strict: true,
              schema: request.schema,
            },
          },
        }),
        signal: controller.signal,
      })

      const body = (await res.json().catch(() => ({}))) as ResponsesBody

      if (!res.ok) {
        const detail = body.error?.message ?? `HTTP ${res.status}`
        if (res.status === 401 || res.status === 403) return { ok: false, kind: "auth", detail }
        if (res.status === 429) return { ok: false, kind: "rate_limit", detail }
        return { ok: false, kind: "server", detail }
      }

      // A truncated answer would parse as invalid JSON; reject it explicitly.
      if (body.status === "incomplete") {
        return { ok: false, kind: "invalid_response", detail: body.incomplete_details?.reason ?? "incomplete" }
      }

      const { text, refusal } = extractText(body)
      if (refusal) return { ok: false, kind: "refusal", detail: refusal }
      if (!text) return { ok: false, kind: "invalid_response", detail: "empty output" }

      try {
        return { ok: true, data: JSON.parse(text) }
      } catch {
        return { ok: false, kind: "invalid_response", detail: "not JSON" }
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return { ok: false, kind: "timeout", detail: `timeout after ${TIMEOUT_MS}ms` }
      }
      return { ok: false, kind: "server", detail: err instanceof Error ? err.message : "unknown" }
    } finally {
      clearTimeout(timer)
    }
  },
}
