// P0 regression guard.
//
// React requires the same hooks, in the same order, on every render. The sheet
// used to run a `useEffect` AFTER `if (!lead) return null`, so selecting a lead
// (null → object) changed the hook count and React threw "Rendered more hooks
// than during the previous render".
//
// Rendering the real component here would need Firebase, the workspace context
// and a DOM. Instead this parses the source and asserts the structural property
// that makes the crash impossible: the component that owns the hooks has no
// early return before them, and the wrapper that returns early owns none.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const src = readFileSync(join(root, "components/leads/lead-detail-sheet.tsx"), "utf8")

/** Strips comments so prose about hooks is not mistaken for code. */
function code(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n")
}

const wrapper = code(src.slice(src.indexOf("export function LeadDetailSheet("), src.indexOf("function LeadDetailSheetInner(")))
const inner = code(src.slice(src.indexOf("function LeadDetailSheetInner(")))
const HOOK = /\buse[A-Z]\w*\s*\(/g

test("the wrapper decides on a null lead and runs no hooks", () => {
  assert.match(wrapper, /if \(!lead\) return null/)
  assert.equal(wrapper.match(HOOK), null)
})

test("the inner component owns every hook", () => {
  const hooks = inner.match(HOOK) ?? []
  assert.ok(hooks.length >= 12, `expected the hooks to live in the inner component, found ${hooks.length}`)
})

test("no hook runs after an early return inside the inner component", () => {
  const firstReturn = inner.search(/\n\s{2}if \([^\n]*\)\s*return\b/)
  if (firstReturn === -1) return // no early return at all: nothing to check
  const after = inner.slice(firstReturn)
  const offending = after.match(/\n\s{2}(const .*=\s*)?use[A-Z]\w*\s*\(/)
  assert.equal(offending, null, `hook found after an early return: ${offending?.[0]?.trim()}`)
})

test("the inner component never treats the lead as optional", () => {
  assert.doesNotMatch(inner, /\blead\?\./)
})

test("the sheet is still exported under its original name", () => {
  // Callers import { LeadDetailSheet }; splitting the component must not
  // change the public surface.
  assert.match(src, /export function LeadDetailSheet\(/)
  assert.doesNotMatch(src, /export function LeadDetailSheetInner\(/)
})
