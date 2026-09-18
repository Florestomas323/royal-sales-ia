/**
 * Cambio de workspace: creación de prospectos y papelera.
 *
 * Estas pruebas EJECUTAN el código real:
 *  - `POST /api/leads` se importa del compilado y corre con dobles solo para
 *    lo que es server-only (Admin SDK, autenticación, notificaciones y el
 *    reclamo atómico de identidad, que tiene sus propias pruebas).
 *  - `AppLayout`, `TopBar` y `WorkspaceScope` se invocan de verdad y se
 *    inspecciona el árbol de elementos React que devuelven, de modo que la
 *    jerarquía «TopBar dentro del alcance que se remonta» es una propiedad
 *    verificada, no un texto buscado.
 *  - Las decisiones del diálogo y de la papelera son funciones puras y se
 *    ejecutan con datos de dos workspaces.
 *
 * Fallan si vuelve cualquiera de los dos errores de producción:
 *   1. «No se pudo crear el prospecto» tras cambiar de workspace.
 *   2. La papelera sin destino (o con el destino equivocado) aunque haya un
 *      workspace concreto seleccionado globalmente.
 */
import test from "node:test"
import assert from "node:assert/strict"
import Module from "node:module"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const build = join(root, ".test-build")

/* ------------------------------------------------------------- dobles ---- */

const state = { auth: null, users: {}, campaigns: {}, created: [], notified: 0 }

function docRef(path) {
  const store = path.startsWith("users/") ? state.users : state.campaigns
  const id = path.split("/").pop()
  return {
    path,
    id,
    get: async () => ({ exists: id in store, data: () => store[id] }),
  }
}

const fakeDb = {
  collection: (name) => ({ doc: (id) => docRef(`${name}/${id}`) }),
}

/** Marcadores: componentes de cliente que NO deben ejecutarse en el test. */
const marker = (name) => {
  const fn = () => null
  Object.defineProperty(fn, "name", { value: name })
  return fn
}
const Markers = {
  SidebarProvider: marker("SidebarProvider"),
  SidebarInset: marker("SidebarInset"),
  SidebarTrigger: marker("SidebarTrigger"),
  AppSidebar: marker("AppSidebar"),
  TopBarStub: marker("TopBarStub"),
  RequireAuth: marker("RequireAuth"),
  WorkspaceProvider: marker("WorkspaceProvider"),
  WorkspaceScopeStub: marker("WorkspaceScopeStub"),
  Separator: marker("Separator"),
  GlobalSearch: marker("GlobalSearch"),
  NotificationsMenu: marker("NotificationsMenu"),
  NewLeadDialog: marker("NewLeadDialog"),
}

/** Lo que `useWorkspace()` devuelve dentro de WorkspaceScope durante el test. */
const workspaceContext = { workspaceId: "ws-A", isSuperAdmin: true, status: "ready" }

const resolveOriginal = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) {
    for (const c of [`${build}/${request.slice(2)}.js`, `${build}/${request.slice(2)}/index.js`]) {
      try { return resolveOriginal.call(this, c, ...rest) } catch { /* next */ }
    }
  }
  if (request === "next/server" || request === "firebase-admin/firestore" || request === "next/navigation") {
    return request
  }
  return resolveOriginal.call(this, request, ...rest)
}

/** Imports relativos de top-bar.tsx que se sustituyen por marcadores. */
const TOP_BAR_RELATIVES = {
  "./global-search": { GlobalSearch: Markers.GlobalSearch },
  "./notifications-menu": { NotificationsMenu: Markers.NotificationsMenu },
  "./new-lead-dialog": { NewLeadDialog: Markers.NewLeadDialog },
}

