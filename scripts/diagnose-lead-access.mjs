#!/usr/bin/env node
/**
 * READ-ONLY diagnostic: why can a given user not act on a given lead?
 *
 * Compares, exactly as the Security Rules do, the Firebase Auth uid, the
 * membership, the team profile, the lead, its workspace and (optionally) the
 * campaign — and reports the FIRST rule condition that fails, with the
 * values involved. Nothing is written. No secret is printed: only document
 * ids, roles, statuses and field types.
 *
 * Usage (from the repo root, with FIREBASE_SERVICE_ACCOUNT_JSON set):
 *
 *   node scripts/diagnose-lead-access.mjs --uid <authUid> --lead <leadId> \
 *     [--campaign <campaignId>] [--op archive|schedule|campaign|channel|stage]
 *
 * `--op` is the operation being attempted (default: archive). It decides
 * which checks BLOCK and which are merely reported: since the APC-compatible
 * rules, `validChangedLeadShape()` only validates the fields a write actually
 * changes, so a bad historical value in an unrelated field no longer stops
 * archiving, restoring, or editing the campaign or the channel.
 *
 * `--uid` is the Firebase Auth uid (Authentication → Users), NOT the users
 * document id. Run it once per person who is failing (Tomás, Eva) against
 * one failing lead of APC Millennium and one working lead of Tomás's own
 * workspace, then compare the two reports side by side.
 */
import { cert, getApps, initializeApp } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, arr) => {
    if (a.startsWith("--")) acc.push([a.slice(2), arr[i + 1]])
    return acc
  }, []),
)
if (!args.uid || !args.lead) {
  console.error("Usage: node scripts/diagnose-lead-access.mjs --uid <authUid> --lead <leadId> [--campaign <campaignId>]")
  process.exit(2)
}

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.trim()
if (!raw) {
  console.error("FIREBASE_SERVICE_ACCOUNT_JSON is not set. Export it (the same value Vercel uses) and retry.")
  process.exit(2)
}
const sa = JSON.parse(raw)
if (!getApps().length) initializeApp({ credential: cert(sa) })
const db = getFirestore()

const typeOf = (v) =>
  v === null ? "null" : v === undefined ? "ABSENT" : Array.isArray(v) ? "list" : v instanceof Date ? "Date" : typeof v === "object" && typeof v.toDate === "function" ? "Timestamp" : typeof v

const findings = []
const ok = (m) => findings.push(["ok", m])
const bad = (m) => findings.push(["FAIL", m])
const warn = (m) => findings.push(["warn", m])

/* ---------------------------------------------------------------- 1. auth */
console.log(`\nProject: ${sa.project_id}`)
console.log(`Auth uid: ${args.uid}`)

/* ---------------------------------------------------------- 2. membership */
const memSnap = await db.doc(`memberships/${args.uid}`).get()
if (!memSnap.exists) {
  bad(`memberships/${args.uid} does NOT exist → hasMembership() is false, every rule denies`)
  report(); process.exit(1)
}
const mem = memSnap.data()
const memStatus = mem.status === undefined ? "active" : mem.status
console.log(`\nmemberships/${args.uid}:`)
console.log(`  role=${mem.role}  status=${mem.status ?? "(absent → active)"}  workspaceId=${mem.workspaceId}  userId=${mem.userId}`)
const isSuper = mem.role === "super_admin"
if (memStatus !== "active") bad(`membershipIsActive() is false: membership.status is "${mem.status}", the rules require exactly "active"`)
else ok("membershipIsActive()")
if (!["super_admin", "client_admin", "manager", "sales_rep", "viewer"].includes(mem.role)) bad(`membership.role "${mem.role}" is not a known role`)
if (typeof mem.userId !== "string" || !mem.userId) bad("membership.userId is missing: myUserId() would be undefined and every actorId/createdBy check fails")

/* ---------------------------------------------------------------- 3. user */
const userSnap = mem.userId ? await db.doc(`users/${mem.userId}`).get() : null
if (!userSnap?.exists) {
  warn(`users/${mem.userId} does not exist (fine for a super admin without a team profile, a problem for anyone else)`)
} else {
  const u = userSnap.data()
  console.log(`users/${mem.userId}:`)
  console.log(`  role=${u.role}  status=${u.status}  workspaceId=${u.workspaceId}  authUid=${u.authUid}`)
  if (u.authUid !== args.uid) warn(`users.authUid (${u.authUid}) ≠ auth uid: the profile is bound to another login`)
  if (!isSuper && u.workspaceId !== mem.workspaceId) bad(`users.workspaceId (${u.workspaceId}) ≠ membership.workspaceId (${mem.workspaceId})`)
  if (!isSuper && u.role !== mem.role) warn(`users.role (${u.role}) ≠ membership.role (${mem.role}) — the RULES read the membership; the UI shows the profile`)
}

