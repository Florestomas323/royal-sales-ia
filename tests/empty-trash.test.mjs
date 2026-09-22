/**
 * "Vaciar papelera": these EXECUTE the real helper.
 *
 * `emptyWorkspaceTrash` is imported from the same module the authenticated
 * route calls — nothing is transcribed or reimplemented here. The Firestore
 * it runs against is a small in-memory double that honours the query shapes
 * the helper uses (`where` equality, `where in`, `limit`, batches and
 * transactions) and can be told to fail a specific collection, which is how
 * the "a broken relation keeps its lead" case is proven.
 *
 * The destructive behaviour against a REAL Firestore lives in
 * tests/emulator/empty-trash.emulator.test.mjs, which imports this same
 * helper.
 */
import test from "node:test"
import assert from "node:assert/strict"
import Module from "node:module"
import { createRequire } from "node:module"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const build = join(root, ".test-build")

const resolveOriginal = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) {
    for (const c of [`${build}/${request.slice(2)}.js`, `${build}/${request.slice(2)}/index.js`]) {
      try { return resolveOriginal.call(this, c, ...rest) } catch { /* next */ }
    }
  }
  if (request === "firebase-admin/firestore") return "firebase-admin/firestore"
  return resolveOriginal.call(this, request, ...rest)
}
const loadOriginal = Module._load
Module._load = function (request, ...rest) {
  if (request === "firebase-admin/firestore") {
    return {
      FieldValue: { serverTimestamp: () => "__ts__", delete: () => "__DELETE__" },
      FieldPath: { documentId: () => "__id__" },
    }
  }
  return loadOriginal.call(this, request, ...rest)
}

const require = createRequire(import.meta.url)
const { emptyWorkspaceTrash } = require(join(build, "lib/leads/empty-trash-server.js"))

/* ------------------------------------------------- in-memory Firestore ---- */

/**
 * Supports exactly what the helper uses. `failOn` makes a collection throw,
 * and `onBeforeTransaction` lets a test mutate a document at the precise
 * moment between the query and the delete.
 */
function fakeDb({ docs = {}, failOn = new Set(), onBeforeTransaction = null } = {}) {
  // docs: { "collection/id": data }  and  "leads/L1/activities/act1"
  const store = new Map(Object.entries(docs))
  const deleted = []

  const refFor = (path) => ({
    path,
    id: path.split("/").pop(),
    get data() { return store.get(path) },
  })

  function docsIn(collectionPath) {
    return [...store.keys()]
      .filter((k) => k.startsWith(`${collectionPath}/`) && k.slice(collectionPath.length + 1).split("/").length === 1)
      .map((k) => ({ id: k.split("/").pop(), ref: refFor(k), data: () => store.get(k), exists: true }))
  }

  function makeQuery(collectionPath, filters = [], limit = Infinity, ordered = false, after = null) {
    const q = {
      where: (field, op, value) => makeQuery(collectionPath, [...filters, { field, op, value }], limit, ordered, after),
      limit: (n) => makeQuery(collectionPath, filters, n, ordered, after),
      orderBy: () => makeQuery(collectionPath, filters, limit, true, after),
      startAfter: (cursor) => makeQuery(collectionPath, filters, limit, ordered, cursor),
      get: async () => {
        if (failOn.has(collectionPath)) throw new Error(`boom:${collectionPath}`)
        let rows = docsIn(collectionPath)
        for (const f of filters) {
          rows = rows.filter((r) => {
            const v = r.data()?.[f.field]
            return f.op === "in" ? f.value.includes(v) : v === f.value
          })
        }
        if (ordered) rows.sort((a, b) => a.id.localeCompare(b.id))
        if (after) rows = rows.filter((r) => r.id.localeCompare(after) > 0)
        rows = rows.slice(0, limit)
        return { docs: rows, size: rows.length, empty: rows.length === 0 }
      },
    }
    return q
  }

  const db = {
    collection: (path) => ({
      ...makeQuery(path),
      doc: (id) => refFor(`${path}/${id}`),
    }),
    batch: () => {
      const ops = []
      return {
        delete: (ref) => ops.push(ref),
        commit: async () => {
          for (const ref of ops) {
            const col = ref.path.split("/").slice(0, -1).join("/")
            if (failOn.has(col)) throw new Error(`boom:${col}`)
            store.delete(ref.path)
            deleted.push(ref.path)
          }
        },
      }
    },
    runTransaction: async (fn) => {
      if (onBeforeTransaction) await onBeforeTransaction(store)
      return fn({
        get: async (ref) => ({
          exists: store.has(ref.path),
          data: () => store.get(ref.path),
        }),
        update: (ref, patch) => {
          const current = { ...(store.get(ref.path) ?? {}) }
          for (const [k, v] of Object.entries(patch)) {
            if (v === "__DELETE__") delete current[k]
            else current[k] = v
          }
          store.set(ref.path, current)
        },
        delete: (ref) => { store.delete(ref.path); deleted.push(ref.path) },
      })
    },
  }
  return { db, store, deleted }
}

