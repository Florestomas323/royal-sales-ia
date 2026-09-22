/**
 * REGRESSION — production incident: every stage change on an existing lead
 * was refused with
 *   "Unable to evaluate the expression as the maximum of 1000 expressions to
 *    evaluate has been reached. for 'update' @ L1814"
 * by the official emulator, with the rules byte-identical to production.
 *
 * Root cause: the leads `allow update` recomputed
 * request.resource.data.diff(resource.data).affectedKeys() ~40 times per
 * write (once per changedTo*() helper and in several branches). The rules
 * now compute it ONCE and pass it down (`ck`), together with `d`, `r`,
 * isSuperAdmin() and both lead types.
 *
 * Runs ONLY against the official Firestore emulator (real Rules engine):
 *
 *   firebase emulators:exec --only firestore --project demo-royal-sales-ia \
 *     "node --test tests/emulator/*.test.mjs"
 *
 * `pnpm test` does not run this file and cannot substitute it.
 *
 * Every DENIED expectation also asserts that the refusal is NOT the
 * 1,000-expression limit: a negative case that "passes" because the engine
 * gave up would prove nothing.
 */
import test from "node:test"
import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { initializeTestEnvironment } from "@firebase/rules-unit-testing"
import { deleteField, doc, serverTimestamp, setDoc, writeBatch } from "firebase/firestore"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
const RULES = readFileSync(join(root, "firestore.rules"), "utf8")

/** Rules published in production when the incident was reproduced (DENIED). */
const PUBLISHED_RULES_SHA256 = "f7b7941282cd1e12e50433e7c05260fb41f9acf6582a2e7d55b5158374f4eb03"
/** Rules of this branch (the refactor under test). */
const BRANCH_RULES_SHA256 = "ac3a20268704c25d2d9a190f76fee6826da232b444941fff54db4ae10094ef85"

/** `emulators:exec --project X` exports X; single-project mode expects it. */
const PROJECT_ID = process.env.GCLOUD_PROJECT || "demo-royal-sales-ia"
const LIMIT = "maximum of 1000 expressions"

const WS = "ws-lead"
const ACTORS = {
  superAdmin: { uid: "auth-super-incident", userId: "auth-super-incident", role: "super_admin", workspaceId: "ws-home" },
  distribuidor: { uid: "auth-dist", userId: "u-dist", role: "client_admin", workspaceId: WS },
  asistente: { uid: "auth-eva", userId: "u-eva", role: "manager", workspaceId: WS },
  asistenteInactiva: { uid: "auth-eva-off", userId: "u-eva-off", role: "manager", workspaceId: WS, status: "inactive" },
  asistenteOtroWs: { uid: "auth-eva-b", userId: "u-eva-b", role: "manager", workspaceId: "ws-other" },
  telemarketing: { uid: "auth-rep", userId: "u-rep", role: "sales_rep", workspaceId: WS },
  telemarketingAjeno: { uid: "auth-rep2", userId: "u-rep2", role: "sales_rep", workspaceId: WS },
  soloLectura: { uid: "auth-view", userId: "u-view", role: "viewer", workspaceId: WS },
}

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
    for (const a of Object.values(ACTORS)) {
      await setDoc(doc(db, "memberships", a.uid), {
        role: a.role,
        workspaceId: a.workspaceId,
        userId: a.userId,
        email: `${a.userId}@x.com`,
        createdAt: "2026-01-01T00:00:00Z",
        // The incident actor has NO status field (legacy → active).
        ...(a.status ? { status: a.status } : {}),
      })
    }
  })
})

function baseLead(extra = {}) {
  return {
    workspaceId: WS,
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
    // Absent unless a test adds them: closedAt, closedValue, archived, purgeClaimId, customerId.
    ...extra,
  }
}

async function seedLead(id, extra) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "leads", id), baseLead(extra))
  })
}

const dbAs = (a) => env.authenticatedContext(a.uid, { email: `${a.userId}@x.com`, email_verified: true }).firestore()

function activity(batch, db, leadId, actor, type, payload, n = 1) {
  batch.set(doc(db, "leads", leadId, "activities", `act-${leadId}-${n}`), {
    workspaceId: WS,
    leadId,
    type,
    actorId: actor.userId,
    actorRole: actor.role,
    createdAt: new Date().toISOString(),
    createdAtServer: serverTimestamp(),
    payload,
  })
}

async function commit(label, batch) {
  try {
    await batch.commit()
    console.log(`[${label}] ALLOWED`)
    return { ok: true }
  } catch (err) {
    console.log(`[${label}] DENIED code=${err?.code}\n${err?.message}`)
    return { ok: false, code: err?.code, message: String(err?.message ?? "") }
  }
}

async function expectAllowed(label, build) {
  const r = await commit(label, await build())
  assert.ok(r.ok, `${label}: expected ALLOWED, got ${r.code}\n${r.message}`)
}

