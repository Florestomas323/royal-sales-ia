// Fase 2 regressions, executed against the real functions.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import Module from "node:module"
import { createRequire } from "node:module"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const build = join(root, ".test-build")

// The compiled output keeps the `@/…` path alias, which Node does not know.
const resolveOriginal = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) {
    for (const candidate of [`${build}/${request.slice(2)}.js`, `${build}/${request.slice(2)}/index.js`]) {
      try { return resolveOriginal.call(this, candidate, ...rest) } catch { /* try the next one */ }
    }
  }
  return resolveOriginal.call(this, request, ...rest)
}

const require = createRequire(import.meta.url)
const { computeMetrics, isContacted, resolvePeriod } = require(join(build, "lib/metrics.js"))
const { analyzeCampaignPerformance } = require(join(build, "lib/media-buyer/analyzer.js"))
const ALL = resolvePeriod("all")
const D30 = resolvePeriod("30d")

const lead = (o = {}) => ({
  id: "L1", workspaceId: "ws-A", leadType: "sales", name: "María", phone: "5551", email: "",
  source: "meta", campaignId: "", campaignName: "", score: 50, temperature: "warm",
  stage: "new_lead", assignedToId: "u1", potentialValue: 0,
  createdAt: new Date().toISOString(), lastContactAt: null, nextFollowUpAt: null,
  nextAction: "", attribution: {}, clientId: "", ...o,
})

/* --------------------------------------------------- contactados (punto 3) */

test("a recorded WhatsApp/call counts as contacted", () => {
  assert.equal(isContacted(lead({ lastContactAt: new Date().toISOString() })), true)
})

test("a lead that moved past its first stage counts as contacted", () => {
  // Outreach that happened outside the app never writes lastContactAt, but a
  // lead sitting in "Demostración agendada" was obviously contacted.
  assert.equal(isContacted(lead({ stage: "appointment" })), true)
  assert.equal(isContacted(lead({ leadType: "recruiting", stage: "rec_interview" })), true)
})

test("a brand new lead is NOT contacted", () => {
  assert.equal(isContacted(lead()), false)
  assert.equal(isContacted(lead({ leadType: "recruiting", stage: "rec_new" })), false)
})

test("contacted is counted inside the selected period", () => {
  const old = new Date(Date.now() - 90 * 864e5).toISOString()
  const rows = [
    lead({ id: "a", stage: "appointment", createdAt: old }),
    lead({ id: "b", stage: "appointment" }),
  ]
  assert.equal(computeMetrics(rows, { period: ALL }).contacted, 2)
  assert.equal(computeMetrics(rows, { period: D30 }).contacted, 1)
})

/* -------------------------------------------------------- citas (punto 3) */

const appt = (o = {}) => ({
  leadId: "L1", leadType: "sales", scheduledAt: new Date().toISOString(), status: "scheduled", ...o,
})

test("a real appointment counts even though the lead never changed stage", () => {
  // Root cause: scheduling writes to `appointments` and does not move the
  // stage, so counting stages alone reported nothing.
  const rows = [lead({ id: "L1", stage: "new_lead" })]
  assert.equal(computeMetrics(rows, { period: ALL }).inAppointmentStage, 0)
  assert.equal(
    computeMetrics(rows, { period: ALL, appointments: [appt({ leadId: "L1" })] }).inAppointmentStage,
    1,
  )
})

test("a lead is counted once, by stage or by meeting, never twice", () => {
  const rows = [lead({ id: "L1", stage: "appointment" })]
  const m = computeMetrics(rows, { period: ALL, appointments: [appt({ leadId: "L1" })] })
  assert.equal(m.inAppointmentStage, 1)
})

test("cancelled meetings and meetings of archived or foreign leads do not count", () => {
  const rows = [lead({ id: "L1" }), lead({ id: "L2", archived: true })]
  const m = computeMetrics(rows, {
    period: ALL,
    appointments: [
      appt({ leadId: "L1", status: "cancelled" }),
      appt({ leadId: "L2" }),
      appt({ leadId: "OTRO-WS" }),
    ],
  })
  assert.equal(m.inAppointmentStage, 0)
})