const WS = "ws-APC"
const OTHER = "ws-otro"
const lead = (o = {}) => ({ workspaceId: WS, name: "Lead", phone: "+1", archived: true, ...o })

/** Seeds a lead with one of each related document. */
function withRelations(id, leadData) {
  return {
    [`leads/${id}`]: leadData,
    [`leads/${id}/activities/act-${id}`]: { workspaceId: leadData.workspaceId, leadId: id },
    [`appointments/appt-${id}`]: { workspaceId: leadData.workspaceId, leadId: id },
    [`notifications/n-${id}`]: { workspaceId: leadData.workspaceId, leadId: id },
    [`leadIdentityKeys/k-${id}`]: { workspaceId: leadData.workspaceId, leadId: id },
  }
}

/* --------------------------------------------------------------- tests ---- */

test("archived leads are deleted and active ones survive", async () => {
  const { db, store } = fakeDb({
    docs: { ...withRelations("A1", lead()), ...withRelations("A2", lead()), ...withRelations("V1", lead({ archived: false })) },
  })
  const out = await emptyWorkspaceTrash(db, WS)
  assert.equal(out.deletedCount, 2)
  assert.equal(out.success, true)
  assert.equal(store.has("leads/A1"), false)
  assert.equal(store.has("leads/A2"), false)
  assert.equal(store.has("leads/V1"), true, "the active prospect is untouched")
})

test("every real relation is deleted with its lead", async () => {
  const { db, store } = fakeDb({ docs: withRelations("A1", lead()) })
  await emptyWorkspaceTrash(db, WS)
  for (const path of ["leads/A1/activities/act-A1", "appointments/appt-A1", "notifications/n-A1", "leadIdentityKeys/k-A1"]) {
    assert.equal(store.has(path), false, `${path} must be deleted`)
  }
})

test("dedup keys are freed, and those of other leads and workspaces stay", async () => {
  const { db, store } = fakeDb({
    docs: {
      ...withRelations("A1", lead()),
      ...withRelations("V1", lead({ archived: false })),
      "leadIdentityKeys/k-OTHER": { workspaceId: OTHER, leadId: "X9" },
    },
  })
  await emptyWorkspaceTrash(db, WS)
  assert.equal(store.has("leadIdentityKeys/k-A1"), false, "freed: the phone+name can be used again")
  assert.equal(store.has("leadIdentityKeys/k-V1"), true)
  assert.equal(store.has("leadIdentityKeys/k-OTHER"), true, "another workspace is untouched")
})

test("another workspace's archived leads are never touched", async () => {
  const { db, store } = fakeDb({
    docs: { ...withRelations("A1", lead()), ...withRelations("B1", lead({ workspaceId: OTHER })) },
  })
  const out = await emptyWorkspaceTrash(db, WS)
  assert.equal(out.deletedCount, 1)
  assert.equal(store.has("leads/B1"), true)
})

test("a related document of ANOTHER workspace is not deleted even with a matching leadId", async () => {
  // A tampered or stale leadId must not reach another tenant's documents.
  const { db, store } = fakeDb({
    docs: { ...withRelations("A1", lead()), "appointments/intruso": { workspaceId: OTHER, leadId: "A1" } },
  })
  await emptyWorkspaceTrash(db, WS)
  assert.equal(store.has("appointments/intruso"), true, "the workspace filter protects it")
})

