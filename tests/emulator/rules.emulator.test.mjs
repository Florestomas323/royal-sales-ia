/**
 * REAL Firestore Rules tests, against the emulator.
 *
 * These are NOT run by `pnpm test`: the emulator JAR is downloaded from
 * storage.googleapis.com, which is unreachable from the environment where
 * this code was written. They are written to be run by you:
 *
 *   npx firebase-tools emulators:exec --only firestore \
 *     "node --test tests/emulator/rules.emulator.test.mjs"
 *
 * with a firebase.json pointing at firestore.rules, e.g.
 *
 *   { "firestore": { "rules": "firestore.rules" },
 *     "emulators": { "firestore": { "port": 8080 }, "ui": { "enabled": false } } }
 *
 * Unlike the CEL-interpreter tests in tests/firestore-rules.test.mjs, this
 * file exercises the rules exactly as Firestore evaluates them: real
 * get()/getAfter(), real batches, real allow/deny.
 *
 * Requires @firebase/rules-unit-testing (a devDependency you would add
 * locally; it is deliberately NOT in package.json, so `pnpm install
 * --frozen-lockfile` keeps working unchanged).
 */
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing"
import { doc, getDoc, setDoc, updateDoc, writeBatch, serverTimestamp } from "firebase/firestore"

const root = join(dirname(fileURLToPath(import.meta.url)), "../..")
const WS = "ws-A"
const OTHER_WS = "ws-B"

let env

/* ------------------------------------------------------------------ setup */

/**
 * Topology that matches production: the super admin's membership lives in
 * workspace A (his own), and every lead under test lives in workspace B
 * (APC). The earlier version of this file seeded both in the same workspace,
 * which could never reproduce a cross-workspace failure.
 */
const SUPER_HOME = OTHER_WS
const ACTORS = {
  superAdmin: { uid: "auth-super", userId: "u-super", role: "super_admin", workspaceId: SUPER_HOME },
  outsider: { uid: "auth-outsider", userId: "u-out", role: "client_admin", workspaceId: OTHER_WS },
  distribuidora: { uid: "auth-eva-ca", userId: "u-eva", role: "client_admin", workspaceId: WS },
  asistente: { uid: "auth-eva-mg", userId: "u-eva", role: "manager", workspaceId: WS },
  telemarketing: { uid: "auth-tm", userId: "u-tm", role: "sales_rep", workspaceId: WS },
}

/** Seeds memberships, users, workspace, campaigns and leads with rules OFF. */
async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    for (const a of Object.values(ACTORS)) {
      await setDoc(doc(db, "memberships", a.uid), {
        workspaceId: a.workspaceId ?? WS,
        role: a.role,
        userId: a.userId,
        email: `${a.userId}@x.com`,
        status: "active",
        createdAt: "2026-01-01T00:00:00Z",
      })
      await setDoc(doc(db, "users", a.userId), {
        workspaceId: a.workspaceId ?? WS,
        name: a.userId,
        email: `${a.userId}@x.com`,
        role: a.role === "super_admin" ? "client_admin" : a.role,
        status: "active",
        authUid: a.uid,
        avatarColor: "#000",
        createdAt: "2026-01-01T00:00:00Z",
      })
    }
    await setDoc(doc(db, "workspaces", WS), {
      name: "APC", status: "active", createdAt: "2026-01-01T00:00:00Z",
      seats: { client_admin: ["u-eva"], manager: [], sales_rep: ["u-tm"] },
    })
    await setDoc(doc(db, "campaigns", "c-own"), {
      workspaceId: WS, name: "Campaña propia", platform: "meta", status: "active",
      objective: "sales", spend: 0, leads: 0, cpl: 0, appointments: 0, sales: 0,
      revenue: 0, roas: 0, clientId: "", createdAt: "2026-01-01T00:00:00Z",
    })
    await setDoc(doc(db, "campaigns", "c-foreign"), {
      workspaceId: OTHER_WS, name: "Campaña ajena", platform: "meta", status: "active",
      objective: "sales", spend: 0, leads: 0, cpl: 0, appointments: 0, sales: 0,
      revenue: 0, roas: 0, clientId: "", createdAt: "2026-01-01T00:00:00Z",
    })
  })
}

