// Seat ledger, invitation claim and deletion rules, evaluated against the
// real conditions in firestore.rules.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { evaluate, ruleFunction } from "./helpers/cel.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const RULES = readFileSync(join(root, "firestore.rules"), "utf8")

const seatOpIsHonest = ruleFunction(RULES, "seatOpIsHonest")
const roleListOnly = ruleFunction(RULES, "roleListOnlyChangedByOps")

const emptySeats = () => ({ client_admin: [], manager: [], sales_rep: [] })

/** Set semantics for the `.toSet()` / `.difference()` pair the rules use. */
const methods = {
  toSet: (list) => ({ __set: [...new Set(list)].sort() }),
  difference: (a, b) => ({ __set: a.__set.filter((x) => !b.__set.includes(x)) }),
  concat: (a, b) => [...a, ...b],
}

/** `==` on two sets compares contents, which is what CEL does. */
function setAwareEvaluate(expr, ctx) {
  return evaluate(expr, {
    ...ctx,
    methods: { ...methods, ...(ctx.methods ?? {}) },
    compareSets: true,
  })
}

function opHonest({ op, before, after, profile }) {
  return evaluate(seatOpIsHonest, {
    vars: { op, wsId: "ws-A" },
    methods,
    fns: {
      seatRoles: () => ["client_admin", "manager", "sales_rep"],
      seatsBefore: () => before,
      seatsAfter: () => after,
      seatUserExists: () => profile !== null,
      seatUser: () => profile ?? {},
    },
  })
}

const activeProfile = (role) => ({ workspaceId: "ws-A", role, status: "active" })

test("an add op must describe somebody who was NOT seated and now is", () => {
  const before = { ...emptySeats(), manager: [] }
  const after = { ...emptySeats(), manager: ["A"] }
  assert.equal(
    opHonest({ op: { kind: "add", role: "manager", userId: "A" }, before, after, profile: activeProfile("manager") }),
    true,
  )
})

test("THE ATTACK: before [A,B] → after [A] declared as 'add A' must fail", () => {
  // A no-op add used to pass and justify B's silent removal.
  const before = { ...emptySeats(), manager: ["A", "B"] }
  const after = { ...emptySeats(), manager: ["A"] }
  assert.equal(
    opHonest({ op: { kind: "add", role: "manager", userId: "A" }, before, after, profile: activeProfile("manager") }),
    false,
  )
})

test("a remove op must describe somebody who WAS seated and now is not", () => {
  const before = { ...emptySeats(), manager: ["A"] }
  const after = emptySeats()
  assert.equal(
    opHonest({
      op: { kind: "remove", role: "manager", userId: "A" },
      before,
      after,
      profile: { workspaceId: "ws-A", role: "manager", status: "inactive" },
    }),
    true,
  )
  // Declaring a removal for somebody who was never there is refused.
  assert.equal(
    opHonest({
      op: { kind: "remove", role: "manager", userId: "Z" },
      before,
      after,
      profile: { workspaceId: "ws-A", role: "manager", status: "inactive" },
    }),
    false,
  )
})

test("an op about another workspace's profile is refused", () => {
  const before = emptySeats()
  const after = { ...emptySeats(), manager: ["A"] }
  assert.equal(
    opHonest({
      op: { kind: "add", role: "manager", userId: "A" },
      before,
      after,
      profile: { workspaceId: "ws-B", role: "manager", status: "active" },
    }),
    false,
  )
})

/** Evaluates roleListOnlyChangedByOps(role) for a declared set of ops. */
function listMatchesOps({ role, before, after, ops }) {
  const expr = roleListOnly
  const ctx = {
    vars: { r: role, request: { resource: { data: { seatOps: ops } } } },
    methods,
    fns: {
      seatsBefore: () => before,
      seatsAfter: () => after,
      declaredAdds: (r) => ops.filter((o) => o.role === r && o.kind === "add").map((o) => o.userId),
      declaredRemovals: (r) => ops.filter((o) => o.role === r && o.kind === "remove").map((o) => o.userId),
    },
  }
  // Sets compare by contents.
  const raw = evaluate(expr.replace(/\br\b/g, "'" + role + "'"), ctx)
  return raw
}

