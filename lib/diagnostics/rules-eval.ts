/**
 * TEMPORARY DIAGNOSTIC — server only. Remove with the rest of lib/diagnostics/.
 *
 * Executes a firestore.rules TEXT (the published one, when available) against
 * real documents and the exact writes the browser sent, and reports which
 * top-level condition of each `allow` returns false. Read-only: it evaluates,
 * it never writes and it never decides access for the app.
 *
 * Known limits of the evaluator (reported when they matter):
 *  - path literals are not resolved: `me()`, `leadBefore()`, `leadAfter()`,
 *    `attributedCampaign()` and `linkedCustomer*()` are answered from the real
 *    documents; a bare `exists(...)` on another path is answered `true` and
 *    flagged as a caveat.
 */

import { evaluate, ruleFunction } from "./cel"

export interface ClauseResult {
  expr: string
  value: boolean | null
  error?: string
  inner?: ClauseResult[]
}

export interface WriteEval {
  path: string
  kind: "lead_update" | "activity_create" | "other"
  activityType?: string
  allowed: boolean | null
  error?: string
  clauses: number
  failing: ClauseResult[]
  caveats: string[]
}

export type Doc = Record<string, unknown>

/* ------------------------------------------------------------ text tools -- */

export function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "")
}

/** Text between `header` and its matching closing brace. */
export function extractBlock(text: string, header: string): string | null {
  const start = text.indexOf(header)
  if (start === -1) return null
  const open = text.indexOf("{", start + header.length - 1)
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++
    else if (text[i] === "}") {
      depth--
      if (depth === 0) return text.slice(open + 1, i)
    }
  }
  return null
}

/** Expression of `allow <op>…: if <expr>;` whose operation list contains `op`. */
export function extractAllow(block: string, op: string): string | null {
  const re = /allow\s+([a-z,\s]+):\s*if/g
  let m: RegExpExecArray | null
  // Only the block's own statements: skip nested `match` blocks.
  const own = removeNestedMatches(block)
  while ((m = re.exec(own))) {
    const ops = m[1].split(",").map((s) => s.trim())
    if (!ops.includes(op) && !(op !== "read" && ops.includes("write"))) continue
    let depth = 0
    let quote: string | null = null
    for (let i = re.lastIndex; i < own.length; i++) {
      const c = own[i]
      if (quote) {
        if (c === quote) quote = null
        continue
      }
      if (c === "'" || c === '"') quote = c
      else if (c === "(" || c === "[" || c === "{") depth++
      else if (c === ")" || c === "]" || c === "}") depth--
      else if (c === ";" && depth === 0) return own.slice(re.lastIndex, i).trim()
    }
  }
  return null
}

function removeNestedMatches(block: string): string {
  let out = block
  for (;;) {
    const i = out.indexOf("match /")
    if (i === -1) return out
    const open = out.indexOf("{", i)
    let depth = 0
    let end = -1
    for (let j = open; j < out.length; j++) {
      if (out[j] === "{") depth++
      else if (out[j] === "}") {
        depth--
        if (depth === 0) { end = j; break }
      }
    }
    if (end === -1) return out
    out = out.slice(0, i) + out.slice(end + 1)
  }
}

/** Splits `expr` on a top-level binary operator (`&&` or `||`). */
function splitTopLevel(expr: string, op: "&&" | "||"): { parts: string[]; hasOr: boolean; hasTernary: boolean } {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let last = 0
  let hasOr = false
  let hasTernary = false
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]
    if (quote) {
      if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"') quote = c
    else if (c === "(" || c === "[" || c === "{") depth++
    else if (c === ")" || c === "]" || c === "}") depth--
    else if (depth === 0) {
      if (c === op[0] && expr[i + 1] === op[1]) {
        parts.push(expr.slice(last, i))
        last = i + 2
        i++
      } else if (c === "|" && expr[i + 1] === "|") {
        hasOr = true
        i++
      } else if (c === "?") hasTernary = true
    }
  }
  parts.push(expr.slice(last))
  return { parts: parts.map((x) => x.trim()).filter(Boolean), hasOr: hasOr || op === "||" && parts.length > 1, hasTernary }
}

/** Splits on top-level `&&` only when that preserves meaning. */
export function splitTopLevelAnd(expr: string): string[] {
  const r = splitTopLevel(expr, "&&")
  if (r.hasTernary || (r.hasOr && r.parts.length > 1)) return [expr.trim()]
  return r.parts
}

function unwrapParens(expr: string): string {
  let e = expr.trim()
  while (e.startsWith("(") && e.endsWith(")")) {
    let depth = 0
    let closesAtEnd = true
    for (let i = 0; i < e.length; i++) {
      if (e[i] === "(") depth++
      else if (e[i] === ")") {
        depth--
        if (depth === 0 && i < e.length - 1) { closesAtEnd = false; break }
      }
    }
    if (!closesAtEnd) break
    e = e.slice(1, -1).trim()
  }
  return e
}