/** A lead WITH leadType (modern) or WITHOUT it (legacy, pre-Fase 1). */
async function seedLead(id, { legacy = false, stage = "new_lead", assignedToId = "u-tm" } = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    const base = {
      workspaceId: WS, name: "María González", phone: "+15555550100", email: "",
      source: "meta", campaignId: "", campaignName: "", score: 50, temperature: "warm",
      stage, assignedToId, potentialValue: 0,
      createdAt: "2025-03-01T00:00:00Z", lastContactAt: null, nextFollowUpAt: null,
      nextAction: "", attribution: { platform: "meta" }, clientId: "",
    }
    // The whole point: a lead created before `leadType` existed.
    await setDoc(doc(db, "leads", id), legacy ? base : { ...base, leadType: "sales" })
  })
}

const asActor = (a) => env.authenticatedContext(a.uid, { email: `${a.userId}@x.com`, email_verified: true }).firestore()

/**
 * The batch createAppointment() performs: appointment + stage + activity.
 * `leadName` is the lead's REAL name, as the app sends it (the server route
 * copies `current.name`; the Rules require leadName == referencedLead().name).
 * It defaults to the name seedLead() uses.
 */
async function bookMeeting(db, actor, { leadId, leadType = "sales", stage = "new_lead", leadName = "María González" }) {
  const batch = writeBatch(db)
  const apptRef = doc(db, "appointments", `appt-${leadId}-${Date.now()}`)
  batch.set(apptRef, {
    workspaceId: WS, leadId, leadName, leadType,
    assignedToId: actor.userId, scheduledAt: "2026-10-01T15:00:00Z", durationMinutes: 60,
    type: "demo", status: "scheduled", createdBy: actor.userId,
    location: { addressLine1: "1 Main St", city: "Austin", state: "TX", postalCode: "78701" },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  })
  // Fase 3: the stage follows the meeting, in the same batch.
  const to = leadType === "recruiting" ? "rec_interview" : "appointment"
  batch.update(doc(db, "leads", leadId), { stage: to })
  batch.set(doc(db, "leads", leadId, "activities", `act-${Date.now()}`), {
    workspaceId: WS, leadId, type: "stage_change", actorId: actor.userId, actorRole: actor.role,
    createdAt: new Date().toISOString(), createdAtServer: serverTimestamp(),
    payload: { from: stage, to, fromLabel: "Prospecto nuevo", toLabel: "Demostración agendada" },
  })
  return batch.commit()
}

/** The batch archiveLead() performs. */
async function archive(db, actor, leadId) {
  const batch = writeBatch(db)
  batch.update(doc(db, "leads", leadId), {
    archived: true, archivedAt: new Date().toISOString(),
    archivedBy: actor.userId, archivedByName: actor.userId,
  })
  batch.set(doc(db, "leads", leadId, "activities", `arc-${Date.now()}`), {
    workspaceId: WS, leadId, type: "archived", actorId: actor.userId, actorRole: actor.role,
    createdAt: new Date().toISOString(), createdAtServer: serverTimestamp(), payload: {},
  })
  return batch.commit()
}

async function restore(db, actor, leadId) {
  const batch = writeBatch(db)
  batch.update(doc(db, "leads", leadId), {
    archived: false, archivedAt: null, archivedBy: null, archivedByName: null,
  })
  batch.set(doc(db, "leads", leadId, "activities", `res-${Date.now()}`), {
    workspaceId: WS, leadId, type: "restored", actorId: actor.userId, actorRole: actor.role,
    createdAt: new Date().toISOString(), createdAtServer: serverTimestamp(), payload: {},
  })
  return batch.commit()
}