test("every list change must correspond exactly to a declared op", () => {
  // Declared: add C. Actual: C added AND B silently dropped → refused.
  assert.equal(
    listMatchesOps({
      role: "manager",
      before: { ...emptySeats(), manager: ["A", "B"] },
      after: { ...emptySeats(), manager: ["A", "C"] },
      ops: [{ kind: "add", role: "manager", userId: "C" }],
    }),
    false,
  )
  // Declared exactly what happened → allowed.
  assert.equal(
    listMatchesOps({
      role: "manager",
      before: { ...emptySeats(), manager: ["A"] },
      after: { ...emptySeats(), manager: ["A", "C"] },
      ops: [{ kind: "add", role: "manager", userId: "C" }],
    }),
    true,
  )
  // A role change: remove from one list, add to the other.
  assert.equal(
    listMatchesOps({
      role: "manager",
      before: { ...emptySeats(), manager: ["A"] },
      after: emptySeats(),
      ops: [
        { kind: "remove", role: "manager", userId: "A" },
        { kind: "add", role: "sales_rep", userId: "A" },
      ],
    }),
    true,
  )
})

test("an undeclared change cannot ride along with a declared one of the same size", () => {
  assert.equal(
    listMatchesOps({
      role: "manager",
      before: { ...emptySeats(), manager: ["A", "B"] },
      after: { ...emptySeats(), manager: ["A", "Z"] },
      ops: [{ kind: "remove", role: "manager", userId: "B" }],
    }),
    false,
    "Z entered the list without being declared",
  )
})

/* ----------------------------------------------------- invitation claim */

const holdsSeat = ruleFunction(RULES, "claimHoldsItsSeat")

test("a claim only succeeds when the profile really holds its seat", () => {
  const run = (seats, exists = true) =>
    evaluate(holdsSeat, {
      vars: { request: { resource: { data: { workspaceId: "ws-A", role: "manager", userId: "u1" } } } },
      methods,
      fns: { existsAfter: () => exists, claimedWorkspaceSeats: () => seats },
    })
  assert.equal(run({ ...emptySeats(), manager: ["u1"] }), true)
  // A cancelled invitation had its seat released: the claim is refused.
  assert.equal(run(emptySeats()), false)
  // Seated under another role is not this role's seat.
  assert.equal(run({ ...emptySeats(), sales_rep: ["u1"] }), false)
})

test("the membership create rule demands a live invitation and an atomic result", () => {
  const membershipBlock = RULES.slice(RULES.indexOf("match /memberships/{uid}"), RULES.indexOf("match /users/{userId}"))
  // Only an `invited` profile can be claimed: an inactive one cannot
  // reactivate itself by signing up again.
  assert.match(membershipBlock, /claimedProfile\(\)\.status == 'invited'/)
  // The end state is checked with getAfter, not just the state before.
  assert.match(membershipBlock, /claimedProfileAfter\(\)\.status == 'active'/)
  assert.match(membershipBlock, /claimedProfileAfter\(\)\.authUid == request\.auth\.uid/)
  assert.match(membershipBlock, /claimHoldsItsSeat\(\)/)
  // No arbitrary extra fields.
  assert.match(membershipBlock, /keys\(\)\.hasOnly\(\['workspaceId', 'role', 'userId', 'email', 'createdAt', 'status'\]\)/)
})

/* -------------------------------------------------------------- deletes */

