/**
 * These EXECUTE the real route handlers.
 *
 * The routes are imported from the compiled output; only the server-only
 * modules (`getAdminDb`, `authenticateRequest`, `next/server`) are replaced
 * by doubles. The Firestore double honours the operations these routes use —
 * `doc().get()`, `collection().doc().update()`, `runTransaction` with
 * `get`/`set`/`update` — so what is asserted is behaviour, not source text.
 */
import test from "node:test"
import assert from "node:assert/strict"
import Module from "node:module"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const build = join(root, ".test-build")

/* --------------------------------------------- in-memory Firestore double */

const state = { auth: null, store: new Map(), writes: [] }

function docRef(path) {
  return {
    path,
    id: path.split("/").pop(),
    get: async () => ({ exists: state.store.has(path), data: () => state.store.get(path) }),
    update: async (patch) => {
      state.writes.push({ op: "update", path, patch })
      state.store.set(path, { ...(state.store.get(path) ?? {}), ...patch })
    },
    collection: (sub) => collectionRef(`${path}/${sub}`),
  }
}

let autoId = 0
function collectionRef(path) {
  return {
    doc: (id) => docRef(`${path}/${id ?? `auto-${++autoId}`}`),
  }
}

const fakeDb = {
  collection: collectionRef,
  runTransaction: async (fn) =>
    fn({
      get: async (ref) => ({ exists: state.store.has(ref.path), data: () => state.store.get(ref.path) }),
      set: (ref, data) => {
        state.writes.push({ op: "set", path: ref.path, data })
        state.store.set(ref.path, data)
      },
      update: (ref, patch) => {
        state.writes.push({ op: "update", path: ref.path, patch })
        state.store.set(ref.path, { ...(state.store.get(ref.path) ?? {}), ...patch })
      },
    }),
}

const resolveOriginal = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) {
    for (const c of [`${build}/${request.slice(2)}.js`, `${build}/${request.slice(2)}/index.js`]) {
      try { return resolveOriginal.call(this, c, ...rest) } catch { /* next */ }
    }
  }
  if (request === "next/server" || request === "firebase-admin/firestore") return request
  return resolveOriginal.call(this, request, ...rest)
}
const loadOriginal = Module._load
Module._load = function (request, ...rest) {
  if (request === "next/server") {
    return { NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, body }) } }
  }
  if (request === "firebase-admin/firestore") {
    return { FieldValue: { serverTimestamp: () => "__ts__", delete: () => "__del__" } }
  }
  if (request === "@/lib/firebase/admin") {
    return { getAdminDb: () => fakeDb, isAdminNotConfigured: () => false }
  }
  if (request === "@/lib/firebase/server-auth") {
    const real = loadOriginal.call(this, `${build}/lib/firebase/server-auth.js`, ...rest)
    return { ...real, authenticateRequest: async () => state.auth }
  }
  return loadOriginal.call(this, request, ...rest)
}

const require = createRequire(import.meta.url)
const campaignRoute = require(join(build, "app/api/leads/[id]/campaign/route.js"))
const appointmentsRoute = require(join(build, "app/api/appointments/route.js"))
const identityRoute = require(join(build, "app/api/admin/identity/route.js"))

/* ------------------------------------------------------------- fixtures --- */

const APC = "ws-APC"
const IMPACT = "ws-impact"

const asUser = (role, workspaceId, userId = "u-eva") => ({
  ok: true,
  user: { uid: `auth-${userId}`, email: null, membership: { authUid: `auth-${userId}`, role, workspaceId, userId, email: "x@y", createdAt: "2026-01-01", status: "active" } },
})