test("meetings respect the selected period and the pipeline", () => {
  const rows = [lead({ id: "L1" }), lead({ id: "L2", leadType: "recruiting", stage: "rec_new" })]
  const old = new Date(Date.now() - 90 * 864e5).toISOString()
  const m = computeMetrics(rows, {
    period: D30,
    appointments: [appt({ leadId: "L1", scheduledAt: old }), appt({ leadId: "L2", leadType: "recruiting" })],
  })
  assert.equal(m.inAppointmentStage, 0, "the sales meeting is outside the period")
  assert.equal(m.inInterviewStage, 1, "the interview counts on the recruiting side")
})

/* ------------------------------------------------- sin campaña (punto 4) */

test("leads no campaign claims are reported as 'Sin campaña', never attributed", () => {
  const insight = [{ campaign_id: "meta-1", campaign_name: "APC", spend: 10, impressions: 100, reach: 90, clicks: 5 }]
  const campaigns = [{
    metaCampaignId: "meta-1", name: "APC", workspaceId: "ws-A", objective: "sales",
    localCampaignId: "c1", insight,
  }]
  const leads = [
    lead({ id: "a", attribution: { externalCampaignId: "meta-1" } }),
    lead({ id: "b", campaignId: "c1" }),
    lead({ id: "c" }),
    lead({ id: "d" }),
  ]
  const a = analyzeCampaignPerformance(campaigns, leads, { period: ALL })
  assert.equal(a.totals.crmLeads, 2, "only the attributed ones belong to the campaign")
  assert.equal(a.totals.unattributedLeads, 2)
  // The whole picture reconciles with the workspace total.
  assert.equal(a.totals.crmLeads + a.totals.unattributedLeads, leads.length)
  // Per-campaign metrics are untouched.
  assert.equal(a.campaigns[0].crmLeads, 2)
})

test("'Sin campaña' honours the period and ignores archived leads", () => {
  const old = new Date(Date.now() - 90 * 864e5).toISOString()
  const leads = [lead({ id: "a", createdAt: old }), lead({ id: "b" }), lead({ id: "c", archived: true })]
  const a = analyzeCampaignPerformance([], leads, { period: D30 })
  assert.equal(a.totals.unattributedLeads, 1)
})

/* ------------------------------------------------ abrir en Meta (punto 5) */

test("shortened Meta links are rejected, so no broken button is shown", () => {
  const src = readFileSync(join(root, "app/api/meta/ad-preview/route.ts"), "utf8")
  assert.match(src, /SHORTENER_HOSTS/)
  for (const host of ["fb.me", "m.me", "fb.watch", "l.facebook.com"]) {
    assert.ok(src.includes(`"${host}"`), `${host} must be rejected`)
  }
  // The check lives in safeUrl, which every link passes through.
  assert.match(src, /if \(SHORTENER_HOSTS\.includes\(host\)\) return null/)
})