test("hard deleting a member is super admin only, so no seat is orphaned", () => {
  const usersBlock = RULES.slice(RULES.indexOf("match /users/{userId}"), RULES.indexOf("match /clients/"))
  const membershipBlock = RULES.slice(RULES.indexOf("match /memberships/{uid}"), RULES.indexOf("match /users/{userId}"))
  assert.match(usersBlock, /allow delete: if isSuperAdmin\(\);/)
  assert.match(membershipBlock, /allow delete: if isSuperAdmin\(\);/)
  assert.doesNotMatch(usersBlock, /allow delete: if isSuperAdmin\(\) \|\| isWsClientAdmin/)
})

/* -------------------------------- one seat per profile, no duplicates ---- */

const seatConsistent = ruleFunction(RULES, "seatConsistentAfter")

/** Evaluates seatConsistentAfter() for a profile update. */
function consistent({ userId = "A", role, status, seats, hasLedger = true }) {
  const ROLES = ["client_admin", "manager", "sales_rep"]
  return evaluate(seatConsistent, {
    vars: { userId, request: { resource: { data: { role, status } } } },
    methods,
    fns: {
      seatRoleAfter: () => ROLES.includes(role),
      ledgerHasSeatsAfter: () => hasLedger,
      ledgerAfter: () => ({ seats }),
      seatListAfter: (r) => seats[r],
      noDuplicateSeatsAfter: () => ROLES.every((r) => seats[r].length === new Set(seats[r]).size),
      seatsOnlyInOwnRoleAfter: () => ROLES.every((r) => r === role || !seats[r].includes(userId)),
      holdsNoSeatAfter: () => ROLES.every((r) => !seats[r].includes(userId)),
    },
  })
}

test("THE ATTACK: manager → sales_rep without leaving the manager list must fail", () => {
  assert.equal(
    consistent({
      role: "sales_rep",
      status: "active",
      seats: { client_admin: [], manager: ["A"], sales_rep: ["A"] },
    }),
    false,
    "A would hold two seats at once",
  )
})

test("the correct move — remove from manager, add to sales_rep — passes", () => {
  assert.equal(
    consistent({
      role: "sales_rep",
      status: "active",
      seats: { client_admin: [], manager: [], sales_rep: ["A"] },
    }),
    true,
  )
})

test("a duplicated id inside one list is refused", () => {
  assert.equal(
    consistent({
      role: "manager",
      status: "active",
      seats: { client_admin: [], manager: ["A", "A"], sales_rep: [] },
    }),
    false,
  )
})

test("a duplicate cannot be smuggled into an unrelated list", () => {
  // The profile being written is a manager; the sales_rep list gaining a
  // silent duplicate still fails the write.
  assert.equal(
    consistent({
      role: "manager",
      status: "active",
      seats: { client_admin: [], manager: ["A"], sales_rep: ["B", "B"] },
    }),
    false,
  )
})

test("a deactivated profile holds no seat in any list", () => {
  assert.equal(
    consistent({ role: "manager", status: "inactive", seats: { client_admin: [], manager: [], sales_rep: [] } }),
    true,
  )
  assert.equal(
    consistent({ role: "manager", status: "inactive", seats: { client_admin: [], manager: ["A"], sales_rep: [] } }),
    false,
  )
  // …not even under a different role.
  assert.equal(
    consistent({ role: "manager", status: "inactive", seats: { client_admin: [], manager: [], sales_rep: ["A"] } }),
    false,
  )
})

/* ------------------------------- the profile side of the claim is atomic - */

