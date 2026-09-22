// @ts-nocheck
/**
 * TEMPORARY DIAGNOSTIC — server only. Verbatim copy of tests/helpers/cel.mjs
 * (the evaluator the Rules tests already use), so the diagnostic route can
 * execute the PUBLISHED firestore.rules text against real documents.
 * Remove with the rest of lib/diagnostics/.
 */
// A small evaluator for the subset of CEL that firestore.rules uses here.
//
// It lets the tests EXECUTE a rule's condition against a simulated request
// instead of asserting on its text: `evaluate(condition, ctx)` returns the
// boolean Firestore would compute. It understands the operators these rules
// rely on — is/in/&&/||/!/ternary, .size(), .keys(), .hasAll/hasAny/hasOnly,
// .diff().affectedKeys(), .get(f, default) — plus the helper functions the
// tests supply in `ctx.fns`.
//
// Deliberately small: it is a test aid, never shipped to the browser.

const TRUE = { t: "bool", v: true }

/** Tokenises a CEL expression. */
function tokenize(src) {
  const out = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (/\s/.test(c)) { i++; continue }
    if (c === "'" || c === '"') {
      let j = i + 1, s = ""
      while (j < src.length && src[j] !== c) { s += src[j]; j++ }
      out.push({ k: "str", v: s }); i = j + 1; continue
    }
    if (/[0-9]/.test(c)) {
      let j = i, s = ""
      while (j < src.length && /[0-9.]/.test(src[j])) { s += src[j]; j++ }
      out.push({ k: "num", v: Number(s) }); i = j; continue
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i, s = ""
      while (j < src.length && /[A-Za-z0-9_$]/.test(src[j])) { s += src[j]; j++ }
      out.push({ k: "id", v: s }); i = j; continue
    }
    const three = src.slice(i, i + 2)
    if (["&&", "||", "==", "!=", "<=", ">="].includes(three)) { out.push({ k: "op", v: three }); i += 2; continue }
    out.push({ k: "op", v: c }); i++
  }
  return out
}

/** Recursive-descent parser → a tiny AST. */
function parse(tokens) {
  let p = 0
  const peek = () => tokens[p]
  const eat = (v) => { if (tokens[p] && tokens[p].v === v) { p++; return true } return false }

  function ternary() {
    const cond = or()
    if (eat("?")) {
      const a = ternary()
      if (!eat(":")) throw new Error("expected :")
      const b = ternary()
      return { n: "ternary", cond, a, b }
    }
    return cond
  }
  function or() {
    let l = and()
    while (peek() && peek().v === "||") { p++; l = { n: "or", l, r: and() } }
    return l
  }
  function and() {
    let l = cmp()
    while (peek() && peek().v === "&&") { p++; l = { n: "and", l, r: cmp() } }
    return l
  }
  function cmp() {
    let l = add()
    while (peek() && ["==", "!=", "in", "is", "<", ">", "<=", ">="].includes(peek().v)) {
      const op = peek().v; p++
      l = { n: "cmp", op, l, r: add() }
    }
    return l
  }
  /** `+` binds tighter than a comparison: a == b + c is a == (b + c). */
  function add() {
    let l = unary()
    while (peek() && peek().v === "+") { p++; l = { n: "cmp", op: "+", l, r: unary() } }
    return l
  }
  function unary() {
    if (peek() && peek().v === "!") { p++; return { n: "not", e: unary() } }
    return postfix()
  }
  function postfix() {
    let e = primary()
    for (;;) {
      if (eat(".")) {
        const name = tokens[p].v; p++
        if (eat("(")) {
          const args = []
          if (!eat(")")) { do { args.push(ternary()) } while (eat(",")); if (!eat(")")) throw new Error("expected )") }
          e = { n: "call", target: e, name, args }
        } else e = { n: "field", target: e, name }
      } else if (eat("[")) {
        const idx = ternary()
        if (!eat("]")) throw new Error("expected ]")
        e = { n: "index", target: e, idx }
      } else break
    }
    return e
  }
  function primary() {
    if (eat("(")) { const e = ternary(); if (!eat(")")) throw new Error("expected )"); return e }
    if (eat("[")) {
      const items = []
      if (!eat("]")) { do { items.push(ternary()) } while (eat(",")); if (!eat("]")) throw new Error("expected ]") }
      return { n: "list", items }
    }
    const tk = tokens[p]; p++
    if (tk.k === "str") return { n: "lit", v: tk.v }
    if (tk.k === "num") return { n: "lit", v: tk.v }
    if (tk.k === "id") {
      if (peek() && peek().v === "(") {
        p++
        const args = []
        if (!eat(")")) { do { args.push(ternary()) } while (eat(",")); if (!eat(")")) throw new Error("expected )") }
        return { n: "fn", name: tk.v, args }
      }
      if (tk.v === "true") return { n: "lit", v: true }
      if (tk.v === "false") return { n: "lit", v: false }
      if (tk.v === "null") return { n: "lit", v: null }
      return { n: "var", name: tk.v }
    }
    throw new Error(`unexpected token ${JSON.stringify(tk)}`)
  }

  const ast = ternary()
  return ast
}

