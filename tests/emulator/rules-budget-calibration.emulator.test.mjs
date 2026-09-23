/**
 * DIAGNOSTIC — measures how the official Firestore emulator spends its
 * 1,000-expression budget. It uses its OWN synthetic ruleset and project
 * (`demo-rules-budget`), never firestore.rules, and it never fails: every
 * case prints one line
 *
 *   [budget] <case> → ALLOWED | DENIED | LIMIT
 *
 * so a single workflow run shows, with the real engine:
 *   deny-and-N    a DENIED write whose refusal is decided before an N-node
 *                 `&&` chain: does the engine still evaluate the chain?
 *   deny-or       …the same behind `true || <chain>`
 *   deny-ternary  …the same behind `cond ? true : <chain>`
 *   allow-N       an ALLOWED write that evaluates an N-node chain
 *   deny-calls-M  a DENIED write followed by M calls to a one-literal function
 *
 * Each chain term is `1 == 1` (3 nodes) or `t()`; terms are joined as a
 * balanced tree so nesting depth stays small.
 */
import test from "node:test"
import { initializeTestEnvironment } from "@firebase/rules-unit-testing"
import { doc, setDoc, updateDoc } from "firebase/firestore"

const LIMIT = "maximum of 1000 expressions"

function chain(terms, term) {
  if (terms <= 1) return term
  const a = Math.floor(terms / 2)
  return `(${chain(a, term)} && ${chain(terms - a, term)})`
}

const CASES = []
for (const n of [60, 120, 180, 200, 220, 240, 260, 300]) {
  // nodes ≈ 4 × n: n terms of 3 nodes + (n − 1) joins
  CASES.push([`deny-and-${n * 4}`, `request.resource.data.v == 0 && ${chain(n, "1 == 1")}`])
  CASES.push([`allow-${n * 4}`, `${chain(n, "1 == 1")} && request.resource.data.v == 1`])
}
CASES.push(["deny-or-2000", `request.resource.data.v == 0 && (1 == 1 || ${chain(500, "1 == 1")})`])
CASES.push(["deny-ternary-2000", `request.resource.data.v == 0 && (request.resource.data.v == 1 ? true : ${chain(500, "1 == 1")})`])
for (const m of [100, 200, 250, 300, 330, 400]) {
  // nodes ≈ 3 × m without any per-call overhead
  CASES.push([`deny-calls-${m}`, `request.resource.data.v == 0 && ${chain(m, "t()")}`])
}

const RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function t() { return true; }
${CASES.map(([name, expr], i) => `    match /c${i}/{id} {\n      allow read: if true;\n      allow update: if ${expr};\n    }`).join("\n")}
  }
}
`

let env
let setupError = null

test.before(async () => {
  try {
    env = await initializeTestEnvironment({ projectId: "demo-rules-budget", firestore: { rules: RULES } })
    await env.withSecurityRulesDisabled(async (ctx) => {
      for (let i = 0; i < CASES.length; i++) await setDoc(doc(ctx.firestore(), `c${i}`, "x"), { v: 0 })
    })
  } catch (err) {
    setupError = err
  }
})
test.after(async () => {
  await env?.cleanup()
})

test("expression budget of the official emulator (diagnostic, never fails)", async () => {
  if (setupError) {
    console.log(`[budget] synthetic ruleset not loaded: ${String(setupError?.message ?? setupError).slice(0, 300)}`)
    return
  }
  const db = env.authenticatedContext("calib").firestore()
  for (let i = 0; i < CASES.length; i++) {
    const [name] = CASES[i]
    let outcome
    try {
      await updateDoc(doc(db, `c${i}`, "x"), { v: 1 })
      outcome = "ALLOWED"
    } catch (err) {
      outcome = String(err?.message ?? "").includes(LIMIT) ? "LIMIT" : `DENIED (${err?.code})`
    }
    console.log(`[budget] ${name} → ${outcome}`)
  }
})
