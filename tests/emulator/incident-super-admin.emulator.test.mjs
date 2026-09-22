/**
 * REGRESSION — production incident: a stage change on an existing lead is
 * refused with permission-denied.
 *
 * Runs ONLY against the official Firestore emulator (real Rules engine):
 *
 *   firebase emulators:exec --only firestore --project demo-royal-sales-ia \
 *     "node --test tests/emulator/*.test.mjs"
 *
 * `pnpm test` does not run this file and cannot substitute it.
 *
 * Topology copied from the production report:
 *   - actor: super_admin; membership.userId is the same actor id as the auth UID;
 *   - membership.status ABSENT (legacy → active);
 *   - membership.workspaceId DIFFERENT from the lead's workspace;
 *   - lead: stage new_lead, leadType sales, assignedToId non-empty, and no
 *     closedAt / closedValue / archived / purgeClaimId / customerId.
 *
 * Every test prints the emulator's full error message on failure: unlike
 * production, the emulator names the rule line and the evaluation error.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { initializeTestEnvironment } from "@firebase/rules-unit-testing"
import { doc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
const RULES = readFileSync(join(root, "firestore.rules"), "utf8")

/**
 * sha256 of the rules the production diagnostic (diag-v3) confirmed as
 * published. If this assertion fails, the file under test is NOT the
 * published one and nothing below proves anything about production.
 */
const PUBLISHED_RULES_SHA256 = "f7b7941282cd1e12e50433e7c05260fb41f9acf6582a2e7d55b5158374f4eb03"

/** `emulators:exec --project X` exports X; single-project mode requires using it. */
const PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-royal-sales-ia"

const SUPER = { uid: "auth-super-incident", role: "super_admin", homeWorkspace: "ws-home" }
const LEAD_WORKSPACE = "ws-lead"

let env

test.before(async () => {
  env = await initializeTestEnvironment({ projectId: PROJECT_ID, firestore: { rules: RULES } })
})
test.after(async () => {
  await env?.cleanup()
})
test.beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    // Legacy membership: NO `status` field at all.
    await setDoc(doc(db, "memberships", SUPER.uid), {
      role: SUPER.role,
      workspaceId: SUPER.homeWorkspace,
      userId: SUPER.uid,
      email: "super@x.com",
      createdAt: "2026-01-01T00:00:00Z",
    })
  })
})

async function seedLead(id) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "leads", id), {
      workspaceId: LEAD_WORKSPACE,
      leadType: "sales",
      stage: "new_lead",
      name: "Prospecto Incidente",
      phone: "+15125550100",
      email: "",
      source: "meta",
      assignedToId: "u-rep",
      campaignId: "",
      campaignName: "",
      score: 50,
      temperature: "warm",
      potentialValue: 0,
      createdAt: "2026-09-20T00:00:00.000Z",
      lastContactAt: null,
      nextFollowUpAt: null,
      nextAction: "Primer contacto",
      clientId: "",
      // Deliberately absent: closedAt, closedValue, archived, purgeClaimId, customerId.
    })
  })
}

const superDb = () =>
  env.authenticatedContext(SUPER.uid, { email: "super@x.com", email_verified: true }).firestore()

/** Runs the commit and reports the emulator's verdict verbatim. */
async function commit(label, batch) {
  try {
    await batch.commit()
    console.log(`[${label}] ALLOWED`)
    return { ok: true }
  } catch (err) {
    console.log(`[${label}] DENIED code=${err?.code}\n${err?.message}`)
    return { ok: false, code: err?.code, message: err?.message }
  }
}

function stageActivity(batch, db, leadId, payload) {
  batch.set(doc(db, "leads", leadId, "activities", `act-${leadId}`), {
    workspaceId: LEAD_WORKSPACE,
    leadId,
    type: "stage_change",
    actorId: SUPER.uid, // = membership.userId
    actorRole: "super_admin",
    createdAt: new Date().toISOString(),
    createdAtServer: serverTimestamp(),
    payload,
  })
}

test("0. the rules under test are byte-identical to the published ones", () => {
  const sha = createHash("sha256").update(RULES, "utf8").digest("hex")
  assert.equal(sha, PUBLISHED_RULES_SHA256)
})

test("INCIDENT: one writeBatch = update stage + create stage_change (payload from/to)", async () => {
  await seedLead("lead-incident")
  const db = superDb()
  const batch = writeBatch(db)
  batch.update(doc(db, "leads", "lead-incident"), { stage: "follow_up" })
  stageActivity(batch, db, "lead-incident", { from: "new_lead", to: "follow_up" })
  const r = await commit("INCIDENT", batch)
  assert.ok(r.ok, `INCIDENT denied by the real engine: ${r.code}\n${r.message}`)
})

test("A. control: batch with ONLY the lead update", async () => {
  await seedLead("lead-a")
  const db = superDb()
  const batch = writeBatch(db)
  batch.update(doc(db, "leads", "lead-a"), { stage: "follow_up" })
  const r = await commit("A", batch)
  assert.ok(r.ok, `A denied by the real engine: ${r.code}\n${r.message}`)
})

test("B. control: full batch exactly as updateLead() sends it (payload with labels)", async () => {
  await seedLead("lead-b")
  const db = superDb()
  const batch = writeBatch(db)
  batch.update(doc(db, "leads", "lead-b"), { stage: "follow_up" })
  stageActivity(batch, db, "lead-b", {
    from: "new_lead",
    to: "follow_up",
    fromLabel: "Prospecto nuevo",
    toLabel: "Seguimiento",
  })
  const r = await commit("B", batch)
  assert.ok(r.ok, `B denied by the real engine: ${r.code}\n${r.message}`)
})