test.before(async () => {
  env = await initializeTestEnvironment({
    projectId: "royal-sales-ia-rules",
    firestore: { rules: readFileSync(join(root, "firestore.rules"), "utf8") },
  })
})
test.after(async () => { await env?.cleanup() })
test.beforeEach(async () => {
  await env.clearFirestore()
  await seed()
})

/* --------------------------------------- the reported failures, both shapes */

for (const [label, actor] of [
  ["super_admin", ACTORS.superAdmin],
  ["client_admin (Distribuidora)", ACTORS.distribuidora],
  ["manager (Asistente)", ACTORS.asistente],
]) {
  for (const legacy of [false, true]) {
    const shape = legacy ? "WITHOUT leadType (legacy)" : "with leadType"

    test(`${label} books a meeting on a lead ${shape}`, async () => {
      await seedLead("L1", { legacy })
      await assertSucceeds(bookMeeting(asActor(actor), actor, { leadId: "L1" }))
      // …and the stage really moved.
      await env.withSecurityRulesDisabled(async (ctx) => {
        const snap = await getDoc(doc(ctx.firestore(), "leads", "L1"))
        assert.equal(snap.data().stage, "appointment")
      })
    })

    test(`${label} archives and restores a lead ${shape}`, async () => {
      await seedLead("L2", { legacy })
      const db = asActor(actor)
      await assertSucceeds(archive(db, actor, "L2"))
      await env.withSecurityRulesDisabled(async (ctx) => {
        const snap = await getDoc(doc(ctx.firestore(), "leads", "L2"))
        assert.equal(snap.data().archived, true, "soft delete: the document survives")
      })
      await assertSucceeds(restore(db, actor, "L2"))
    })

    test(`${label} cancels a meeting on a lead ${shape}`, async () => {
      await seedLead("L3", { legacy, stage: "appointment" })
      const db = asActor(actor)
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "appointments", "appt-cancel"), {
          workspaceId: WS, leadId: "L3", leadName: "María González", leadType: "sales",
          assignedToId: actor.userId, scheduledAt: "2026-10-01T15:00:00Z", durationMinutes: 60,
          type: "demo", status: "scheduled", createdBy: actor.userId,
          location: { addressLine1: "1 Main St", city: "Austin", state: "TX", postalCode: "78701" },
          createdAt: "2026-09-01T00:00:00Z", updatedAt: "2026-09-01T00:00:00Z",
        })
      })
      const batch = writeBatch(db)
      batch.update(doc(db, "appointments", "appt-cancel"), { status: "cancelled", updatedAt: new Date().toISOString() })
      batch.update(doc(db, "leads", "L3"), { stage: "follow_up" })
      batch.set(doc(db, "leads", "L3", "activities", `c-${Date.now()}`), {
        workspaceId: WS, leadId: "L3", type: "stage_change", actorId: actor.userId, actorRole: actor.role,
        createdAt: new Date().toISOString(), createdAtServer: serverTimestamp(),
        payload: { from: "appointment", to: "follow_up", fromLabel: "Demostración agendada", toLabel: "Seguimiento" },
      })
      await assertSucceeds(batch.commit())
    })

    test(`${label} attributes a campaign of the SAME workspace on a lead ${shape}`, async () => {
      await seedLead("L4", { legacy })
      await assertSucceeds(
        updateDoc(doc(asActor(actor), "leads", "L4"), {
          campaignId: "c-own", campaignName: "Campaña propia", attributionSource: "manual",
        }),
      )
    })

    test(`${label} sets "Sin campaña" on a lead ${shape}`, async () => {
      await seedLead("L5", { legacy })
      await assertSucceeds(
        updateDoc(doc(asActor(actor), "leads", "L5"), {
          campaignId: "", campaignName: "", attributionSource: "manual",
        }),
      )
    })

    test(`${label} corrects the channel on a lead ${shape}`, async () => {
      await seedLead("L6", { legacy })
      await assertSucceeds(updateDoc(doc(asActor(actor), "leads", "L6"), { source: "whatsapp" }))
    })
  }
}