async function expectDenied(label, build) {
  const r = await commit(label, await build())
  assert.equal(r.ok, false, `${label}: expected DENIED, but it was ALLOWED`)
  assert.equal(r.code, "permission-denied", `${label}: unexpected error ${r.code}`)
  assert.ok(!r.message.includes(LIMIT), `${label}: denied by the expression LIMIT, not by the rule:\n${r.message}`)
}

/* ------------------------------------------------------------ provenance -- */

test("0. rules under test = this branch's firestore.rules (and they are NOT the published ones)", () => {
  const sha = createHash("sha256").update(RULES, "utf8").digest("hex")
  console.log(`[rules] sha256=${sha} (published=${PUBLISHED_RULES_SHA256})`)
  assert.equal(sha, BRANCH_RULES_SHA256)
  assert.notEqual(sha, PUBLISHED_RULES_SHA256)
})

/* ---------------------------------------------------- the incident, exact -- */

test("INCIDENT: one writeBatch = update stage + create stage_change (payload from/to)", async () => {
  const a = ACTORS.superAdmin
  await seedLead("lead-incident")
  await expectAllowed("INCIDENT", () => {
    const db = dbAs(a)
    const b = writeBatch(db)
    b.update(doc(db, "leads", "lead-incident"), { stage: "follow_up" })
    activity(b, db, "lead-incident", a, "stage_change", { from: "new_lead", to: "follow_up" })
    return b
  })
})

test("A. control: batch with ONLY the lead update", async () => {
  await seedLead("lead-a")
  await expectAllowed("A", () => {
    const db = dbAs(ACTORS.superAdmin)
    const b = writeBatch(db)
    b.update(doc(db, "leads", "lead-a"), { stage: "follow_up" })
    return b
  })
})

test("B. control: full batch exactly as updateLead() sends it (payload with labels)", async () => {
  const a = ACTORS.superAdmin
  await seedLead("lead-b")
  await expectAllowed("B", () => {
    const db = dbAs(a)
    const b = writeBatch(db)
    b.update(doc(db, "leads", "lead-b"), { stage: "follow_up" })
    activity(b, db, "lead-b", a, "stage_change", { from: "new_lead", to: "follow_up", fromLabel: "Prospecto nuevo", toLabel: "Seguimiento" })
    return b
  })
})

/* ------------------------------------ heaviest legitimate writes (budget) -- */

test("WORST CASE: Distribuidor edits 7 fields + stage_change + assignment_change in one batch", async () => {
  const a = ACTORS.distribuidor
  await seedLead("lead-heavy")
  await expectAllowed("WORST-EDIT", () => {
    const db = dbAs(a)
    const b = writeBatch(db)
    b.update(doc(db, "leads", "lead-heavy"), {
      stage: "appointment",
      assignedToId: "u-eva",
      name: "Nombre corregido",
      phone: "+15125550199",
      email: "correo@ejemplo.com",
      nextAction: "Confirmar demostración",
      source: "whatsapp",
    })
    activity(b, db, "lead-heavy", a, "stage_change", { from: "new_lead", to: "appointment", fromLabel: "Prospecto nuevo", toLabel: "Demostración agendada" }, 1)
    activity(b, db, "lead-heavy", a, "assignment_change", { from: "u-rep", to: "u-eva", fromLabel: "Rep", toLabel: "Eva" }, 2)
    return b
  })
})

test("Asistente: appointment → follow_up with reassignment (the original report)", async () => {
  const a = ACTORS.asistente
  await seedLead("lead-eva", { stage: "appointment", assignedToId: "" })
  await expectAllowed("ASISTENTE", () => {
    const db = dbAs(a)
    const b = writeBatch(db)
    b.update(doc(db, "leads", "lead-eva"), { stage: "follow_up", assignedToId: "u-eva" })
    activity(b, db, "lead-eva", a, "stage_change", { from: "appointment", to: "follow_up", fromLabel: "Demostración agendada", toLabel: "Seguimiento" }, 1)
    activity(b, db, "lead-eva", a, "assignment_change", { from: "", to: "u-eva", fromLabel: "", toLabel: "Eva" }, 2)
    return b
  })
})

test("closing a sale: stage sale + closedValue + closedAt + activity", async () => {
  const a = ACTORS.distribuidor
  await seedLead("lead-sale", { stage: "follow_up" })
  await expectAllowed("CLOSE-SALE", () => {
    const db = dbAs(a)
    const b = writeBatch(db)
    b.update(doc(db, "leads", "lead-sale"), { stage: "sale", closedValue: 1500, closedAt: new Date().toISOString() })
    activity(b, db, "lead-sale", a, "stage_change", { from: "follow_up", to: "sale", fromLabel: "Seguimiento", toLabel: "Venta" })
    return b
  })
})

test("Telemarketing works its OWN lead through the whitelist", async () => {
  const a = ACTORS.telemarketing
  await seedLead("lead-rep")
  await expectAllowed("REP-OWN", () => {
    const db = dbAs(a)
    const b = writeBatch(db)
    b.update(doc(db, "leads", "lead-rep"), { stage: "follow_up", nextAction: "Llamar mañana", lastContactAt: new Date().toISOString() })
    activity(b, db, "lead-rep", a, "stage_change", { from: "new_lead", to: "follow_up" })
    return b
  })
})