test("a failing relation KEEPS its lead, and the result is partial", async () => {
  const { db, store } = fakeDb({ docs: withRelations("A1", lead()), failOn: new Set(["appointments"]) })
  const out = await emptyWorkspaceTrash(db, WS)
  assert.equal(out.deletedCount, 0, "no orphan: the lead survives its relation")
  assert.equal(store.has("leads/A1"), true)
  assert.equal(out.pendingCount, 1)
  assert.equal(out.success, false, "a partial result is never a success")
})

test("one broken lead does not block the others", async () => {
  const { db, store } = fakeDb({ docs: { ...withRelations("A1", lead()), ...withRelations("A2", lead()) } })
  // Make only A1's activities fail, by deleting the collection read path.
  const broken = fakeDb({
    docs: { ...withRelations("A1", lead()), ...withRelations("A2", lead()) },
    failOn: new Set(["leads/A1/activities"]),
  })
  const out = await emptyWorkspaceTrash(broken.db, WS)
  assert.equal(out.deletedCount, 1, "A2 is deleted")
  assert.equal(broken.store.has("leads/A1"), true, "A1 is kept")
  assert.equal(out.pendingCount, 1)
  assert.ok(store)
})

test("a lead restored DURING the operation is not deleted, and is reported as a conflict", async () => {
  const docs = withRelations("A1", lead())
  const { db, store } = fakeDb({
    docs,
    // Somebody restores it between the query and the delete.
    onBeforeTransaction: (s) => {
      const d = s.get("leads/A1")
      if (d?.archived === true) s.set("leads/A1", { ...d, archived: false })
    },
  })
  const out = await emptyWorkspaceTrash(db, WS)
  assert.equal(out.deletedCount, 0)
  assert.equal(store.has("leads/A1"), true, "the restored prospect survives")
  assert.equal(out.conflictCount, 1)
  assert.equal(out.pendingCount, 1)
  assert.equal(out.success, false)
})

test("a lead moved to another workspace mid-run is not deleted either", async () => {
  const { db, store } = fakeDb({
    docs: withRelations("A1", lead()),
    onBeforeTransaction: (s) => {
      const d = s.get("leads/A1")
      if (d?.workspaceId === WS) s.set("leads/A1", { ...d, workspaceId: OTHER })
    },
  })
  const out = await emptyWorkspaceTrash(db, WS)
  assert.equal(out.deletedCount, 0)
  assert.equal(store.has("leads/A1"), true)
  assert.equal(out.conflictCount, 1)
})

test("a retry finishes what was pending, and a second full run returns zero", async () => {
  const docs = withRelations("A1", lead())
  const first = fakeDb({ docs: { ...docs }, failOn: new Set(["appointments"]) })
  const failed = await emptyWorkspaceTrash(first.db, WS)
  assert.equal(failed.deletedCount, 0)

  // Same data, without the failure: the retry completes it.
  const retry = fakeDb({ docs: { ...docs } })
  const ok = await emptyWorkspaceTrash(retry.db, WS)
  assert.equal(ok.deletedCount, 1)
  assert.equal(ok.success, true)

  // And running again over an empty trash is safe.
  const again = await emptyWorkspaceTrash(retry.db, WS)
  assert.equal(again.deletedCount, 0)
  assert.equal(again.success, true, "idempotent")
})

test("an empty trash returns zero and succeeds", async () => {
  const { db } = fakeDb({ docs: withRelations("V1", lead({ archived: false })) })
  const out = await emptyWorkspaceTrash(db, WS)
  assert.equal(out.deletedCount, 0)
  assert.equal(out.success, true)
})

test("the outcome exposes counts only — no ids, names or phones", async () => {
  const { db } = fakeDb({ docs: withRelations("A1", lead({ name: "María", phone: "+15125550100" })), failOn: new Set(["notifications"]) })
  const out = await emptyWorkspaceTrash(db, WS)
  const serialised = JSON.stringify(out)
  assert.doesNotMatch(serialised, /María|5125550100|A1/)
  assert.deepEqual(
    Object.keys(out).sort(),
    ["alreadyMissingCount", "conflictCount", "deletedCount", "pendingCount", "success", "workspaceId"],
  )
})

