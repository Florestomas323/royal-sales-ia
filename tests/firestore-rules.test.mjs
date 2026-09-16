// Security tests that EVALUATE the real conditions from firestore.rules with
// a small CEL interpreter (tests/helpers/cel.mjs), so they fail if the rule
// text changes meaning — not merely if it changes wording.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { evaluate, ruleFunction } from "./helpers/cel.mjs"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const RULES = readFileSync(join(root, "firestore.rules"), "utf8")

/** Set semantics for the `.toSet()` / `.difference()` pair the rules use. */
const methods = {
  toSet: (list) => ({ __set: [...new Set(list)].sort() }),
  difference: (a, b) => ({ __set: a.__set.filter((x) => !b.__set.includes(x)) }),
  concat: (a, b) => [...a, ...b],
}

/* ------------------------------------------------------------------ leads */

const leadShape = ruleFunction(RULES, "validLeadShape")
const repFields = ruleFunction(RULES, "repEditableFields")

/** Evaluates validLeadShape() for an incoming document. */
function shapeOk(after, before = null) {
  return evaluate(leadShape, {
    vars: { request: { resource: { data: after } }, resource: before ? { data: before } : null },
    fns: {
      optionalString: (f) => !(f in after) || after[f] === null || typeof after[f] === "string",
      optionalBool: (f) => !(f in after) || after[f] === null || typeof after[f] === "boolean",
      optionalNumber: (f) => !(f in after) || after[f] === null || typeof after[f] === "number",
      presentString: (f) => (f in after ? typeof after[f] === "string" : before === null || !(f in before)),
      nonEmptyString: (f) =>
        f in after ? typeof after[f] === "string" && after[f].length > 0 : before === null || !(f in before),
    },
  })
}

const modernLead = {
  workspaceId: "ws-A", name: "María", phone: "+15550001", assignedToId: "u1",
  source: "meta", createdAt: "2026-01-01T00:00:00Z", leadType: "sales", stage: "new_lead",
}

test("a well-formed lead passes the shape check", () => {
  assert.equal(shapeOk(modernLead), true)
})

test("stored UI crashes are rejected: object name, array phone, numeric workspaceId, string archived", () => {
  assert.equal(shapeOk({ ...modernLead, name: {} }), false)
  assert.equal(shapeOk({ ...modernLead, phone: [] }), false)
  assert.equal(shapeOk({ ...modernLead, workspaceId: 123 }), false)
  assert.equal(shapeOk({ ...modernLead, archived: "yes" }), false)
  assert.equal(shapeOk({ ...modernLead, closedValue: "5000" }), false)
  assert.equal(shapeOk({ ...modernLead, temperature: "tibio" }), false)
})

test("an empty name is rejected", () => {
  assert.equal(shapeOk({ ...modernLead, name: "" }), false)
})

test("a legacy lead missing assignedToId stays editable", () => {
  // Document created before the field existed: it is absent before AND after,
  // so the update is allowed and the lead can be fixed progressively.
  const legacy = { workspaceId: "ws-A", name: "Antiguo", phone: "", source: "meta", createdAt: "2025-03-01T00:00:00Z" }
  assert.equal(shapeOk({ ...legacy, name: "Antiguo corregido" }, legacy), true)
})

test("but an update may not introduce an invalid type on a legacy lead", () => {
  const legacy = { workspaceId: "ws-A", name: "Antiguo", phone: "", source: "meta", createdAt: "2025-03-01T00:00:00Z" }
  assert.equal(shapeOk({ ...legacy, assignedToId: 42 }, legacy), false)
  assert.equal(shapeOk({ ...legacy, name: null }, legacy), false)
})

test("the sales_rep whitelist excludes trash, ownership and integration fields", () => {
  const allowed = evaluate(repFields, { vars: {} })
  for (const f of [
    "archived", "archivedAt", "archivedBy", "archivedByName",
    "assignedToId", "assignedToName", "workspaceId", "attribution",
    "source", "webForm", "campaignId", "campaignName", "leadType", "createdAt",
  ]) {
    assert.ok(!allowed.includes(f), `${f} must not be editable by a sales_rep`)
  }
})

test("the whitelist still covers what following up needs", () => {
  const allowed = evaluate(repFields, { vars: {} })
  for (const f of ["stage", "closedValue", "closedAt", "lastContactAt", "nextFollowUpAt", "nextAction", "name", "phone", "email", "updatedAt"]) {
    assert.ok(allowed.includes(f), `${f} should be editable by the assigned rep`)
  }
})