test("the users claim branch demands the membership in the same batch", () => {
  const usersBlock = RULES.slice(RULES.indexOf("match /users/{userId}"), RULES.indexOf("match /clients/"))
  const claim = usersBlock.slice(usersBlock.indexOf("Claiming an invitation"))
  // Only a live invitation, ending active, with its membership present.
  assert.match(claim, /resource\.data\.get\('status', 'invited'\) == 'invited'/)
  assert.match(claim, /request\.resource\.data\.status == 'active'/)
  assert.match(claim, /existsAfter\(\/databases\/\$\(database\)\/documents\/memberships\/\$\(request\.auth\.uid\)\)/)
  assert.match(claim, /claimMembershipAfter\(\)\.workspaceId == resource\.data\.workspaceId/)
  assert.match(claim, /claimMembershipAfter\(\)\.userId == userId/)
  assert.match(claim, /claimMembershipAfter\(\)\.role == request\.resource\.data\.role/)
  assert.match(claim, /claimMembershipAfter\(\)\.get\('status', 'active'\) == 'active'/)
  assert.match(claim, /claimMembershipAfter\(\)\.email == request\.auth\.token\.email\.lower\(\)/)
  assert.match(claim, /seatConsistentAfter\(\)/)
})

/** Evaluates the whole claim branch of users/{userId}. */
function claimBranch({ before, after, membership, membershipExists, seats, authUid = "auth-1", email = "a@x" }) {
  const usersBlock = RULES.slice(RULES.indexOf("match /users/{userId}"), RULES.indexOf("match /clients/"))
  const start = usersBlock.indexOf("|| (signedIn()", usersBlock.indexOf("Claiming an invitation"))
  const expr = usersBlock
    .slice(start + 3, usersBlock.indexOf(";", start))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n")
  const changed = Object.keys(after).filter((k) => after[k] !== before[k])
  return evaluate(expr, {
    vars: {
      userId: "A",
      resource: { data: before },
      request: { resource: { data: after }, auth: { uid: authUid, token: { email, email_verified: true } } },
    },
    methods,
    fns: {
      signedIn: () => true,
      onlyChanges: (fields) => changed.every((k) => fields.includes(k)),
      seatConsistentAfter: () =>
        ["client_admin", "manager", "sales_rep"].every((r) =>
          r === after.role ? seats[r].includes("A") : !seats[r].includes("A"),
        ),
      existsAfter: () => membershipExists,
      claimMembershipAfter: () => membership,
      // Mirrors the rule: an unclaimed profile is invited/inactive, a claimed
      // one active/inactive.
      statusStateValidAfter: () =>
        ["active", "invited", "inactive"].includes(after.status)
        && ((after.authUid ?? null) === null
              ? ["invited", "inactive"].includes(after.status)
              : ["active", "inactive"].includes(after.status)),
    },
  })
}

const invited = { authUid: null, status: "invited", email: "a@x", role: "manager", workspaceId: "ws-A" }
const seated = { client_admin: [], manager: ["A"], sales_rep: [] }
const goodMembership = { workspaceId: "ws-A", userId: "A", role: "manager", email: "a@x", status: "active" }

test("A) activating the profile WITHOUT a membership is denied", () => {
  assert.equal(
    claimBranch({
      before: invited,
      after: { ...invited, authUid: "auth-1", status: "active" },
      membership: goodMembership,
      membershipExists: false,
      seats: seated,
    }),
    false,
  )
})

test("B) moving the profile to inactive through the claim branch is denied", () => {
  assert.equal(
    claimBranch({
      before: invited,
      after: { ...invited, authUid: "auth-1", status: "inactive" },
      membership: goodMembership,
      membershipExists: true,
      seats: seated,
    }),
    false,
  )
})

test("C) a complete, coherent claim is allowed", () => {
  assert.equal(
    claimBranch({
      before: invited,
      after: { ...invited, authUid: "auth-1", status: "active" },
      membership: goodMembership,
      membershipExists: true,
      seats: seated,
    }),
    true,
  )
})

test("a membership that disagrees with the profile is denied", () => {
  const run = (membership) =>
    claimBranch({
      before: invited,
      after: { ...invited, authUid: "auth-1", status: "active" },
      membership,
      membershipExists: true,
      seats: seated,
    })
  assert.equal(run({ ...goodMembership, workspaceId: "ws-B" }), false, "cross-workspace")
  assert.equal(run({ ...goodMembership, role: "client_admin" }), false, "role mismatch")
  assert.equal(run({ ...goodMembership, userId: "OTHER" }), false, "bound to another profile")
  assert.equal(run({ ...goodMembership, email: "otro@x" }), false, "email mismatch")
  assert.equal(run({ ...goodMembership, status: "inactive" }), false, "born inactive")
})