function seed({ leadWorkspace = APC, leadType = "sales", stage = "new_lead", archived = false, assignedToId = "u-eva" } = {}) {
  state.store = new Map()
  state.writes = []
  state.store.set("leads/L1", {
    workspaceId: leadWorkspace, leadType, stage, archived, assignedToId,
    name: "María González", phone: "+15125550100", source: "meta",
    campaignId: "", campaignName: "", createdAt: "2026-01-01T00:00:00Z",
    attribution: { platform: "meta", externalCampaignId: "META-999" },
  })
  state.store.set("campaigns/c-apc", { workspaceId: APC, name: "APC | Agua", objective: "sales" })
  state.store.set("campaigns/c-apc-rec", { workspaceId: APC, name: "APC | Reclutamiento", objective: "recruiting" })
  state.store.set("campaigns/c-impact", { workspaceId: IMPACT, name: "Impact | Ajena", objective: "sales" })
  // Perfiles y membresías coherentes de todos los actores: las rutas
  // comprueban la coherencia antes de hablar de permisos, así que una
  // siembra incompleta se reportaría (con razón) como identity_inconsistent.
  state.store.set("users/u-eva", { workspaceId: APC, role: "manager", status: "active", authUid: "auth-u-eva" })
  state.store.set("users/u-dist", { workspaceId: APC, role: "client_admin", status: "active", authUid: "auth-u-dist" })
  state.store.set("users/u-tm", { workspaceId: APC, role: "sales_rep", status: "active", authUid: "auth-u-tm" })
  state.store.set("users/u-otro", { workspaceId: IMPACT, role: "client_admin", status: "active", authUid: "auth-u-otro" })
  state.store.set("memberships/auth-u-eva", { workspaceId: APC, role: "manager", userId: "u-eva", email: "e@x", status: "active" })
  state.store.set("memberships/auth-u-dist", { workspaceId: APC, role: "client_admin", userId: "u-dist", email: "d@x", status: "active" })
  state.store.set("memberships/auth-u-tm", { workspaceId: APC, role: "sales_rep", userId: "u-tm", email: "t@x", status: "active" })
  state.store.set("memberships/auth-u-otro", { workspaceId: IMPACT, role: "client_admin", userId: "u-otro", email: "o@x", status: "active" })
  state.store.set("workspaces/ws-APC", { name: "APC Millennium", seats: { client_admin: ["u-dist"], manager: ["u-eva"], sales_rep: ["u-tm"] } })
  state.store.set("workspaces/ws-impact", { name: "Impact Enterprises", seats: { client_admin: ["u-otro"], manager: [], sales_rep: [] } })
}

const postCampaign = (leadId, body) =>
  campaignRoute.POST(
    new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
    { params: Promise.resolve({ id: leadId }) },
  )
const postAppointment = (body) =>
  appointmentsRoute.POST(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }))
const postIdentity = (body) =>
  identityRoute.POST(new Request("http://x", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }))

const ADDRESS = { addressLine1: "1 Main St", city: "Austin", state: "TX", postalCode: "78701" }

/* ====================== 2. CAMPAÑA ======================================= */

test("2a. el super admin asigna una campaña del workspace DEL PROSPECTO", async () => {
  seed()
  state.auth = asUser("super_admin", IMPACT, "u-tomas") // su membresía está en OTRO workspace
  const res = await postCampaign("L1", { campaignId: "c-apc" })
  assert.equal(res.status, 200)
  const lead = state.store.get("leads/L1")
  assert.equal(lead.campaignId, "c-apc")
  // El nombre sale del documento de la campaña, no del navegador.
  assert.equal(lead.campaignName, "APC | Agua")
  assert.equal(lead.attributionSource, "manual")
})

test("2b. el super admin puede QUITAR la campaña", async () => {
  seed()
  state.store.set("leads/L1", { ...state.store.get("leads/L1"), campaignId: "c-apc", campaignName: "APC | Agua" })
  state.auth = asUser("super_admin", IMPACT, "u-tomas")
  const res = await postCampaign("L1", { campaignId: "" })
  assert.equal(res.status, 200)
  assert.equal(state.store.get("leads/L1").campaignId, "")
  assert.equal(state.store.get("leads/L1").campaignName, "")
})

test("2c. una campaña de OTRO workspace se rechaza con su código propio", async () => {
  seed()
  state.auth = asUser("super_admin", IMPACT, "u-tomas")
  const res = await postCampaign("L1", { campaignId: "c-impact" })
  assert.equal(res.status, 403)
  assert.equal(res.body.error, "campaign_wrong_workspace", "no un permission-denied genérico")
  assert.equal(state.store.get("leads/L1").campaignId, "", "nada se escribió")
})

test("2d. los identificadores originales de Meta se conservan", async () => {
  seed()
  state.auth = asUser("client_admin", APC, "u-dist")
  await postCampaign("L1", { campaignId: "c-apc" })
  const lead = state.store.get("leads/L1")
  assert.deepEqual(lead.attribution, { platform: "meta", externalCampaignId: "META-999" })
  const patch = state.writes.find((w) => w.op === "update").patch
  assert.ok(!("attribution" in patch), "attribution nunca entra en el patch")
})