test("a sales_rep write is refused when it touches anything outside the whitelist", () => {
  const allowed = evaluate(repFields, { vars: {} })
  const hasOnly = (changed) => changed.every((k) => allowed.includes(k))
  assert.equal(hasOnly(["stage", "updatedAt"]), true)
  assert.equal(hasOnly(["archived", "archivedAt"]), false)
  assert.equal(hasOnly(["assignedToId"]), false)
  assert.equal(hasOnly(["attribution"]), false)
  assert.equal(hasOnly(["webForm"]), false)
})

/* ------------------------------------------------------ memberships/seats */

const matchesProfile = ruleFunction(RULES, "matchesProfileAfter")

/** Evaluates matchesProfileAfter() for a membership update. */
function membershipOk({ membershipAfter, profile, membershipWorkspace = "ws-A", profileExists = true }) {
  return evaluate(matchesProfile, {
    vars: {
      request: { resource: { data: membershipAfter } },
      resource: { data: { workspaceId: membershipWorkspace, userId: "u1" } },
    },
    fns: {
      existsAfter: () => profileExists,
      profileAfter: () => profile,
      // V3: a membership never holds `invited`; absent counts as active.
      validMembershipStatus: (v) => ["active", "inactive"].includes(v),
      profileStatusAfter: () => (profile.status === undefined ? "active" : profile.status),
      membershipStatusAfter: () =>
        membershipAfter.status === undefined ? "active" : membershipAfter.status,
    },
  })
}

test("a membership may not be reactivated while its profile is inactive", () => {
  // The exact bypass the review found: writing status:"active" straight to the
  // membership would restore access without holding a seat.
  assert.equal(
    membershipOk({
      membershipAfter: { role: "manager", status: "active" },
      profile: { workspaceId: "ws-A", role: "manager", status: "inactive" },
    }),
    false,
  )
})

test("deactivating both together is allowed", () => {
  assert.equal(
    membershipOk({
      membershipAfter: { role: "manager", status: "inactive" },
      profile: { workspaceId: "ws-A", role: "manager", status: "inactive" },
    }),
    true,
  )
})

test("a membership role must equal the profile role", () => {
  assert.equal(
    membershipOk({
      membershipAfter: { role: "client_admin", status: "active" },
      profile: { workspaceId: "ws-A", role: "sales_rep", status: "active" },
    }),
    false,
  )
})

test("legacy documents with no status count as active on both sides", () => {
  assert.equal(
    membershipOk({
      membershipAfter: { role: "manager" },
      profile: { workspaceId: "ws-A", role: "manager" },
    }),
    true,
  )
  // …but a legacy membership cannot outlive a deactivated profile.
  assert.equal(
    membershipOk({
      membershipAfter: { role: "manager" },
      profile: { workspaceId: "ws-A", role: "manager", status: "inactive" },
    }),
    false,
  )
})

test("the profile must stay in the same workspace", () => {
  assert.equal(
    membershipOk({
      membershipAfter: { role: "manager", status: "active" },
      profile: { workspaceId: "ws-B", role: "manager", status: "active" },
    }),
    false,
  )
})

test("seat limits are 2 per role and building a ledger from scratch is super admin only", () => {
  const limits = ruleFunction(RULES, "seatLimitsRespected")
  const seats = (n) => ({ client_admin: Array(n).fill("x"), manager: [], sales_rep: [] })
  const check = (s) => evaluate(limits, { vars: {}, fns: { seatsAfter: () => s } })
  assert.equal(check(seats(2)), true)
  assert.equal(check(seats(3)), false)

  const ledger = ruleFunction(RULES, "seatLedgerWriteIsValid")
  const run = (hadLedger, superAdmin) =>
    evaluate(ledger, {
      vars: {},
      fns: {
        validSeatsShape: () => true,
        seatOpsAreHonest: () => true,
        hadLedger: () => hadLedger,
        seatLimitsRespected: () => true,
        roleListOnlyChangedByOps: () => true,
        isSuperAdmin: () => superAdmin,
      },
    })
  assert.equal(run(false, false), false, "a workspace admin must not initialise a ledger")
  assert.equal(run(false, true), true, "the super admin repair tool may")
  assert.equal(run(true, false), true, "normal seat moves stay available to admins")
})

/* --------------------------------------------------------- notifications */

const recipient = ruleFunction(RULES, "validRecipient")
const describes = ruleFunction(RULES, "describesItsLead")
const notifShape = ruleFunction(RULES, "validNotificationShape")

const lead = { workspaceId: "ws-A", leadType: "sales", source: "meta", assignedToId: "u9" }

function recipientOk(profile, data = { workspaceId: "ws-A", userId: "u1" }) {
  return evaluate(recipient, {
    vars: { request: { resource: { data } } },
    fns: { recipientProfile: () => profile, notifiedLead: () => lead },
  })
}

