import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { createRequire } from "node:module"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const require = createRequire(import.meta.url)
const dedup = require(join(root, ".test-build/lib/lead-dedup.js"))
const read = (path) => readFileSync(join(root, path), "utf8")

const lead = (overrides = {}) => ({
  workspaceId: "ws-apc",
  name: "María  Pérez",
  phone: "+1 (214) 555-0198",
  ...overrides,
})

test("normalises accents, case and repeated spaces in the name", () => {
  assert.equal(dedup.normalizeLeadName("  MARÍA   Pérez "), "maria perez")
})

test("normalises a bare US number and its E.164 form to the same phone", () => {
  assert.equal(dedup.normalizeLeadPhone("214-555-0198"), "12145550198")
  assert.equal(dedup.normalizeLeadPhone("+1 (214) 555-0198"), "12145550198")
})

test("same workspace + phone + name is one prospect", () => {
  assert.equal(dedup.sameLeadIdentity(
    lead(),
    lead({ name: "maria perez", phone: "2145550198" }),
  ), true)
})

test("a different workspace never collides", () => {
  assert.equal(dedup.sameLeadIdentity(lead(), lead({ workspaceId: "ws-other" })), false)
})

test("same phone with a different name is not collapsed", () => {
  assert.equal(dedup.sameLeadIdentity(lead(), lead({ name: "José Pérez" })), false)
})

test("manual and website creation use the same atomic server helper", () => {
  const manual = read("app/api/leads/route.ts")
  const website = read("app/api/website/leads/route.ts")
  assert.match(manual, /createOrReuseLeadAtomic/)
  assert.match(website, /createOrReuseLeadAtomic/)
  assert.doesNotMatch(website, /await ref\.set\(draft/)
})

test("duplicate manual submissions are explained instead of announced as new", () => {
  const dialog = read("components/shell/new-lead-dialog.tsx")
  assert.match(dialog, /if \(result\.duplicate\)/)
  assert.match(dialog, /duplicateRestoredTitle/)
  assert.doesNotMatch(dialog, /sendNewLeadEmail/)
})

/* ===================== enriquecimiento de duplicados ===================== */

import Module from "node:module"

const buildDir = join(dirname(fileURLToPath(import.meta.url)), "../.test-build")
const resolveOriginal = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) {
    for (const c of [`${buildDir}/${request.slice(2)}.js`, `${buildDir}/${request.slice(2)}/index.js`]) {
      try { return resolveOriginal.call(this, c, ...rest) } catch { /* next */ }
    }
  }
  // The server helper imports FieldValue at module level; the pure functions
  // under test never touch it, so a minimal stub is enough.
  if (request === "firebase-admin/firestore") return "firebase-admin/firestore"
  return resolveOriginal.call(this, request, ...rest)
}
const loadOriginal = Module._load
Module._load = function (request, ...rest) {
  if (request === "firebase-admin/firestore") {
    return { FieldValue: { serverTimestamp: () => "__ts__", delete: () => "__del__" } }
  }
  return loadOriginal.call(this, request, ...rest)
}
const { enrichmentPatch, leadOutcomeOf } = require(join(buildDir, "lib/lead-dedup-server.js"))

const existing = (o = {}) => ({
  id: "L1", workspaceId: "ws-A", leadType: "sales", name: "María González", phone: "+15125550100",
  email: "", source: "meta", campaignId: "", campaignName: "", stage: "new_lead",
  assignedToId: "u1", createdAt: "2026-01-01T00:00:00Z", attribution: {}, ...o,
})

test("1. a duplicate with no new data changes nothing", () => {
  const { patch, fields } = enrichmentPatch(existing({ email: "maria@x.com" }), { email: "maria@x.com" })
  assert.deepEqual(patch, {})
  assert.deepEqual(fields, [])
  assert.equal(leadOutcomeOf({ created: false, restored: false, enriched: false }), "unchanged")
})

test("2. a duplicate carrying a missing field fills exactly that field", () => {
  const { patch, fields } = enrichmentPatch(existing(), { email: "maria@x.com" })
  assert.deepEqual(patch, { email: "maria@x.com" })
  assert.deepEqual(fields, ["email"])
  assert.equal(leadOutcomeOf({ created: false, restored: false, enriched: true }), "enriched")
})

