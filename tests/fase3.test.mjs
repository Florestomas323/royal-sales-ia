// Fase 3 — the CRM's surfaces must describe one and the same state.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import Module from "node:module"
import { createRequire } from "node:module"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const build = join(root, ".test-build")

const resolveOriginal = Module._resolveFilename
Module._resolveFilename = function (request, ...rest) {
  if (request.startsWith("@/")) {
    for (const candidate of [`${build}/${request.slice(2)}.js`, `${build}/${request.slice(2)}/index.js`]) {
      try { return resolveOriginal.call(this, candidate, ...rest) } catch { /* next */ }
    }
  }
  return resolveOriginal.call(this, request, ...rest)
}
const require = createRequire(import.meta.url)
const { analyzeCampaignPerformance, leadsForCampaign } = require(join(build, "lib/media-buyer/analyzer.js"))
const { computeMetrics, resolvePeriod } = require(join(build, "lib/metrics.js"))
const { localStatusFor } = require(join(build, "lib/meta/campaign-links.js"))
const read = (p) => readFileSync(join(root, p), "utf8")

const ALL = resolvePeriod("all")
const lead = (o = {}) => ({
  id: "L1", workspaceId: "ws-A", leadType: "sales", name: "María", phone: "5551", email: "",
  source: "meta", campaignId: "", campaignName: "", score: 50, temperature: "warm",
  stage: "new_lead", assignedToId: "u1", potentialValue: 0,
  createdAt: new Date().toISOString(), lastContactAt: null, nextFollowUpAt: null,
  nextAction: "", attribution: {}, clientId: "", ...o,
})

/* ---------------------------- 1 y 2. cita ↔ etapa: una sola verdad ------ */

const APPTS = read("lib/firebase/appointments.ts")