/* ---------------------------------------------------------------- 4. lead */
const leadSnap = await db.doc(`leads/${args.lead}`).get()
if (!leadSnap.exists) { bad(`leads/${args.lead} does not exist`); report(); process.exit(1) }
const lead = leadSnap.data()
console.log(`\nleads/${args.lead}:`)
console.log(`  workspaceId=${lead.workspaceId}  leadType=${lead.leadType ?? "(ABSENT → sales)"}  stage=${lead.stage}  assignedToId=${JSON.stringify(lead.assignedToId)}  archived=${lead.archived ?? "(absent)"}`)
console.log(`  source=${lead.source}  campaignId=${JSON.stringify(lead.campaignId)}  attributionSource=${lead.attributionSource ?? "(absent)"}`)

/* --------------------------------------------------- 5. workspace + tenant */
const wsSnap = await db.doc(`workspaces/${lead.workspaceId}`).get()
console.log(`\nworkspaces/${lead.workspaceId}: ${wsSnap.exists ? `exists — name="${wsSnap.data().name}"` : "DOES NOT EXIST"}`)
if (!wsSnap.exists) bad(`the lead points at a workspace document that does not exist: "${lead.workspaceId}"`)
if (isSuper) {
  ok(`super_admin: isSuperAdmin() bypasses the workspace check (membership is in "${mem.workspaceId}", lead is in "${lead.workspaceId}")`)
} else if (mem.workspaceId !== lead.workspaceId) {
  bad(`inWorkspace() is false: membership.workspaceId "${mem.workspaceId}" ≠ lead.workspaceId "${lead.workspaceId}". The person and the lead are in DIFFERENT workspace documents — check the ids character by character.`)
} else ok("inWorkspace(): membership and lead share the workspace id")

/* ---------------------------------------- 5b. what this operation writes */
/**
 * Fields each operation actually modifies. Only these are validated by
 * `validChangedLeadShape()`; everything else is carried over untouched and
 * is reported as a warning, not as a blocker.
 */
const OPS = {
  archive: ["archived", "archivedAt", "archivedBy", "archivedByName"],
  restore: ["archived", "archivedAt", "archivedBy", "archivedByName"],
  schedule: ["stage"],
  campaign: ["campaignId", "campaignName", "attributionSource"],
  channel: ["source"],
  stage: ["stage", "closedValue", "closedAt"],
}
const op = args.op ?? "archive"
if (!OPS[op]) { console.error(`Unknown --op "${op}". Use one of: ${Object.keys(OPS).join(", ")}`); process.exit(2) }
const touched = new Set(OPS[op])
console.log(`\nOperation under test: --op ${op} → writes [${OPS[op].join(", ")}]`)

/* --------------------------------------- 6. validChangedLeadShape, per field */
const shape = []      // fields this operation WRITES and whose value is invalid → blocking
const historical = [] // fields it does NOT write but whose stored value is invalid → warning
const need = (f, pred, desc) => {
  if (pred) return
  const line = `${f}: ${desc} (is ${typeOf(lead[f])}${lead[f] === "" ? ", empty" : ""})`
  if (touched.has(f)) shape.push(line)
  else historical.push(line)
}
need("workspaceId", typeof lead.workspaceId === "string" && lead.workspaceId.length > 0, "must be a non-empty string")
need("name", typeof lead.name === "string" && lead.name.length > 0, "must be a non-empty string")
for (const f of ["phone", "assignedToId", "source", "createdAt"]) {
  need(f, lead[f] === undefined || typeof lead[f] === "string", "when present must be a string (null is NOT tolerated)")
}
for (const f of ["email", "assignedToName", "campaignId", "campaignName", "clientId", "receivedAt", "updatedAt", "emailNotifiedAt", "notes", "lastContactAt", "nextFollowUpAt", "nextAction", "archivedAt", "archivedBy", "archivedByName", "closedAt", "customerId"]) {
  need(f, lead[f] === undefined || lead[f] === null || typeof lead[f] === "string", "must be absent, null or a string")
}
need("archived", lead.archived === undefined || lead.archived === null || typeof lead.archived === "boolean", "must be absent, null or a boolean")
for (const f of ["closedValue", "potentialValue", "score"]) need(f, lead[f] === undefined || lead[f] === null || typeof lead[f] === "number", "must be absent, null or a number")
need("temperature", lead.temperature === undefined || lead.temperature === null || ["hot", "warm", "cold"].includes(lead.temperature), "must be hot/warm/cold")
need("attributionSource", lead.attributionSource === undefined || ["meta", "manual", "web"].includes(lead.attributionSource), "absent or meta/manual/web (null is NOT tolerated)")
for (const f of ["attribution", "webForm", "recruiting"]) need(f, lead[f] === undefined || lead[f] === null || (typeof lead[f] === "object" && !Array.isArray(lead[f])), "must be absent, null or a map")
need("leadType", lead.leadType === undefined || ["sales", "recruiting"].includes(lead.leadType), "absent or sales/recruiting")
const SALES = ["new_lead", "contact", "contacted", "interested", "appointment", "follow_up", "sale", "not_interested"]
const REC = ["rec_new", "rec_contact", "rec_contacted", "rec_qualified", "rec_interview", "rec_orientation", "rec_follow_up", "rec_hired", "rec_disqualified"]
const lt = lead.leadType ?? "sales"
need("stage", (lt === "sales" ? SALES : REC).includes(lead.stage), `must belong to the ${lt} pipeline`)
if (shape.length) {
  bad(`validChangedLeadShape() REJECTS this "${op}" write: the operation itself writes a field with an invalid value:\n     - ` + shape.join("\n     - "))
} else ok(`validChangedLeadShape(): every field this "${op}" writes has an accepted type`)
if (historical.length) {
  warn(`historical values in fields this operation does NOT write. Under the APC-compatible rules they do NOT block it; they WOULD block a write that touches them, and are worth cleaning up:\n     - ` + historical.join("\n     - "))
}

