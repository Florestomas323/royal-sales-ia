import { createHash, randomBytes } from "node:crypto"
import { getAdminDb } from "@/lib/firebase/admin"
import { KEY_PREFIX, displayPrefix } from "@/lib/website-leads"
import type { WebsiteIntegration } from "@/types"

/**
 * Server-only access to `websiteIntegrations/{workspaceId}`.
 *
 * Written ONLY here, with the Admin SDK, from authenticated routes: Firestore
 * Rules deny every client write to this collection, so neither a key hash nor
 * a status can be forged from the browser. The plain key exists in memory
 * exactly once — inside `generateKey` — and is returned to the admin to copy.
 */
export const WEBSITE_INTEGRATIONS = "websiteIntegrations"

export function hashKey(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex")
}

export function generateKey(): string {
  return `${KEY_PREFIX}${randomBytes(20).toString("hex")}`
}

export async function readIntegration(workspaceId: string): Promise<WebsiteIntegration | null> {
  const snap = await getAdminDb().collection(WEBSITE_INTEGRATIONS).doc(workspaceId).get()
  return snap.exists ? (snap.data() as WebsiteIntegration) : null
}

/**
 * Creates or rotates the key. Rotation invalidates the previous key at once:
 * the old hash is gone the moment this write lands.
 */
export async function upsertIntegration(input: {
  workspaceId: string
  domain: string
  rotateKey: boolean
}): Promise<{ integration: WebsiteIntegration; plainKey: string | null }> {
  const db = getAdminDb()
  const ref = db.collection(WEBSITE_INTEGRATIONS).doc(input.workspaceId)
  const now = new Date().toISOString()
  const existing = (await ref.get()).data() as WebsiteIntegration | undefined

  const plainKey = !existing || input.rotateKey ? generateKey() : null
  const integration: WebsiteIntegration = {
    workspaceId: input.workspaceId,
    domain: input.domain,
    status: existing?.status ?? "connected",
    keyHash: plainKey ? hashKey(plainKey) : existing!.keyHash,
    keyPrefix: plainKey ? displayPrefix(plainKey) : existing!.keyPrefix,
    lastReceivedAt: existing?.lastReceivedAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  await ref.set(integration, { merge: false })
  return { integration, plainKey }
}

export async function setIntegrationStatus(
  workspaceId: string,
  status: WebsiteIntegration["status"],
): Promise<void> {
  await getAdminDb().collection(WEBSITE_INTEGRATIONS).doc(workspaceId)
    .set({ status, updatedAt: new Date().toISOString() }, { merge: true })
}

/**
 * Resolves WHICH workspace a submission belongs to, from the key alone. The
 * body never says; a caller cannot point a lead at somebody else's tenant.
 * One equality filter on the hash: no composite index.
 */
export async function resolveByKey(plainKey: string): Promise<WebsiteIntegration | null> {
  const snap = await getAdminDb()
    .collection(WEBSITE_INTEGRATIONS)
    .where("keyHash", "==", hashKey(plainKey))
    .limit(1)
    .get()
  if (snap.empty) return null
  return snap.docs[0].data() as WebsiteIntegration
}

export async function touchLastReceived(workspaceId: string, at: string): Promise<void> {
  await getAdminDb().collection(WEBSITE_INTEGRATIONS).doc(workspaceId)
    .set({ lastReceivedAt: at, updatedAt: at }, { merge: true })
}