test("only active admins or the assigned rep may be notified", () => {
  assert.equal(recipientOk({ workspaceId: "ws-A", role: "client_admin", status: "active" }), true)
  assert.equal(recipientOk({ workspaceId: "ws-A", role: "manager", status: "active" }), true)
  // A rep who is not the assignee is not a valid recipient.
  assert.equal(recipientOk({ workspaceId: "ws-A", role: "sales_rep", status: "active" }), false)
  // …unless the lead is theirs.
  assert.equal(
    recipientOk({ workspaceId: "ws-A", role: "sales_rep", status: "active" }, { workspaceId: "ws-A", userId: "u9" }),
    true,
  )
})

test("an inactive or foreign recipient is refused", () => {
  assert.equal(recipientOk({ workspaceId: "ws-A", role: "client_admin", status: "inactive" }), false)
  assert.equal(recipientOk({ workspaceId: "ws-B", role: "client_admin", status: "active" }), false)
})

test("the notification must describe the lead it points at", () => {
  const run = (data) =>
    evaluate(describes, { vars: { request: { resource: { data } } }, fns: { notifiedLead: () => lead } })
  assert.equal(run({ workspaceId: "ws-A", leadType: "sales", source: "meta" }), true)
  // Cross-workspace, wrong pipeline or invented source: all refused.
  assert.equal(run({ workspaceId: "ws-B", leadType: "sales", source: "meta" }), false)
  assert.equal(run({ workspaceId: "ws-A", leadType: "recruiting", source: "meta" }), false)
  assert.equal(run({ workspaceId: "ws-A", leadType: "sales", source: "indeed" }), false)
})

test("notification text is typed and length-bounded", () => {
  const base = {
    workspaceId: "ws-A", userId: "u1", type: "new_lead", leadId: "L1", leadType: "sales",
    title: "Nuevo prospecto", message: "María · Meta", source: "meta", form: null,
    read: false, readAt: null, createdAt: "2026-01-01T00:00:00Z",
  }
  const run = (data) => evaluate(notifShape, { vars: { request: { resource: { data } } }, fns: { validLeadType: (v) => ["sales", "recruiting"].includes(v) } })
  assert.equal(run(base), true)
  assert.equal(run({ ...base, title: "" }), false)
  assert.equal(run({ ...base, message: "x".repeat(501) }), false)
  assert.equal(run({ ...base, title: 5 }), false)
  assert.equal(run({ ...base, read: true }), false, "a notification is born unread")
  assert.equal(run({ ...base, readAt: "2026-01-01" }), false)
  assert.equal(run({ ...base, form: 7 }), false)
})

test("the deterministic id is enforced, so no equivalent copies can be created", () => {
  const det = ruleFunction(RULES, "deterministicId")
  const run = (id) =>
    evaluate(det, {
      vars: {
        notificationId: id,
        request: { resource: { data: { leadId: "L1", userId: "u1" } } },
      },
      fns: {},
    })
  assert.equal(run("new_lead__L1__u1"), true)
  assert.equal(run("random-id"), false)
  assert.equal(run("new_lead__L1__u2"), false)
})

/* ---------------------------------------------------------- multi-tenant */

test("nothing outside the declared collections is reachable", () => {
  assert.match(RULES, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/)
})

test("leads are read and written only within the caller's workspace", () => {
  const leadsBlock = RULES.slice(RULES.indexOf("match /leads/{leadId}"))
  assert.match(leadsBlock, /allow read: if isSuperAdmin\(\)\s*\|\| \(inWorkspace\(resource\.data\.workspaceId\)/)
  assert.match(leadsBlock, /isWsAdmin\(request\.resource\.data\.workspaceId\)/)
})

test("users may only be changed through a whitelist of real fields", () => {
  const usersBlock = RULES.slice(RULES.indexOf("match /users/{userId}"), RULES.indexOf("match /clients/"))
  assert.match(
    usersBlock,
    /onlyChanges\(\['name', 'avatarColor', 'role', 'status', 'emailNewLeadNotifications', 'updatedAt'\]\)/,
  )
  // Identity and unknown future fields are unreachable for a workspace admin.
  for (const f of ["authUid", "email", "createdAt", "workspaceId", "isDemo"]) {
    assert.ok(
      !/onlyChanges\(\[[^\]]*\]\)/.exec(usersBlock)[0].includes(`'${f}'`),
      `${f} must not be in the admin whitelist`,
    )
  }
})

/* ------------------------------ hardening: active means exactly active --- */