test("shared entities are never queried for deletion", async () => {
  const { db, store } = fakeDb({
    docs: {
      ...withRelations("A1", lead()),
      "campaigns/c1": { workspaceId: WS },
      "users/u1": { workspaceId: WS },
      "workspaces/ws-APC": { name: "APC" },
    },
  })
  await emptyWorkspaceTrash(db, WS)
  for (const p of ["campaigns/c1", "users/u1", "workspaces/ws-APC"]) {
    assert.equal(store.has(p), true, `${p} must survive`)
  }
})

/* ============ v3: reclamo de purga, cursor, tri-estado y parciales ======= */

test("2. si RESTAURAR gana la carrera, las relaciones del prospecto quedan intactas", async () => {
  const docs = withRelations("A1", lead())
  const { db, store } = fakeDb({
    docs,
    // El restore ocurre ANTES de que la purga reclame el lead.
    onBeforeTransaction: (s) => {
      const d = s.get("leads/A1")
      if (d?.archived === true && !d.purgeClaimId) s.set("leads/A1", { ...d, archived: false })
    },
  })
  const out = await emptyWorkspaceTrash(db, WS)
  assert.equal(out.deletedCount, 0)
  assert.equal(store.has("leads/A1"), true, "el prospecto sobrevive")
  // Lo que la auditoría exigía: sus relaciones TAMBIÉN sobreviven.
  for (const path of ["leads/A1/activities/act-A1", "appointments/appt-A1", "notifications/n-A1", "leadIdentityKeys/k-A1"]) {
    assert.equal(store.has(path), true, `${path} debe conservarse`)
  }
  assert.equal(out.conflictCount, 1)
})

test("2b. un lead ya reclamado por otra purga no se toca, y no se libera su reclamo ajeno", async () => {
  const docs = withRelations("A1", lead({ purgeClaimId: "otra-purga", purgeClaimedAt: new Date().toISOString() }))
  const { db, store } = fakeDb({ docs })
  const out = await emptyWorkspaceTrash(db, WS)
  assert.equal(out.deletedCount, 0)
  assert.equal(out.conflictCount, 1)
  assert.equal(store.get("leads/A1").purgeClaimId, "otra-purga", "el reclamo ajeno se respeta")
  assert.equal(store.has("appointments/appt-A1"), true, "sus relaciones no se tocan")
})

test("2c. un reclamo obsoleto se puede retomar: nunca queda un bloqueo permanente", async () => {
  const old = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { db, store } = fakeDb({ docs: withRelations("A1", lead({ purgeClaimId: "run-muerto", purgeClaimedAt: old })) })
  const out = await emptyWorkspaceTrash(db, WS)
  assert.equal(out.deletedCount, 1, "el reclamo abandonado se retoma")
  assert.equal(store.has("leads/A1"), false)
})

test("2d. si ya se borró parte de las relaciones, el bloqueo NO se libera", async () => {
  // Liberarlo dejaría restaurar un prospecto mutilado: sin actividades, sin
  // citas o sin su clave de dedup. El bloqueo se conserva y el siguiente run
  // lo retoma para terminar el trabajo.
  const { db, store } = fakeDb({ docs: withRelations("A1", lead()), failOn: new Set(["appointments"]) })
  const out = await emptyWorkspaceTrash(db, WS)
  assert.equal(out.deletedCount, 0)
  assert.equal(out.pendingCount, 1)
  const after = store.get("leads/A1")
  assert.equal(after.purgeState, "purging", "queda marcado como purga en curso")
  assert.ok(after.purgeClaimId, "conserva el bloqueo")
  // Las actividades, borradas antes del fallo, ya no están: por eso no puede
  // volver a ser un prospecto normal.
  assert.equal(store.has("leads/A1/activities/act-A1"), false)
})

test("2e. un bloqueo obsoleto de una purga interrumpida se RETOMA y termina el borrado", async () => {
  const old = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { db, store } = fakeDb({
    docs: withRelations("A1", lead({ purgeClaimId: "run-muerto", purgeClaimedAt: old, purgeState: "purging" })),
  })
  const out = await emptyWorkspaceTrash(db, WS)
  assert.equal(out.deletedCount, 1, "se termina, no se resucita")
  assert.equal(store.has("leads/A1"), false)
})