/* ----------------------------------------------- isolation must still hold */

test("a campaign of ANOTHER workspace is refused, legacy lead included", async () => {
  for (const legacy of [false, true]) {
    await env.clearFirestore(); await seed()
    await seedLead("L7", { legacy })
    await assertFails(
      updateDoc(doc(asActor(ACTORS.distribuidora), "leads", "L7"), {
        campaignId: "c-foreign", campaignName: "Campaña ajena", attributionSource: "manual",
      }),
    )
  }
})

test("an invented campaignId is refused", async () => {
  await seedLead("L8")
  await assertFails(
    updateDoc(doc(asActor(ACTORS.distribuidora), "leads", "L8"), {
      campaignId: "no-existe", campaignName: "x", attributionSource: "manual",
    }),
  )
})

test("Telemarketing cannot attribute, change the channel, or archive", async () => {
  await seedLead("L9", { assignedToId: "u-tm" })
  const db = asActor(ACTORS.telemarketing)
  await assertFails(updateDoc(doc(db, "leads", "L9"), { campaignId: "c-own", campaignName: "Campaña propia", attributionSource: "manual" }))
  await assertFails(updateDoc(doc(db, "leads", "L9"), { source: "whatsapp" }))
  await assertFails(archive(db, ACTORS.telemarketing, "L9"))
  // …but it can still do its own job.
  await assertSucceeds(updateDoc(doc(db, "leads", "L9"), { stage: "follow_up", updatedAt: new Date().toISOString() }))
})

test("an invalid leadType is still refused, legacy default or not", async () => {
  await seedLead("L10", { legacy: true })
  await assertFails(updateDoc(doc(asActor(ACTORS.distribuidora), "leads", "L10"), { leadType: "inventado" }))
})

test("a lead of another workspace stays unreachable", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "leads", "L-other"), {
      workspaceId: OTHER_WS, name: "Ajeno", phone: "+15555550111", email: "", source: "meta",
      campaignId: "", campaignName: "", score: 50, temperature: "warm", stage: "new_lead",
      assignedToId: "", potentialValue: 0, createdAt: "2026-01-01T00:00:00Z",
      lastContactAt: null, nextFollowUpAt: null, nextAction: "", attribution: {}, clientId: "",
      leadType: "sales",
    })
  })
  await assertFails(updateDoc(doc(asActor(ACTORS.distribuidora), "leads", "L-other"), { stage: "follow_up" }))
})

/* ================== cross-workspace, exactly as in production ============ */

test("the super admin's membership is NOT in the lead's workspace (precondition of these tests)", async () => {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const m = await getDoc(doc(ctx.firestore(), "memberships", ACTORS.superAdmin.uid))
    assert.notEqual(m.data().workspaceId, WS)
  })
})

for (const legacy of [false, true]) {
  const shape = legacy ? "WITHOUT leadType (legacy)" : "with leadType"

  test(`super admin from workspace A archives, restores and books on a workspace-B lead ${shape}`, async () => {
    await seedLead("X1", { legacy })
    const db = asActor(ACTORS.superAdmin)
    await assertSucceeds(archive(db, ACTORS.superAdmin, "X1"))
    await assertSucceeds(restore(db, ACTORS.superAdmin, "X1"))
    await assertSucceeds(bookMeeting(db, ACTORS.superAdmin, { leadId: "X1" }))
    await env.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(doc(ctx.firestore(), "leads", "X1"))
      assert.equal(snap.data().stage, "appointment")
      assert.equal(snap.data().workspaceId, WS, "the lead never moves workspace")
    })
  })

  test(`super admin from workspace A changes campaign and channel on a workspace-B lead ${shape}`, async () => {
    await seedLead("X2", { legacy })
    const db = asActor(ACTORS.superAdmin)
    await assertSucceeds(updateDoc(doc(db, "leads", "X2"), { campaignId: "c-own", campaignName: "Campaña propia", attributionSource: "manual" }))
    await assertSucceeds(updateDoc(doc(db, "leads", "X2"), { source: "whatsapp" }))
    // …but never to a campaign of a third workspace.
    await assertFails(updateDoc(doc(db, "leads", "X2"), { campaignId: "c-foreign", campaignName: "Campaña ajena", attributionSource: "manual" }))
  })
}