test("booking a meeting advances the lead into the meeting stage in the SAME batch", () => {
  // Root cause: appointments lived only in `appointments`; the stage never
  // moved, so the funnel showed 0 while the calendar showed the demo.
  const create = APPTS.slice(APPTS.indexOf("export async function createAppointment"), APPTS.indexOf("export async function syncExistingAppointments"))
  assert.match(create, /const batch = writeBatch\(db\)/)
  // The stage move is the shared helper, so booking and the sync write the same thing.
  assert.match(create, /stageMoveIntoMeeting\(batch, lead, actor\)/)
  const helper = APPTS.slice(APPTS.indexOf("function stageMoveIntoMeeting"), APPTS.indexOf("export async function createAppointment"))
  assert.match(helper, /batch\.update\(doc\(db, "leads", lead\.id\), \{ stage: to \}\)/)
  assert.match(helper, /stageActivity\(batch/)
  assert.match(create, /await batch\.commit\(\)/)
  // No second source of truth: nothing derives the stage from appointments.
  assert.doesNotMatch(read("lib/funnels.ts"), /appointments/)
})

test("only a lead BEFORE the meeting stage is advanced; won / follow-up leads are left alone", () => {
  assert.match(APPTS, /if \(!isBeforeMeetingStage\(leadType, lead\.stage\)\) return false/)
  const fn = APPTS.slice(APPTS.indexOf("function isBeforeMeetingStage"), APPTS.indexOf("/**\n * Books a meeting"))
  assert.match(fn, /idx < meetingIdx/)
})

test("sales → 'appointment', recruiting → 'rec_interview': the funnels stay independent", () => {
  assert.match(APPTS, /leadType === "recruiting" \? "rec_interview" : "appointment"/)
  assert.match(APPTS, /leadType === "recruiting" \? "rec_follow_up" : "follow_up"/)
})

test("rescheduling keeps the lead in the meeting stage (status untouched, date updated)", () => {
  const upd = APPTS.slice(APPTS.indexOf("export async function updateAppointment"), APPTS.indexOf("export async function setAppointmentStatus"))
    // Instructions only: the next function's doc comment mentions "status".
    .replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n")
  assert.doesNotMatch(upd, /status/)
  assert.match(upd, /scheduledAt/)
})

test("cancelling the LAST active meeting moves the lead back to follow-up; another active one keeps it", () => {
  const set = APPTS.slice(APPTS.indexOf("export async function setAppointmentStatus"), APPTS.indexOf("export function useAppointments"))
  assert.match(set, /status === "cancelled" \|\| status === "no_show"/)
  assert.match(set, /where\("status", "==", "scheduled"\)/)
  assert.match(set, /const stillActive = others\.docs\.some\(\(d\) => d\.id !== id\)/)
  assert.match(set, /!stillActive && lead\.stage === meetingStageFor\(leadType\)/)
  // Scoped to the workspace and the lead: never another tenant's meetings.
  assert.match(set, /where\("workspaceId", "==", appt\.workspaceId\)/)
})

test("the tenant is checked before touching a stage", () => {
  assert.match(APPTS, /lead\.workspaceId === input\.workspaceId/)
})

test("several meetings of one lead never duplicate it in Centro de mando", () => {
  const rows = [lead({ id: "L1", stage: "appointment" })]
  const now = new Date().toISOString()
  const m = computeMetrics(rows, {
    period: ALL,
    appointments: [
      { leadId: "L1", leadType: "sales", scheduledAt: now, status: "scheduled" },
      { leadId: "L1", leadType: "sales", scheduledAt: now, status: "scheduled" },
      { leadId: "L1", leadType: "sales", scheduledAt: now, status: "cancelled" },
    ],
  })
  assert.equal(m.inAppointmentStage, 1)
})

test("the callers no longer sign the write themselves: the server derives the actor", () => {
  // Booking moved to POST /api/appointments, which reads the actor from the
  // membership. Cancelling still goes through the client helper with an actor.
  const sched = read("components/appointments/schedule-dialog.tsx")
  assert.match(sched, /await bookAppointment\(\{/)
  assert.doesNotMatch(sched, /await createAppointment\(/)
  assert.match(read("app/api/appointments/route.ts"), /actorId: membership\.userId/)
  assert.match(read("components/calendar/appointment-card.tsx"), /setAppointmentStatus\(\s*appointment\.id,\s*status,\s*membership && role/)
})

/* ---------------------------------- 3 y 5. atribución manual ------------ */

const mk = (id, local) => ({
  metaCampaignId: id, name: id, workspaceId: "ws-A", objective: "sales", localCampaignId: local,
  insight: [{ campaign_id: id, campaign_name: id, spend: 10, impressions: 10, reach: 10, clicks: 1 }],
})
const A = mk("meta-A", "cA"), B = mk("meta-B", "cB")

test("Sin campaña → campaña A: the lead leaves 'Sin campaña' and enters A", () => {
  const before = analyzeCampaignPerformance([A, B], [lead({ id: "x" })], { period: ALL }).totals
  assert.equal(before.unattributedLeads, 1)
  const after = analyzeCampaignPerformance([A, B], [lead({ id: "x", campaignId: "cA", attributionSource: "manual" })], { period: ALL })
  assert.equal(after.totals.unattributedLeads, 0)
  assert.equal(after.totals.crmLeads, 1)
  assert.equal(after.campaigns[0].crmLeads, 1)
  assert.equal(after.totals.allCrmLeads, before.allCrmLeads, "the workspace total does not change")
})

test("campaña A → campaña B: exactly one campaign claims it, never both", () => {
  const moved = lead({ id: "x", campaignId: "cB", attributionSource: "manual", attribution: { externalCampaignId: "meta-A" } })
  const a = analyzeCampaignPerformance([A, B], [moved], { period: ALL })
  assert.equal(a.campaigns[0].crmLeads, 0, "A no longer claims it, even with the old Meta id")
  assert.equal(a.campaigns[1].crmLeads, 1)
  assert.equal(a.totals.crmLeads, 1)
})

test("campaña → Sin campaña: a manual 'none' beats an automatic Meta attribution", () => {
  const none = lead({ id: "x", campaignId: "", attributionSource: "manual", attribution: { externalCampaignId: "meta-A" } })
  const a = analyzeCampaignPerformance([A, B], [none], { period: ALL })
  assert.equal(a.totals.crmLeads, 0)
  assert.equal(a.totals.unattributedLeads, 1)
})

test("an automatic Meta attribution is kept and shown, not overwritten silently", () => {
  const auto = lead({ id: "x", attribution: { externalCampaignId: "meta-A" } })
  assert.equal(leadsForCampaign([auto], A).length, 1)
  assert.match(read("components/leads/edit-lead-dialog.tsx"), /lead\.attributionSource !== "manual" && lead\.attribution\?\.externalCampaignId[\s\S]{0,60}campaignFromMeta/)
})

test("saving a campaign marks the attribution as manual, in the same write", () => {
  const src = read("lib/firebase/leads.ts")
  assert.match(src, /if \(patch\.campaignId !== undefined\) \{[\s\S]{0,300}data\.attributionSource = "manual"/)
})

test("the selector lists ACTIVE and PAUSED campaigns of the workspace, with their state", () => {
  const dlg = read("components/leads/edit-lead-dialog.tsx")
  // Ahora ligado al workspace del PROSPECTO, no al activo.
  assert.match(dlg, /useCampaignsForWorkspace\(lead\.workspaceId\)/)
  assert.match(dlg, /\.filter\(\(c\) => c\.status === "active" \|\| c\.status === "paused"\)/)
  assert.match(dlg, /CAMPAIGN_STATUS_LABELS\[c\.status\]/)
  assert.match(dlg, /<SelectItem value=\{NO_CAMPAIGN\}>/)
})

test("a campaign of another workspace is NOT available: the list is scoped and the id is re-checked", () => {
  const dlg = read("components/leads/edit-lead-dialog.tsx")
  // The list is queried for the LEAD's workspace…
  assert.match(read("lib/firebase/collections.ts"), /export function useCampaignsForWorkspace[\s\S]{0,600}where\("workspaceId", "==", workspaceId\)/)
  // …and the chosen id is re-checked against it before anything is written.
  assert.match(dlg, /c\.id === nextCampaign && c\.workspaceId === lead\.workspaceId/)
  assert.match(dlg, /if \(nextCampaign && !chosen\)[\s\S]{0,80}campaignInvalid/)
})

test("only Distribuidor / Asistente attribute; the sales_rep whitelist has no campaignId", () => {
  assert.match(read("components/leads/edit-lead-dialog.tsx"), /const canAttribute = isSuperAdmin \|\| role === "client_admin" \|\| role === "manager"/)
  const wl = read("firestore.rules").match(/function repEditableFields\(\) \{[\s\S]*?\]/)[0]
  assert.doesNotMatch(wl, /campaignId/)
})

/* ---------------------------------- 4. campañas activas y pausadas ------ */

test("Meta's status maps to the local one: ACTIVE → active, PAUSED → paused, nothing else is 'paused'", () => {
  assert.equal(localStatusFor("ACTIVE"), "active")
  assert.equal(localStatusFor("PAUSED"), "paused")
  assert.equal(localStatusFor("CAMPAIGN_PAUSED"), "paused")
  assert.notEqual(localStatusFor("ARCHIVED"), "paused")
  assert.equal(localStatusFor(null), null)
})

test("the local mirror is born with Meta's state and kept in step with it", () => {
  const src = read("lib/meta/campaign-links.ts")
  assert.match(src, /status: localStatusFor\(input\.metaStatus\) \?\? "ended"/)
  assert.match(src, /if \(status !== null && current\.status !== status\) patch\.status = status/)
})

test("the state travels: table → link → mirror, and refreshes when Meta changes it", () => {
  assert.match(read("components/integrations/meta-campaigns-table.tsx"), /metaCampaignStatus: campaign\.effectiveStatus \?\? campaign\.status \?\? null/)
  // Live Meta state first, the state stored at link time as the fallback.
  assert.match(read("app/api/meta/campaign-links/route.ts"), /liveStatuses\.get\(link\.metaCampaignId\) \?\? link\.metaCampaignStatus \?\? null/)
  assert.match(read("components/integrations/meta-campaigns-table.tsx"), /status === \(l\.metaCampaignStatus \?\? null\)\) continue/)
})

test("Campañas shows paused campaigns but 'Campañas activas' counts only active ones", () => {
  const { mergeCampaigns, mergedTotals } = require(join(build, "lib/campaigns/merged.js"))
  const c = (id, status) => ({ id, workspaceId: "ws-A", name: id, platform: "meta", status, objective: "sales",
    spend: 0, leads: 0, cpl: 0, appointments: 0, sales: 0, revenue: 0, roas: 0, clientId: "", externalId: id })
  const rows = mergeCampaigns([c("a", "active"), c("b", "active"), c("p", "paused")], [])
  assert.equal(rows.length, 3, "the paused one is listed")
  assert.equal(mergedTotals(rows).active, 2, "…but not counted as active")
  assert.equal(rows.find((r) => r.id === "p").status, "paused")
})

test("Meta campaigns are fetched without a status filter", () => {
  const g = read("lib/meta/graph.ts")
  const fn = g.slice(g.indexOf("export const getCampaigns"), g.indexOf("export interface GraphAdSet"))
  assert.doesNotMatch(fn, /filtering|effective_status.*ACTIVE/)
})

/* ---------------------------------------- 6. destino inválido ----------- */

test("an fb.me destination is dropped from the preview; the creative stays", () => {
  const route = read("app/api/meta/ad-preview/route.ts")
  assert.match(route, /preview\.linkUrl = safeUrl\(preview\.linkUrl \?\? undefined\)/)
  assert.match(read("components/campaigns/ad-preview-dialog.tsx"), /\{preview\.linkUrl && \(/)
  // account_id / verify_account untouched.
  assert.match(route, /stage = "verify_account"/)
  assert.match(route, /normalizeAccountId\(result\.data\.account_id\)/)
})

/* ======================= V2: retroactive sync, isolation, states ========= */

import { evaluate, ruleFunction } from "./helpers/cel.mjs"
const RULES = read("firestore.rules")

/** Set semantics for the .toSet()/.difference() pair some rules use. */
const methods = {
  toSet: (list) => ({ __set: [...new Set(list)].sort() }),
  difference: (a, b) => ({ __set: a.__set.filter((x) => !b.__set.includes(x)) }),
  concat: (a, b) => [...a, ...b],
}

test("createAppointment now REQUIRES an actor: no meeting without its stage", () => {
  const src = read("lib/firebase/appointments.ts")
  assert.match(src, /export async function createAppointment\(input: NewAppointment, actor: ActorContext\)/)
  assert.doesNotMatch(src, /createAppointment\(input: NewAppointment, actor\?: ActorContext\)/)
  // The only caller refuses to book without a resolved membership.
  assert.match(read("components/appointments/schedule-dialog.tsx"), /if \(!membership\?\.userId \|\| !role\) \{\s*toast\.error\(d\.error\)\s*return\s*\}/)
})

test("the retroactive sync only advances leads BEFORE the meeting stage — idempotent by construction", () => {
  const src = read("lib/firebase/appointments.ts")
  const fn = src.slice(src.indexOf("export async function syncExistingAppointments"))
  assert.match(fn, /where\("workspaceId", "==", workspaceId\)/)
  assert.match(fn, /where\("status", "==", "scheduled"\)/)
  assert.match(fn, /new Set\(snap\.docs\.map/)
  // Same helper as a fresh booking → same stage change, same activity.
  assert.match(fn, /if \(!stageMoveIntoMeeting\(batch, lead, actor\)\) continue/)
  assert.match(fn, /lead\.workspaceId !== workspaceId \|\| lead\.archived === true/)
  // stageMoveIntoMeeting refuses anything at or past the meeting stage.
  const helper = src.slice(src.indexOf("function stageMoveIntoMeeting"), src.indexOf("export async function createAppointment"))
  assert.match(helper, /if \(!isBeforeMeetingStage\(leadType, lead\.stage\)\) return false/)
})

test("the sync is exposed to workspace admins on the Agenda", () => {
  const cal = read("components/calendar/calendar-view.tsx")
  assert.match(cal, /isSuperAdmin \|\| role === "client_admin" \|\| role === "manager"/)
  assert.match(cal, /syncExistingAppointments\(workspaceId, \{ userId: membership\.userId, role \}\)/)
})

/* ------------------------ attribution isolation, now in the Rules ------- */

const attrValid = ruleFunction(RULES, "manualAttributionIsValid")

// manualAttributionIsValid(d, r): `d` = request.resource.data, `r` = resource.data,
// both passed down from allow update (computed once).
function attribution({ campaignId, campaignName = "", source = "manual", campaign, exists = campaign !== undefined, leadWorkspace = "ws-A" }) {
  return evaluate(attrValid, {
    vars: {
      r: { workspaceId: leadWorkspace },
      d: { campaignId, campaignName, attributionSource: source },
    },
    fns: { exists: () => exists, attributedCampaign: () => campaign },
  })
}

test("a campaign of the SAME workspace is allowed", () => {
  assert.equal(attribution({ campaignId: "c1", campaignName: "APC", campaign: { workspaceId: "ws-A", name: "APC" } }), true)
})

test("a campaign of ANOTHER workspace is denied", () => {
  assert.equal(attribution({ campaignId: "c9", campaignName: "Ajena", campaign: { workspaceId: "ws-B", name: "Ajena" } }), false)
})

test("an invented campaignId is denied", () => {
  assert.equal(attribution({ campaignId: "no-existe", campaignName: "x", campaign: undefined, exists: false }), false)
})

test("'Sin campaña' is allowed, with an empty name", () => {
  assert.equal(attribution({ campaignId: "", campaignName: "" }), true)
  assert.equal(attribution({ campaignId: "", campaignName: "Fantasma" }), false)
})

test("the name must match the campaign, and the change must be marked manual", () => {
  const c = { workspaceId: "ws-A", name: "APC" }
  assert.equal(attribution({ campaignId: "c1", campaignName: "Otro nombre", campaign: c }), false)
  assert.equal(attribution({ campaignId: "c1", campaignName: "APC", campaign: c, source: "meta" }), false)
})

test("Telemarketing cannot touch attribution: not in the whitelist, and the rule demands an admin", () => {
  const wl = RULES.match(/function repEditableFields\(\) \{[\s\S]*?\]/)[0]
  for (const f of ["campaignId", "campaignName", "attributionSource"]) assert.ok(!wl.includes(`'${f}'`), f)
  const leadsBlock = RULES.slice(RULES.indexOf("match /leads/{leadId}"))
  assert.match(leadsBlock, /!attributionChanges\(ck\)\s*\|\| \(adm && manualAttributionIsValid\(d, r\)\)/)
  // `adm` IS isSuperAdmin() || isWsAdmin(lead workspace), bound once — the
  // exact expression this branch used to repeat inline.
  assert.match(leadsBlock, /function leadUpdateIsValid\(ck, d, r, sa\)/)
  assert.match(ruleFunction(RULES, "leadUpdateIsValid"), /sa \|\| isWsAdmin\(r\.workspaceId\)/)
  assert.match(leadsBlock, /function leadUpdateChecks\(ck, d, r, adm, lta, ltb\)/)
  assert.match(leadsBlock, /allow update: if leadUpdateIsValid\(\s*request\.resource\.data\.diff\(resource\.data\)\.affectedKeys\(\),\s*request\.resource\.data,\s*resource\.data,\s*isSuperAdmin\(\)\s*\);/)
})

test("attributionSource is typed: absent on legacy, or meta / manual / web", () => {
  const shape = ruleFunction(RULES, "validLeadShape")
  assert.match(shape, /attributionSource in \['meta', 'manual', 'web'\]/)
  assert.match(shape, /!\('attributionSource' in request\.resource\.data\)/)
})

test("nothing else in the Rules changed: only additions over the published file", () => {
  // Guarded structurally by the diff run at packaging time; here we pin the
  // policies Phase 1 owns.
  assert.match(RULES, /function isWsClientAdmin\(ws\) \{\s*return inWorkspace\(ws\) && role\(\) in \['client_admin', 'manager'\];/)
  assert.match(RULES, /allow delete: if isSuperAdmin\(\);\s*\}\s*\n\s*\/\/ -{10,} clients/)
})

/* --------------------------------- supported Meta states, strictly ------ */

test("ARCHIVED and DELETED are NOT paused; only an empty state is null", () => {
  assert.equal(localStatusFor("ACTIVE"), "active")
  assert.equal(localStatusFor("PAUSED"), "paused")
  assert.notEqual(localStatusFor("ARCHIVED"), "paused")
  assert.notEqual(localStatusFor("DELETED"), "paused")
  assert.equal(localStatusFor("ARCHIVED"), "ended")
  // V3: an unrecognised state is `ended`, not null — it must not leave a
  // stale "active" in place.
  assert.equal(localStatusFor("IN_PROCESS"), "ended")
  assert.equal(localStatusFor(null), null)
})

test("Campañas lists only active and paused, and self-syncs from Meta for admins", () => {
  const live = read("components/campaigns/campaigns-live.tsx")
  assert.match(live, /campaigns\.filter\(\(c\) => c\.status === "active" \|\| c\.status === "paused"\)/)
  assert.match(live, /if \(!canManageCampaignLinks\) return\s*\n\s*void reconcileCampaignLinks/)
  const route = read("app/api/meta/campaign-links/route.ts")
  assert.match(route, /const statuses = await liveStatusesFor\(db, current\)/)
  assert.match(route, /const s = c\.effective_status \?\? c\.status/)
})

test("an unrecognised live state never overwrites a stored one", () => {
  const src = read("lib/meta/campaign-links.ts")
  assert.match(src, /if \(status !== null && current\.status !== status\) patch\.status = status/)
})

/* ======================= V3: unsupported states, attributionSource ====== */

test("any non-empty Meta state other than ACTIVE/PAUSED becomes 'ended'", () => {
  assert.equal(localStatusFor("ACTIVE"), "active")
  assert.equal(localStatusFor("PAUSED"), "paused")
  assert.equal(localStatusFor("CAMPAIGN_PAUSED"), "paused")
  for (const s of ["ARCHIVED", "DELETED", "IN_PROCESS", "WITH_ISSUES", "ADSET_PAUSED", "SOMETHING_NEW"]) {
    assert.equal(localStatusFor(s), "ended", `${s} must not be active or paused`)
    assert.notEqual(localStatusFor(s), "active")
    assert.notEqual(localStatusFor(s), "paused")
  }
})

test("only an empty or missing state yields null", () => {
  assert.equal(localStatusFor(null), null)
  assert.equal(localStatusFor(undefined), null)
  assert.equal(localStatusFor(""), null)
  assert.equal(localStatusFor("   "), null)
})

test("a campaign that leaves ACTIVE does not keep an 'active' mirror", () => {
  // WITH_ISSUES used to fall through to null, which left the stored "active".
  assert.notEqual(localStatusFor("WITH_ISSUES"), "active")
  assert.notEqual(localStatusFor("IN_PROCESS"), "active")
  const src = read("lib/meta/campaign-links.ts")
  assert.match(src, /if \(status !== null && current\.status !== status\) patch\.status = status/)
})

test("a NEW mirror with no known state is not born active", () => {
  const src = read("lib/meta/campaign-links.ts")
  assert.match(src, /status: localStatusFor\(input\.metaStatus\) \?\? "ended"/)
  assert.doesNotMatch(src, /localStatusFor\(input\.metaStatus\) \?\? "active"/)
})

test("'ended' stays out of the normal list and of the attribution selector", () => {
  assert.match(read("components/campaigns/campaigns-live.tsx"), /c\.status === "active" \|\| c\.status === "paused"/)
  assert.match(read("components/leads/edit-lead-dialog.tsx"), /c\.status === "active" \|\| c\.status === "paused"/)
})

test("once Meta reports ACTIVE or PAUSED the mirror is recovered", () => {
  // The reconcile passes the live state through localStatusFor, which now
  // returns a real status, and the patch is applied because it differs.
  assert.equal(localStatusFor("ACTIVE"), "active")
  assert.equal(localStatusFor("PAUSED"), "paused")
  const route = read("app/api/meta/campaign-links/route.ts")
  assert.match(route, /const metaStatus = liveStatuses\.get\(link\.metaCampaignId\) \?\? link\.metaCampaignStatus \?\? null/)
  assert.match(route, /if \(link\.campaignId && \(!metaStatus \|\| metaStatus === \(link\.metaCampaignStatus \?\? null\)\)\) return link/)
})

test("attributionSource: absent is legacy-valid, null is not a value", () => {
  const shape = ruleFunction(RULES, "validLeadShape")
  const run = (data) =>
    evaluate(shape, {
      vars: { request: { resource: { data } }, resource: null },
      fns: {
        optionalString: () => true, optionalBool: () => true, optionalNumber: () => true,
        presentString: () => true, nonEmptyString: () => true,
      },
    })
  const base = { workspaceId: "ws-A", name: "María", phone: "1", assignedToId: "u1", source: "meta", createdAt: "x" }
  assert.equal(run(base), true, "absent → legacy valid")
  for (const v of ["meta", "manual", "web"]) {
    assert.equal(run({ ...base, attributionSource: v }), true, v)
  }
  assert.equal(run({ ...base, attributionSource: null }), false, "explicit null is refused")
  for (const v of ["", "MANUAL", "otro", "landing"]) {
    assert.equal(run({ ...base, attributionSource: v }), false, `${JSON.stringify(v)} is refused`)
  }
})

test("the workspace isolation of manual attribution is untouched", () => {
  assert.match(RULES, /attributedCampaign\(d\)\.workspaceId == r\.workspaceId/)
  assert.match(RULES, /d\.get\('campaignName', ''\) == attributedCampaign\(d\)\.name/)
  assert.match(RULES, /get\(\/databases\/\$\(database\)\/documents\/campaigns\/\$\(d\.campaignId\)\)\.data/)
})

/* ============ V4: guardar campaña y editar canal ======================== */

test("the edit form re-seeds only when a DIFFERENT lead opens", () => {
  // Root cause: leads-view replaces `selected` with a new object on every
  // Firestore snapshot, so depending on `lead` wiped the in-progress edit and
  // the patch came out empty.
  const dlg = read("components/leads/edit-lead-dialog.tsx")
  assert.match(dlg, /\}, \[open, lead\.id, type\]\)/)
  assert.doesNotMatch(dlg, /\}, \[open, lead, type\]\)/)
})

test("the campaign patch carries id, name and manual source together", () => {
  const src = read("lib/firebase/leads.ts")
  const block = src.slice(src.indexOf("if (patch.campaignId !== undefined) {"))
  assert.match(block.slice(0, 300), /data\.campaignId = patch\.campaignId/)
  assert.match(block.slice(0, 300), /data\.campaignName = patch\.campaignId \? \(patch\.campaignName \?\? ""\) : ""/)
  assert.match(block.slice(0, 300), /data\.attributionSource = "manual"/)
})

test("save errors are surfaced, not swallowed", () => {
  const dlg = read("components/leads/edit-lead-dialog.tsx")
  assert.match(dlg, /setFormError\(/)
  assert.match(dlg, /describeError\(/)
})

/* ------------------------------------------- channel: one field, reused - */

test("the channel reuses lead.source and the existing platform list", () => {
  const dlg = read("components/leads/edit-lead-dialog.tsx")
  assert.match(dlg, /React\.useState<Platform>\(lead\.source\)/)
  assert.match(dlg, /PLATFORMS\.map\(\(p\) =>/)
  assert.match(dlg, /PLATFORM_LABELS\[p\]/)
  // Derived from the label map: the two cannot drift.
  assert.match(read("lib/constants.ts"), /export const PLATFORMS = Object\.keys\(PLATFORM_LABELS\) as Platform\[\]/)
})

test("changing the channel does NOT touch the campaign or the Meta trail", () => {
  const src = read("lib/firebase/leads.ts")
  const block = src.slice(src.indexOf("if (patch.source !== undefined) {"), src.indexOf("if (patch.campaignId !== undefined) {"))
  assert.match(block, /data\.source = patch\.source/)
  assert.doesNotMatch(block, /campaignId|attribution/)
  // `attribution` remains frozen for everyone in the Rules.
  assert.match(RULES, /hasAny\(\['workspaceId', 'attribution', 'createdAt', 'clientId', 'webForm'\]\)/)
})

test("an invalid channel is refused in the app and in the Rules", () => {
  assert.match(read("lib/firebase/leads.ts"), /if \(!PLATFORMS\.includes\(patch\.source\)\)/)
  const fn = ruleFunction(RULES, "validPlatform")
  const run = (v) => evaluate(fn, { vars: { v }, methods })
  for (const v of ["meta", "whatsapp", "referral", "organic"]) assert.equal(run(v), true, v)
  for (const v of ["", "META", "telegram", "inventado"]) assert.equal(run(v), false, JSON.stringify(v))
})

test("the Rules platform list matches the app's, value by value", () => {
  const labels = read("lib/constants.ts")
  const map = labels.slice(labels.indexOf("PLATFORM_LABELS: Record<Platform, string> = {"))
  const names = [...map.slice(0, map.indexOf("}")).matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1])
  const list = RULES.match(/function validPlatform\(v\) \{[\s\S]*?\]/)[0]
  assert.ok(names.length >= 10)
  for (const n of names) assert.ok(list.includes(`'${n}'`), `${n} missing from the Rules list`)
})

test("only an admin may correct the channel; Telemarketing cannot", () => {
  const fn = ruleFunction(RULES, "channelChangeIsValid")
  const run = ({ changed, admin, source = "meta" }) =>
    evaluate(fn, {
      // adm = isSuperAdmin() || isWsAdmin(lead workspace), computed once upstream.
      vars: { ck: changed, d: { source }, adm: admin === "super" || admin === "ws" },
      methods,
      fns: {
        validPlatform: (v) => ["meta", "whatsapp"].includes(v),
      },
    })
  assert.equal(run({ changed: ["name"], admin: null }), true, "not touching source is fine for anybody")
  assert.equal(run({ changed: ["source"], admin: "ws" }), true)
  assert.equal(run({ changed: ["source"], admin: "super" }), true)
  assert.equal(run({ changed: ["source"], admin: null }), false, "a rep cannot change the channel")
  assert.equal(run({ changed: ["source"], admin: "ws", source: "inventado" }), false)
  // The rule must actually invoke it in allow update.
  const leadsBlock = RULES.slice(RULES.indexOf("match /leads/{leadId}"))
  assert.match(leadsBlock, /&& channelChangeIsValid\(ck, d, adm\)/)
  // And `source` is not in the rep whitelist either.
  const wl = RULES.match(/function repEditableFields\(\) \{[\s\S]*?\]/)[0]
  assert.ok(!wl.includes("'source'"))
})

test("workspace isolation of attribution is untouched by the channel change", () => {
  assert.match(RULES, /attributedCampaign\(d\)\.workspaceId == r\.workspaceId/)
})

/* ========== V5: prospectos sin leadType (compatibilidad legacy) ========== */
/*
 * NOTE: these evaluate the rule conditions with the CEL interpreter in
 * tests/helpers/cel.mjs. That is NOT Firestore. The end-to-end proof lives in
 * tests/emulator/rules.emulator.test.mjs, which must be run against the
 * emulator — it could not be run where this was written (the emulator JAR
 * comes from storage.googleapis.com, blocked there).
 */

test("every leadType read on the UPDATE path is legacy-tolerant", () => {
  const leadsBlock = RULES.slice(RULES.indexOf("match /leads/{leadId}"), RULES.indexOf("match /leads/{leadId}/activities"))
  const update = leadsBlock.slice(leadsBlock.indexOf("allow update:"), leadsBlock.indexOf("allow delete:"))
  // No direct read survives in the update rule itself…
  assert.doesNotMatch(update, /validLeadType\(request\.resource\.data\.leadType\)/)
  assert.doesNotMatch(update, /stageMatchesType\(request\.resource\.data\.leadType/)
  // The lead type after the write is computed ONCE, legacy-tolerantly, by
  // leadTypeAfterOf(d, r) and passed down as `lta`.
  assert.match(update, /leadUpdateIsValid\(/)
  assert.match(ruleFunction(RULES, "leadUpdateIsValid"), /leadTypeAfterOf\(d, r\), leadTypeBeforeOf\(r\)/)
  // Since the APC-compatible rules, the pipeline check runs only when the
  // write touches it, inside pipelineChangeIsValid().
  assert.match(ruleFunction(RULES, "leadUpdateChecks"), /pipelineChangeIsValid\(ck, d, lta\)/)
  const pipeline = ruleFunction(RULES, "pipelineChangeIsValid")
  assert.match(pipeline, /validLeadType\(lta\)/)
  assert.match(pipeline, /stageMatchesType\(lta, d\.stage\)/)
  // …nor in the helpers the update path calls.
  for (const fn of ["leadUpdateChecks", "closingChangeIsValid", "closingInvariants", "customerLinkOnlyOnRealClose"]) {
    const body = ruleFunction(RULES, fn)
    assert.doesNotMatch(body, /request\.resource\.data\.leadType/, `${fn} still reads the field directly`)
    assert.doesNotMatch(body, /\bd\.leadType\b/, `${fn} still reads the field directly`)
  }
})

test("create stays strict: a new lead must declare its type", () => {
  const leadsBlock = RULES.slice(RULES.indexOf("match /leads/{leadId}"))
  const create = leadsBlock.slice(leadsBlock.indexOf("allow create:"), leadsBlock.indexOf("allow update:"))
  assert.match(create, /validLeadType\(request\.resource\.data\.leadType\)/)
  assert.doesNotMatch(create, /leadTypeAfter\(\)/)
})

test("the default applies only when the field is ABSENT; an invalid value is still refused", () => {
  const after = ruleFunction(RULES, "leadTypeAfterOf")
  // The default now needs the field to be null/absent BEFORE and AFTER, so a
  // valid type cannot be nulled out and silently read as "sales".
  const run = (data, before = {}) =>
    evaluate(after, { vars: { d: data, r: before }, methods })
  assert.equal(run({ stage: "new_lead" }), "sales", "absent before and after → sales")
  assert.equal(run({ leadType: null }, { leadType: null }), "sales", "explicit null on a legacy doc → sales")
  assert.equal(run({ leadType: "recruiting" }), "recruiting", "present → itself")
  assert.equal(run({ leadType: "inventado" }), "inventado", "…and an invalid value is NOT masked")
  assert.equal(run({ leadType: null }, { leadType: "sales" }), null, "nulling a valid type is NOT masked")
  // validLeadType then rejects it.
  const valid = ruleFunction(RULES, "validLeadType")
  assert.equal(evaluate(valid, { vars: { v: "inventado" }, methods }), false)
  assert.equal(evaluate(valid, { vars: { v: "sales" }, methods }), true)
})

test("a legacy lead now passes the two conditions that blocked every update", () => {
  const expr = "validLeadType(leadTypeAfter()) && stageMatchesType(leadTypeAfter(), request.resource.data.stage)"
  const run = (data) =>
    evaluate(expr, {
      vars: { request: { resource: { data } } },
      methods,
      fns: {
        leadTypeAfter: () => data.leadType ?? "sales",
        validLeadType: (v) => ["sales", "recruiting"].includes(v),
        stageMatchesType: (t, s) =>
          t === "sales"
            ? ["new_lead", "contact", "contacted", "interested", "appointment", "follow_up", "sale", "not_interested"].includes(s)
            : String(s).startsWith("rec_"),
      },
    })
  assert.equal(run({ stage: "new_lead" }), true, "legacy lead being archived / scheduled")
  assert.equal(run({ stage: "appointment" }), true, "legacy lead moved by a booking")
  assert.equal(run({ leadType: "sales", stage: "new_lead" }), true)
  assert.equal(run({ leadType: "recruiting", stage: "rec_interview" }), true)
  assert.equal(run({ leadType: "inventado", stage: "new_lead" }), false, "invalid is still refused")
  assert.equal(run({ leadType: "sales", stage: "rec_interview" }), false, "pipelines stay separate")
})

test("role and workspace restrictions are untouched by the legacy default", () => {
  const leadsBlock = RULES.slice(RULES.indexOf("match /leads/{leadId}"))
  assert.match(leadsBlock, /sa \|\| isWsAdmin\(r\.workspaceId\)/)
  assert.match(leadsBlock, /adm\s*\n(\s*\/\/[^\n]*\n)*\s*\|\| \(isWsRep\(r\.workspaceId\)\s*\n\s*&& r\.assignedToId == myUserId\(\)/)
  assert.match(leadsBlock, /ck\.hasOnly\(repEditableFields\(\)\)/)
})

test("the scheduling copy no longer contradicts Fase 3", () => {
  const i18n = read("lib/i18n.ts")
  assert.doesNotMatch(i18n, /Agendar no cambia la etapa/)
  assert.match(i18n, /pasa automáticamente a la etapa de cita/)
})

test("the emulator suite exists and covers both lead shapes and the five actions", () => {
  const emu = read("tests/emulator/rules.emulator.test.mjs")
  for (const needle of ["books a meeting", "archives and restores", "cancels a meeting", "attributes a campaign", "corrects the channel"]) {
    assert.ok(emu.includes(needle), `missing scenario: ${needle}`)
  }
  assert.ok(emu.includes("WITHOUT leadType (legacy)"))
  for (const role of ["super_admin", "client_admin (Distribuidora)", "manager (Asistente)"]) {
    assert.ok(emu.includes(role), `missing role: ${role}`)
  }
  // It must not be picked up by `pnpm test`, which has no emulator.
  assert.doesNotMatch(emu, /^\s*import .*from "\.\.\/helpers/m)
})