test("claimLead distingue claimed / already_missing / conflict", async () => {
  // already_missing: el lead desaparece antes de reclamarlo.
  const gone = fakeDb({
    docs: withRelations("A1", lead()),
    onBeforeTransaction: (st) => { st.delete("leads/A1") },
  })
  const a = await emptyWorkspaceTrash(gone.db, WS)
  assert.equal(a.alreadyMissingCount, 1)
  assert.equal(a.conflictCount, 0)
  assert.equal(a.pendingCount, 0, "desaparecido no es pendiente")
  assert.equal(a.success, true)

  // conflict: lo restauran antes del reclamo.
  const restored = fakeDb({
    docs: withRelations("A2", lead()),
    onBeforeTransaction: (st) => {
      const d = st.get("leads/A2")
      if (d?.archived === true && !d.purgeClaimId) st.set("leads/A2", { ...d, archived: false })
    },
  })
  const b = await emptyWorkspaceTrash(restored.db, WS)
  assert.equal(b.conflictCount, 1)
  assert.equal(b.alreadyMissingCount, 0)
  assert.equal(b.pendingCount, 1)
})

test("3. una página fallida no impide procesar las siguientes", async () => {
  // 150 archivados; los primeros 100 (por id) fallan al borrar sus citas.
  const docs = {}
  const ids = []
  for (let i = 0; i < 150; i += 1) {
    const id = `L${String(i).padStart(3, "0")}`
    ids.push(id)
    Object.assign(docs, withRelations(id, lead()))
  }
  const firstPage = new Set(ids.slice(0, 100))
  const { db, store } = fakeDb({ docs })
  // Hace fallar la consulta de appointments solo para la primera página.
  const originalCollection = db.collection
  db.collection = (path) => {
    const col = originalCollection(path)
    if (path !== "appointments") return col
    return {
      ...col,
      where: (f, op, v) => {
        const q = col.where(f, op, v)
        return {
          ...q,
          where: (f2, op2, v2) => {
            const q2 = q.where(f2, op2, v2)
            return { ...q2, get: async () => { if (firstPage.has(v2)) throw new Error("boom"); return q2.get() } }
          },
        }
      },
    }
  }
  const out = await emptyWorkspaceTrash(db, WS)
  assert.equal(out.deletedCount, 50, "los 50 posteriores sí se eliminan")
  assert.equal(out.pendingCount, 100, "y los 100 pendientes se cuentan todos")
  assert.equal(store.has("leads/L149"), false)
  assert.equal(store.has("leads/L000"), true)
})

test("4. una purga concurrente no hace que el mismo lead se cuente dos veces", async () => {
  const { db, store } = fakeDb({
    docs: withRelations("A1", lead()),
    // Entre el reclamo y el borrado, otra purga lo elimina.
    onBeforeTransaction: (s) => {
      if (s.get("leads/A1")?.purgeClaimId) s.delete("leads/A1")
    },
  })
  const out = await emptyWorkspaceTrash(db, WS)
  assert.equal(out.deletedCount, 0, "esta ejecución no lo borró, no lo cuenta")
  assert.equal(out.alreadyMissingCount, 1)
  assert.equal(out.pendingCount, 0, "tampoco es un pendiente")
  assert.equal(out.success, true)
  assert.equal(store.has("leads/A1"), false)
})

test("5. un error tras progreso conserva los contadores, nunca informa cero", async () => {
  const docs = {}
  for (let i = 0; i < 150; i += 1) Object.assign(docs, withRelations(`L${String(i).padStart(3, "0")}`, lead()))
  const { db } = fakeDb({ docs })
  // La consulta de leads falla a partir de la segunda página.
  const originalCollection = db.collection
  let pages = 0
  db.collection = (path) => {
    const col = originalCollection(path)
    if (path !== "leads") return col
    const wrap = (q) => ({
      ...q,
      where: (...a) => wrap(q.where(...a)),
      limit: (...a) => wrap(q.limit(...a)),
      orderBy: (...a) => wrap(q.orderBy(...a)),
      startAfter: (...a) => wrap(q.startAfter(...a)),
      get: async () => { pages += 1; if (pages > 1) throw new Error("boom"); return q.get() },
      doc: col.doc,
    })
    return { ...wrap(col), doc: col.doc }
  }
  const out = await emptyWorkspaceTrash(db, WS)
  assert.equal(out.errored, true)
  assert.equal(out.deletedCount, 100, "informa lo que sí eliminó")
  assert.equal(out.success, false)
})

