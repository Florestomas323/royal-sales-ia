/**
 * Provider-agnostic contract. Swapping OpenAI for another vendor means
 * writing a new adapter; the API route, the service and the UI stay the same.
 */
export interface ProviderRequest {
  system: string
  user: string
  /** JSON Schema the answer must satisfy (strict mode). */
  schemaName: string
  schema: object
}

export type ProviderFailureKind =
  | "not_configured"
  | "auth"
  | "rate_limit"
  | "timeout"
  | "invalid_response"
  | "refusal"
  | "server"

export type ProviderResult =
  | { ok: true; data: unknown }
  | { ok: false; kind: ProviderFailureKind; detail: string }

export interface ContentAIProvider {
  readonly name: string
  isConfigured(): boolean
  generate(request: ProviderRequest): Promise<ProviderResult>
}
