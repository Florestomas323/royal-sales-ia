/**
 * DESTRUCTIVE tests for "Vaciar papelera", against the Firestore EMULATOR.
 *
 * Never run these against production: they delete documents. The emulator is
 * cleared between tests, so nothing outside it is ever touched.
 *
 *   pnpm test:rules
 *
 * These exercise the deletion logic itself (what gets removed and what
 * survives) with the Admin-style access the route uses. The authorisation
 * half is covered by the assertions in tests/lead-dedup.test.mjs, which read
 * the route's real checks.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { initializeTestEnvironment } from "@firebase/rules-unit-testing"
import { collection, doc, getDoc, getDocs, setDoc, query, where } from "firebase/firestore"

const WS = "ws-APC"
const OTHER = "ws-otro"
let env
let adminDb

test.before(async () => {
  // Admin SDK against the emulator: the helper is Admin-shaped, and this is
  // how the route talks to Firestore in production too.
  process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080"
  const { initializeApp, getApps } = await import("firebase-admin/app")
  const { getFirestore } = await import("firebase-admin/firestore")
  if (!getApps().length) initializeApp({ projectId: "royal-sales-ia-trash" })
  adminDb = getFirestore()

  env = await initializeTestEnvironment({
    projectId: "royal-sales-ia-trash",
    // Rules are irrelevant here: the route runs with the Admin SDK, which
    // bypasses them. Every access below is made with rules disabled.
    firestore: { rules: "service cloud.firestore { match /databases/{db}/documents { match /{d=**} { allow read, write: if true; } } }" },
  })
})
test.after(async () => { await env?.cleanup() })
test.beforeEach(async () => { await env.clearFirestore() })

const lead = (id, o = {}) => ({
  id,
  data: {
    workspaceId: WS, leadType: "sales", name: `Lead ${id}`, phone: `+1512555${id}`,
    email: "", source: "meta", campaignId: "", campaignName: "", stage: "new_lead",
    assignedToId: "u1", createdAt: "2026-01-01T00:00:00Z", attribution: {}, archived: false,
    ...o,
  },
})

/** Seeds leads plus every related document the route is expected to remove. */
async function seed(db, leads) {
  for (const { id, data } of leads) {
    await setDoc(doc(db, "leads", id), data)
    await setDoc(doc(db, "leads", id, "activities", `act-${id}`), { workspaceId: data.workspaceId, leadId: id, type: "note" })
    await setDoc(doc(db, "appointments", `appt-${id}`), { workspaceId: data.workspaceId, leadId: id, status: "scheduled" })
    await setDoc(doc(db, "notifications", `new_lead__${id}__u1`), { workspaceId: data.workspaceId, leadId: id, userId: "u1", read: false })
    await setDoc(doc(db, "leadIdentityKeys", `key-${id}`), { workspaceId: data.workspaceId, leadId: id, nameKey: `n${id}`, phoneKey: `p${id}` })
  }
}

/**
 * The REAL helper, imported and executed against the emulator. Nothing is
 * transcribed here: this is the same function the authenticated route calls.
 * It expects an Admin-SDK-shaped Firestore, which the emulator provides
 * through firebase-admin pointed at FIRESTORE_EMULATOR_HOST.
 */
const { emptyWorkspaceTrash } = await import("../../.test-build/lib/leads/empty-trash-server.js")

test("6-7. only archived prospects are deleted; active ones survive untouched", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await seed(db, [lead("A1", { archived: true }), lead("A2", { archived: true }), lead("V1")])
    const res = await emptyWorkspaceTrash(adminDb, WS)
    assert.equal(res.deletedCount, 2)
    assert.equal((await getDoc(doc(db, "leads", "A1"))).exists(), false)
    assert.equal((await getDoc(doc(db, "leads", "A2"))).exists(), false)
    assert.equal((await getDoc(doc(db, "leads", "V1"))).exists(), true, "the active prospect survives")
  })
})

test("8. the real related documents are deleted with the lead", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await seed(db, [lead("A1", { archived: true })])
    await emptyWorkspaceTrash(adminDb, WS)
    assert.equal((await getDocs(collection(db, "leads", "A1", "activities"))).size, 0)
    assert.equal((await getDocs(query(collection(db, "appointments"), where("leadId", "==", "A1")))).size, 0)
    assert.equal((await getDocs(query(collection(db, "notifications"), where("leadId", "==", "A1")))).size, 0)
  })
})

test("9-10. dedup keys of deleted leads go; those of other leads and workspaces stay", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await seed(db, [lead("A1", { archived: true }), lead("V1")])
    await setDoc(doc(db, "leadIdentityKeys", "key-OTHER"), { workspaceId: OTHER, leadId: "X9", nameKey: "n", phoneKey: "p" })
    await emptyWorkspaceTrash(adminDb, WS)
    assert.equal((await getDoc(doc(db, "leadIdentityKeys", "key-A1"))).exists(), false, "freed: the phone+name can be captured again")
    assert.equal((await getDoc(doc(db, "leadIdentityKeys", "key-V1"))).exists(), true, "the active lead keeps its key")
    assert.equal((await getDoc(doc(db, "leadIdentityKeys", "key-OTHER"))).exists(), true, "another workspace is untouched")
  })
})

test("5. another workspace's trash is never affected", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await seed(db, [lead("A1", { archived: true })])
    await setDoc(doc(db, "leads", "B1"), { ...lead("B1", { archived: true }).data, workspaceId: OTHER })
    const res = await emptyWorkspaceTrash(adminDb, WS)
    assert.equal(res.deletedCount, 1)
    assert.equal((await getDoc(doc(db, "leads", "B1"))).exists(), true)
  })
})

test("11-12. running it twice is safe, and an empty trash returns zero", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await seed(db, [lead("A1", { archived: true })])
    assert.equal((await emptyWorkspaceTrash(adminDb, WS)).deletedCount, 1)
    const second = await emptyWorkspaceTrash(adminDb, WS)
    assert.equal(second.deletedCount, 0, "idempotent")
    assert.equal(second.success, true)
    // And on a workspace that never had archived leads.
    assert.equal((await emptyWorkspaceTrash(adminDb, OTHER)).deletedCount, 0)
  })
})

test("shared entities are never deleted", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await seed(db, [lead("A1", { archived: true })])
    await setDoc(doc(db, "campaigns", "c1"), { workspaceId: WS, name: "APC" })
    await setDoc(doc(db, "users", "u1"), { workspaceId: WS, name: "Eva" })
    await setDoc(doc(db, "workspaces", WS), { name: "APC Millennium" })
    await emptyWorkspaceTrash(adminDb, WS)
    for (const [c, id] of [["campaigns", "c1"], ["users", "u1"], ["workspaces", WS]]) {
      assert.equal((await getDoc(doc(db, c, id))).exists(), true, `${c}/${id} must survive`)
    }
  })
})