test("leadType change by an admin, resetting the stage to the new pipeline's first one", async () => {
  await seedLead("lead-type-ok")
  await expectAllowed("LEADTYPE-OK", () => {
    const db = dbAs(ACTORS.distribuidor)
    const b = writeBatch(db)
    b.update(doc(db, "leads", "lead-type-ok"), { leadType: "recruiting", stage: "rec_new" })
    return b
  })
})

/* -------------------------------------------- protections still in place -- */

const onlyUpdate = (actor, id, data) => () => {
  const db = dbAs(actor)
  const b = writeBatch(db)
  b.update(doc(db, "leads", id), data)
  return b
}

const DENIED_CASES = [
  // roles / workspace
  ["viewer cannot write", ACTORS.soloLectura, {}, { stage: "follow_up" }],
  ["inactive Asistente cannot write", ACTORS.asistenteInactiva, {}, { stage: "follow_up" }],
  ["Asistente of ANOTHER workspace cannot write", ACTORS.asistenteOtroWs, {}, { stage: "follow_up" }],
  ["Telemarketing cannot write a lead assigned to someone else", ACTORS.telemarketingAjeno, {}, { stage: "follow_up" }],
  ["Telemarketing cannot reassign its own lead", ACTORS.telemarketing, {}, { assignedToId: "u-rep2" }],
  ["Telemarketing cannot change the channel", ACTORS.telemarketing, {}, { source: "whatsapp" }],
  ["Telemarketing cannot archive", ACTORS.telemarketing, {}, { archived: true }],
  ["Telemarketing cannot change leadType", ACTORS.telemarketing, {}, { leadType: "recruiting", stage: "rec_new" }],
  // immutables — for the super admin too
  ["super admin cannot move the lead to another workspace", ACTORS.superAdmin, {}, { workspaceId: "ws-other" }],
  ["super admin cannot rewrite attribution", ACTORS.superAdmin, {}, { attribution: { platform: "web" } }],
  ["super admin cannot change createdAt", ACTORS.superAdmin, {}, { createdAt: "2027-01-01T00:00:00.000Z" }],
  ["super admin cannot change clientId", ACTORS.superAdmin, {}, { clientId: "otro" }],
  ["super admin cannot write webForm", ACTORS.superAdmin, {}, { webForm: { form: "x" } }],
  ["super admin cannot touch purge bookkeeping", ACTORS.superAdmin, {}, { purgeClaimId: "c" }],
  // pipeline
  ["an invented stage is refused", ACTORS.distribuidor, {}, { stage: "inventada" }],
  ["a sales lead cannot take a recruiting stage", ACTORS.distribuidor, {}, { stage: "rec_new" }],
  ["an invalid leadType is refused", ACTORS.distribuidor, {}, { leadType: "inventado" }],
  ["a leadType change must reset the stage", ACTORS.distribuidor, {}, { leadType: "recruiting" }],
  // closing
  ["residual closedAt blocks a stage change", ACTORS.distribuidor, { closedAt: "2026-01-01T00:00:00.000Z" }, { stage: "follow_up" }],
  ["entering sale needs a positive amount", ACTORS.distribuidor, {}, { stage: "sale", closedAt: "2026-09-22T00:00:00.000Z" }],
  ["leaving sale must clear closing data", ACTORS.distribuidor, { stage: "sale", closedValue: 900, closedAt: "2026-09-01T00:00:00.000Z" }, { stage: "follow_up" }],
  // shape
  ["name cannot become empty", ACTORS.distribuidor, {}, { name: "" }],
  ["phone must stay a string", ACTORS.distribuidor, {}, { phone: 5125550100 }],
  ["email must be a string or null", ACTORS.distribuidor, {}, { email: 42 }],
  ["temperature must be hot/warm/cold", ACTORS.distribuidor, {}, { temperature: "tibio" }],
  ["archived must be a bool", ACTORS.distribuidor, {}, { archived: "yes" }],
  ["assignedToId cannot be removed", ACTORS.distribuidor, {}, { assignedToId: deleteField() }],
  // customer link
  ["a customer cannot be linked outside a real close", ACTORS.distribuidor, {}, { customerId: "c-1" }],
]

for (const [label, actor, extra, data] of DENIED_CASES) {
  test(`DENIED — ${label}`, async () => {
    const id = `lead-neg-${label.replace(/[^a-z0-9]+/gi, "-").slice(0, 40)}`
    await seedLead(id, extra)
    await expectDenied(label, onlyUpdate(actor, id, data))
  })
}

test("DENIED — an activity whose actorRole is not the caller's real role sinks the batch", async () => {
  const a = ACTORS.asistente
  await seedLead("lead-fake-role")
  await expectDenied("fake actorRole", () => {
    const db = dbAs(a)
    const b = writeBatch(db)
    b.update(doc(db, "leads", "lead-fake-role"), { stage: "follow_up" })
    activity(b, db, "lead-fake-role", { ...a, role: "client_admin" }, "stage_change", { from: "new_lead", to: "follow_up" })
    return b
  })
})
