// The scenario linter: what a scenario writer gets wrong (a node that is not there, an expression that does not parse, a variable
// that was never declared, a node nobody can reach, a hub with no way out). Run by tools/dnd-sim.js and by the tests.
//   lint(scenario) -> { errors: [text], warnings: [text] }
(function (D) {
  const asList = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);

  function lint(sc) {
    const errors = [], warnings = [], nodes = sc.nodes || {};
    const err = (w, t) => errors.push(`${w}: ${t}`), warn = (w, t) => warnings.push(`${w}: ${t}`);
    const items = new Set((sc.items || []).map((i) => i.id)), creatures = new Set((sc.creatures || []).map((c) => c.id));
    const vars = new Set(Object.keys(sc.vars || {})), heroVars = new Set(Object.keys(sc.heroVars || {}));
    const edges = new Map(Object.keys(nodes).map((id) => [id, new Set()]));
    if (!nodes[sc.start]) err('start', `no node ${sc.start}`);
    for (const k of ['id', 'title', 'nodes']) if (!sc[k]) err('scenario', `missing ${k}`);

    const expr = (where, src) => {
      if (src === undefined || typeof src === 'boolean') return;
      const bad = D.expr.check(src);
      if (bad) { err(where, `expression "${src}": ${bad}`); return; }
      for (const n of D.expr.names(src)) if (!n.startsWith('me.') && !vars.has(n)) warn(where, `"${src}" reads ${n}, which is not in vars`);
      for (const m of String(src).matchAll(/has\("([^"]+)"\)/g)) if (!items.has(m[1])) err(where, `has("${m[1]}"): no such item`);
      for (const m of String(src).matchAll(/(?:hp|mood)\("([^"]+)"\)/g)) if (!creatures.has(m[1])) err(where, `${m[1]}: no such creature`);
      for (const m of String(src).matchAll(/(?:top|sum)\("([^"]+)"\)/g)) { const [c, f] = m[1].split('.'); if (!(f && creatures.has(c)) && !heroVars.has(m[1]) && m[1] !== 'dealt') warn(where, `top/sum of ${m[1]}: neither a creature's memory nor a hero variable`); }
    };
    const lines = (where, ls) => { for (const l of asList(ls)) { if (l && typeof l === 'object') { expr(where, l.when); if (!l.t) err(where, 'a line without text'); } } };
    const target = (from, where, t) => {
      for (const x of asList(t)) {
        const to = typeof x === 'string' ? x : x && x.go;
        if (x && typeof x === 'object') expr(where, x.when);
        if (!nodes[to]) err(where, `goes to ${to}, which is not a node`); else edges.get(from).add(to);
      }
    };
    const effects = (where, o) => {
      if (!o) return;
      for (const k of Object.keys(o.set || {}).concat(Object.keys(o.add || {}))) if (!vars.has(k)) warn(where, `changes ${k}, which is not in vars`);
      for (const id of asList(o.show).concat(asList(o.hide), asList(o.give))) if (!items.has(id)) err(where, `item ${id} is not in items`);
      for (const k of ['mood', 'respect', 'threat']) for (const id of Object.keys(o[k] || {})) if (!creatures.has(id)) err(where, `${k}: no creature ${id}`);
    };
    const outcome = (from, where, o) => {
      if (!o) return;
      lines(where, o.say); effects(where, o);
      if (o.check) {
        const ck = o.check;
        if (ck.who !== 'luck' && !ck.stat) err(where, 'a check needs a stat (or who: luck)');
        if (!ck.dc) warn(where, 'a check without dc (10 is used)');
        outcome(from, `${where} pass`, ck.pass); outcome(from, `${where} fail`, ck.fail);
      }
      if (o.go !== undefined) target(from, where, o.go);
    };

    for (const [id, n] of Object.entries(nodes)) {
      lines(id, n.say); lines(id, n.hints); effects(`${id} enter`, n.enter);
      if (n.go !== undefined) target(id, `${id} go`, n.go);
      if (n.check) outcome(id, `${id} check`, { check: n.check });
      if (n.fight) {
        for (const f of asList(n.fight.foes)) if (!creatures.has(f)) err(id, `fight: no creature ${f}`);
        for (const k of ['win', 'lose', 'fled', 'escape']) if (n.fight[k] !== undefined) target(id, `${id} fight ${k}`, n.fight[k]);
        if (!n.fight.win) err(id, 'a fight needs win');
        if (!n.fight.lose) warn(id, 'a fight without lose: when everyone falls, it goes to win');
      }
      const chs = n.choices || [];
      const heard = new Map();
      chs.forEach((c, i) => {
        const w = `${id} choice ${i + 1}${c.label ? ` (${c.label})` : ''}`;
        if (!c.hear || !c.hear.length) err(w, 'nothing to hear');
        if (!c.label && !c.quiet) warn(w, 'no label: the narrator cannot offer it');
        expr(w, c.when); outcome(id, w, c); lines(w, c.again);
        for (const p of c.hear || []) { const k = D.intent.norm(p).join(' '); if (heard.has(k)) warn(w, `"${p}" is heard by choice ${heard.get(k) + 1} too`); heard.set(k, i); }
      });
      if (chs.length && !n.fight && !chs.some((c) => c.go !== undefined || (c.check && ((c.check.pass && c.check.pass.go) || (c.check.fail && c.check.fail.go)))))
        warn(id, 'no choice leaves this node');
      if (!chs.length && n.go === undefined && !n.end && !n.fight && !n.check) err(id, 'a dead end: no choices, no go, not an end');
    }
    // who can be reached from the start
    const seen = new Set(), todo = [sc.start];
    while (todo.length) { const id = todo.pop(); if (seen.has(id) || !edges.has(id)) continue; seen.add(id); for (const to of edges.get(id)) todo.push(to); }
    for (const id of Object.keys(nodes)) if (!seen.has(id)) warn(id, 'cannot be reached from the start');
    if (!Object.values(nodes).some((n) => n.end)) err('scenario', 'no ending');
    return { errors, warnings };
  }

  // every voice a scenario uses (for the recordings)
  function voices(sc) {
    const out = new Set(['narrator']);
    const walk = (x) => { if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === 'object') { if (typeof x.v === 'string' && typeof x.t === 'string') out.add(x.v); Object.values(x).forEach(walk); } };
    walk(sc.nodes);
    for (const c of sc.creatures || []) { walk(c.lines); if (c.voice) out.add(c.voice); }
    return [...out];
  }

  D.lint = { lint, voices };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.DND = globalThis.DND || {}));
