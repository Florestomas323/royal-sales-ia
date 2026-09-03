import { NextResponse } from "next/server"
import { getMetaAppSecret, getWebhookVerifyToken, isMissingEnvError } from "@/lib/meta/env"
import { verifyMetaSignature } from "@/lib/meta/signature"
import { maskId, parseMetaWebhook } from "@/lib/meta/types"
import {
  createFirestoreProcessor,
  createLogOnlyProcessor,
  handleLeadgenEvent,
  type MetaLeadProcessor,
} from "@/lib/meta/processor"
import { getAdminDb, isAdminNotConfigured } from "@/lib/firebase/admin"

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

/**
 * Persistent processor when Firebase Admin is configured; otherwise a log-only
 * fallback so Meta still gets a 200 (and the misconfiguration is logged once).
 */
let processor: MetaLeadProcessor | null = null
let warnedNoAdmin = false
function getProcessor(): MetaLeadProcessor {
  if (processor) return processor
  try {
    processor = createFirestoreProcessor(getAdminDb())
  } catch (err) {
    if (!warnedNoAdmin) {
      warnedNoAdmin = true
      console.error(
        "[meta/webhook] persistence disabled:",
        isAdminNotConfigured(err) ? err.message : "Firebase Admin init failed",
      )
    }
    processor = createLogOnlyProcessor()
  }
  return processor
}

/** Reads one secret; on misconfiguration logs the variable NAME (never the value). */
function readSecret(read: () => string): string | null {
  try {
    return read()
  } catch (err) {
    console.error("[meta/webhook]", isMissingEnvError(err) ? err.message : "env error")
    return null
  }
}

const notConfigured = () => new NextResponse("Webhook not configured", { status: 503 })

export async function GET(request: Request) {
  // GET only needs the verify token; META_APP_SECRET is not required here.
  const verifyToken = readSecret(getWebhookVerifyToken)
  if (!verifyToken) return notConfigured()

  const { searchParams } = new URL(request.url)
  const rawMode = searchParams.get("hub.mode")
  const rawToken = searchParams.get("hub.verify_token")
  const challenge = searchParams.get("hub.challenge")

  const mode = rawMode?.trim()
  const token = rawToken?.trim()
  const matches = token !== undefined && token === verifyToken

  // TEMPORARY diagnostic logging (remove once the subscription is verified).
  // Only shapes and lengths — never the token values, never the app secret.
  console.info(
    "[meta/webhook][GET] " +
      `mode=${mode ?? "—"} ` +
      `hasVerifyToken=${rawToken !== null} ` +
      `receivedLen=${token?.length ?? 0} ` +
      `expectedLen=${verifyToken.length} ` +
      `matches=${matches} ` +
      `hasChallenge=${challenge !== null} ` +
      `params=[${[...searchParams.keys()].join(",")}]`,
  )

  if (mode === "subscribe" && matches && challenge !== null) {
    // Meta expects the raw challenge string as the body.
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  }
  return new NextResponse("Forbidden", { status: 403 })
}

export async function POST(request: Request) {
  const appSecret = readSecret(getMetaAppSecret)
  if (!appSecret) return notConfigured()

  // Raw body first: the signature is computed over the exact bytes.
  const rawBody = await request.text()
  const signature = request.headers.get("x-hub-signature-256")

  if (!verifyMetaSignature(rawBody, signature, appSecret)) {
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

  const active = getProcessor()
  const summary = { resolved: 0, unresolved: 0, duplicate: 0, error: 0 }
  for (const event of parsed.leadgen) {
    const outcome = await handleLeadgenEvent(event, active)
    summary[outcome.status]++
    console.info(
      `[meta/webhook] leadgen leadgen_id=${maskId(event.leadgenId)} form=${maskId(event.formId)} page=${maskId(event.pageId)} ad=${maskId(event.adId)} campaign=${maskId(event.campaignId)} → ${outcome.status}${
        outcome.status === "unresolved" || outcome.status === "error" ? ` (${outcome.reason})` : ""
      }`,
    )
  }
  if (parsed.ignoredChanges > 0) {
    console.info(`[meta/webhook] ignored ${parsed.ignoredChanges} non-leadgen change(s)`)
  }

  return NextResponse.json({ received: true, leadgen: parsed.leadgen.length, ...summary })
}
