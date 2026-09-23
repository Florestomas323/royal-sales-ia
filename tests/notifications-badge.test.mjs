/**
 * REGRESSION — the notifications badge flashed a large number on load.
 *
 * Cause: for a super admin the read receipts arrive over HTTP, after the
 * Firestore snapshot. While the receipt set was still the empty initial
 * value, every event was counted as unread, so the badge showed a high
 * number for a few frames and then dropped to the real one. The same shape
 * of bug applied to a workspace switch, where the previous listener's
 * documents were still in state while the new query loaded.
 *
 * The gate lives in lib/notifications.ts so it can be tested here, with the
 * real dedupe logic underneath (unchanged).
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
    for (const candidate of [`${build}/${request.slice(2)}.js`, `${build}/${request.slice(2)}/index.js`]) {
      try { return resolveOriginal.call(this, candidate, ...rest) } catch { /* next candidate */ }
    }
  }
  return resolveOriginal.call(this, request, ...rest)
}

const require = createRequire(import.meta.url)
const {
  notificationsPending,
  notificationsQueryKey,
  selectNotifications,
  visibleNotifications,
  unreadCount,
  eventKey,
} = require(join(build, "lib/notifications.js"))

const notif = (o = {}) => ({
  id: "n1", workspaceId: "ws-A", userId: "u1", type: "new_lead", leadId: "L1", leadType: "sales",
  title: "Nuevo prospecto", message: "María", source: "meta", form: null,
  read: false, readAt: null, createdAt: "2026-09-16T10:00:00Z", ...o,
})

/** Three events, each notified to two people — a super admin sees 3 rows. */
const HISTORY = [
  notif({ id: "a1", leadId: "L1", userId: "u1" }), notif({ id: "a2", leadId: "L1", userId: "u2" }),
  notif({ id: "b1", leadId: "L2", userId: "u1" }), notif({ id: "b2", leadId: "L2", userId: "u2" }),
  notif({ id: "c1", leadId: "L3", userId: "u1" }), notif({ id: "c2", leadId: "L3", userId: "u2" }),
]

const view = (o = {}) =>
  visibleNotifications({
    items: HISTORY,
    archivedLeadIds: new Set(),
    isSuperAdmin: true,
    readKeys: new Set(),
    leadsLoading: false,
    notificationsLoading: false,
    receiptsLoaded: true,
    ...o,
  })

test("super admin: nothing is counted while the receipts are still loading", () => {
  // The flicker: notifications already in, receipts not yet.
  const rows = view({ receiptsLoaded: false })
  assert.equal(rows.length, 0, "no provisional rows")
  assert.equal(unreadCount(rows), 0, "the badge shows nothing, not 3")
  assert.equal(
    notificationsPending({ isSuperAdmin: true, leadsLoading: false, notificationsLoading: false, receiptsLoaded: false }),
    true,
  )
})

test("super admin: once the receipts are in, the count is the real one", () => {
  // Two of the three events were already read by this super admin.
  const readKeys = new Set([eventKey(notif({ leadId: "L1" })), eventKey(notif({ leadId: "L2" }))])
  const rows = view({ readKeys })
  assert.equal(rows.length, 3, "one row per event, as before")
  assert.equal(unreadCount(rows), 1, "only the event without a receipt is unread")
})

test("super admin: opening an app full of already-read history shows 0, never a spike", () => {
  const readKeys = new Set(HISTORY.map((n) => eventKey(n)))
  assert.equal(unreadCount(view({ receiptsLoaded: false, readKeys })), 0, "while loading")
  assert.equal(unreadCount(view({ readKeys })), 0, "and after loading")
})

test("marking read drops the count: a receipt is all it takes", () => {
  const keys = HISTORY.map((n) => eventKey(n))
  assert.equal(unreadCount(view({ readKeys: new Set([keys[0]]) })), 2, "one marked")
  assert.equal(unreadCount(view({ readKeys: new Set(keys) })), 0, "all marked")
})

test("a workspace switch never counts the previous query's documents", () => {
  // useNotifications reports loading while the new listener starts.
  const rows = view({ notificationsLoading: true, receiptsLoaded: true })
  assert.equal(rows.length, 0)
  assert.equal(unreadCount(rows), 0)
})

/* ------------- the React cycle: render BEFORE the effect has run ---------- */

/**
 * What the hook exposes on a given render, from the documents it has loaded
 * (tagged with the query they came from) and the query being asked for now.
 * A React effect runs AFTER the render, so this renders the exact moment that
 * used to leak: the inputs already point at the new workspace and the state
 * still holds the previous listener's items.
 */
const render = (loaded, input) => selectNotifications(loaded, notificationsQueryKey(input))

const SUPER_A = { userId: "u-super", isSuperAdmin: true, workspaceId: "ws-A" }
const SUPER_B = { ...SUPER_A, workspaceId: "ws-B" }
const wsALoaded = { key: notificationsQueryKey(SUPER_A), items: HISTORY }