/* -------------------------------------------------------------- context -- */

export interface EvalInput {
  rules: string
  uid: string
  membership: Doc | null
  /** Lead as it was BEFORE the batch (Admin read). */
  leadBefore: Doc | null
  /** Lead as it would be AFTER the batch. */
  leadAfter: Doc | null
  leadId: string
  requestTime: Date
  campaign?: Doc | null
  customerAfter?: Doc | null
}

function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val) => (val instanceof Date ? { __ts: val.toISOString() } : val))
}

export function changedTopLevelKeys(before: Doc | null, after: Doc | null): string[] {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])
  return [...keys].filter((k) => stable((before ?? {})[k]) !== stable((after ?? {})[k]))
}

function buildFns(input: EvalInput, vars: Record<string, unknown>, extra: Record<string, (...a: unknown[]) => unknown>, caveats: Set<string>) {
  const params: Record<string, string[]> = {}
  for (const m of input.rules.matchAll(/function\s+(\w+)\(([^)]*)\)/g)) {
    params[m[1]] = m[2].split(",").map((s) => s.trim()).filter(Boolean)
  }
  const prim: Record<string, (...a: unknown[]) => unknown> = {
    signedIn: () => true,
    hasMembership: () => input.membership != null,
    me: () => input.membership,
    leadBefore: () => input.leadBefore,
    leadAfter: () => input.leadAfter,
    leadExistedBefore: () => input.leadBefore != null,
    attributedCampaign: () => input.campaign ?? null,
    linkedCustomerExists: () => input.customerAfter != null,
    linkedCustomer: () => input.customerAfter ?? null,
    exists: () => {
      caveats.add("exists(<ruta>) se respondió true sin resolver la ruta")
      return true
    },
    existsAfter: () => input.leadAfter != null,
    get: () => {
      throw new Error("get(<ruta>) sin resolver")
    },
    getAfter: () => {
      throw new Error("getAfter(<ruta>) sin resolver")
    },
    ...extra,
  }
  const fns: Record<string, (...a: unknown[]) => unknown> = new Proxy({} as Record<string, (...a: unknown[]) => unknown>, {
    has: () => true,
    get: (_t, name: string) => {
      if (name in prim) return prim[name]
      return (...args: unknown[]) => {
        const body = ruleFunction(input.rules, name)
        const v: Record<string, unknown> = { ...vars }
        ;(params[name] ?? []).forEach((p, i) => { v[p] = args[i] })
        return evaluate(body, { vars: v, fns })
      }
    },
  })
  return fns
}

function evalClause(expr: string, ctx: { vars: Record<string, unknown>; fns: unknown }): ClauseResult {
  try {
    return { expr: compact(expr), value: evaluate(expr, ctx) === true }
  } catch (e) {
    return { expr: compact(expr), value: null, error: e instanceof Error ? e.message : String(e) }
  }
}

function compact(expr: string): string {
  const one = expr.replace(/\s+/g, " ").trim()
  return one.length > 220 ? `${one.slice(0, 217)}…` : one
}

/** Evaluates each top-level clause; drills into failing helper calls. */
function drill(expr: string, rules: string, ctx: { vars: Record<string, unknown>; fns: unknown }, depth: number): ClauseResult[] {
  const out: ClauseResult[] = []
  for (const part of splitTopLevelAnd(unwrapParens(expr))) {
    const r = evalClause(part, ctx)
    if (r.value !== true && depth < 5) r.inner = explain(part, rules, ctx, depth + 1)
    out.push(r)
  }
  return out
}

/** Why a false clause is false: its helper body, its conjuncts or each disjunct. */
function explain(part: string, rules: string, ctx: { vars: Record<string, unknown>; fns: unknown }, depth: number): ClauseResult[] | undefined {
  const inner = unwrapParens(part)
  const call = /^(\w+)\(([\s\S]*)\)$/.exec(inner)
  if (call && rules.includes(`function ${call[1]}(`) && balanced(call[2])) {
    try {
      const params = new RegExp(`function\\s+${call[1]}\\(([^)]*)\\)`).exec(rules)?.[1]
        .split(",").map((x) => x.trim()).filter(Boolean) ?? []
      const args = call[2].trim() ? splitArgs(call[2]) : []
      const bound: Record<string, unknown> = {}
      params.forEach((name, i) => { bound[name] = args[i] !== undefined ? evaluate(args[i], ctx) : undefined })
      const sub = { vars: { ...ctx.vars, ...bound }, fns: ctx.fns }
      const failing = drill(ruleFunction(rules, call[1]), rules, sub, depth).filter((x) => x.value !== true)
      return failing.length ? failing : undefined
    } catch {
      return undefined
    }
  }
  const ands = splitTopLevelAnd(inner)
  if (ands.length > 1) {
    const failing = drill(inner, rules, ctx, depth).filter((x) => x.value !== true)
    return failing.length ? failing : undefined
  }
  const ors = splitTopLevel(inner, "||")
  if (!ors.hasTernary && ors.parts.length > 1) {
    // An OR is false only if EVERY branch is false: show why each one is.
    return ors.parts.map((b) => {
      const r = evalClause(b, ctx)
      if (r.value !== true && depth < 5) r.inner = explain(b, rules, ctx, depth + 1)
      return r
    })
  }
  return undefined
}

