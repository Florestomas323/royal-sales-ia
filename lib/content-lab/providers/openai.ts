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
 */

const ENDPOINT = "https://api.openai.com/v1/responses"
export const DEFAULT_MODEL = "gpt-5.6-terra"
const TIMEOUT_MS = 45_000

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
          text: {
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