test("2e. un rol sin autorización es rechazado, y el body no elige el workspace", async () => {
  seed()
  state.auth = asUser("sales_rep", APC, "u-tm")
  const res = await postCampaign("L1", { campaignId: "c-apc" })
  assert.equal(res.status, 403)
  assert.equal(res.body.error, "insufficient_role")

  // Un admin de otro workspace no alcanza el lead ni mandando su workspaceId.
  seed()
  state.auth = asUser("client_admin", IMPACT, "u-otro")
  const cross = await postCampaign("L1", { campaignId: "c-apc", workspaceId: IMPACT })
  assert.equal(cross.status, 403)
  assert.equal(cross.body.error, "wrong_workspace")
})

test("2f. una campaña incompatible con el tipo del prospecto se rechaza", async () => {
  seed()
  state.auth = asUser("client_admin", APC, "u-dist")
  const res = await postCampaign("L1", { campaignId: "c-apc-rec" })
  assert.equal(res.status, 422)
  assert.equal(res.body.error, "campaign_type_mismatch")
})

test("2g. una campaña inexistente da 404, no un error de permisos", async () => {
  seed()
  state.auth = asUser("client_admin", APC, "u-dist")
  const res = await postCampaign("L1", { campaignId: "no-existe" })
  assert.equal(res.status, 404)
  assert.equal(res.body.error, "campaign_not_found")
})

/* ====================== 3. AGENDA ======================================== */

test("3a. Eva (manager) agenda en SU workspace: cita, etapa y actividad juntas", async () => {
  seed()
  state.auth = asUser("manager", APC, "u-eva")
  const res = await postAppointment({
    leadId: "L1", scheduledAt: "2026-10-01T15:00:00Z", durationMinutes: 60, type: "demo", location: ADDRESS,
  })
  assert.equal(res.status, 200, JSON.stringify(res.body))
  assert.equal(res.body.stageMoved, true)

  const appt = state.writes.find((w) => w.op === "set" && w.path.startsWith("appointments/"))
  assert.ok(appt, "se creó la cita")
  // Derivado del lead y de la membresía, no del navegador.
  assert.equal(appt.data.workspaceId, APC)
  assert.equal(appt.data.leadName, "María González")
  assert.equal(appt.data.leadType, "sales")
  assert.equal(appt.data.createdBy, "u-eva")

  assert.equal(state.store.get("leads/L1").stage, "appointment")
  const activity = state.writes.find((w) => w.op === "set" && w.path.includes("/activities/"))
  assert.ok(activity, "se escribió la actividad de auditoría")
  assert.equal(activity.data.actorRole, "manager", "el rol sale de la membresía")
  assert.equal(activity.data.actorId, "u-eva")
})

test("3b. el navegador no puede falsear workspace, nombre, tipo, autor ni rol", async () => {
  seed()
  state.auth = asUser("manager", APC, "u-eva")
  await postAppointment({
    leadId: "L1", scheduledAt: "2026-10-01T15:00:00Z", type: "demo", location: ADDRESS,
    // Todo esto debe ignorarse.
    workspaceId: IMPACT, leadName: "Falso", leadType: "recruiting",
    createdBy: "u-otro", actorRole: "super_admin", status: "completed",
  })
  const appt = state.writes.find((w) => w.op === "set" && w.path.startsWith("appointments/"))
  assert.equal(appt.data.workspaceId, APC)
  assert.equal(appt.data.leadName, "María González")
  assert.equal(appt.data.leadType, "sales")
  assert.equal(appt.data.createdBy, "u-eva")
  assert.equal(appt.data.status, "scheduled")
})

test("3c. Eva no puede agendar en otro workspace", async () => {
  seed({ leadWorkspace: IMPACT })
  state.auth = asUser("manager", APC, "u-eva")
  const res = await postAppointment({ leadId: "L1", scheduledAt: "2026-10-01T15:00:00Z", type: "demo", location: ADDRESS })
  assert.equal(res.status, 403)
  assert.equal(res.body.error, "wrong_workspace")
  assert.equal(state.writes.length, 0, "no se escribió nada")
})