test("the render right after a workspace switch exposes no items and loading=true", () => {
  // 1. steady state on ws-A
  const before = render(wsALoaded, SUPER_A)
  assert.equal(before.loading, false)
  assert.equal(before.items.length, 6)

  // 2. the switch: this render happens BEFORE the effect resubscribes, with
  //    ws-A's documents still in state. Nothing of ws-A may reach the badge.
  const during = render(wsALoaded, SUPER_B)
  assert.equal(during.loading, true, "loading is true from the first render")
  assert.deepEqual(during.items, [], "the previous workspace's documents are not exposed")
  assert.equal(
    unreadCount(visibleNotifications({
      items: during.items, archivedLeadIds: new Set(), isSuperAdmin: true, readKeys: new Set(),
      leadsLoading: false, notificationsLoading: during.loading, receiptsLoaded: true,
    })),
    0,
    "the badge shows nothing during the switch",
  )

  // 3. the new snapshot answers the new key
  const after = render({ key: notificationsQueryKey(SUPER_B), items: [notif({ id: "z", workspaceId: "ws-B" })] }, SUPER_B)
  assert.equal(after.loading, false)
  assert.equal(after.items.length, 1)
})

test("the same holds when the person or the role changes", () => {
  const member = { userId: "u1", isSuperAdmin: false, workspaceId: "ws-A" }
  const other = { userId: "u2", isSuperAdmin: false, workspaceId: "ws-A" }
  const loadedForU1 = { key: notificationsQueryKey(member), items: HISTORY }
  assert.equal(render(loadedForU1, other).loading, true, "another member starts from scratch")
  assert.deepEqual(render(loadedForU1, other).items, [])
  assert.equal(render(loadedForU1, { ...member, isSuperAdmin: true }).loading, true, "role change too")
  // The keys themselves must tell those queries apart.
  assert.notEqual(notificationsQueryKey(member), notificationsQueryKey(other))
  assert.notEqual(notificationsQueryKey(SUPER_A), notificationsQueryKey(SUPER_B))
  assert.notEqual(notificationsQueryKey(member), notificationsQueryKey({ ...member, isSuperAdmin: true }))
  assert.equal(notificationsQueryKey(SUPER_A), notificationsQueryKey({ ...SUPER_A }), "stable for the same query")
})

test("a never-loaded hook starts loading, with nothing to show", () => {
  const first = render({ key: "", items: [] }, SUPER_A)
  assert.equal(first.loading, true)
  assert.deepEqual(first.items, [])
})

test("leads still gate the badge, so an archived lead never flashes", () => {
  assert.equal(view({ leadsLoading: true }).length, 0)
  const rows = view({ archivedLeadIds: new Set(["L2"]) })
  assert.equal(rows.length, 2, "the archived lead's event is hidden, as before")
})

test("a member is not gated by receipts, and their own read state still rules", () => {
  const input = {
    items: [notif({ id: "a1", read: true, readAt: "2026-09-16T11:00:00Z" }), notif({ id: "b1", leadId: "L2" })],
    archivedLeadIds: new Set(),
    isSuperAdmin: false,
    readKeys: new Set(),
    leadsLoading: false,
    notificationsLoading: false,
    receiptsLoaded: false, // never fetched for a member
  }
  assert.equal(notificationsPending(input), false)
  const rows = visibleNotifications(input)
  assert.equal(rows.length, 2)
  assert.equal(unreadCount(rows), 1, "the one they already read does not count")
})

test("the menu and the hook use the gate (no provisional render)", () => {
  const menu = readFileSync(join(root, "components/shell/notifications-menu.tsx"), "utf8")
  assert.match(menu, /loading: notificationsLoading/, "the hook's loading is used")
  assert.match(menu, /const \[receiptsLoaded, setReceiptsLoaded\] = useState\(false\)/)
  assert.match(menu, /setReceiptsLoaded\(true\)/, "flipped only after fetchReadReceipts() resolves")
  assert.match(menu, /visibleNotifications\(\{/, "rows come from the gated helper")
  assert.doesNotMatch(menu, /dedupeNotifications\(/, "the menu no longer dedupes ungated")

  // The hook DERIVES what it exposes from the query key, during render.
  const hook = readFileSync(join(root, "lib/firebase/notifications.ts"), "utf8")
  assert.match(hook, /const key = notificationsQueryKey\(input\)/)
  assert.match(hook, /const \{ items, loading \} = selectNotifications\(loaded, key\)/)
  assert.match(hook, /useState<\{ key: string; items: AppNotification\[\] \}>/, "documents are stored with their query")
  assert.match(hook, /failure\?\.key === key/, "an error from the previous query is not shown either")
  assert.doesNotMatch(hook, /setLoading\(/, "loading is derived, not stored")
})

test("the receipts fetch is keyed by identity, and clears before checking the role", () => {
  const menu = readFileSync(join(root, "components/shell/notifications-menu.tsx"), "utf8")
  assert.match(menu, /const identityKey = .*membership\?\.userId/, "the person, not only the role")
  const effect = menu.slice(menu.indexOf("const identityKey"), menu.indexOf("/** Leads, notifications"))
  assert.ok(
    effect.indexOf("setReceiptsLoaded(false)") < effect.indexOf("if (!isSuperAdmin) return"),
    "receipts are dropped before the role check, so a member never keeps them",
  )
  assert.ok(
    effect.indexOf("setReceipts(") < effect.indexOf("if (!isSuperAdmin) return"),
    "…and so is the receipt set",
  )
  assert.match(effect, /\}, \[isSuperAdmin, identityKey\]\)/, "re-runs when the super admin changes")
})
