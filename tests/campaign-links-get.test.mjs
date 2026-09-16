// Executed tests, not text inspection: the COMPILED route handler is invoked
// with a fake Admin SDK whose every write path throws. Only the server-only
// modules are substituted (`getAdminDb`, auth, the link store); the handler's
// own logic is the real thing.
import test from "node:test"
import assert from "node:assert/strict"
import Module from "node:module"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const build = join(root, ".test-build")
const require = createRequire(import.meta.url)

/** State the fakes read from, reset per test. */
const state = { user: null, links: [], writes: [], reconciled: false }

/** An Admin SDK whose every write throws: a read that writes cannot pass. */
function readOnlyDb() {
  const fail = (what) => () => {
    state.writes.push(what)
    throw new Error(`unexpected write: ${what}`)
  }
  const docRef = {
    set: fail("set"), update: fail("update"), create: fail("create"), delete: fail("delete"),
    get: async () => ({ exists: false, data: () => undefined }),
  }
  const query = { where: () => query, limit: () => query, get: async () => ({ empty: true, docs: [] }) }
  return {
    collection: () => ({ doc: () => docRef, add: fail("add"), where: () => query }),
    batch: () => ({ set: fail("batch.set"), update: fail("batch.update"), commit: fail("batch.commit") }),
    runTransaction: fail("runTransaction"),
  }
}

const fakes = {
  "next/server": {
    NextResponse: { json: (body, init) => ({ status: init?.status ?? 200, body }) },
  },
  "@/lib/firebase/admin": { getAdminDb: () => readOnlyDb(), isAdminNotConfigured: () => false },
  "@/lib/firebase/server-auth": {
    authenticateRequest: async () => ({ ok: true, user: state.user }),
    canAccessWorkspace: (u, ws) => u.membership.role === "super_admin" || u.membership.workspaceId === ws,
    canManageCampaignLinks: (u, ws) =>
      u.membership.role === "super_admin"
      || ((u.membership.role === "client_admin" || u.membership.role === "manager")
          && u.membership.workspaceId === ws),
  },
  "@/lib/meta/campaign-links": {
    listCampaignLinks: async (_db, scope) => state.links.filter((l) => scope === null || l.workspaceId === scope),
    ensureLocalCampaign: async () => { state.reconciled = true; return "local-x" },
    upsertCampaignLink: async () => { throw new Error("upsert must not run on a read") },
    deleteCampaignLink: async () => { throw new Error("delete must not run on a read") },
    getCampaignLink: async (_db, id) => state.links.find((l) => l.metaCampaignId === id) ?? null,
  },
}

const resolveOriginal = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request in fakes) return request
  return resolveOriginal.call(this, request, ...rest)
}
const loadOriginal = Module._load
Module._load = function (request, ...rest) {
  if (request in fakes) return fakes[request]
  return loadOriginal.call(this, request, ...rest)
}

const route = require(join(build, "app/api/meta/campaign-links/route.js"))

const adminOfA = { uid: "a", membership: { role: "client_admin", workspaceId: "ws-A", userId: "u1", email: "a@x" } }
const adminOfB = { uid: "b", membership: { role: "client_admin", workspaceId: "ws-B", userId: "u2", email: "b@x" } }
const superAdmin = { uid: "s", membership: { role: "super_admin", workspaceId: null, userId: "s", email: "s@x" } }

function setUp(user) {
  state.user = user
  state.writes = []
  state.reconciled = false
  state.links = [
    { metaCampaignId: "c-A", workspaceId: "ws-A", active: true, campaignId: "local-A", objective: "sales" },
    // campaignId null: the old GET would have "fixed" this with a write.
    { metaCampaignId: "c-B", workspaceId: "ws-B", active: true, campaignId: null, objective: "sales" },
  ]
}

test("GET performs ZERO writes", async () => {
  setUp(adminOfA)
  const res = await route.GET(new Request("http://x/api/meta/campaign-links"))
  assert.equal(res.status, 200)
  assert.deepEqual(state.writes, [], "a read must not write to Firestore")
})

test("GET does not reconcile local campaigns: that is an explicit POST action", async () => {
  setUp(adminOfB)
  await route.GET(new Request("http://x/api/meta/campaign-links"))
  assert.equal(state.reconciled, false)
})

test("an admin of workspace B never receives workspace A's links", async () => {
  setUp(adminOfB)
  const res = await route.GET(new Request("http://x/api/meta/campaign-links"))
  const seen = [...new Set(res.body.links.map((l) => l.workspaceId))]
  assert.deepEqual(seen, ["ws-B"])
})

test("naming another workspace in the query does not widen the scope", async () => {
  setUp(adminOfB)
  const res = await route.GET(new Request("http://x/api/meta/campaign-links?workspaceId=ws-A"))
  if (res.status === 200) {
    assert.ok(
      res.body.links.every((l) => l.workspaceId === "ws-B"),
      "a non-super-admin is always scoped to their own workspace",
    )
  } else {
    assert.equal(res.status, 403)
  }
})

test("a super admin may read across workspaces", async () => {
  setUp(superAdmin)
  const res = await route.GET(new Request("http://x/api/meta/campaign-links"))
  assert.equal(res.body.links.length, 2)
})

test("reconciling through POST never reaches another workspace", async () => {
  setUp(adminOfB)
  const res = await route.POST(
    new Request("http://x/api/meta/campaign-links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reconcile", workspaceId: "ws-A" }),
    }),
  )
  if (res.status === 200) {
    assert.ok((res.body.links ?? []).every((l) => l.workspaceId === "ws-B"))
  } else {
    assert.equal(res.status, 403)
  }
})
