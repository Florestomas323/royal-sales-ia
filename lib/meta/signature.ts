import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Validates Meta's `X-Hub-Signature-256` header against the RAW request body.
 *
 *   header = "sha256=" + hex(HMAC_SHA256(app_secret, raw_body))
 *
 * The comparison is constant-time. The body must be the exact bytes Meta sent
 * (no JSON re-serialisation), which is why the route reads `request.text()`
 * before parsing.
 */
export function verifyMetaSignature(
  rawBody: string,
  signatureHeader: string | null,
  appSecret: string,
): boolean {
  if (!signatureHeader) return false
  const [scheme, receivedHex] = signatureHeader.split("=", 2)
  if (scheme !== "sha256" || !receivedHex) return false

  const expectedHex = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex")
  if (receivedHex.length !== expectedHex.length) return false

  try {
    return timingSafeEqual(Buffer.from(receivedHex, "hex"), Buffer.from(expectedHex, "hex"))
  } catch {
    // Non-hex characters in the received signature.
    return false
  }
}