/* ============== cambio de campaña: alcance del selector ================= */

test("el selector de campañas se liga al workspace DEL PROSPECTO, no al activo", () => {
  const dlg = readFileSync(join(root, "components/leads/edit-lead-dialog.tsx"), "utf8")
  // La causa del permission-denied: useCampaigns() usa el workspace activo.
  assert.match(dlg, /useCampaignsForWorkspace\(lead\.workspaceId\)/)
  assert.doesNotMatch(dlg, /= useCampaigns\(\)/)
  // Y se revalida el id contra el workspace del lead antes de escribir.
  assert.match(dlg, /c\.id === nextCampaign && c\.workspaceId === lead\.workspaceId/)
  const col = readFileSync(join(root, "lib/firebase/collections.ts"), "utf8")
  assert.match(col, /export function useCampaignsForWorkspace\(workspaceId: string \| null\)/)
  assert.match(col, /where\("workspaceId", "==", workspaceId\)/)
})

test("los campos de purga son server-only en las reglas", () => {
  const rules = readFileSync(join(root, "firestore.rules"), "utf8")
  // The affected-key set is computed once in allow update and passed as `ck`.
  assert.match(rules, /function purgeFieldsUntouched\(ck\)/)
  assert.match(rules, /!ck\.hasAny\(\['purgeClaimId', 'purgeClaimedAt', 'purgeState'\]\)/)
  const leadsBlock = rules.slice(rules.indexOf("match /leads/{leadId}"), rules.indexOf("match /leads/{leadId}/activities"))
  assert.match(leadsBlock, /&& purgeFieldsUntouched\(ck\)/)
  assert.match(leadsBlock, /allow update: if hasMembership\(\)\s*&& leadUpdateIsValid\(\s*request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\)/)
  // Tampoco pueden nacer con el lead.
  assert.match(leadsBlock, /hasAny\(\['purgeClaimId', 'purgeClaimedAt', 'purgeState'\]\)/)
})

/* ========== v5: el estado destructivo nunca retrocede ==================== */

test("1. un reclamo obsoleto en «purging» se retoma CONSERVANDO purging", async () => {
  const old = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { db, store } = fakeDb({
    docs: withRelations("A1", lead({ purgeClaimId: "run-muerto", purgeClaimedAt: old, purgeState: "purging" })),
    // Capturamos el estado justo después del reclamo, antes de markPurging.
  })
  // Instrumentamos: tras el primer update de reclamo, el estado debe seguir siendo purging.
  const seen = []
  const original = db.runTransaction
  db.runTransaction = async (fn) => {
    const r = await original(fn)
    const d = store.get("leads/A1")
    if (d?.purgeState) seen.push(d.purgeState)
    return r
  }
  await emptyWorkspaceTrash(db, WS)
  assert.ok(!seen.includes("claimed"), "nunca degrada a claimed")
  assert.equal(store.has("leads/A1"), false, "y termina el borrado")
})

test("2-4. si markPurging falla tras retomar un purging, el bloqueo NO se libera", async () => {
  const old = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  const { db, store } = fakeDb({
    docs: withRelations("A1", lead({ purgeClaimId: "run-muerto", purgeClaimedAt: old, purgeState: "purging" })),
  })
  // Hacemos fallar la segunda transacción (markPurging).
  let calls = 0
  const original = db.runTransaction
  db.runTransaction = async (fn) => {
    calls += 1
    if (calls === 2) throw new Error("boom")
    return original(fn)
  }
  const out = await emptyWorkspaceTrash(db, WS)
  assert.equal(out.deletedCount, 0)
  assert.equal(out.pendingCount, 1)
  const after = store.get("leads/A1")
  assert.equal(after.purgeState, "purging", "sigue en fase destructiva")
  assert.ok(after.purgeClaimId, "el bloqueo se conserva")
  assert.equal(after.archived, true, "y el prospecto no es restaurable mientras haya reclamo")
})

