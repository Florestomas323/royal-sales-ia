import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { createRequire } from "node:module"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
const buildDir = join(root, ".test-build")
// "@/lib/…" → compiled file in .test-build, like the other suites.
const Module = require("node:module")
const resolveOriginal = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) {
    for (const c of [`${buildDir}/${request.slice(2)}.js`, `${buildDir}/${request.slice(2)}/index.js`]) {
      try { return resolveOriginal.call(this, c, ...rest) } catch { /* next */ }
    }
  }
  return resolveOriginal.call(this, request, ...rest)
}
const s = require(join(buildDir, "lib/website-lead-status.js"))
const read = (path) => readFileSync(join(root, path), "utf8")

const cita = (over = {}) => ({
  ref: "c1729900000123",
  scheduledAt: "2026-10-24T18:00:00.000-04:00",
  durationMinutes: 40,
  mode: "in_person",
  location: { addressLine1: "123 Main St, Norcross, GA 30071", city: "Norcross", state: "GA", postalCode: "30071" },
  notes: "Agendada por Sofía",
  ...over,
})

test("accepts a booking with prospectId or externalId", () => {
  const r = s.parseLeadStatus({ externalId: "wa:123@s.whatsapp.net", event: "appointment_scheduled", appointment: cita() })
  assert.equal(r.ok, true)
  assert.equal(r.payload.appointment.mode, "in_person")
  assert.equal(r.payload.appointment.scheduledAt, "2026-10-24T22:00:00.000Z")
  assert.equal(s.parseLeadStatus({ prospectId: "abc123", event: "progress" }).ok, true)
})

test("rejects a body without identity, with an unknown event or a booking without its meeting", () => {
  assert.equal(s.parseLeadStatus({ event: "progress" }).ok, false)
  assert.equal(s.parseLeadStatus({ externalId: "wa:1", event: "sale" }).ok, false)
  assert.equal(s.parseLeadStatus({ externalId: "wa:1", event: "appointment_scheduled" }).ok, false)
  assert.equal(s.parseLeadStatus({ prospectId: "../x", event: "progress" }).ok, false)
})

test("drops an incomplete address instead of storing half of it", () => {
  const r = s.parseLeadStatus({ externalId: "wa:1", event: "appointment_scheduled", appointment: cita({ location: { addressLine1: "123 Main", city: "Norcross" } }) })
  assert.equal(r.ok, true)
  assert.equal(r.payload.appointment.location, undefined)
  assert.equal(s.appointmentTypeFor(r.payload.appointment), "other")
})

test("video demos are stored as 'other' so the address rule is never broken", () => {
  assert.equal(s.appointmentTypeFor(cita({ mode: "video", location: undefined })), "other")
  assert.equal(s.appointmentTypeFor(cita()), "demo")
  assert.match(s.appointmentNotesFor(cita({ mode: "video" }), false), /Google Meet/)
  assert.match(s.appointmentNotesFor(cita(), true), /Confirmada/)
})

test("answers are filtered: no prototype keys, values capped", () => {
  const r = s.parseLeadStatus({ externalId: "wa:1", event: "progress", answers: { etapa_sofia: "Cita agendada", ["__proto__"]: "x", obj: { a: 1 }, largo: "a".repeat(900) } })
  assert.equal(r.ok, true)
  assert.deepEqual(Object.keys(r.payload.answers).sort(), ["etapa_sofia", "largo"])
  assert.equal(r.payload.answers.largo.length, 500)
})

test("stage moves: forward into the meeting, back to follow-up only on the last cancel, never from won/lost", () => {
  assert.equal(s.nextStageFor("sales", "new_lead", "appointment_scheduled", false), "appointment")
  assert.equal(s.nextStageFor("sales", "follow_up", "appointment_rescheduled", false), "appointment")
  assert.equal(s.nextStageFor("sales", "appointment", "appointment_scheduled", false), null)
  assert.equal(s.nextStageFor("sales", "appointment", "appointment_cancelled", false), "follow_up")
  assert.equal(s.nextStageFor("sales", "appointment", "appointment_cancelled", true), null)
  assert.equal(s.nextStageFor("sales", "new_lead", "not_interested", false), "not_interested")
  assert.equal(s.nextStageFor("sales", "appointment", "not_interested", false), null)
  assert.equal(s.nextStageFor("sales", "sale", "appointment_scheduled", false), null)
  assert.equal(s.nextStageFor("sales", "not_interested", "appointment_scheduled", false), null)
  assert.equal(s.nextStageFor("sales", "new_lead", "progress", false), null)
})

test("the same meeting always maps to the same appointment id, per workspace", () => {
  const a = s.integrationAppointmentId("ws-apc", "c1")
  assert.equal(a, s.integrationAppointmentId("ws-apc", "c1"))
  assert.notEqual(a, s.integrationAppointmentId("ws-impact", "c1"))
  assert.match(a, /^int_[a-f0-9]{28}$/)
})

test("the route authenticates by integration key only and never sends CORS headers", () => {
  const src = read("app/api/website/leads/status/route.ts")
  assert.match(src, /resolveByKey\(key\)/)
  assert.match(src, /where\("workspaceId", "==", workspaceId\)/)
  assert.doesNotMatch(src, /Access-Control-Allow-Origin/)
  assert.doesNotMatch(src, /export async function OPTIONS/)
})