test("3d. una demostración de ventas exige dirección, con su propio código", async () => {
  seed()
  state.auth = asUser("manager", APC, "u-eva")
  const res = await postAppointment({ leadId: "L1", scheduledAt: "2026-10-01T15:00:00Z", type: "demo" })
  assert.equal(res.status, 422)
  assert.equal(res.body.error, "address_required", "no es un problema de permisos")
})

test("3e. Telemarketing solo agenda sobre un prospecto suyo", async () => {
  seed({ assignedToId: "u-tm" })
  state.auth = asUser("sales_rep", APC, "u-tm")
  assert.equal((await postAppointment({ leadId: "L1", scheduledAt: "2026-10-01T15:00:00Z", type: "demo", location: ADDRESS })).status, 200)

  seed({ assignedToId: "otra-persona" })
  state.auth = asUser("sales_rep", APC, "u-tm")
  const res = await postAppointment({ leadId: "L1", scheduledAt: "2026-10-01T15:00:00Z", type: "demo", location: ADDRESS })
  assert.equal(res.status, 403)
  assert.equal(res.body.error, "insufficient_role")
})

test("3f. un prospecto en la papelera no admite citas", async () => {
  seed({ archived: true })
  state.auth = asUser("manager", APC, "u-eva")
  const res = await postAppointment({ leadId: "L1", scheduledAt: "2026-10-01T15:00:00Z", type: "demo", location: ADDRESS })
  assert.equal(res.status, 409)
  assert.equal(res.body.error, "lead_archived")
})

test("3g. una etapa posterior no retrocede al agendar", async () => {
  seed({ stage: "sale" })
  state.auth = asUser("manager", APC, "u-eva")
  const res = await postAppointment({ leadId: "L1", scheduledAt: "2026-10-01T15:00:00Z", type: "closing", location: ADDRESS })
  assert.equal(res.status, 200)
  assert.equal(res.body.stageMoved, false)
  assert.equal(state.store.get("leads/L1").stage, "sale")
})

/* ====================== 4. IDENTIDAD INCOHERENTE ========================= */

test("4a. se detecta la diferencia entre users y memberships sin ampliar permisos", async () => {
  seed()
  // El perfil de Eva quedó como sales_rep y sin asiento: su membresía dice manager.
  state.store.set("users/u-eva", { workspaceId: APC, role: "sales_rep", status: "active", authUid: "auth-u-eva" })
  state.store.set("workspaces/ws-APC", { name: "APC", seats: { client_admin: [], manager: [], sales_rep: [] } })
  state.auth = asUser("client_admin", APC, "u-dist")
  const res = await postIdentity({ authUid: "auth-u-eva" })
  assert.equal(res.status, 200)
  assert.equal(res.body.coherent, false)
  assert.ok(res.body.problems.includes("profile_role_mismatch"))
  assert.ok(res.body.problems.includes("seat_missing"))
  // Diagnóstico solo: sin `repair` no se escribe nada.
  assert.equal(res.body.repaired, false)
  assert.equal(state.writes.length, 0)
})

test("4b. la reparación alinea perfil y asiento con la MEMBRESÍA, nunca al revés", async () => {
  seed()
  state.store.set("users/u-eva", { workspaceId: APC, role: "sales_rep", status: "active", authUid: "auth-u-eva" })
  state.store.set("workspaces/ws-APC", { name: "APC", seats: { client_admin: [], manager: [], sales_rep: ["u-eva"] } })
  state.store.set("memberships/auth-u-eva", { workspaceId: APC, role: "manager", userId: "u-eva", email: "e@x", status: "active" })
  state.auth = asUser("client_admin", APC, "u-dist")
  const res = await postIdentity({ authUid: "auth-u-eva", repair: true })
  assert.equal(res.status, 200)
  assert.equal(res.body.repaired, true)
  // El perfil pasa a manager (el rol de la membresía), no la membresía a sales_rep.
  assert.equal(state.store.get("users/u-eva").role, "manager")
  const seats = state.store.get("workspaces/ws-APC").seats
  assert.deepEqual(seats.manager, ["u-eva"])
  assert.deepEqual(seats.sales_rep, [], "libera el asiento equivocado")
  assert.equal(res.body.coherent, true)
})