const loadOriginal = Module._load
Module._load = function (request, parent, ...rest) {
  if (request === "next/server") {
    return { NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, body }) } }
  }
  if (request === "next/navigation") {
    return { usePathname: () => "/leads" }
  }
  if (request === "firebase-admin/firestore") {
    return { FieldValue: { serverTimestamp: () => "__ts__", delete: () => "__del__" } }
  }
  if (request === "@/lib/firebase/admin") {
    return { getAdminDb: () => fakeDb, isAdminNotConfigured: () => false }
  }
  if (request === "@/lib/firebase/server-auth") {
    return { authenticateRequest: async () => state.auth }
  }
  if (request === "@/lib/notifications/server") {
    return { notifyNewLeadServer: async () => { state.notified += 1 } }
  }
  if (request === "@/lib/lead-dedup-server") {
    // El reclamo atómico tiene sus propias pruebas (tests/lead-dedup). Aquí
    // interesa QUÉ prospecto construyó la ruta antes de escribirlo.
    return {
      createOrReuseLeadAtomic: async ({ lead }) => {
        state.created.push(lead)
        return { leadId: `lead-${state.created.length}`, created: true, duplicate: false, restored: false, enriched: false, enrichedFields: [] }
      },
      leadOutcomeOf: (r) => (r.created ? "created" : "unchanged"),
    }
  }
  if (request === "@/components/ui/sidebar") {
    return { SidebarProvider: Markers.SidebarProvider, SidebarInset: Markers.SidebarInset, SidebarTrigger: Markers.SidebarTrigger }
  }
  if (request === "@/components/ui/separator") return { Separator: Markers.Separator }
  if (request === "@/components/shell/app-sidebar") return { AppSidebar: Markers.AppSidebar }
  if (request === "@/components/shell/top-bar") return { TopBar: Markers.TopBarStub }
  if (request === "@/components/auth/require-auth") return { RequireAuth: Markers.RequireAuth }
  if (request === "@/components/shell/workspace-scope") return { WorkspaceScope: Markers.WorkspaceScopeStub }
  if (request === "@/lib/firebase/workspace-context") {
    return {
      ALL_WORKSPACES: "__all__",
      WorkspaceProvider: Markers.WorkspaceProvider,
      useWorkspace: () => workspaceContext,
    }
  }
  if (parent?.filename?.endsWith(join("components", "shell", "top-bar.js")) && TOP_BAR_RELATIVES[request]) {
    return TOP_BAR_RELATIVES[request]
  }
  return loadOriginal.call(this, request, parent, ...rest)
}

const require = createRequire(import.meta.url)
const leadsRoute = require(join(build, "app/api/leads/route.js"))
const layoutModule = require(join(build, "app/(app)/layout.js"))
const topBarModule = require(join(build, "components/shell/top-bar.js"))
const scopeModule = require(join(build, "components/shell/workspace-scope.js"))
const {
  NO_CAMPAIGN,
  countArchivedIn,
  initialWorkspaceFilter,
  newLeadSubmitBlock,
  resolveAssignee,
  resolveCampaignId,
  resolveTrashTarget,
  showsLocalWorkspaceFilter,
} = require(join(build, "lib/leads/workspace-switch.js"))
const { MutationError } = require(join(build, "lib/firebase/leads.js"))
const { describeError } = require(join(build, "lib/firebase/errors.js"))

/* ------------------------------------------------------- dos workspaces -- */

const WS_A = "ws-A"
const WS_IMPACT = "IS2O6ZW8IcWZhkAy7vNS"
const WORKSPACES = [
  { id: WS_A, name: "Cocina con Propósito" },
  { id: WS_IMPACT, name: "Impact Enterprises" },
]

function reset() {
  state.created = []
  state.notified = 0
  state.users = {
    "u-a1": { workspaceId: WS_A, role: "sales_rep", status: "active" },
    "u-imp1": { workspaceId: WS_IMPACT, role: "manager", status: "active" },
    "u-imp2": { workspaceId: WS_IMPACT, role: "sales_rep", status: "active" },
  }
  state.campaigns = {
    "c-a1": { workspaceId: WS_A, objective: "sales", name: "Regalo A", clientId: "" },
    "c-imp1": { workspaceId: WS_IMPACT, objective: "sales", name: "Reclutamiento Impact", clientId: "" },
  }
  state.auth = superAdmin()
}

const superAdmin = () => ({
  ok: true,
  user: { uid: "uid-tomas", email: null, membership: { userId: "u-super", role: "super_admin", workspaceId: null, status: "active" } },
})
const memberOf = (workspaceId, role, userId) => ({
  ok: true,
  user: { uid: `uid-${userId}`, email: null, membership: { userId, role, workspaceId, status: "active" } },
})

/** Un POST real a la ruta compilada. */
async function post(body) {
  const request = {
    url: "https://royalsalesia.com/api/leads",
    headers: { get: () => "Bearer t" },
    json: async () => body,
  }
  return leadsRoute.POST(request)
}