test("3. incoming data NEVER replaces a populated field", () => {
  const before = existing({ email: "real@x.com", source: "meta", campaignId: "c1" })
  const { patch } = enrichmentPatch(before, { email: "otro@x.com", source: "web", campaignId: "c2" })
  assert.deepEqual(patch, {}, "nothing populated may be overwritten")
})

test("empty means absent, null, blank string or empty array", () => {
  for (const empty of [undefined, null, "", "   "]) {
    const { patch } = enrichmentPatch(existing({ email: empty }), { email: "maria@x.com" })
    assert.deepEqual(patch, { email: "maria@x.com" }, `stored ${JSON.stringify(empty)} counts as empty`)
  }
  // …and a blank incoming value never overwrites nor counts as data.
  const { patch } = enrichmentPatch(existing(), { email: "   " })
  assert.deepEqual(patch, {})
})

test("4. arrays are merged without duplicates and never lose elements", () => {
  const { patch } = enrichmentPatch(existing({ tags: ["vip", "austin"] }), { tags: ["austin", "referido"] })
  assert.deepEqual(patch.tags, ["vip", "austin", "referido"])
})

test("maps are filled key by key; a stored key survives a different incoming one", () => {
  const before = existing({ attribution: { platform: "meta", externalCampaignId: "111" } })
  const { patch } = enrichmentPatch(before, { attribution: { externalCampaignId: "999", adId: "a1" } })
  assert.equal(patch.attribution.externalCampaignId, "111", "the stored id wins")
  assert.equal(patch.attribution.adId, "a1", "the missing key is added")
  assert.equal(patch.attribution.platform, "meta")
})

test("control and identity fields are never enriched", () => {
  const before = existing({ assignedToId: "", stage: "new_lead", closedValue: null, archived: true, score: 0 })
  const { patch } = enrichmentPatch(before, {
    id: "OTRO", workspaceId: "ws-B", createdAt: "2020-01-01T00:00:00Z",
    assignedToId: "intruso", stage: "sale", leadType: "recruiting",
    closedValue: 9999, closedAt: "2026-01-01T00:00:00Z", archived: false,
    score: 100, emailNotifiedAt: "x", isDemo: true, customerId: "c9",
  })
  for (const f of ["id", "workspaceId", "createdAt", "assignedToId", "stage", "leadType",
                   "closedValue", "closedAt", "archived", "score", "emailNotifiedAt", "isDemo", "customerId"]) {
    assert.ok(!(f in patch), `${f} must never be enriched`)
  }
})

test("5-6. an archived duplicate is restored, and can be restored AND enriched at once", () => {
  // Restoring is decided in duplicateUpdate; the outcome keeps both facts.
  assert.equal(leadOutcomeOf({ created: false, restored: true, enriched: false }), "restored")
  const both = { created: false, restored: true, enriched: true }
  assert.equal(leadOutcomeOf(both), "restored")
  assert.equal(both.enriched, true, "enriched travels alongside, so both facts are unambiguous")
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../lib/lead-dedup-server.ts"), "utf8")
  const dup = src.slice(src.indexOf("function duplicateUpdate"), src.indexOf("export function leadOutcomeOf") > 0 ? src.length : undefined)
  assert.match(dup, /patch\.archived = false/)
  assert.match(dup, /enrichmentPatch\(data, input\.lead\)/)
})

test("7. concurrency is handled by a single transaction on one claim document", () => {
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../lib/lead-dedup-server.ts"), "utf8")
  assert.match(src, /db\.runTransaction\(async \(tx\) =>/)
  // The claim id is derived from workspace + phone + name, so concurrent
  // submissions contend on the same document and only one creates the lead.
  assert.match(src, /createHash\("sha256"\)/)
  assert.match(src, /\$\{identity\.workspaceId\}\\u0000\$\{identity\.phoneKey\}\\u0000\$\{identity\.nameKey\}/)
})

test("11. both routes call the same central helper, with no second implementation", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..")
  for (const r of ["app/api/leads/route.ts", "app/api/website/leads/route.ts"]) {
    const src = readFileSync(join(root, r), "utf8")
    assert.match(src, /createOrReuseLeadAtomic/, `${r} must use the central helper`)
    assert.match(src, /leadOutcomeOf\(result\)/, `${r} must report the outcome`)
  }
})