test("4c. la reparación respeta el límite de asientos en vez de forzarlo", async () => {
  seed()
  state.store.set("memberships/auth-u-eva", { workspaceId: APC, role: "manager", userId: "u-eva", email: "e@x", status: "active" })
  state.store.set("users/u-eva", { workspaceId: APC, role: "manager", status: "active", authUid: "auth-u-eva" })
  state.store.set("workspaces/ws-APC", { name: "APC", seats: { client_admin: [], manager: ["a", "b"], sales_rep: [] } })
  state.auth = asUser("super_admin", IMPACT, "u-tomas")
  const res = await postIdentity({ authUid: "auth-u-eva", repair: true })
  assert.ok(res.body.applied.includes("seat_limit_reached"))
  assert.deepEqual(state.store.get("workspaces/ws-APC").seats.manager, ["a", "b"], "no se excede el límite")
})

test("4d. nadie repara a un miembro de otro workspace", async () => {
  seed()
  state.store.set("memberships/auth-u-otro", { workspaceId: IMPACT, role: "manager", userId: "u-otro", email: "o@x", status: "active" })
  state.auth = asUser("client_admin", APC, "u-dist")
  const res = await postIdentity({ authUid: "auth-u-otro", repair: true })
  assert.equal(res.status, 403)
  assert.equal(res.body.error, "wrong_workspace")
})

test("4e. un rol insuficiente no puede reparar a nadie", async () => {
  seed()
  state.store.set("memberships/auth-u-eva", { workspaceId: APC, role: "manager", userId: "u-eva", email: "e@x", status: "active" })
  state.auth = asUser("sales_rep", APC, "u-tm")
  const res = await postIdentity({ authUid: "auth-u-eva", repair: true })
  assert.equal(res.status, 403)
  assert.equal(res.body.error, "insufficient_role")
})

test("los logs y las respuestas no exponen datos personales", async () => {
  seed()
  state.auth = asUser("manager", APC, "u-eva")
  const res = await postAppointment({ leadId: "L1", scheduledAt: "2026-10-01T15:00:00Z", type: "demo" })
  const serialised = JSON.stringify(res.body)
  assert.doesNotMatch(serialised, /María|5125550100|Main St|austin/i)
})

/* ====================== 1. CAMBIO DE WORKSPACE =========================== */

import { readFileSync } from "node:fs"
const read = (p) => readFileSync(join(root, p), "utf8")

test("1a. el contenido operativo se remonta con una key por workspace", () => {
  // La regla de la key se EJECUTA: dos workspaces distintos, y \"Todos\",
  // nunca pueden compartir ámbito, porque compartirla es no desmontar.
  const key = (ws, superAdmin = true, status = "ready") =>
    workspaceScopeKey(status, ws, superAdmin, "__all__")
  assert.notEqual(key("ws-A"), key("ws-B"))
  assert.notEqual(key("ws-A"), key(null))
  assert.notEqual(key(null), key(null, false))
  assert.notEqual(key("ws-A", true, "loading"), key("ws-A"))
  assert.equal(key("ws-A"), key("ws-A"), "el mismo workspace no se remonta solo")
  // Va DENTRO de los providers: no se desmonta Auth ni se cierra sesión.
  // La jerarquía completa (TopBar incluida) se verifica ejecutando el layout
  // en tests/workspace-switch.test.mjs.
  const scope = read("components/shell/workspace-scope.tsx")
  assert.match(scope, /<div key=\{scope\}/)
  assert.doesNotMatch(scope, /RequireAuth|signOut|WorkspaceProvider/)
})

test("1b. una ficha abierta de un prospecto fuera de ámbito se cierra sola", () => {
  const view = read("components/leads/leads-view.tsx")
  const effect = view.slice(view.indexOf("if (!selected) return"), view.indexOf("}, [leads, selected"))
  assert.match(effect, /setOpen\(false\)/)
  assert.match(effect, /setSelected\(null\)/)
  assert.match(effect, /selected\.workspaceId === workspaceFilter/)
  // Y el efecto reacciona al cambio de workspace.
  assert.match(view, /\}, \[leads, selected, isSuperAdmin, workspaceFilter, activeWorkspaceId\]\)/)
})

/* ====================== 5. PAPELERA VISIBLE ============================== */