test("an already claimed or deactivated profile cannot be claimed again", () => {
  const run = (before) =>
    claimBranch({
      before,
      after: { ...before, authUid: "auth-1", status: "active" },
      membership: goodMembership,
      membershipExists: true,
      seats: seated,
    })
  assert.equal(run({ ...invited, authUid: "someone" }), false)
  assert.equal(run({ ...invited, status: "inactive" }), false)
})

/* --------------------------------------- viewer must hold no seat either - */

test("A) manager → viewer WITHOUT releasing the manager seat must fail", () => {
  // The ghost seat: `viewer` is not a seat role, and used to skip the check
  // entirely, leaving the id stranded in seats.manager forever.
  assert.equal(
    consistent({
      role: "viewer",
      status: "active",
      seats: { client_admin: [], manager: ["A"], sales_rep: [] },
    }),
    false,
  )
})

test("B) manager → viewer releasing the seat passes", () => {
  assert.equal(
    consistent({ role: "viewer", status: "active", seats: { client_admin: [], manager: [], sales_rep: [] } }),
    true,
  )
})

test("C) a viewer appearing in ANY of the three lists fails", () => {
  for (const role of ["client_admin", "manager", "sales_rep"]) {
    const seats = { client_admin: [], manager: [], sales_rep: [] }
    seats[role] = ["A"]
    assert.equal(consistent({ role: "viewer", status: "active", seats }), false, `viewer seated in ${role}`)
  }
})

test("D) a clean viewer, with no seat anywhere, passes", () => {
  assert.equal(
    consistent({
      role: "viewer",
      status: "active",
      seats: { client_admin: ["B"], manager: ["C"], sales_rep: [] },
    }),
    true,
  )
})

test("the check no longer has an automatic bypass for non-seat roles", () => {
  const body = ruleFunction(RULES, "seatConsistentAfter")
  assert.doesNotMatch(body, /^\s*!seatRoleAfter\(\) *\|\|/m)
})

test("a viewer still cannot smuggle a duplicate into an unrelated list", () => {
  assert.equal(
    consistent({
      role: "viewer",
      status: "active",
      seats: { client_admin: [], manager: ["B", "B"], sales_rep: [] },
    }),
    false,
  )
})

/* ------------------- profile and membership move together, or not at all - */

const ridesAlong = ruleFunction(RULES, "membershipRidesAlong")

/**
 * Evaluates membershipRidesAlong() for an admin edit of a team profile.
 * `membership` is the document as it ends up after the batch.
 */
function membershipFollows({ before, after, membership, membershipExists = true }) {
  const changed = Object.keys({ ...before, ...after }).filter((k) => before[k] !== after[k])
  return evaluate(ridesAlong, {
    vars: {
      userId: "A",
      resource: { data: before },
      request: { resource: { data: after } },
    },
    methods,
    fns: {
      roleOrStatusChanges: () => changed.includes("role") || changed.includes("status"),
      existsAfter: () => membershipExists,
      linkedMembershipAfter: () => membership,
      linkedMembershipConsistentAfter: () =>
        membershipExists
        && membership.workspaceId === before.workspaceId
        && membership.userId === "A"
        && membership.role === after.role
        && (membership.status === undefined ? "active" : membership.status)
             === (after.status === undefined ? "active" : after.status),
    },
  })
}

const claimedProfile = { authUid: "AUTH-A", workspaceId: "ws-A", role: "manager", status: "active" }
const currentMembership = { workspaceId: "ws-A", userId: "A", role: "manager", status: "active" }