/* ============ externalId: restaura y enriquece dentro del helper ========= */

const serverSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../lib/lead-dedup-server.ts"), "utf8")
const webRouteSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../app/api/website/leads/route.ts"), "utf8")

test("externalId matching lives in the central helper, inside the transaction", () => {
  const tx = serverSrc.slice(serverSrc.indexOf("return db.runTransaction"))
  assert.match(tx, /const externalId = input\.lead\.webForm\?\.externalId/)
  assert.match(tx, /findByExternalId\(tx, db, input\.lead\.workspaceId, externalId\)/)
  // It goes through the SAME patch as any other duplicate: restore + enrich.
  assert.match(tx, /const \{ patch, enrichedFields \} = duplicateUpdate\(data, input\)/)
  // The route no longer implements it separately.
  assert.doesNotMatch(webRouteSrc, /where\("webForm\.externalId", "==", externalId\)/)
  assert.doesNotMatch(webRouteSrc, /reason: "external_id" \}\)/)
})

test("idempotency by externalId is preserved and never crosses workspaces", () => {
  const fn = serverSrc.slice(serverSrc.indexOf("async function findByExternalId"), serverSrc.indexOf("export async function createOrReuseLeadAtomic"))
  assert.match(fn, /\.where\("workspaceId", "==", workspaceId\)/)
  assert.match(fn, /\.where\("webForm\.externalId", "==", externalId\)/)
  assert.match(fn, /\.limit\(1\)/)
  // Re-checked on the document before anything is written to it.
  assert.match(fn, /\.workspaceId === workspaceId \? doc : null/)
  // The workspace comes from the resolved integration, never from the body.
  assert.match(webRouteSrc, /buildWebsiteLead\(integration\.workspaceId/)
})

test("a duplicate by externalId with NO new data changes nothing", () => {
  const before = existing({ email: "maria@x.com", webForm: { externalId: "EXT-1" } })
  const { patch, fields } = enrichmentPatch(before, { email: "maria@x.com", webForm: { externalId: "EXT-1" } })
  assert.deepEqual(patch, {})
  assert.deepEqual(fields, [])
})

test("a duplicate by externalId WITH new data fills the gap", () => {
  const before = existing({ webForm: { externalId: "EXT-1" } })
  const { patch, fields } = enrichmentPatch(before, { email: "maria@x.com", webForm: { externalId: "EXT-1" } })
  assert.equal(patch.email, "maria@x.com")
  assert.ok(fields.includes("email"))
})

test("an archived duplicate found by externalId is restored, and can be enriched at once", () => {
  const dup = serverSrc.slice(serverSrc.indexOf("function duplicateUpdate"), serverSrc.indexOf("export function leadOutcomeOf") > 0 ? undefined : undefined)
  assert.match(dup, /if \(data\.archived === true\)/)
  assert.match(dup, /patch\.archived = false/)
  assert.match(dup, /enrichmentPatch\(data, input\.lead\)/)
  // The externalId branch reports both facts.
  const tx = serverSrc.slice(serverSrc.indexOf('matchedBy: "external_id"'))
  assert.match(tx.slice(0, 220), /restored: data\.archived === true/)
  assert.match(tx.slice(0, 220), /enriched: enrichedFields\.length > 0/)
})

/* ------------------------- fusión recursiva de mapas anidados ----------- */

test("webForm.answers keeps existing answers AND gains the new ones", () => {
  const before = existing({ webForm: { externalId: "EXT-1", answers: { agua: "sí" } } })
  const { patch } = enrichmentPatch(before, { webForm: { answers: { horario: "tarde" } } })
  assert.deepEqual(patch.webForm.answers, { agua: "sí", horario: "tarde" })
  assert.equal(patch.webForm.externalId, "EXT-1", "the existing external id survives")
})

test("a conflicting answer ALWAYS keeps the stored value", () => {
  const before = existing({ webForm: { answers: { agua: "sí", horario: "mañana" } } })
  const { patch } = enrichmentPatch(before, { webForm: { answers: { agua: "no", horario: "tarde", extra: "x" } } })
  assert.equal(patch.webForm.answers.agua, "sí")
  assert.equal(patch.webForm.answers.horario, "mañana")
  assert.equal(patch.webForm.answers.extra, "x", "only the genuinely missing key is added")
})

test("nested arrays are unioned, never truncated", () => {
  const before = existing({ webForm: { answers: { intereses: ["agua"] } } })
  const { patch } = enrichmentPatch(before, { webForm: { answers: { intereses: ["agua", "ollas"] } } })
  assert.deepEqual(patch.webForm.answers.intereses, ["agua", "ollas"])
})

test("dangerous keys are refused at every depth", () => {
  const hostile = JSON.parse('{"webForm":{"answers":{"__proto__":{"admin":true},"prototype":{"x":1},"constructor":{"y":2},"ok":"v"}}}')
  const { patch } = enrichmentPatch(existing({ webForm: { answers: {} } }), hostile)
  const answers = patch.webForm.answers
  for (const k of ["__proto__", "prototype", "constructor"]) {
    assert.ok(!Object.prototype.hasOwnProperty.call(answers, k), `${k} must never be merged`)
  }
  assert.equal(answers.ok, "v")
  assert.notEqual({}.admin, true, "the global prototype is untouched")
})

test("the recursive merge does not apply to control fields", () => {
  const { patch } = enrichmentPatch(existing({ assignedToId: "" }), { assignedToId: "intruso", stage: "sale" })
  assert.ok(!("assignedToId" in patch))
  assert.ok(!("stage" in patch))
})

/* --------------------------- contrato del cliente manual ---------------- */

test("the manual client keeps outcome, enriched and enrichedFields", () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..")
  const lib = readFileSync(join(root, "lib/firebase/leads.ts"), "utf8")
  const iface = lib.slice(lib.indexOf("export interface CreateLeadResult"), lib.indexOf("export async function createLead"))
  for (const f of ["outcome", "enriched", "enrichedFields"]) assert.match(iface, new RegExp(f), `${f} missing from the contract`)
  assert.match(lib, /enriched: body\.enriched === true/)
  assert.match(lib, /enrichedFields: Array\.isArray\(body\.enrichedFields\) \? body\.enrichedFields : \[\]/)

  const dlg = readFileSync(join(root, "components/shell/new-lead-dialog.tsx"), "utf8")
  // Four distinguishable outcomes.
  assert.match(dlg, /duplicateRestoredEnrichedTitle/)
  assert.match(dlg, /duplicateEnrichedTitle/)
  assert.match(dlg, /duplicateRestoredTitle/)
  assert.match(dlg, /duplicateTitle/)
  // Field NAMES only: the values are never rendered.
  assert.match(dlg, /t\.leads\.enrichedFieldLabels\[f\] \?\? f/)
  assert.doesNotMatch(dlg, /result\.enrichedFields\.map\(\(f\) => result/)
})

const build = buildDir

/* ============ Vaciar papelera: autorización de la RUTA ================== */
/*
 * Only the authorisation half lives here, and it is exercised by calling the
 * real route handler with injected fakes. What gets deleted is proven by
 * tests/empty-trash.test.mjs and the emulator suite, which run the real
 * helper — no regex over source code.
 */

const routeFakes = {
  auth: null,
  emptied: [],
  outcome: { workspaceId: "", deletedCount: 0, pendingCount: 0, conflictCount: 0, success: true },
}

Module._load = (function (original) {
  return function (request, ...rest) {
    if (request === "next/server") {
      return { NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, body }) } }
    }
    if (request === "@/lib/firebase/admin") {
      return { getAdminDb: () => ({}), isAdminNotConfigured: () => false }
    }
    if (request === "@/lib/firebase/server-auth") {
      const real = original.call(this, join(build, "lib/firebase/server-auth.js"), ...rest)
      return { ...real, authenticateRequest: async () => routeFakes.auth }
    }
    if (request === "@/lib/leads/empty-trash-server") {
      return {
        emptyWorkspaceTrash: async (_db, workspaceId) => {
          routeFakes.emptied.push(workspaceId)
          return { ...routeFakes.outcome, workspaceId }
        },
      }
    }
    return original.call(this, request, ...rest)
  }
})(Module._load)