test("5. si esta ejecución PIERDE el reclamo, no borra ninguna relación", async () => {
  const { db, store } = fakeDb({ docs: withRelations("A1", lead()) })
  // Otro run se lo queda entre el reclamo y markPurging.
  let calls = 0
  const original = db.runTransaction
  db.runTransaction = async (fn) => {
    calls += 1
    if (calls === 2) {
      const d = store.get("leads/A1")
      store.set("leads/A1", { ...d, purgeClaimId: "otro-run" })
    }
    return original(fn)
  }
  const out = await emptyWorkspaceTrash(db, WS)
  assert.equal(out.deletedCount, 0)
  assert.equal(out.conflictCount, 1, "se reporta como conflicto, no como pendiente propio")
  // Lo esencial: NADA se borró.
  for (const path of ["leads/A1/activities/act-A1", "appointments/appt-A1", "notifications/n-A1", "leadIdentityKeys/k-A1"]) {
    assert.equal(store.has(path), true, `${path} intacto`)
  }
  assert.equal(store.has("leads/A1"), true)
})

test("6. un reclamo NUEVO que falla antes de borrar nada sí se libera", async () => {
  const { db, store } = fakeDb({ docs: withRelations("A1", lead()) })
  let calls = 0
  const original = db.runTransaction
  db.runTransaction = async (fn) => {
    calls += 1
    if (calls === 2) throw new Error("boom") // markPurging falla
    return original(fn)
  }
  await emptyWorkspaceTrash(db, WS)
  const after = store.get("leads/A1")
  assert.equal(after.purgeClaimId, undefined, "sin bloqueo: nada se había borrado")
  assert.equal(after.purgeState, undefined)
  assert.equal(after.archived, true, "vuelve a ser restaurable con normalidad")
})

test("7. el reintento posterior completa la eliminación", async () => {
  const { db, store } = fakeDb({ docs: withRelations("A1", lead()), failOn: new Set(["appointments"]) })
  const first = await emptyWorkspaceTrash(db, WS)
  assert.equal(first.deletedCount, 0)
  assert.equal(store.get("leads/A1").purgeState, "purging")

  // Segundo intento, ya sin el fallo y con el reclamo caducado.
  const stale = new Date(Date.now() - 10 * 60 * 1000).toISOString()
  store.set("leads/A1", { ...store.get("leads/A1"), purgeClaimedAt: stale })
  const retry = fakeDb({ docs: Object.fromEntries(store) })
  const second = await emptyWorkspaceTrash(retry.db, WS)
  assert.equal(second.deletedCount, 1, "el reintento termina el trabajo")
  assert.equal(retry.store.has("leads/A1"), false)
})

test("markPurging devuelve un resultado explícito y condiciona el borrado", () => {
  const src = readFileSync(join(root, "lib/leads/empty-trash-server.ts"), "utf8")
  assert.match(src, /type MarkOutcome = "marked" \| "lost"/)
  assert.match(src, /if \(mark === "lost"\)/)
  // El invariante está codificado, no solo comentado.
  assert.match(src, /if \(data\.purgeState === "purging"\) return/)
  assert.match(src, /purgeState: resumedDestructive \? "purging" : "claimed"/)
})

test("1b. los TRES campos de purga están prohibidos en create y update", () => {
  const rules = readFileSync(join(root, "firestore.rules"), "utf8")
  const leadsBlock = rules.slice(rules.indexOf("match /leads/{leadId}"), rules.indexOf("match /leads/{leadId}/activities"))
  const untouched = leadsBlock.slice(leadsBlock.indexOf("function purgeFieldsUntouched"), leadsBlock.indexOf("function purgeFieldsUntouched") + 200)
  const createBan = leadsBlock.slice(leadsBlock.indexOf("Purge bookkeeping is server-only"))
  for (const field of ["purgeClaimId", "purgeClaimedAt", "purgeState"]) {
    assert.ok(untouched.includes(`'${field}'`), `${field} debe estar en purgeFieldsUntouched`)
    assert.ok(createBan.slice(0, 220).includes(`'${field}'`), `${field} debe estar prohibido en create`)
  }
})