const validLead = (over = {}) => ({
  workspaceId: WS_IMPACT,
  leadType: "sales",
  source: "manual",
  name: "Prospecto de prueba",
  phone: "+16823811576",
  assignedToId: "u-imp1",
  campaignId: "c-imp1",
  ...over,
})

/* --------------------------------------------------- árbol de elementos -- */

function flatten(node, out = []) {
  if (node === null || node === undefined || typeof node !== "object") return out
  if (Array.isArray(node)) {
    for (const n of node) flatten(n, out)
    return out
  }
  out.push(node)
  flatten(node.props?.children, out)
  return out
}

const typesIn = (node) => flatten(node).map((el) => el.type)

/* ========================================================================= */
/*  1 y 10. El contenido operativo — TopBar y sus diálogos — se remonta      */
/* ========================================================================= */

test("1. WorkspaceScope envuelve TopBar, no solo el contenido de main", () => {
  const tree = layoutModule.default({ children: "PAGE" })
  const all = flatten(tree)
  const scope = all.find((el) => el.type === Markers.WorkspaceScopeStub)
  assert.ok(scope, "el layout debe seguir usando WorkspaceScope")

  const insideScope = typesIn(scope.props.children)
  assert.ok(
    insideScope.includes(Markers.TopBarStub),
    "TopBar debe estar DENTRO del alcance que se remonta: es quien renderiza NewLeadDialog",
  )
  assert.ok(insideScope.includes("main"), "main también debe estar dentro del alcance")

  const topBars = all.filter((el) => el.type === Markers.TopBarStub)
  assert.equal(topBars.length, 1, "una sola TopBar, y no fuera del alcance")

  // El sidebar y los providers NO se remontan: nadie pierde la sesión ni el
  // selector de workspace. "Fuera" = fuera del subárbol de WorkspaceScope.
  const inside = new Set(flatten(scope.props.children))
  const outside = all.filter((el) => el !== scope && !inside.has(el)).map((el) => el.type)
  assert.ok(outside.includes(Markers.AppSidebar), "AppSidebar debe quedar fuera del remontaje")
  assert.ok(outside.includes(Markers.WorkspaceProvider), "los providers no se remontan")
  assert.ok(outside.includes(Markers.RequireAuth), "la sesión no se remonta")
  assert.ok(!insideScope.includes(Markers.AppSidebar))
})

test("1b. NewLeadDialog se renderiza dentro de TopBar", () => {
  const tree = topBarModule.TopBar()
  assert.ok(
    typesIn(tree).includes(Markers.NewLeadDialog),
    "si NewLeadDialog dejara de estar en TopBar, la prueba 1 dejaría de cubrirlo",
  )
})

test("10. cambiar de workspace cambia la key: React desmonta diálogos y hojas", () => {
  workspaceContext.workspaceId = WS_A
  const a = scopeModule.WorkspaceScope({ children: "X" })
  workspaceContext.workspaceId = WS_IMPACT
  const impact = scopeModule.WorkspaceScope({ children: "X" })
  assert.notEqual(a.key, impact.key, "A → Impact debe remontar el subárbol")

  // «Todos los workspaces» es su propio alcance.
  workspaceContext.workspaceId = null
  const todos = scopeModule.WorkspaceScope({ children: "X" })
  assert.notEqual(todos.key, impact.key)
  assert.notEqual(todos.key, a.key)

  // Mientras la identidad carga no se reutiliza la key de un workspace real.
  workspaceContext.workspaceId = WS_IMPACT
  workspaceContext.status = "loading"
  assert.notEqual(scopeModule.WorkspaceScope({ children: "X" }).key, impact.key)
  workspaceContext.status = "ready"
})

/* ========================================================================= */
/*  2, 3 y 4. Nada del workspace anterior sobrevive al cambio                */
/* ========================================================================= */

test("2. un responsable del workspace A no sobrevive al cambio a Impact", () => {
  const impactReps = ["u-imp1", "u-imp2"]
  assert.equal(
    resolveAssignee("u-a1", impactReps),
    "u-imp1",
    "el responsable de A debe ser reemplazado, no conservado",
  )
  // Y una selección válida de Impact se respeta.
  assert.equal(resolveAssignee("u-imp2", impactReps), "u-imp2")
  // Sin integrantes todavía, jamás se devuelve el del workspace anterior.
  assert.equal(resolveAssignee("u-a1", []), "")
  // El rep solo puede asignarse a sí mismo.
  assert.equal(resolveAssignee("u-imp1", impactReps, { isRep: true, userId: "u-imp2" }), "u-imp2")
})