const emptyTrashRoute = require(join(build, "app/api/leads/empty-trash/route.js"))

const asUser = (role, workspaceId) => ({
  ok: true,
  user: { uid: "u", email: null, membership: { role, workspaceId, userId: "user-1", email: "u@x" } },
})
const post = (body) =>
  emptyTrashRoute.POST(new Request("http://x/api/leads/empty-trash", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  }))

test("1-2. Distribuidor y Asistente pueden vaciar la papelera de SU workspace", async () => {
  for (const role of ["client_admin", "manager"]) {
    routeFakes.auth = asUser(role, "ws-APC")
    routeFakes.emptied = []
    const res = await post({ workspaceId: "ws-APC" })
    assert.equal(res.status, 200, role)
    assert.equal(res.body.success, true)
    assert.deepEqual(routeFakes.emptied, ["ws-APC"])
  }
})

test("3. Telemarketing recibe 403 y no se borra nada", async () => {
  routeFakes.auth = asUser("sales_rep", "ws-APC")
  routeFakes.emptied = []
  const res = await post({ workspaceId: "ws-APC" })
  assert.equal(res.status, 403)
  assert.deepEqual(routeFakes.emptied, [], "la eliminación nunca se invoca")
})

test("viewer también recibe 403", async () => {
  routeFakes.auth = asUser("viewer", "ws-APC")
  routeFakes.emptied = []
  assert.equal((await post({ workspaceId: "ws-APC" })).status, 403)
  assert.deepEqual(routeFakes.emptied, [])
})