test("only `active` (or a legacy absent status) grants access", () => {
  const isActive = ruleFunction(RULES, "membershipIsActive")
  const run = (status) =>
    evaluate(isActive, { vars: {}, fns: { me: () => (status === undefined ? {} : { status }) } })
  assert.equal(run(undefined), true, "A) legacy membership with no status")
  assert.equal(run("active"), true, "B) active")
  assert.equal(run("inactive"), false, "C) inactive")
  assert.equal(run("invited"), false, "D) invited must not grant access")
  for (const s of ["unknown", "abc", "", "ACTIVE"]) {
    assert.equal(run(s), false, `E) unknown status ${JSON.stringify(s)}`)
  }
})

test("F/G) an assignee or seller membership must be exactly active", () => {
  const assignee = ruleFunction(RULES, "assigneeIsValid")
  const seller = ruleFunction(RULES, "sellerIsValid")
  // Both now compare with == 'active'; nothing else passes.
  for (const expr of [assignee, seller]) {
    assert.match(expr, /get\('status', 'active'\) == 'active'/)
    assert.doesNotMatch(expr, /get\('status', 'active'\) != 'inactive'/)
  }
})

test("no rule still uses the loose `!= 'inactive'` test", () => {
  assert.doesNotMatch(RULES, /get\('status', 'active'\) != 'inactive'/)
})

test("H/I) a deactivated member cannot edit their profile or mark notifications read", () => {
  const usersBlock = RULES.slice(RULES.indexOf("match /users/{userId}"), RULES.indexOf("match /clients/"))
  assert.match(
    usersBlock,
    /\|\| \(hasMembership\(\) && membershipIsActive\(\)\s*\n\s*&& resource\.data\.authUid == request\.auth\.uid/,
  )
  const notifBlock = RULES.slice(RULES.indexOf("match /notifications/{notificationId}"))
  assert.match(notifBlock, /allow update: if hasMembership\(\)\s*\n\s*&& membershipIsActive\(\)/)
})

/* -------------------------- hardening: the invitation lookup exception --- */

test("the invitation lookup demands a verified email and a live invitation", () => {
  const usersBlock = RULES.slice(RULES.indexOf("match /users/{userId}"), RULES.indexOf("match /clients/"))
  const readRule = usersBlock.slice(usersBlock.indexOf("allow read:"), usersBlock.indexOf("allow create:"))
  const expr = readRule
    .slice(readRule.indexOf("|| (signedIn()"))
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n")
    .replace(/^\s*\|\|\s*/, "")
    .replace(/;\s*$/, "")

  const run = ({ verified, email, authUid, status }) =>
    evaluate(expr, {
      vars: {
        resource: { data: { email, authUid, status } },
        request: { auth: { uid: "AUTH-1", token: { email: "A@X.com", email_verified: verified } } },
      },
      methods,
      fns: { signedIn: () => true },
    })

  const invitation = { email: "a@x.com", authUid: null, status: "invited" }
  assert.equal(run({ ...invitation, verified: false }), false, "A) unverified email")
  assert.equal(run({ ...invitation, verified: true }), true, "B) verified + invited + unclaimed")
  assert.equal(run({ ...invitation, verified: true, status: "inactive" }), false, "C) cancelled invitation")
  assert.equal(run({ ...invitation, verified: true, authUid: "AUTH-1" }), false, "D) already claimed")
  assert.equal(run({ ...invitation, verified: true, email: "otro@x.com" }), false, "another person's invitation")
})

/* ------------------- the invitation query matches the rule it must pass -- */

test("findInvitation narrows itself exactly like the read rule", () => {
  // Firestore Rules are not filters: a query missing any of the three
  // conditions is rejected outright, so the lookup would always fail.
  const src = readFileSync(join(root, "lib/firebase/membership.ts"), "utf8")
  const fn = src.slice(src.indexOf("export async function findInvitation"))
  const body = fn.slice(0, fn.indexOf("\n}"))
  assert.match(body, /where\("email", "==", email\.toLowerCase\(\)\)/)
  assert.match(body, /where\("authUid", "==", null\)/)
  assert.match(body, /where\("status", "==", "invited"\)/)
})

test("the invitation is only looked up once the email is verified", () => {
  const src = readFileSync(join(root, "lib/firebase/membership.ts"), "utf8")
  const fn = src.slice(src.indexOf("export async function resolveIdentity"))
  const body = fn.slice(0, fn.indexOf("\n  const [profile"))
  const verifiedCheck = body.indexOf("authUser.emailVerified")
  const lookup = body.indexOf("findInvitation(")
  assert.ok(verifiedCheck !== -1 && lookup !== -1)
  assert.ok(verifiedCheck < lookup, "the verification guard must come before the query")
})