test("2b. el servidor rechaza un responsable de otro workspace con su código", async () => {
  reset()
  const res = await post(validLead({ assignedToId: "u-a1" }))
  assert.equal(res.body.error, "invalid_assignee")
  assert.equal(res.status, 400)
  assert.deepEqual(state.created, [], "no se escribe ningún prospecto")
})

test("3. las campañas de A no aparecen ni pueden enviarse desde Impact", async () => {
  assert.equal(resolveCampaignId("c-a1", ["c-imp1"]), NO_CAMPAIGN)
  assert.equal(resolveCampaignId("c-imp1", ["c-imp1"]), "c-imp1")
  assert.equal(resolveCampaignId(NO_CAMPAIGN, ["c-imp1"]), NO_CAMPAIGN)

  reset()
  const res = await post(validLead({ campaignId: "c-a1" }))
  assert.equal(res.body.error, "invalid_campaign")
  assert.deepEqual(state.created, [])
})

test("4. crear justo después del cambio usa workspace, campaña y responsable de Impact", async () => {
  reset()
  // Lo que el diálogo decide tras el remontaje, con los datos de Impact.
  const assignedToId = resolveAssignee("u-a1", ["u-imp1", "u-imp2"])
  const campaignId = resolveCampaignId("c-a1", ["c-imp1"])
  const chosen = campaignId === NO_CAMPAIGN ? "c-imp1" : campaignId

  const res = await post(validLead({ assignedToId, campaignId: chosen }))
  assert.equal(res.status, 201, res.body?.error ?? "")
  const [lead] = state.created
  assert.equal(lead.workspaceId, WS_IMPACT)
  assert.equal(lead.assignedToId, "u-imp1")
  assert.equal(lead.campaignId, "c-imp1")
  assert.equal(lead.campaignName, "Reclutamiento Impact")
  assert.equal(typeof res.body.operationId, "string")
})

test("4b. Guardar está bloqueado mientras carga el workspace nuevo", () => {
  const base = { workspaceId: WS_IMPACT, loadingReps: false, loadingCampaigns: false, submitting: false }
  assert.equal(newLeadSubmitBlock(base), null)
  assert.equal(newLeadSubmitBlock({ ...base, loadingReps: true }), "loading_workspace")
  assert.equal(newLeadSubmitBlock({ ...base, loadingCampaigns: true }), "loading_workspace")
  assert.equal(newLeadSubmitBlock({ ...base, workspaceId: null }), "no_workspace")
  assert.equal(newLeadSubmitBlock({ ...base, submitting: true }), "submitting")
})

/* ========================================================================= */
/*  5. Los códigos conservan su mensaje específico hasta la interfaz         */
/* ========================================================================= */

test("5. cada código de POST /api/leads viaja con su operationId", async () => {
  const cases = [
    ["invalid_identity", validLead({ phone: "12345" })],
    ["invalid_email", validLead({ email: "no-es-correo" })],
    ["invalid_lead_type", validLead({ leadType: "otro" })],
    ["invalid_source", validLead({ source: "telepatía" })],
    ["invalid_source_for_type", validLead({ leadType: "sales", source: "indeed" })],
    ["missing_workspace", validLead({ workspaceId: "" })],
    ["invalid_assignee", validLead({ assignedToId: "u-a1" })],
    ["invalid_campaign", validLead({ campaignId: "c-a1" })],
  ]
  for (const [code, body] of cases) {
    reset()
    const res = await post(body)
    assert.equal(res.body.error, code, `se esperaba ${code}`)
    assert.equal(typeof res.body.operationId, "string", `${code} necesita operationId`)
    assert.ok(res.status >= 400)
  }
})

test("5b. la interfaz muestra el motivo real, no «error inesperado»", () => {
  const generic = describeError(new Error("boom")).message
  for (const code of [
    "missing_workspace",
    "invalid_assignee",
    "invalid_campaign",
    "forbidden",
    "invalid_identity",
    "invalid_email",
    "invalid_lead_type",
    "invalid_source",
    "invalid_source_for_type",
    "server_not_configured",
  ]) {
    const described = describeError(new MutationError(code, "op-1"))
    assert.notEqual(described.message, generic, `${code} no puede caer en el mensaje genérico`)
    assert.ok(described.message.length > 0)
    assert.ok(described.detail.includes("op-1"), "el operationId debe poder reportarse")
  }
})