/* -------------------------------------------------- 7. closing invariants */
const wonStage = lt === "sales" ? "sale" : "rec_hired"
const hasCV = lead.closedValue !== undefined && lead.closedValue !== null
const hasCA = lead.closedAt !== undefined && lead.closedAt !== null
const stale = (lead.stage !== wonStage && (hasCV || hasCA)) || (lt === "recruiting" && hasCV)
// `closingChangeIsValid()` runs the invariants ONLY when the write touches
// leadType, stage, closedValue or closedAt. Archiving, restoring or editing
// the campaign or the channel leave historical closing data alone.
const closingTouched = ["leadType", "stage", "closedValue", "closedAt"].some((f) => touched.has(f))
if (stale && closingTouched) {
  bad(`closingInvariants(): the lead is in "${lead.stage}" carrying closedValue/closedAt, and this "${op}" write touches the closing fields, so the invariants apply and refuse it`)
} else if (stale) {
  warn(`the lead carries closing data that does not match its stage. This "${op}" write does NOT touch leadType/stage/closedValue/closedAt, so it is NOT blocked — but moving the stage later will be, until the data is cleaned up`)
} else ok("closingInvariants() on the stored document")

/* ------------------------------------------------- 8. role branch on lead */
if (isSuper) ok("leads update role branch: isSuperAdmin()")
else if (["client_admin", "manager"].includes(mem.role)) ok("leads update role branch: isWsAdmin()")
else if (mem.role === "sales_rep") {
  if (lead.assignedToId !== mem.userId) bad(`sales_rep branch: lead.assignedToId "${lead.assignedToId}" ≠ myUserId() "${mem.userId}"`)
  else ok("sales_rep branch: the lead is assigned to this person")
} else bad(`role "${mem.role}" has no write branch on leads`)

/* -------------------------------------------------- 9. optional campaign */
if (args.campaign) {
  const cSnap = await db.doc(`campaigns/${args.campaign}`).get()
  if (!cSnap.exists) bad(`campaigns/${args.campaign} does not exist → manualAttributionIsValid() is false`)
  else {
    const c = cSnap.data()
    console.log(`\ncampaigns/${args.campaign}: workspaceId=${c.workspaceId} name="${c.name}" status=${c.status}`)
    if (c.workspaceId !== lead.workspaceId) bad(`manualAttributionIsValid(): campaign.workspaceId "${c.workspaceId}" ≠ lead.workspaceId "${lead.workspaceId}"`)
    else ok("manualAttributionIsValid(): campaign is in the lead's workspace")
  }
}

/* -------------------------------------------------------- 10. appointments */
const appts = await db.collection("appointments").where("leadId", "==", args.lead).get()
console.log(`\nappointments for this lead: ${appts.size}`)
for (const d of appts.docs) {
  const a = d.data()
  const mismatch = a.workspaceId !== lead.workspaceId
  console.log(`  ${d.id}: status=${a.status} workspaceId=${a.workspaceId}${mismatch ? "  ← ≠ lead.workspaceId" : ""}`)
  if (mismatch) warn(`appointment ${d.id} stores a different workspaceId than the lead`)
}

report()

function report() {
  console.log("\n================ RESULT ================")
  const fails = findings.filter(([k]) => k === "FAIL")
  for (const [k, m] of findings) console.log(`${k === "FAIL" ? "✗" : k === "warn" ? "!" : "✓"} ${m}`)
  console.log("========================================")
  console.log(
    fails.length
      ? `\n${fails.length} blocking condition(s) for --op ${op}. The first one listed is what Firestore rejects.`
      : `\nNo blocking condition for --op ${op} in the stored data. Warnings above (if any) are historical values that these rules tolerate on this operation.\nIf the write still fails, the difference is in the REQUEST (what the app sends), not in the documents: run \`pnpm test:rules\` and compare the batch shapes in tests/emulator/.\nTry the other operations too: --op schedule, --op campaign, --op channel, --op stage.`,
  )
}
