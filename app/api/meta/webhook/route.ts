import { NextResponse } from "next/server"
import { getMetaServerEnv, isMissingEnvError } from "@/lib/meta/env"
import { verifyMetaSignature } from "@/lib/meta/signature"
import { maskId, parseMetaWebhook } from "@/lib/meta/types"
import { createLogOnlyProcessor, handleLeadgenEvent } from "@/lib/meta/processor"

/**
 * Meta Webhooks endpoint — object "page", field "leadgen".
 *
 *   GET  → subscription verification (hub.mode / hub.verify_token / hub.challenge)
 *   POST → event delivery, authenticated with X-Hub-Signature-256 (HMAC-SHA256
 *          of the RAW body with META_APP_SECRET)
 *
 * This endpoint is public by design: Meta calls it directly, so it must not
 * depend on Firebase Auth. It runs on the Node.js runtime (node:crypto).
 * Works on any domain: https://<domain>/api/meta/webhook
 */
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const processor = createLogOnlyProcessor()

function envOr503() {
  try {
    return { env: getMetaServerEnv(), response: null }
  } catch (err) {
    // Misconfiguration must be visible in server logs, never as a 200.
    console.error("[meta/webhook]", isMissingEnvError(err) ? err.message : "env error")
    return { env: null, response: new NextResponse("Webhook not configured", { status: 503 }) }
  }
}

export async function GET(request: Request) {
  const { env, response } = envOr503()
  if (!env) return response

  const { searchParams } = new URL(request.url)
  const mode = searchParams.get("hub.mode")
  const token = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  if (mode === "subscribe" && token === env.webhookVerifyToken && challenge !== null) {
    // Meta expects the raw challenge string as the body.
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }
  return new NextResponse("Forbidden", { status: 403 })
}

export async function POST(request: Request) {
  const { env, response } = envOr503()
  if (!env) return response

  // Raw body first: the signature is computed over the exact bytes.
  const rawBody = await request.text()
  const signature = request.headers.get("x-hub-signature-256")

  if (!verifyMetaSignature(rawBody, signature, env.appSecret)) {
    console.warn("[meta/webhook] invalid signature")
    return new NextResponse("Unauthorized", { status: 401 })
  }

  let json: unknown = null
  try {
    json = rawBody.length > 0 ? JSON.parse(rawBody) : null
  } catch {
    // Signed but not JSON: acknowledge so Meta does not retry forever, log it.
    console.warn("[meta/webhook] signed payload is not valid JSON")
    return NextResponse.json({ received: true, ignored: true })
  }

  const parsed = parseMetaWebhook(json)

  if (parsed.object !== "page") {
    console.info(`[meta/webhook] ignored object=${parsed.object ?? "—"}`)
    return NextResponse.json({ received: true, ignored: true })
  }

  const summary = { resolved: 0, unresolved: 0, duplicate: 0 }
  for (const event of parsed.leadgen) {
    const outcome = await handleLeadgenEvent(event, processor)
    summary[outcome.status]++
    console.info(
      `[meta/webhook] leadgen leadgen_id=${maskId(event.leadgenId)} form=${maskId(event.formId)} page=${maskId(event.pageId)} ad=${maskId(event.adId)} → ${outcome.status}${
        outcome.status === "unresolved" ? ` (${outcome.reason})` : ""
      }`,
    )
  }
  if (parsed.ignoredChanges > 0) {
    console.info(`[meta/webhook] ignored ${parsed.ignoredChanges} non-leadgen change(s)`)
  }

  return NextResponse.json({ received: true, leadgen: parsed.leadgen.length, ...summary })
}