test("5a. el acceso a Papelera es visible siempre, con 0 y con N", () => {
  const view = read("components/leads/leads-view.tsx")
  // Ya no depende de archivedCount > 0.
  assert.match(view, /\{canEmptyTrash && \(\s*\n\s*<Button/)
  assert.match(view, /t\.leads\.trashLabel\(archivedCount\)/)
  assert.doesNotMatch(view, /archivedCount > 0 && \(\s*\n\s*<label/)
  assert.match(read("lib/i18n.ts"), /trashLabel: \(n: number\) => `Papelera \(\$\{n\}\)`/)
})

test("5b. dentro de la papelera el botón se muestra siempre; sin workspace, deshabilitado", () => {
  const view = read("components/leads/leads-view.tsx")
  const block = view.slice(view.indexOf("{showArchived && canEmptyTrash && ("))
  assert.match(block.slice(0, 600), /trashWorkspace \? \(/)
  assert.match(block.slice(0, 600), /<Button variant="outline" size="sm" disabled/)
  assert.match(block.slice(0, 600), /t\.leads\.emptyTrash\.pickWorkspace/)
  assert.match(read("lib/i18n.ts"), /pickWorkspace: 'Selecciona un workspace para vaciar su papelera'/)
})

test("5c. nunca existe un vaciado global", () => {
  // Sin workspace individual NO hay destino: se ejecuta la decisión real.
  assert.equal(resolveTrashTarget(null, null, [{ id: "ws-A", name: "A" }]), null)
  const view = read("components/leads/leads-view.tsx")
  assert.match(view, /t\.leads\.emptyTrash\.pickWorkspace/)
  const route = read("app/api/leads/empty-trash/route.ts")
  assert.match(route, /if \(isSuper && !asked\)[\s\S]{0,120}workspace_required/)
})

/* ====================== 6. CONTROLES NEGATIVOS =========================== */

test("6a. confiar en el workspaceId del body rompería el aislamiento", () => {
  // Codificado: el workspace SIEMPRE sale del lead.
  const campaign = read("app/api/leads/[id]/campaign/route.ts")
  assert.match(campaign, /const workspaceId = lead\.workspaceId/)
  assert.doesNotMatch(campaign, /body\.workspaceId/)
  const appt = read("app/api/appointments/route.ts")
  assert.match(appt, /const workspaceId = lead\.workspaceId/)
  assert.doesNotMatch(appt, /body\.workspaceId/)
})

test("6b. el rol y el autor salen de la membresía, nunca del body", () => {
  const appt = read("app/api/appointments/route.ts")
  assert.match(appt, /createdBy: membership\.userId/)
  assert.match(appt, /actorId: membership\.userId/)
  assert.match(appt, /actorRole: role/)
  assert.doesNotMatch(appt, /body\.createdBy|body\.actorRole|body\.leadType|body\.leadName/)
})

test("6c. cada fallo tiene su código: nada se convierte en permission-denied genérico", async () => {
  const seen = new Set()
  // Campaña inexistente, de otro workspace, tipo incompatible, rol insuficiente.
  seed(); state.auth = asUser("client_admin", APC, "u-dist")
  seen.add((await postCampaign("L1", { campaignId: "no-existe" })).body.error)
  seed(); state.auth = asUser("client_admin", APC, "u-dist")
  seen.add((await postCampaign("L1", { campaignId: "c-impact" })).body.error)
  seed(); state.auth = asUser("client_admin", APC, "u-dist")
  seen.add((await postCampaign("L1", { campaignId: "c-apc-rec" })).body.error)
  seed(); state.auth = asUser("sales_rep", APC, "u-tm")
  seen.add((await postCampaign("L1", { campaignId: "c-apc" })).body.error)
  seed(); state.auth = asUser("manager", APC, "u-eva")
  seen.add((await postAppointment({ leadId: "L1", scheduledAt: "x", type: "demo" })).body.error)
  seed(); state.auth = asUser("manager", APC, "u-eva")
  seen.add((await postAppointment({ leadId: "NOPE", scheduledAt: "x", type: "demo", location: ADDRESS })).body.error)

  assert.deepEqual(
    [...seen].sort(),
    ["address_required", "campaign_not_found", "campaign_type_mismatch", "campaign_wrong_workspace", "insufficient_role", "lead_not_found"],
    "seis fallos distintos, seis códigos distintos",
  )
})

test("6d. quitar la comprobación de workspace de la campaña rompería el aislamiento", () => {
  // El invariante está codificado y es el que prueba 2c.
  const campaign = read("app/api/leads/[id]/campaign/route.ts")
  assert.match(campaign, /if \(campaign\.workspaceId !== workspaceId\)/)
  assert.match(campaign, /return fail\("campaign_wrong_workspace", operationId\)/)
})

test("6e. manager es un rol autorizado explícito para agendar", () => {
  const appt = read("app/api/appointments/route.ts")
  assert.match(appt, /role === "client_admin" \|\| role === "manager"/)
})

test("los diálogos usan las rutas de servidor, no escrituras directas", () => {
  const edit = read("components/leads/edit-lead-dialog.tsx")
  assert.match(edit, /await setLeadCampaign\(lead\.id, plan\.campaign\)/)
  // Y la decisión sale de la función pura, probada arriba.
  assert.match(edit, /const plan = planLeadSave\(Object\.keys\(patch\)\.length, campaignChange\)/)
  assert.match(edit, /if \(plan\.noop\)/)
  assert.match(edit, /if \(plan\.patch\)/)
  // La atribución ya no viaja en el patch directo a Firestore.
  assert.doesNotMatch(edit, /patch\.campaignId =/)
  const sched = read("components/appointments/schedule-dialog.tsx")
  assert.match(sched, /await bookAppointment\(\{/)
  assert.doesNotMatch(sched, /await createAppointment\(/)
})

test("los códigos del servidor se traducen a mensajes accionables, no a «no tienes permiso»", () => {
  const lib = read("lib/firebase/leads.ts")
  for (const code of ["campaign_wrong_workspace", "campaign_type_mismatch", "address_required", "identity_inconsistent", "lead_archived"]) {
    assert.match(lib, new RegExp(`${code}:`), `${code} necesita su mensaje`)
  }
  // Y ninguno de esos mensajes dice que sea un problema de permisos.
  const msgs = lib.slice(lib.indexOf("MUTATION_MESSAGES"), lib.indexOf("export class MutationError"))
  assert.doesNotMatch(msgs, /address_required: "[^"]*permiso/)
  assert.doesNotMatch(msgs, /campaign_type_mismatch: "[^"]*permiso/)
})

/* ============ decisión del guardado (función pura, ejecutada) ============ */

const { planLeadSave, describeSaveFailure } = require(join(build, "lib/leads/save-plan.js"))
const { describeError } = require(join(build, "lib/firebase/errors.js"))
const { MutationError } = require(join(build, "lib/firebase/leads.js"))
const { resolveTrashTarget, workspaceScopeKey } = require(join(build, "lib/leads/workspace-switch.js"))

/** Ejecuta la decisión del submit con dobles, como hace el diálogo. */
async function runSubmit({ patchKeys, campaignChange, failCampaign = false, failPatch = false }) {
  const calls = []
  const plan = planLeadSave(patchKeys, campaignChange)
  if (plan.noop) return { calls, result: "nothing_changed", plan }
  let writeStage = "campaign"
  try {
    if (plan.campaign !== null) {
      calls.push({ fn: "setLeadCampaign", value: plan.campaign })
      if (failCampaign) throw new MutationError("campaign_wrong_workspace", "op-1")
    }
    writeStage = "patch"
    if (plan.patch) {
      calls.push({ fn: "updateLead" })
      if (failPatch) throw new Error("firestore down")
    }
    return { calls, result: "saved", plan }
  } catch (err) {
    return { calls, result: describeSaveFailure(plan, writeStage), plan, message: describeError(err).message }
  }
}

test("cambiar SOLO la campaña A → B llama a la ruta y guarda", async () => {
  // El bug: con el patch vacío el diálogo se cerraba sin llamar a nada.
  const { calls, result } = await runSubmit({ patchKeys: 0, campaignChange: "c-b" })
  assert.notEqual(result, "nothing_changed")
  assert.deepEqual(calls, [{ fn: "setLeadCampaign", value: "c-b" }])
  assert.equal(result, "saved")
})

test("quitar SOLO la campaña también llama a la ruta", async () => {
  const { calls, result } = await runSubmit({ patchKeys: 0, campaignChange: "" })
  assert.deepEqual(calls, [{ fn: "setLeadCampaign", value: "" }], '"" es un cambio real: Sin campaña')
  assert.equal(result, "saved")
})

test("no cambiar nada muestra «sin cambios» y no llama a nadie", async () => {
  const { calls, result } = await runSubmit({ patchKeys: 0, campaignChange: null })
  assert.equal(result, "nothing_changed")
  assert.deepEqual(calls, [])
})

test("campaña + otro campo ejecuta AMBAS operaciones, en orden", async () => {
  const { calls, result } = await runSubmit({ patchKeys: 2, campaignChange: "c-b" })
  assert.deepEqual(calls.map((c) => c.fn), ["setLeadCampaign", "updateLead"])
  assert.equal(result, "saved")
})

test("cambiar solo otros campos NO llama a la ruta de campaña", async () => {
  const { calls } = await runSubmit({ patchKeys: 1, campaignChange: null })
  assert.deepEqual(calls.map((c) => c.fn), ["updateLead"])
})

test("nunca se llama updateLead con un patch vacío", async () => {
  const { calls } = await runSubmit({ patchKeys: 0, campaignChange: "c-b" })
  assert.ok(!calls.some((c) => c.fn === "updateLead"))
})

test("si falla la campaña no se escribe nada más y el mensaje es el específico", async () => {
  const { calls, result, message } = await runSubmit({ patchKeys: 2, campaignChange: "c-b", failCampaign: true })
  assert.equal(result, "failed", "nada llegó a guardarse")
  assert.deepEqual(calls.map((c) => c.fn), ["setLeadCampaign"], "updateLead no se ejecuta")
  assert.match(message, /otro workspace/, "el mensaje específico sobrevive")
})

test("si falla el SEGUNDO guardado no se presenta como éxito total", async () => {
  const { result } = await runSubmit({ patchKeys: 2, campaignChange: "c-b", failPatch: true })
  assert.equal(result, "partial_campaign_saved")
  assert.notEqual(result, "saved")
})

test("un fallo del patch SIN cambio de campaña es un fallo limpio", async () => {
  const { result } = await runSubmit({ patchKeys: 2, campaignChange: null, failPatch: true })
  assert.equal(result, "failed")
})

/* ============ describeError conserva el mensaje y el operationId ========= */

test("describeError devuelve el mensaje específico, no «error inesperado»", () => {
  for (const code of ["campaign_wrong_workspace", "campaign_type_mismatch", "address_required", "identity_inconsistent"]) {
    const d = describeError(new MutationError(code, "op-42"))
    assert.doesNotMatch(d.message, /inesperado/i, `${code} no debe caer en unknown`)
    assert.match(d.detail, /op-42/, "el operationId viaja para correlacionar con el log")
    assert.match(d.detail, new RegExp(code))
  }
})

test("un Error normal sigue tratándose como desconocido", () => {
  const d = describeError(new Error("boom"))
  assert.match(d.message, /inesperado/i)
})

/* ============ códigos reales de authenticateRequest ===================== */

test("cada fallo de autenticación conserva su propio código", async () => {
  const cases = [
    ["missing_token", "unauthenticated", 401],
    ["invalid_token", "invalid_token", 401],
    ["no_membership", "membership_missing", 403],
    ["membership_inactive", "membership_inactive", 403],
    ["server_not_configured", "server_not_configured", 503],
  ]
  for (const [authError, expected, status] of cases) {
    seed()
    state.auth = { ok: false, status, error: authError }
    const campaign = await postCampaign("L1", { campaignId: "c-apc" })
    assert.equal(campaign.body.error, expected, `campaña: ${authError}`)
    assert.equal(campaign.status, status)

    const appt = await postAppointment({ leadId: "L1", scheduledAt: "x", type: "demo", location: ADDRESS })
    assert.equal(appt.body.error, expected, `agenda: ${authError}`)
    assert.equal(appt.status, status)
  }
})

test("una membresía desactivada no se reporta como «vuelve a iniciar sesión»", () => {
  const lib = read("lib/firebase/leads.ts")
  assert.match(lib, /membership_inactive: "Tu cuenta está desactivada/)
  assert.doesNotMatch(lib, /membership_inactive: "[^"]*iniciar sesión/)
})