test("4. un usuario sin sesión válida no llega a la lógica", async () => {
  routeFakes.auth = { ok: false, status: 401, error: "missing_token" }
  routeFakes.emptied = []
  const res = await post({ workspaceId: "ws-APC" })
  assert.equal(res.status, 401)
  assert.deepEqual(routeFakes.emptied, [])
})

test("5. nadie vacía la papelera de otro workspace", async () => {
  routeFakes.auth = asUser("client_admin", "ws-APC")
  routeFakes.emptied = []
  const res = await post({ workspaceId: "ws-otro" })
  assert.equal(res.status, 403, "el cuerpo no puede elegir otro destino")
  assert.deepEqual(routeFakes.emptied, [])
})

test("el workspace se deriva de la membresía, no del cuerpo", async () => {
  routeFakes.auth = asUser("manager", "ws-APC")
  routeFakes.emptied = []
  const res = await post({})
  assert.equal(res.status, 200)
  assert.deepEqual(routeFakes.emptied, ["ws-APC"], "usa el suyo aunque el cuerpo calle")
})

test("el super admin SIN workspace explícito es rechazado: no hay vía global", async () => {
  routeFakes.auth = asUser("super_admin", "ws-propio")
  routeFakes.emptied = []
  const res = await post({})
  assert.equal(res.status, 400)
  assert.equal(res.body.error, "workspace_required")
  assert.deepEqual(routeFakes.emptied, [], "ninguna papelera se toca")
})

test("el super admin CON workspace explícito vacía solo ese", async () => {
  routeFakes.auth = asUser("super_admin", "ws-propio")
  routeFakes.emptied = []
  const res = await post({ workspaceId: "ws-APC" })
  assert.equal(res.status, 200)
  assert.deepEqual(routeFakes.emptied, ["ws-APC"], "solo el workspace nombrado")
})

test("15. un resultado parcial responde 207 y no se presenta como éxito", async () => {
  routeFakes.auth = asUser("client_admin", "ws-APC")
  routeFakes.outcome = { deletedCount: 3, pendingCount: 2, conflictCount: 1, success: false }
  const res = await post({ workspaceId: "ws-APC" })
  assert.equal(res.status, 207)
  assert.equal(res.body.success, false)
  assert.equal(res.body.partial, true)
  assert.equal(res.body.deletedCount, 3)
  assert.equal(res.body.pendingCount, 2)
  // Counts only: nothing identifying leaves the route.
  assert.doesNotMatch(JSON.stringify(res.body), /leadId|phone|name/)
  routeFakes.outcome = { deletedCount: 0, pendingCount: 0, conflictCount: 0, success: true }
})