test("the admin branch of users/{userId} actually calls membershipRidesAlong()", () => {
  // The helper is only worth anything if the rule invokes it.
  const usersBlock = RULES.slice(RULES.indexOf("match /users/{userId}"), RULES.indexOf("match /clients/"))
  const adminBranch = usersBlock.slice(usersBlock.indexOf("isWsAdmin(resource.data.workspaceId)"))
  assert.match(adminBranch.slice(0, 700), /&& membershipRidesAlong\(\)/)
})

test("A) deactivating the profile and freeing the seat WITHOUT touching the membership fails", () => {
  // membershipIsActive() reads the membership, so the person would keep access.
  assert.equal(
    membershipFollows({
      before: claimedProfile,
      after: { ...claimedProfile, status: "inactive" },
      membership: currentMembership,
    }),
    false,
  )
})

test("B) deactivating both, and freeing the seat, passes", () => {
  assert.equal(
    membershipFollows({
      before: claimedProfile,
      after: { ...claimedProfile, status: "inactive" },
      membership: { ...currentMembership, status: "inactive" },
    }),
    true,
  )
})

test("C) manager → sales_rep with the membership still manager fails", () => {
  // Otherwise the manager seat is released while manager privileges remain.
  assert.equal(
    membershipFollows({
      before: claimedProfile,
      after: { ...claimedProfile, role: "sales_rep" },
      membership: currentMembership,
    }),
    false,
  )
})

test("D) manager → sales_rep with the membership moved too passes", () => {
  assert.equal(
    membershipFollows({
      before: claimedProfile,
      after: { ...claimedProfile, role: "sales_rep" },
      membership: { ...currentMembership, role: "sales_rep" },
    }),
    true,
  )
})

test("E) manager → viewer with the membership still manager fails", () => {
  assert.equal(
    membershipFollows({
      before: claimedProfile,
      after: { ...claimedProfile, role: "viewer" },
      membership: currentMembership,
    }),
    false,
  )
})

test("F) manager → viewer with the membership moved too passes", () => {
  assert.equal(
    membershipFollows({
      before: claimedProfile,
      after: { ...claimedProfile, role: "viewer" },
      membership: { ...currentMembership, role: "viewer" },
    }),
    true,
  )
})

test("G) editing only the name or the colour needs no membership rewrite", () => {
  assert.equal(
    membershipFollows({
      before: { ...claimedProfile, name: "Ana" },
      after: { ...claimedProfile, name: "Ana María" },
      membership: currentMembership,
      membershipExists: false,
    }),
    true,
  )
})

test("an invited profile has no membership yet, so none is demanded", () => {
  const invitedProfile = { authUid: null, workspaceId: "ws-A", role: "manager", status: "invited" }
  assert.equal(
    membershipFollows({
      before: invitedProfile,
      after: { ...invitedProfile, status: "inactive" },
      membership: {},
      membershipExists: false,
    }),
    true,
  )
})

test("a membership left in another workspace or bound to another profile fails", () => {
  const run = (membership) =>
    membershipFollows({
      before: claimedProfile,
      after: { ...claimedProfile, role: "sales_rep" },
      membership,
    })
  assert.equal(run({ ...currentMembership, role: "sales_rep", workspaceId: "ws-B" }), false)
  assert.equal(run({ ...currentMembership, role: "sales_rep", userId: "OTHER" }), false)
})

test("a legacy membership with no status counts as active on both sides", () => {
  assert.equal(
    membershipFollows({
      before: { ...claimedProfile, status: undefined },
      after: { ...claimedProfile, status: undefined, role: "sales_rep" },
      membership: { workspaceId: "ws-A", userId: "A", role: "sales_rep" },
    }),
    true,
  )
})

/* ---------------------------------------- member state machine (V3) ------ */

const statusStateValid = ruleFunction(RULES, "statusMatchesClaimState")
const memberStatusValid = ruleFunction(RULES, "validMemberStatus")
const membershipStatusValid = ruleFunction(RULES, "validMembershipStatus")