function balanced(text: string): boolean {
  let depth = 0
  for (const c of text) {
    if (c === "(") depth++
    else if (c === ")") { depth--; if (depth < 0) return false }
  }
  return depth === 0
}

function splitArgs(text: string): string[] {
  const out: string[] = []
  let depth = 0
  let quote: string | null = null
  let last = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quote) { if (c === quote) quote = null; continue }
    if (c === "'" || c === '"') quote = c
    else if (c === "(" || c === "[" || c === "{") depth++
    else if (c === ")" || c === "]" || c === "}") depth--
    else if (c === "," && depth === 0) { out.push(text.slice(last, i)); last = i + 1 }
  }
  out.push(text.slice(last))
  return out.map((x) => x.trim())
}

/* ------------------------------------------------------------ evaluators -- */

export function evaluateLeadUpdate(input: EvalInput, path: string): WriteEval {
  const caveats = new Set<string>()
  const clean = stripComments(input.rules)
  const block = extractBlock(clean, "match /leads/{leadId} {")
  const expr = block ? extractAllow(block, "update") : null
  if (!expr) {
    return { path, kind: "lead_update", allowed: null, error: "no se encontró `allow update` de leads en las reglas", clauses: 0, failing: [], caveats: [] }
  }
  const changed = changedTopLevelKeys(input.leadBefore, input.leadAfter)
  const vars: Record<string, unknown> = {
    request: { auth: { uid: input.uid }, resource: { data: input.leadAfter }, time: input.requestTime },
    resource: { data: input.leadBefore },
    leadId: input.leadId,
    database: "(default)",
  }
  const fns = buildFns({ ...input, rules: clean }, vars, { changedKeys: () => changed }, caveats)
  const ctx = { vars, fns }
  const clauses = drill(expr, clean, ctx, 0)
  const whole = evalClause(expr, ctx)
  return {
    path,
    kind: "lead_update",
    allowed: whole.value,
    ...(whole.error ? { error: whole.error } : {}),
    clauses: clauses.length,
    failing: clauses.filter((c) => c.value !== true),
    caveats: [...caveats],
  }
}

export function evaluateActivityCreate(input: EvalInput, path: string, activity: Doc): WriteEval {
  const caveats = new Set<string>()
  const clean = stripComments(input.rules)
  const block = extractBlock(clean, "match /leads/{leadId}/activities/{activityId} {")
  const expr = block ? extractAllow(block, "create") : null
  const activityType = typeof activity.type === "string" ? activity.type : undefined
  if (!expr) {
    return { path, kind: "activity_create", activityType, allowed: null, error: "no se encontró `allow create` de activities en las reglas", clauses: 0, failing: [], caveats: [] }
  }
  const vars: Record<string, unknown> = {
    request: { auth: { uid: input.uid }, resource: { data: activity }, time: input.requestTime },
    resource: null,
    leadId: input.leadId,
    activityId: path.split("/").pop(),
    database: "(default)",
  }
  const fns = buildFns({ ...input, rules: clean }, vars, {
    // `{}` literal default is outside the evaluator's grammar.
    activityPayload: () => (activity.payload as Doc | undefined) ?? {},
  }, caveats)
  const ctx = { vars, fns }
  const clauses = drill(expr, clean, ctx, 0)
  const whole = evalClause(expr, ctx)
  return {
    path,
    kind: "activity_create",
    activityType,
    allowed: whole.value,
    ...(whole.error ? { error: whole.error } : {}),
    clauses: clauses.length,
    failing: clauses.filter((c) => c.value !== true),
    caveats: [...caveats],
  }
}

/** Deepest false predicates, as "outer › … › leaf = false". */
export function failingLeaves(results: ClauseResult[], prefix = "", acc: string[] = []): string[] {
  for (const r of results) {
    if (r.value === true) continue
    const label = r.expr.length > 90 ? `${r.expr.slice(0, 87)}…` : r.expr
    const path = prefix ? `${prefix} › ${label}` : label
    if (r.inner?.length) failingLeaves(r.inner, path, acc)
    else acc.push(`${path} = ${r.value === null ? `ERROR (${r.error})` : "false"}`)
  }
  return acc
}