test("5c. la respuesta nunca registra nombre, teléfono ni correo", async () => {
  reset()
  const res = await post(validLead({ assignedToId: "u-a1", email: "cliente@example.com" }))
  const payload = JSON.stringify(res.body)
  assert.ok(!payload.includes("Prospecto de prueba"))
  assert.ok(!payload.includes("+16823811576"))
  assert.ok(!payload.includes("cliente@example.com"))
})

/* ========================================================================= */
/*  6, 7, 8 y 9. Papelera: destino y contador                                */
/* ========================================================================= */

test("6. con Impact activo la papelera resuelve a Impact sin elegirlo otra vez", () => {
  const filtro = initialWorkspaceFilter(WS_IMPACT)
  assert.equal(filtro, WS_IMPACT, "la pantalla arranca en el workspace global")
  const target = resolveTrashTarget(filtro, WS_IMPACT, WORKSPACES)
  assert.deepEqual(target, { id: WS_IMPACT, name: "Impact Enterprises" })
  // Aunque el filtro local no se hubiese sincronizado todavía.
  assert.deepEqual(resolveTrashTarget(null, WS_IMPACT, WORKSPACES), target)
  // Y sin selector local contradictorio.
  assert.equal(showsLocalWorkspaceFilter(true, 2, WS_IMPACT), false)
})

test("7. en «Todos los workspaces» no hay borrado hasta elegir uno", () => {
  assert.equal(resolveTrashTarget(null, null, WORKSPACES), null, "jamás un borrado global")
  assert.equal(showsLocalWorkspaceFilter(true, 2, null), true, "ahí sí hace falta el selector local")
})

test("8. elegir Impact desde «Todos» habilita únicamente la papelera de Impact", () => {
  const target = resolveTrashTarget(WS_IMPACT, null, WORKSPACES)
  assert.deepEqual(target, { id: WS_IMPACT, name: "Impact Enterprises" })
  assert.notEqual(target.id, WS_A)
  // Un id que no está entre los workspaces autorizados no da destino.
  assert.equal(resolveTrashTarget("ws-inventado", null, WORKSPACES), null)
})

test("9. el contador es el de los archivados de ESE workspace", () => {
  const leads = [
    { workspaceId: WS_IMPACT, archived: true },
    { workspaceId: WS_IMPACT, archived: true },
    { workspaceId: WS_IMPACT, archived: false },
    { workspaceId: WS_IMPACT },
    { workspaceId: WS_A, archived: true },
    { workspaceId: WS_A, archived: true },
    { workspaceId: WS_A, archived: true },
  ]
  assert.equal(countArchivedIn(leads, WS_IMPACT), 2)
  assert.equal(countArchivedIn(leads, WS_A), 3)
  assert.equal(countArchivedIn(leads, null), 0, "sin destino no se promete ningún borrado")
})

/* ========================================================================= */
/*  12. Roles y aislamiento multitenant                                      */
/* ========================================================================= */

test("12. nadie crea prospectos en otro workspace", async () => {
  reset()
  state.auth = memberOf(WS_A, "client_admin", "u-a1")
  const res = await post(validLead({ workspaceId: WS_IMPACT }))
  // El workspace se deriva de la membresía, nunca del cuerpo.
  assert.equal(state.created.length === 0 || state.created[0].workspaceId === WS_A, true)
  if (res.status >= 400) assert.ok(["forbidden", "invalid_assignee", "invalid_campaign"].includes(res.body.error))
})

test("12b. un viewer no puede crear y un rep solo se asigna a sí mismo", async () => {
  reset()
  state.auth = memberOf(WS_IMPACT, "viewer", "u-imp3")
  assert.equal((await post(validLead())).body.error, "forbidden")
  assert.deepEqual(state.created, [])

  reset()
  state.auth = memberOf(WS_IMPACT, "sales_rep", "u-imp2")
  const res = await post(validLead({ assignedToId: "u-imp1" }))
  assert.equal(res.body.error, "invalid_assignee")
  assert.equal(res.status, 403)
  assert.deepEqual(state.created, [])
})
