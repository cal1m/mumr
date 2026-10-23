// Small, safe expressions for scenarios: conditions ("vhorr.awake && village.trust >= 3") and nothing else. No eval: a tokenizer and
// a parser that know numbers, 'strings', true/false/null, names with dots (a scenario variable), ! && || == != < <= > >= + - * /,
// parentheses and calls of the functions the caller hands in (top("vhorr.threat"), has("bell")). An unknown name is undefined.
//   expr.compile(src) -> (env) => value        env: { get(name), fn: { name: (...args) => value } }
//   expr.check(src) -> null | 'what is wrong'  (for the scenario linter)
//   expr.names(src) -> [names read]
(function (D) {
  const TOKEN = /\s*(?:(\d+(?:\.\d+)?)|'([^']*)'|"([^"]*)"|([A-Za-z_][\w.]*)|(&&|\|\||==|!=|<=|>=|[!<>+\-*/(),]))/y;

  function tokens(src) {
    const out = [];
    TOKEN.lastIndex = 0;
    let at = 0;
    while (at < src.length) {
      if (/^\s*$/.test(src.slice(at))) break;
      TOKEN.lastIndex = at;
      const m = TOKEN.exec(src);
      if (!m) throw new Error(`cannot read "${src.slice(at, at + 12)}"`);
      at = TOKEN.lastIndex;
      if (m[1] !== undefined) out.push({ t: 'num', v: +m[1] });
      else if (m[2] !== undefined || m[3] !== undefined) out.push({ t: 'str', v: m[2] !== undefined ? m[2] : m[3] });
      else if (m[4] !== undefined) out.push({ t: 'name', v: m[4] });
      else out.push({ t: 'op', v: m[5] });
    }
    return out;
  }

  const BIN = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6 };

  function parse(src) {
    const tk = tokens(String(src));
    let i = 0;
    const peek = () => tk[i], next = () => tk[i++];
    const want = (v) => { const t = next(); if (!t || t.v !== v) throw new Error(`expected ${v}`); };
    function primary() {
      const t = next();
      if (!t) throw new Error('unexpected end');
      if (t.t === 'num' || t.t === 'str') return { lit: t.v };
      if (t.t === 'op' && t.v === '(') { const e = expr(0); want(')'); return e; }
      if (t.t === 'op' && (t.v === '!' || t.v === '-')) return { un: t.v, a: primary() };
      if (t.t === 'name') {
        if (t.v === 'true' || t.v === 'false') return { lit: t.v === 'true' };
        if (t.v === 'null') return { lit: null };
        if (peek() && peek().v === '(') {
          next();
          const args = [];
          if (!(peek() && peek().v === ')')) { do { args.push(expr(0)); } while (peek() && peek().v === ',' && next()); }
          want(')');
          return { call: t.v, args };
        }
        return { name: t.v };
      }
      throw new Error(`unexpected ${t.v}`);
    }
    function expr(min) {
      let a = primary();
      for (;;) {
        const t = peek();
        if (!t || t.t !== 'op' || !BIN[t.v] || BIN[t.v] <= min) return a;
        next();
        a = { op: t.v, a, b: expr(BIN[t.v]) };
      }
    }
    const tree = expr(0);
    if (i < tk.length) throw new Error(`unexpected ${tk[i].v}`);
    return tree;
  }

  function run(n, env) {
    if ('lit' in n) return n.lit;
    if (n.name) return env.get(n.name);
    if (n.call) {
      const f = env.fn && env.fn[n.call];
      if (typeof f !== 'function') throw new Error(`no function ${n.call}`);
      return f(...n.args.map((a) => run(a, env)));
    }
    if (n.un === '!') return !run(n.a, env);
    if (n.un === '-') return -run(n.a, env);
    if (n.op === '&&') return run(n.a, env) && run(n.b, env);
    if (n.op === '||') return run(n.a, env) || run(n.b, env);
    const a = run(n.a, env), b = run(n.b, env);
    switch (n.op) {
      case '==': return a === b;
      case '!=': return a !== b;
      case '<': return a < b;
      case '<=': return a <= b;
      case '>': return a > b;
      case '>=': return a >= b;
      case '+': return (a || 0) + (b || 0);
      case '-': return (a || 0) - (b || 0);
      case '*': return (a || 0) * (b || 0);
      case '/': return b ? (a || 0) / b : 0;
    }
    throw new Error('bad tree');
  }

  const cache = new Map();
  function compile(src) {
    if (typeof src === 'boolean') return () => src;
    if (!cache.has(src)) { const tree = parse(src); cache.set(src, (env) => run(tree, env)); }
    return cache.get(src);
  }
  function check(src) { try { parse(src); return null; } catch (e) { return e.message; } }
  function names(src) {
    const out = [];
    const walk = (n) => { if (!n) return; if (n.name) out.push(n.name); for (const k of ['a', 'b']) walk(n[k]); for (const a of n.args || []) walk(a); };
    walk(parse(src));
    return out;
  }

  D.expr = { compile, check, names };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.DND = globalThis.DND || {}));
