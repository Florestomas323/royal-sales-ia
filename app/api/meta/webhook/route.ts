import { NextResponse } from "next/server"
import { getMetaAppSecret, getWebhookVerifyToken, isMissingEnvError } from "@/lib/meta/env"
import { verifyMetaSignature } from "@/lib/meta/signature"
import { maskId, parseMetaWebhook } from "@/lib/meta/types"
import {
  buildLeadAttribution,
  createFirestoreProcessor,
  createLogOnlyProcessor,
  handleLeadgenEvent,
  type MetaLeadProcessor,
} from "@/lib/meta/processor"
import { getAdminDb, isAdminNotConfigured } from "@/lib/firebase/admin"
import { lookupCampaignIdForAd } from "@/lib/meta/graph"

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
/**
 * Log-only mode is a LOCAL DEVELOPMENT convenience, never a production
 * fallback. Answering 200 without persisting would tell Meta the lead was
 * delivered while it was silently dropped; a 503 lets Meta retry instead.
 * Opt in explicitly, and only outside production.
 */
const LOG_ONLY_ALLOWED =
  process.env.NODE_ENV !== "production" && process.env.META_WEBHOOK_LOG_ONLY === "1"

let warnedNoAdmin = false
function getProcessor(): MetaLeadProcessor | null {
  if (processor) return processor
  try {
    processor = createFirestoreProcessor(getAdminDb())
  } catch (err) {
    if (!warnedNoAdmin) {
      warnedNoAdmin = true
      console.error(
        "[meta/webhook] persistence unavailable:",
        isAdminNotConfigured(err) ? err.message : "Firebase Admin init failed",
        LOG_ONLY_ALLOWED ? "(log-only mode, development)" : "(refusing events so Meta retries)",
      )
    }
    if (!LOG_ONLY_ALLOWED) return null
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
  if (!active) {
    // Signature already verified above: this is a real Meta event we cannot
    // store. Not a 200 — Meta must see the failure and redeliver.
    return new NextResponse("Persistence unavailable", { status: 503 })
  }
  const summary = { resolved: 0, unresolved: 0, retryable: 0, duplicate: 0, error: 0 }
  // Set when Firestore itself failed for any event in this delivery.
  let persistenceFailed = false
  /**
   * Set for outcomes that `isReprocessable` will pick up again — today only
   * `no_link` / `link_inactive`. They are stored as reprocessable but nothing
   * reprocesses them, so a 200 would strand the lead until somebody noticed.
   */
  let awaitingLink = false
  for (const event of parsed.leadgen) {
    const outcome = await handleLeadgenEvent(event, active, lookupCampaignIdForAd)
    summary[outcome.status]++
    if (outcome.status === "error" && outcome.persistence) persistenceFailed = true
    if (outcome.status === "unresolved" && (outcome.reason === "no_link" || outcome.reason === "link_inactive")) {
      awaitingLink = true
    }
    if (outcome.status === "resolved") {
      // Attribution is ready; creating the lead needs `leads_retrieval` to
      // download field_data, which Meta has not granted yet (see META.md).
      const attribution = buildLeadAttribution(event, outcome.owner, null)
      console.info(
        `[meta/webhook] lead pending download workspace=${maskId(attribution.workspaceId)} leadType=${attribution.leadType} form=${maskId(attribution.externalFormId ?? null)}`,
      )
    }
    const detail =
      outcome.status === "resolved"
        ? ` campaign=${maskId(outcome.owner.metaCampaignId)} via=${outcome.via} workspace=${maskId(outcome.owner.workspaceId)} objective=${outcome.owner.objective}`
        : outcome.status === "duplicate"
          ? ""
          : ` (${outcome.reason})`
    console.info(
      `[meta/webhook] leadgen leadgen_id=${maskId(event.leadgenId)} ad=${maskId(event.adId)} page=${maskId(event.pageId)} → ${outcome.status}${detail}`,
    )
  }
  if (parsed.ignoredChanges > 0) {
    console.info(`[meta/webhook] ignored ${parsed.ignoredChanges} non-leadgen change(s)`)
  }

  // `retryable` outcomes (Graph rate limits, transient lookup failures) have
  // no internal worker to reprocess them. Acknowledging with 200 would abandon
  // them, so Meta is asked to redeliver; `isReprocessable` marks these records
  // reprocessable, which keeps the retry idempotent.
  // A campaign with no link yet (or an inactive one) is not permanent: the
  // distributor may assign it in a minute, and the stored record is marked
  // reprocessable. Asking Meta to redeliver keeps the lead reachable, and
  // `isReprocessable` makes the retry idempotent.
  if (awaitingLink) {
    console.error("[meta/webhook] campaign not linked yet, asking Meta to redeliver")
    return new NextResponse("Campaign not linked", { status: 503 })
  }
  if (summary.retryable > 0) {
    console.error(`[meta/webhook] ${summary.retryable} retryable event(s), asking Meta to redeliver`)
    return new NextResponse("Retryable outcome", { status: 503 })
  }
  if (persistenceFailed) {
    // At least one event could not be stored. Acknowledging with 200 would
    // tell Meta the delivery landed; 5xx makes it redeliver, and the claim
    // records keep that redelivery from duplicating anything.
    console.error(`[meta/webhook] persistence failure, asking Meta to retry (errors=${summary.error})`)
    return new NextResponse("Persistence failure", { status: 503 })
  }
  return NextResponse.json({ received: true, leadgen: parsed.leadgen.length, ...summary })
}
