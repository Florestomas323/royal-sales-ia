import type { Analysis, Recommendation } from "./analyzer"

/**
 * Optional natural-language layer on top of the deterministic engine.
 *
 * STATUS: no AI provider is configured in this project (OPENAI_API_KEY only
 * appears commented out in .env.example and nothing reads it). Until one is
 * approved and wired server-side, this adapter is a pass-through: the
 * recommendations shown are exactly the engine's.
 *
 * Contract for a future provider (must hold, in this order of importance):
 *   - runs ONLY on the server; the browser never calls a model;
 *   - receives structured findings — never Meta tokens, never other
 *     workspaces' data, never lead PII (names, phones, emails);
 *   - may rephrase and prioritise, must NOT invent numbers or actions;
 *   - output validated against the Recommendation shape; on timeout/error the
 *     deterministic output is returned unchanged.
 */
export interface RecommendationRewriter {
  rewrite(analysis: Analysis): Promise<Recommendation[]>
}

export const passthroughRewriter: RecommendationRewriter = {
  async rewrite(analysis) {
    return analysis.recommendations
  },
}

export function isAiConfigured(): boolean {
  return false
}