const has = (o, k) => o != null && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k)

function evalNode(node, ctx) {
  const ev = (n) => evalNode(n, ctx)
  switch (node.n) {
    case "lit": return node.v
    case "list": return node.items.map(ev)
    case "var": {
      if (has(ctx.vars, node.name)) return ctx.vars[node.name]
      throw new Error(`unknown variable ${node.name}`)
    }
    case "fn": {
      const fn = ctx.fns?.[node.name]
      if (!fn) throw new Error(`unknown function ${node.name}`)
      return fn(...node.args.map(ev))
    }
    case "not": return !ev(node.e)
    case "and": return ev(node.l) && ev(node.r)
    case "or": return ev(node.l) || ev(node.r)
    case "ternary": return ev(node.cond) ? ev(node.a) : ev(node.b)
    case "field": {
      const t = ev(node.target)
      return t == null ? undefined : t[node.name]
    }
    case "index": {
      const t = ev(node.target)
      return t == null ? undefined : t[ev(node.idx)]
    }
    case "cmp": {
      const l = ev(node.l)
      if (node.op === "is") {
        const type = node.r.name ?? node.r.v
        if (type === "string") return typeof l === "string"
        if (type === "bool") return typeof l === "boolean"
        if (type === "number") return typeof l === "number"
        if (type === "list") return Array.isArray(l)
        if (type === "map") return l != null && typeof l === "object" && !Array.isArray(l)
        if (type === "timestamp") return l instanceof Date
        throw new Error(`unknown type ${type}`)
      }
      const r = ev(node.r)
      // CEL sets compare by contents, not by identity.
      const isSet = (v) => v != null && typeof v === "object" && Array.isArray(v.__set)
      const sameSet = (a, b) =>
        a.__set.length === b.__set.length && a.__set.every((x) => b.__set.includes(x))
      if (isSet(l) && isSet(r)) {
        if (node.op === "==") return sameSet(l, r)
        if (node.op === "!=") return !sameSet(l, r)
      }
      switch (node.op) {
        case "==": return l === r
        case "!=": return l !== r
        case "in": return Array.isArray(r) ? r.includes(l) : has(r, l)
        case "<": return l < r
        case ">": return l > r
        case "<=": return l <= r
        case ">=": return l >= r
        case "+": return l + r
        default: throw new Error(`unknown operator ${node.op}`)
      }
    }
    case "call": {
      const t = ev(node.target)
      const args = node.args.map(ev)
      switch (node.name) {
        case "size": return typeof t === "string" || Array.isArray(t) ? t.length : Object.keys(t ?? {}).length
        case "keys": return Object.keys(t ?? {})
        case "hasAll": return args[0].every((k) => (t ?? []).includes(k))
        case "hasAny": return args[0].some((k) => (t ?? []).includes(k))
        case "hasOnly": return (t ?? []).every((k) => args[0].includes(k))
        case "get": return has(t, args[0]) && t[args[0]] !== undefined ? t[args[0]] : args[1]
        case "lower": return String(t).toLowerCase()
        case "trim": return String(t).trim()
        default: {
          const fn = ctx.methods?.[node.name]
          if (fn) return fn(t, ...args)
          throw new Error(`unknown method ${node.name}`)
        }
      }
    }
    default: throw new Error(`unknown node ${node.n}`)
  }
}

/**
 * Firestore path literals (`/databases/$(database)/documents/users/$(id)`) are
 * not CEL expressions the tests care about: every rule that uses one passes it
 * to `exists`/`get`, which the tests stub. They are replaced by a plain string
 * so the tokeniser never sees them.
 */
const PATH_LITERAL = new RegExp(String.raw`/databases/[^()\s$]*(?:\$\([^)]*\)[^()\s$]*)*`, "g")

function stripPaths(expression) {
  return expression.replace(PATH_LITERAL, "'__path__'")
}

export function evaluate(expression, ctx) {
  return evalNode(parse(tokenize(stripPaths(expression))), ctx)
}

/** Extracts the body of a `function name() { return <expr>; }` from the rules. */
export function ruleFunction(rulesText, name) {
  const start = rulesText.indexOf(`function ${name}(`)
  if (start === -1) throw new Error(`rule function ${name} not found`)
  const open = rulesText.indexOf("{", start)
  let depth = 0, i = open
  for (; i < rulesText.length; i++) {
    if (rulesText[i] === "{") depth++
    else if (rulesText[i] === "}") { depth--; if (depth === 0) break }
  }
  const body = rulesText.slice(open + 1, i)
  const ret = body.indexOf("return ")
  const expr = body.slice(ret + 7, body.lastIndexOf(";"))
  // Strip comments inside the expression.
  return expr.replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n")
}

export { TRUE }