test("the button only renders when a link survived", () => {
  const dlg = readFileSync(join(root, "components/campaigns/ad-preview-dialog.tsx"), "utf8")
  assert.match(dlg, /\{preview\.shareableLink && \(/)
})

test("account_id and verify_account are untouched", () => {
  const src = readFileSync(join(root, "app/api/meta/ad-preview/route.ts"), "utf8")
  assert.match(src, /stage = "verify_account"/)
  assert.match(src, /normalizeAccountId\(result\.data\.account_id\)/)
})

/* ------------------------------------------------- campana (puntos 1 y 2) */

test("the bell marks notifications read for EVERY role, super admin included", () => {
  const menu = readFileSync(join(root, "components/shell/notifications-menu.tsx"), "utf8")
  // The root cause: the write was skipped for a super admin, so the badge
  // never went down for them.
  assert.doesNotMatch(menu, /if \(!n\.read && !isSuperAdmin\)/)
  assert.match(menu, /if \(!n\.read\) \{/)
  assert.doesNotMatch(menu, /unread > 0 && !isSuperAdmin/)
})

test("a failing mark-as-read is surfaced, not swallowed", () => {
  const menu = readFileSync(join(root, "components/shell/notifications-menu.tsx"), "utf8")
  assert.doesNotMatch(menu, /markNotificationRead\(n\.copies\)\.catch\(\(\) => \{\}\)/)
  assert.match(menu, /toast\.error\(t\.notifications\.markError/)
})

test("every historical copy is marked, so the badge cannot be revived", () => {
  // A member's path goes through markAllNotificationsRead, which walks the
  // copies of each logical row.
  const menu = readFileSync(join(root, "components/shell/notifications-menu.tsx"), "utf8")
  assert.match(menu, /await markAllNotificationsRead\(unread\)/)
  const fb = readFileSync(join(root, "lib/firebase/notifications.ts"), "utf8")
  assert.match(fb, /flatMap\(\(n\) => n\.copies \?\? \[n\.id\]\)/)
})

/* ------------ super admin: dedupe por evento y recibos (corrección 1) ---- */

const { dedupeNotifications, eventKey, notificationKey } = require(join(build, "lib/notifications.js"))

const notif = (o = {}) => ({
  id: "n1", workspaceId: "ws-A", userId: "u1", type: "new_lead", leadId: "L1", leadType: "sales",
  title: "Nuevo prospecto", message: "María", source: "meta", form: null,
  read: false, readAt: null, createdAt: "2026-09-16T10:00:00Z", ...o,
})

test("a member still sees one row per event AND per recipient", () => {
  const rows = dedupeNotifications([notif({ id: "a" }), notif({ id: "b", userId: "u2" })])
  assert.equal(rows.length, 2, "two recipients are two different notifications")
})

test("a super admin sees ONE row for a lead that notified several people", () => {
  // Root cause: keying by userId showed the same prospect once per recipient
  // to somebody who can read them all.
  const rows = dedupeNotifications(
    [notif({ id: "a", userId: "u1" }), notif({ id: "b", userId: "u2" }), notif({ id: "c", userId: "u3" })],
    { byEvent: true },
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].copies.length, 3)
  assert.equal(rows[0].eventKey, "ws-A__new_lead__L1")
})

test("different leads or workspaces stay separate for a super admin", () => {
  const rows = dedupeNotifications(
    [notif({ id: "a" }), notif({ id: "b", leadId: "L2" }), notif({ id: "c", workspaceId: "ws-B" })],
    { byEvent: true },
  )
  assert.equal(rows.length, 3)
})

test("the super admin's read state comes from receipts, not from recipients", () => {
  const read = [notif({ id: "a", read: true, readAt: "2026-09-16T11:00:00Z" })]
  // The distributor read theirs; that is NOT the super admin's read state.
  assert.equal(dedupeNotifications(read, { byEvent: true })[0].read, false)
  // With a receipt, it is read.
  assert.equal(
    dedupeNotifications(read, { byEvent: true, readKeys: new Set(["ws-A__new_lead__L1"]) })[0].read,
    true,
  )
  // And a receipt does not leak into a member's own view.
  assert.equal(
    dedupeNotifications([notif({ id: "a" })], { readKeys: new Set(["ws-A__new_lead__L1"]) })[0].read,
    false,
  )
})

test("the two keys are distinct: one by recipient, one by event", () => {
  assert.equal(notificationKey(notif()), "new_lead__L1__u1")
  assert.equal(eventKey(notif()), "ws-A__new_lead__L1")
})

test("the bell writes receipts for a super admin and documents for a member", () => {
  const menu = readFileSync(join(root, "components/shell/notifications-menu.tsx"), "utf8")
  // A super admin never writes on somebody else's notification.
  assert.match(menu, /if \(isSuperAdmin\) \{[\s\S]{0,400}markReadReceipts\(keys\)/)
  assert.match(menu, /await markAllNotificationsRead\(unread\)/)
  assert.doesNotMatch(menu, /isSuperAdmin[\s\S]{0,80}markNotificationRead/)
  // Dedupe is switched by role.
  assert.match(menu, /\{ byEvent: isSuperAdmin, readKeys: receipts \}/)
  // The badge drops before the round trip and rolls back on failure.
  assert.match(menu, /setReceipts\(\(prev\) => new Set\(\[\.\.\.prev, \.\.\.keys\]\)\)/)
})

test("the receipts route verifies super admin and never touches notifications", () => {
  const src = readFileSync(join(root, "app/api/notifications/receipts/route.ts"), "utf8")
  assert.match(src, /authenticateRequest\(request\)/)
  assert.match(src, /auth\.user\.membership\.role !== "super_admin"/)
  // Writes go to its own collection, never to `notifications`.
  assert.match(src, /const COLLECTION = "notificationReceipts"/)
  assert.doesNotMatch(src, /collection\("notifications"\)/)
  // A non-super-admin POST is refused outright.
  assert.match(src, /return NextResponse\.json\(\{ error: "forbidden" \}, \{ status: 403 \}\)/)
})

test("the receipts collection is unreachable from the client by the catch-all", () => {
  const rules = readFileSync(join(root, "firestore.rules"), "utf8")
  assert.doesNotMatch(rules, /match \/notificationReceipts/)
  assert.match(rules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/)
})

/* ---------------- resumen de Media Buyer reconciliable (corrección 2) ---- */

test("the summary reconciles: total = attributed + unattributed", () => {
  const insight = [{ campaign_id: "meta-1", campaign_name: "APC", spend: 40, impressions: 100, reach: 90, clicks: 5 }]
  const campaigns = [{
    metaCampaignId: "meta-1", name: "APC", workspaceId: "ws-A", objective: "sales",
    localCampaignId: "c1", insight,
  }]
  const leads = [
    lead({ id: "a", attribution: { externalCampaignId: "meta-1" } }),
    lead({ id: "b", attribution: { externalCampaignId: "meta-1" } }),
    lead({ id: "c" }),
    lead({ id: "d" }),
    lead({ id: "e" }),
  ]
  const t = analyzeCampaignPerformance(campaigns, leads, { period: ALL }).totals
  assert.equal(t.allCrmLeads, 5)
  assert.equal(t.crmLeads, 2, "attributed")
  assert.equal(t.unattributedLeads, 3)
  assert.equal(t.crmLeads + t.unattributedLeads, t.allCrmLeads)
})

test("ONE lead claimed by TWO campaigns is counted once in every CRM total", () => {
  // The gap this closes: totals used to sum `c.crmLeads` across campaigns, so
  // the same prospect landed twice and the CPL divided spend by 2 instead of 1.
  const mk = (id) => ({
    metaCampaignId: id, name: id, workspaceId: "ws-A", objective: "sales", localCampaignId: "c1",
    insight: [{ campaign_id: id, campaign_name: id, spend: 50, impressions: 10, reach: 10, clicks: 1 }],
  })
  const sold = lead({
    id: "a", campaignId: "c1", stage: "sale",
    closedValue: 3000, closedAt: new Date().toISOString(),
  })
  const t = analyzeCampaignPerformance([mk("meta-1"), mk("meta-2")], [sold], { period: ALL }).totals

  assert.equal(t.allCrmLeads, 1)
  assert.equal(t.crmLeads, 1, "attributed once, not twice")
  assert.equal(t.unattributedLeads, 0)
  assert.equal(t.crmLeads + t.unattributedLeads, t.allCrmLeads)
  assert.equal(t.sales, 1, "one sale, not two")
  assert.equal(t.revenue, 3000, "revenue counted once")
  if (t.cplCrm !== null) {
    // 100 of spend over ONE lead. Double counting would have reported 50.
    assert.equal(t.cplCrm, t.spend / 1)
  }
  if (t.roas !== null) assert.equal(t.roas, 3000 / t.spend)

  // Each campaign card still reports its own match: those are unchanged.
  const a = analyzeCampaignPerformance([mk("meta-1"), mk("meta-2")], [sold], { period: ALL })
  assert.equal(a.campaigns[0].crmLeads, 1)
  assert.equal(a.campaigns[1].crmLeads, 1)
})

test("the identity crmLeads + unattributedLeads === allCrmLeads always holds", () => {
  const mk = (id, local) => ({
    metaCampaignId: id, name: id, workspaceId: "ws-A", objective: "sales", localCampaignId: local,
    insight: [{ campaign_id: id, campaign_name: id, spend: 10, impressions: 10, reach: 10, clicks: 1 }],
  })
  const leads = [
    lead({ id: "a", campaignId: "c1" }),
    lead({ id: "b", attribution: { externalCampaignId: "meta-2" } }),
    lead({ id: "c" }),
    lead({ id: "d", campaignId: "c1", attribution: { externalCampaignId: "meta-2" } }),
  ]
  const t = analyzeCampaignPerformance([mk("meta-1", "c1"), mk("meta-2", "c2")], leads, { period: ALL }).totals
  assert.equal(t.crmLeads + t.unattributedLeads, t.allCrmLeads)
  assert.equal(t.allCrmLeads, 4)
  assert.equal(t.crmLeads, 3)
  assert.equal(t.unattributedLeads, 1)
})

test("totals are computed from the unique set, not by summing campaigns", () => {
  const src = readFileSync(join(root, "lib/media-buyer/analyzer.ts"), "utf8")
  assert.doesNotMatch(src, /campaigns\.reduce\(\(s, c\) => s \+ c\.crmLeads, 0\)/)
  assert.doesNotMatch(src, /campaigns\.reduce\(\(s, c\) => s \+ c\.sales, 0\)/)
  assert.match(src, /const attributedInPeriod = \[\.\.\.attributed\.values\(\)\]/)
  assert.match(src, /const uniqueSales = salesInPeriod\(\[\.\.\.attributed\.values\(\)\], period\)/)
  assert.match(src, /cplCrm: ratio\(totalSpend, totalCrm\)/)
})

test("a lead two campaigns could claim is counted ONCE in the total", () => {
  const mk = (id) => ({
    metaCampaignId: id, name: id, workspaceId: "ws-A", objective: "sales", localCampaignId: "c1",
    insight: [{ campaign_id: id, campaign_name: id, spend: 10, impressions: 10, reach: 10, clicks: 1 }],
  })
  // `campaignId: "c1"` matches both campaigns' localCampaignId.
  const leads = [lead({ id: "a", campaignId: "c1" })]
  const t = analyzeCampaignPerformance([mk("meta-1"), mk("meta-2")], leads, { period: ALL }).totals
  assert.equal(t.allCrmLeads, 1)
  assert.equal(t.unattributedLeads, 0)
})

test("the CPL divides spend by ATTRIBUTED leads only, and says so", () => {
  const insight = [{ campaign_id: "meta-1", campaign_name: "APC", spend: 40, impressions: 100, reach: 90, clicks: 5 }]
  const campaigns = [{
    metaCampaignId: "meta-1", name: "APC", workspaceId: "ws-A", objective: "sales",
    localCampaignId: "c1", insight,
  }]
  const leads = [
    lead({ id: "a", attribution: { externalCampaignId: "meta-1" } }),
    lead({ id: "b", attribution: { externalCampaignId: "meta-1" } }),
    lead({ id: "c" }), lead({ id: "d" }), lead({ id: "e" }),
  ]
  const t = analyzeCampaignPerformance(campaigns, leads, { period: ALL }).totals
  // The divisor is the ATTRIBUTED count, never the 5 of the workspace.
  assert.equal(t.crmLeads, 2)
  assert.equal(t.allCrmLeads, 5)
  const analyzer = readFileSync(join(root, "lib/media-buyer/analyzer.ts"), "utf8")
  assert.match(analyzer, /cplCrm: ratio\(totalSpend, totalCrm\)/)
  assert.doesNotMatch(analyzer, /cplCrm: ratio\(totalSpend, [^)]*all/)
  const i18n = readFileSync(join(root, "lib/i18n.ts"), "utf8")
  assert.match(i18n, /cplCrm: 'CPL atribuido'/)
})

test("the summary shows the three figures", () => {
  const view = readFileSync(join(root, "components/media-buyer/media-buyer-view.tsx"), "utf8")
  assert.match(view, /m\.summary\.crmLeads[\s\S]{0,80}analysis\.totals\.allCrmLeads/)
  assert.match(view, /m\.summary\.attributedLeads[\s\S]{0,80}analysis\.totals\.crmLeads/)
  assert.match(view, /m\.summary\.unattributedLeads[\s\S]{0,80}analysis\.totals\.unattributedLeads/)
})
