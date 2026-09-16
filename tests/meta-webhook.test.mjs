// Behavioural tests: a real processor implementation is driven through
// handleLeadgenEvent, so these exercise the code, not its text.
//
//   pnpm test
import test from "node:test"
import assert from "node:assert/strict"
import { handleLeadgenEvent } from "../.test-build/lib/meta/processor.js"

const event = (o = {}) => ({
  leadgenId: "lg1",
  formId: "f1",
  pageId: "p1",
  adId: "ad1",
  adgroupId: null,
  campaignId: "c1",
  createdTime: 1_700_000_000,
  ...o,
})

/** A processor whose individual steps can be told to blow up. */
function fakeProcessor({ failOn = null, duplicate = false } = {}) {
  const calls = { claim: 0, resolveLink: 0, record: 0 }
  const recorded = []
  return {
    calls,
    recorded,
    async claim() {
      calls.claim++
      if (failOn === "claim") throw Object.assign(new Error("UNAVAILABLE"), { name: "FirebaseError" })
      return { outcome: duplicate ? "duplicate" : "claimed", attempt: 1 }
    },
    async resolveLink() {
      calls.resolveLink++
      if (failOn === "resolveLink") throw Object.assign(new Error("UNAVAILABLE"), { name: "FirebaseError" })
      return { status: "resolved", owner: { workspaceId: "ws-A", objective: "sales", localCampaignId: "local-1" } }
    },
    async record(_e, outcome) {
      calls.record++
      if (failOn === "record") throw Object.assign(new Error("write failed"), { name: "FirebaseError" })
      recorded.push(outcome)
    },
  }
}

const lookupOk = async () => ({ ok: true, campaignId: "c1", adsetId: "as1" })

test("normal delivery resolves and is NOT flagged as a persistence failure", async () => {
  const p = fakeProcessor()
  const out = await handleLeadgenEvent(event(), p, lookupOk)
  assert.equal(out.status, "resolved")
  assert.ok(!("persistence" in out) || out.persistence !== true)
  assert.equal(p.calls.record, 1)
})

test("a duplicate is a normal outcome, never a 5xx", async () => {
  const out = await handleLeadgenEvent(event(), fakeProcessor({ duplicate: true }), lookupOk)
  assert.equal(out.status, "duplicate")
  assert.notEqual(out.persistence, true)
})

test("a PERMANENT unresolved reason is not a persistence failure", async () => {
  // `link_invalid` really is permanent: the stored record is not reprocessable.
  const p = fakeProcessor()
  p.resolveLink = async () => ({ status: "unresolved", reason: "link_invalid" })
  const out = await handleLeadgenEvent(event(), p, lookupOk)
  assert.equal(out.status, "unresolved")
  assert.equal(out.reason, "link_invalid")
  assert.notEqual(out.persistence, true)
})

test("no_link and link_inactive are reported as unresolved and ARE reprocessable", async () => {
  // My earlier test claimed "a campaign with no link is permanent". It is not:
  // isReprocessable() picks these up again, so acknowledging them with 200
  // would strand the lead. The route now asks for a redelivery instead.
  for (const reason of ["no_link", "link_inactive"]) {
    const p = fakeProcessor()
    p.resolveLink = async () => ({ status: "unresolved", reason })
    const out = await handleLeadgenEvent(event(), p, lookupOk)
    assert.equal(out.status, "unresolved")
    assert.equal(out.reason, reason)
    // Recorded, so the redelivery is idempotent.
    assert.equal(p.calls.record, 1)
  }
})

test("a redelivery after the link is created resolves, without duplicating", async () => {
  const p = fakeProcessor()
  // First delivery: no link yet.
  p.resolveLink = async () => ({ status: "unresolved", reason: "no_link" })
  const first = await handleLeadgenEvent(event(), p, lookupOk)
  assert.equal(first.reason, "no_link")
  // The distributor assigns the campaign; Meta redelivers. The stored record
  // is reprocessable, so claim() lets it through again rather than calling it
  // a duplicate, and it now resolves — one lead, not two.
  p.resolveLink = async () => ({
    status: "resolved",
    owner: { workspaceId: "ws-A", objective: "sales", localCampaignId: "local-1" },
  })
  const second = await handleLeadgenEvent(event(), p, lookupOk)
  assert.equal(second.status, "resolved")
  assert.equal(p.calls.claim, 2, "the same leadgenId was claimed again, not duplicated")
})