const stateOk = (authUid, status) =>
  evaluate(statusStateValid, { vars: { authUid, status }, methods })
const statusKnown = (s) => evaluate(memberStatusValid, { vars: { s }, methods })
const membershipStatusOk = (s) => evaluate(membershipStatusValid, { vars: { s }, methods })

test("A) an unclaimed profile may never be set to active", () => {
  // The broken-invitation case: it would hold a seat with no membership and
  // the claim branch would refuse it afterwards (it demands `invited`).
  assert.equal(stateOk(null, "active"), false)
})

test("B) an unclaimed profile may go back to invited", () => {
  assert.equal(stateOk(null, "invited"), true)
})

test("C) an unclaimed profile may stay invited or be deactivated", () => {
  assert.equal(stateOk(null, "invited"), true)
  assert.equal(stateOk(null, "inactive"), true)
})

test("D) the claimed state is authUid + active", () => {
  assert.equal(stateOk("AUTH-A", "active"), true)
})

test("E/F) a claimed profile moves between active and inactive", () => {
  assert.equal(stateOk("AUTH-A", "inactive"), true)
  assert.equal(stateOk("AUTH-A", "active"), true)
})

test("G) a claimed profile may never be invited again", () => {
  assert.equal(stateOk("AUTH-A", "invited"), false)
})

test("H) a membership may never hold `invited`", () => {
  assert.equal(membershipStatusOk("invited"), false)
  assert.equal(membershipStatusOk("active"), true)
  assert.equal(membershipStatusOk("inactive"), true)
})

test("I) an unknown membership status is refused", () => {
  for (const s of ["", "ACTIVE", "pending", "suspended", "true"]) {
    assert.equal(membershipStatusOk(s), false, `membership status ${s}`)
  }
})

test("J) an unknown profile status is refused", () => {
  assert.equal(statusKnown("active"), true)
  assert.equal(statusKnown("invited"), true)
  assert.equal(statusKnown("inactive"), true)
  for (const s of ["", "ACTIVE", "pending", "deleted"]) {
    assert.equal(statusKnown(s), false, `profile status ${s}`)
  }
})

test("K) a legacy membership with no status is still read as active", () => {
  // The rules use get('status', 'active'); the default must pass validation.
  assert.equal(membershipStatusOk("active"), true)
  const membershipBlock = RULES.slice(RULES.indexOf("match /memberships/{uid}"), RULES.indexOf("match /users/{userId}"))
  assert.match(membershipBlock, /get\('status', 'active'\)/)
})

test("the rules actually apply the state machine", () => {
  const usersBlock = RULES.slice(RULES.indexOf("match /users/{userId}"), RULES.indexOf("match /clients/"))
  // create, the admin branch and the claim branch all go through it.
  assert.ok(
    (usersBlock.match(/statusStateValidAfter\(\)/g) ?? []).length >= 3,
    "every users write path must validate the state",
  )
  const membershipBlock = RULES.slice(RULES.indexOf("match /memberships/{uid}"), RULES.indexOf("match /users/{userId}"))
  assert.match(membershipBlock, /validMembershipStatus\(membershipStatusAfter\(\)\)/)
  assert.match(membershipBlock, /validMembershipStatus\(request\.resource\.data\.get\('status', 'active'\)\)/)
})

test("setMemberStatus reactivates an unclaimed profile as invited, not active", () => {
  const src = readFileSync(join(root, "lib/firebase/collections.ts"), "utf8")
  assert.match(
    src,
    /const target: MemberStatus =\s*\n\s*status === "active" && \(current\.authUid \?\? null\) === null \? "invited" : status/,
  )
  // The seat branch and the profile write both use the corrected target.
  assert.match(src, /if \(target === "inactive"\)/)
  assert.match(src, /tx\.update\(userRef, \{ status: target, updatedAt: serverTimestamp\(\) \}\)/)
})