test("13-14. el modal exige VACIAR y bloquea dobles clics", () => {
  const dlg = read("components/leads/empty-trash-dialog.tsx")
  assert.match(dlg, /const CONFIRM_WORD = "VACIAR"/)
  assert.match(dlg, /const matches = typed\.trim\(\) === CONFIRM_WORD/)
  assert.match(dlg, /if \(!matches \|\| busy\) return/)
  assert.match(dlg, /disabled=\{archivedCount === 0\}/)
})

test("super admin con «Todos los workspaces»: el botón queda oculto", () => {
  const view = read("components/leads/leads-view.tsx")
  // Sin respaldo a activeWorkspaceId: null significa «todos» y no hay destino.
  assert.match(view, /const id = isSuperAdmin \? workspaceFilter : activeWorkspaceId/)
  assert.doesNotMatch(view, /workspaceFilter \?\? activeWorkspaceId/)
  assert.match(view, /showArchived && trashWorkspace &&/)
  // Y el contador es el del workspace objetivo, no el del ámbito visible.
  assert.match(view, /l\.workspaceId === trashWorkspace\.id/)
  assert.match(view, /archivedCount=\{trashTargetCount\}/)
  assert.doesNotMatch(view, /archivedCount=\{scope\.length\}/)
})

test("1. un parcial con cero eliminados NO dice «ya está vacía» y deja el modal abierto", () => {
  const dlg = read("components/leads/empty-trash-dialog.tsx")
  const handler = dlg.slice(dlg.indexOf("const result = await emptyTrash"), dlg.indexOf("} catch (err)"))
  // La incompletitud se evalúa ANTES que deletedCount === 0.
  assert.ok(
    handler.indexOf("!result.success || result.partial") < handler.indexOf("result.deletedCount === 0"),
    "el caso parcial debe comprobarse primero",
  )
  // Y en ese caso no se cierra el modal.
  const partialBranch = handler.slice(handler.indexOf("!result.success || result.partial"), handler.indexOf("if (result.deletedCount === 0)"))
  assert.match(partialBranch, /setBusy\(false\)\s*\n\s*return/)
  assert.doesNotMatch(partialBranch, /setOpen\(false\)/)
  // El contrato del cliente lleva los contadores.
  const lib = read("lib/firebase/leads.ts")
  assert.match(lib, /pendingCount: typeof body\.pendingCount === "number"/)
  assert.match(lib, /conflictCount: typeof body\.conflictCount === "number"/)
})

test("2. las reglas impiden restaurar mientras la purga tiene reclamo", () => {
  const rules = read("firestore.rules")
  assert.match(rules, /function purgeClaimHeld\(\)/)
  assert.match(rules, /resource\.data\.get\('purgeClaimId', null\) != null/)
  assert.match(rules, /function notRestoringDuringPurge\(\)/)
  // Y la condición se aplica de verdad en el allow update de leads.
  const leadsBlock = rules.slice(rules.indexOf("match /leads/{leadId}"), rules.indexOf("match /leads/{leadId}/activities"))
  assert.match(leadsBlock, /&& notRestoringDuringPurge\(\)/)
  // Solo bloquea el desarchivado; el resto del documento sigue editable.
  const fn = rules.slice(rules.indexOf("function unarchivingNow()"), rules.indexOf("function notRestoringDuringPurge()"))
  assert.match(fn, /resource\.data\.get\('archived', false\) == true/)
  assert.match(fn, /request\.resource\.data\.get\('archived', false\) != true/)
})

test("5. la ruta propaga los contadores acumulados cuando la purga se corta", () => {
  const route = read("app/api/leads/empty-trash/route.ts")
  assert.match(route, /deletedCount: outcome\.deletedCount/)
  assert.match(route, /outcome\.errored \? \{ errored: true \} : \{\}/)
  // El 500 solo ocurre si el helper lanza, y ahí no hubo progreso que perder.
  assert.match(route, /outcome = await emptyWorkspaceTrash\(getAdminDb\(\), workspaceId\)/)
})