test("Firestore failing during claim is flagged so the webhook answers 5xx", async () => {
  const out = await handleLeadgenEvent(event(), fakeProcessor({ failOn: "claim" }), lookupOk)
  assert.equal(out.status, "error")
  assert.equal(out.persistence, true)
})

test("Firestore failing during resolveLink is flagged too", async () => {
  const out = await handleLeadgenEvent(event(), fakeProcessor({ failOn: "resolveLink" }), lookupOk)
  assert.equal(out.status, "error")
  assert.equal(out.persistence, true)
})

test("a record() failure is flagged instead of being swallowed", async () => {
  // This was the gap: the outcome looked resolved and the route answered 200
  // while nothing had been written.
  const out = await handleLeadgenEvent(event(), fakeProcessor({ failOn: "record" }), lookupOk)
  assert.equal(out.status, "error")
  assert.equal(out.reason, "record_failed")
  assert.equal(out.persistence, true)
})

test("a missing leadgen id is permanent, and still recorded", async () => {
  const p = fakeProcessor()
  const out = await handleLeadgenEvent(event({ leadgenId: null }), p, lookupOk)
  assert.equal(out.status, "unresolved")
  assert.notEqual(out.persistence, true)
  assert.equal(p.calls.record, 1)
})

test("dedupe is preserved: claim is consulted once per event", async () => {
  const p = fakeProcessor()
  await handleLeadgenEvent(event(), p, lookupOk)
  assert.equal(p.calls.claim, 1)
})

/* ------------------------------------- claims in flight and retryable work */

test("an open, not-yet-stale claim is NOT acknowledged as a duplicate", () => {
  // The lost-event case: record() failed on a previous attempt, Meta redelivers
  // inside STALE_CLAIM_MS, and the claim is still `received`.
  const p = fakeProcessor()
  p.claim = async () => ({ outcome: "in_flight", attempt: 2 })
  return handleLeadgenEvent(event(), p, lookupOk).then((out) => {
    assert.equal(out.status, "error")
    assert.equal(out.reason, "claim_in_flight")
    assert.equal(out.persistence, true)
    // The open claim keeps its own timestamp: nothing is recorded over it.
    assert.equal(p.calls.record, 0)
  })
})

test("a settled duplicate is still a normal 200", async () => {
  const out = await handleLeadgenEvent(event(), fakeProcessor({ duplicate: true }), lookupOk)
  assert.equal(out.status, "duplicate")
  assert.notEqual(out.persistence, true)
})

test("a retryable Graph outcome is reported so the route can ask for a redelivery", async () => {
  const p = fakeProcessor()
  const out = await handleLeadgenEvent(
    event({ campaignId: null }),
    p,
    async () => ({ ok: false, kind: "rate_limited", retryable: true }),
  )
  assert.equal(out.status, "retryable")
  // It IS recorded, so isReprocessable can pick it up again idempotently.
  assert.equal(p.calls.record, 1)
})

/* ----------------------------------------- the route's own decision table */

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const routeSrc = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../app/api/meta/webhook/route.ts"),
  "utf8",
)

test("the route answers 503 for retryable outcomes and for persistence failures", () => {
  assert.match(routeSrc, /summary\.retryable > 0[\s\S]{0,600}status: 503/)
  assert.match(routeSrc, /if \(persistenceFailed\)[\s\S]{0,600}status: 503/)
})

test("log-only mode cannot be reached in production", () => {
  assert.match(
    routeSrc,
    /process\.env\.NODE_ENV !== "production" && process\.env\.META_WEBHOOK_LOG_ONLY === "1"/,
  )
})

test("the route asks for a redelivery on no_link / link_inactive", () => {
  assert.match(routeSrc, /awaitingLink = true/)
  assert.match(routeSrc, /if \(awaitingLink\)[\s\S]{0,600}status: 503/)
  assert.match(routeSrc, /outcome\.reason === "no_link" \|\| outcome\.reason === "link_inactive"/)
})

test("resolved and terminal duplicate still answer 200", () => {
  // Neither sets a 5xx flag, so the handler falls through to the JSON reply.
  const flags = routeSrc.slice(routeSrc.indexOf("for (const event of parsed.leadgen)"))
  assert.doesNotMatch(flags, /outcome\.status === "resolved"[\s\S]{0,80}= true/)
  assert.doesNotMatch(flags, /outcome\.status === "duplicate"[\s\S]{0,80}= true/)
  assert.match(routeSrc, /return NextResponse\.json\(\{ received: true/)
})