test("an admin of workspace A is refused on every operation in workspace B", async () => {
  await seedLead("X3")
  const db = asActor(ACTORS.outsider)
  await assertFails(getDoc(doc(db, "leads", "X3")))
  await assertFails(archive(db, ACTORS.outsider, "X3"))
  await assertFails(bookMeeting(db, ACTORS.outsider, { leadId: "X3" }))
  await assertFails(updateDoc(doc(db, "leads", "X3"), { campaignId: "c-own", campaignName: "Campaña propia", attributionSource: "manual" }))
  await assertFails(updateDoc(doc(db, "leads", "X3"), { source: "whatsapp" }))
})

test("the full booking batch is atomic: appointment + stage + activity, or nothing", async () => {
  await seedLead("X4")
  const db = asActor(ACTORS.distribuidora)
  await assertSucceeds(bookMeeting(db, ACTORS.distribuidora, { leadId: "X4" }))
  await env.withSecurityRulesDisabled(async (ctx) => {
    const adb = ctx.firestore()
    const lead = await getDoc(doc(adb, "leads", "X4"))
    assert.equal(lead.data().stage, "appointment")
    const { getDocs, collection } = await import("firebase/firestore")
    const acts = await getDocs(collection(adb, "leads", "X4", "activities"))
    assert.equal(acts.size, 1)
    assert.equal(acts.docs[0].data().type, "stage_change")
    assert.equal(acts.docs[0].data().actorRole, "client_admin")
  })
})

/** A lead shaped like a website integration lead: source web, no owner, webForm. */
const WEB_LEAD_NAME = "Web Lead"
async function seedWebLead(id) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "leads", id), {
      workspaceId: WS, leadType: "sales", name: WEB_LEAD_NAME, phone: "+15555550199", email: "",
      source: "web", campaignId: "", campaignName: "", score: 50, temperature: "warm",
      stage: "new_lead", assignedToId: "", potentialValue: 0,
      createdAt: "2026-09-10T00:00:00Z", lastContactAt: null, nextFollowUpAt: null, nextAction: "Primer contacto",
      attribution: { platform: "web", externalCampaignId: "123" }, clientId: "",
      webForm: { formId: "f1" }, receivedAt: "2026-09-10T00:00:01Z",
    })
  })
}

test("a lead shaped like a website integration lead (source web, empty assignedToId) is writable", async () => {
  await seedWebLead("X5")
  const db = asActor(ACTORS.asistente)
  await assertSucceeds(archive(db, ACTORS.asistente, "X5"))
  await assertSucceeds(restore(db, ACTORS.asistente, "X5"))
  await assertSucceeds(bookMeeting(db, ACTORS.asistente, { leadId: "X5", leadName: WEB_LEAD_NAME }))
})

// The same three operations, one per test, so a failure names the operation.
test("website-shaped lead: the Asistente archives it", async () => {
  await seedWebLead("X5a")
  await assertSucceeds(archive(asActor(ACTORS.asistente), ACTORS.asistente, "X5a"))
})

test("website-shaped lead: the Asistente restores it", async () => {
  await seedWebLead("X5r")
  const db = asActor(ACTORS.asistente)
  await assertSucceeds(archive(db, ACTORS.asistente, "X5r"))
  await assertSucceeds(restore(db, ACTORS.asistente, "X5r"))
})

test("website-shaped lead: the Asistente books a meeting on it", async () => {
  await seedWebLead("X5b")
  await assertSucceeds(bookMeeting(asActor(ACTORS.asistente), ACTORS.asistente, { leadId: "X5b", leadName: WEB_LEAD_NAME }))
})

// What made the combined test fail: the appointment named a different person
// than the lead. That refusal is the Rules working (appointmentMatchesLead).
test("an appointment whose leadName is not the lead's name is refused", async () => {
  await seedWebLead("X5n")
  await assertFails(bookMeeting(asActor(ACTORS.asistente), ACTORS.asistente, { leadId: "X5n", leadName: "María González" }))
})

/* ============ purge fields are SERVER-ONLY (real client writes) ========== */

for (const field of ["purgeClaimId", "purgeClaimedAt", "purgeState"]) {
  test(`a client cannot CREATE a lead carrying ${field}`, async () => {
    const db = asActor(ACTORS.distribuidora)
    await assertFails(
      setDoc(doc(db, "leads", `new-${field}`), {
        workspaceId: WS, leadType: "sales", name: "Nuevo", phone: "+15555550123", email: "",
        source: "meta", campaignId: "", campaignName: "", score: 50, temperature: "warm",
        stage: "new_lead", assignedToId: "u-eva", potentialValue: 0,
        createdAt: new Date().toISOString(), lastContactAt: null, nextFollowUpAt: null,
        nextAction: "", attribution: {}, clientId: "",
        [field]: field === "purgeState" ? "claimed" : "forjado",
      }),
    )
  })

  for (const [label, actor] of [
    ["client_admin", ACTORS.distribuidora],
    ["manager", ACTORS.asistente],
    ["super_admin", ACTORS.superAdmin],
  ]) {
    test(`${label} cannot WRITE ${field} on an existing lead`, async () => {
      await seedLead(`P-${field}-${label}`)
      await assertFails(
        updateDoc(doc(asActor(actor), "leads", `P-${field}-${label}`), {
          [field]: field === "purgeState" ? "claimed" : "forjado",
        }),
      )
    })

    test(`${label} cannot DELETE ${field} written by the server`, async () => {
      const id = `D-${field}-${label}`
      await seedLead(id)
      // The server (Admin SDK) stamps the purge bookkeeping.
      await env.withSecurityRulesDisabled(async (ctx) => {
        const { deleteField } = await import("firebase/firestore")
        void deleteField
        await updateDoc(doc(ctx.firestore(), "leads", id), {
          purgeClaimId: "run-1", purgeClaimedAt: new Date().toISOString(), purgeState: "purging",
        })
      })
      const { deleteField } = await import("firebase/firestore")
      await assertFails(updateDoc(doc(asActor(actor), "leads", id), { [field]: deleteField() }))
    })
  }
}

test("a client cannot restore a lead while a purge claim is held", async () => {
  await seedLead("LOCKED", { stage: "new_lead" })
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), "leads", "LOCKED"), {
      archived: true, archivedAt: new Date().toISOString(), archivedBy: "u-eva",
      purgeClaimId: "run-1", purgeClaimedAt: new Date().toISOString(), purgeState: "purging",
    })
  })
  // The restore the app performs: clearing `archived`.
  await assertFails(
    updateDoc(doc(asActor(ACTORS.distribuidora), "leads", "LOCKED"), {
      archived: false, archivedAt: null, archivedBy: null, archivedByName: null,
    }),
  )
})

test("without a claim, restoring works normally", async () => {
  await seedLead("FREE")
  await env.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), "leads", "FREE"), {
      archived: true, archivedAt: new Date().toISOString(), archivedBy: "u-eva",
    })
  })
  await assertSucceeds(
    updateDoc(doc(asActor(ACTORS.distribuidora), "leads", "FREE"), {
      archived: false, archivedAt: null, archivedBy: null, archivedByName: null,
    }),
  )
})
