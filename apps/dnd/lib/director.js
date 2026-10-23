// The DIRECTOR: the game master, run by the host on the PC (host.js). It holds the truth of the game (which scenario, which node of
// it, the variables, the heroes' wounds, the creatures and their memory, the fight) and publishes it as document events (game.js).
// Players only speak and act; everything random and every result is worked out here (design, section 3). No network and no DOM: the
// host hands it `emit` and a clock, a test calls it directly.
//
//   new Director({ emit(e), now() (ms), rng, store: { load() -> saved | null, save(saved) }, log(text), scenarios })
//   online()                         (re)publish everything (the host joined the server)
//   join({ id, name, cls }, slot)    a player's hero comes, or comes back;   left(slot)   its page went
//   heard(heroId, text)              a player said something (speech recognition, typed, or the game master typing for them)
//   act(heroId, what, args)          take / give / drop / use an item
//   move(heroId, x, y)               where a hero stands (metres, common frame)
//   gm(cmd)                          the game master's buttons: start, goto, set, heard, choose, say, hint, pause, resume, next, heal, end
//   tick()                           a few times a second: timers, hints after silence, creatures turning
//
// A scenario (scenarios/*.js) is a tree of nodes; see scenarios/README.md for the format.
(function (D) {
  const R = () => D.rules, X = () => D.expr, I = () => D.intent, C = () => D.creature;
  const HINT_AFTER = 60;           // s of silence before the narrator offers the choices (scenario: hintAfter)
  const TURN_WAIT = 45;            // s a hero has for their turn in a fight before they hesitate
  const CONFIRM_WAIT = 20;         // s for a yes or a no; silence is a yes
  const FOE_PAUSE = 1.5;           // s after the narrator has finished before a creature acts
  const MAX_HOPS = 25;             // nodes entered in a row without a stop: the scenario loops

  const COMBAT = [
    { id: 'attack', hear: ['attack', 'strike', 'hit', 'shoot', 'stab', 'slash', 'swing', 'fire at', 'cast', 'charge', 'kill', 'spark'] },
    { id: 'defend', hear: ['defend', 'block', 'dodge', 'take cover', 'hide', 'brace', 'shield up', 'wait'] },
    { id: 'guard', hear: ['guard', 'protect', 'cover', 'stand in front'] },
    { id: 'ward', hear: ['ward', 'shield us', 'shimmer'] },
    { id: 'mend', hear: ['heal', 'mend', 'tend', 'patch up', 'help'] },
    { id: 'potion', hear: ['drink', 'potion'] },
    { id: 'flee', hear: ['run', 'flee', 'retreat', 'escape', 'get out'] },
  ];

  const asList = (x) => (x === undefined || x === null ? [] : Array.isArray(x) ? x : [x]);

  class Director {
    constructor(opts = {}) {
      this.emitFn = opts.emit || (() => {});
      this.now = opts.now || (() => Date.now());
      this.rnd = opts.rng || R().rng(Date.now() & 0xffffffff);
      this.store = opts.store || null;
      this.logFn = opts.log || (() => {});
      this.scenarios = opts.scenarios || D.scenarios || {};
      this.timers = [];
      this.quietUntil = 0;           // ms: the narrator is speaking until then
      this.lastHeard = this.now();
      this.camp = { heroes: {}, memory: {}, history: [] };
      this.st = this._blank();
      const saved = this.store && this.store.load();
      if (saved && saved.camp) { this.camp = saved.camp; if (saved.st) this.st = Object.assign(this._blank(), saved.st); }
      for (const h of Object.values(this.st.heroes)) h.here = false;          // (whoever is here says so again)
    }
    _blank() { return { scenario: null, node: null, vars: {}, hv: {}, heroes: {}, creatures: {}, items: {}, combat: null, done: {}, ending: null, paused: false, pending: null, hintIx: 0, hops: 0 }; }
    get sc() { return this.scenarios[this.st.scenario] || null; }
    get nodeDef() { return this.sc && this.st.node ? this.sc.nodes[this.st.node] : null; }
    heroes() { return Object.values(this.st.heroes); }
    present() { return this.heroes().filter((h) => h.here); }
    standing() { return this.present().filter((h) => !h.down); }
    log(t) { this.logFn(t); this.emit({ k: 'note', t, at: Date.now() }); }
    emit(e) { this.emitFn(e); }

    // ---- publishing
    online() {
      this.pubWorld();
      for (const h of this.heroes()) this.pubHero(h);
      for (const c of Object.values(this.st.creatures)) this.pubCreature(c);
      for (const it of Object.values(this.st.items)) this.emit({ k: 'item', id: it.id, item: it });
      this.emit({ k: 'combat', combat: this.st.combat });
      if (this.st.combat) this._turn(true);
    }
    pubWorld() {
      const sc = this.sc, n = this.nodeDef;
      this.emit({ k: 'world', world: {
        scenario: this.st.scenario, title: sc ? sc.title : null, node: this.st.node, act: n && n.act ? n.act : this._act(), scene: n && n.scene ? n.scene : null,
        room: sc ? sc.room || { w: 4, d: 3 } : { w: 4, d: 3 }, vars: this.st.vars, hv: this.st.hv, ending: this.st.ending, paused: this.st.paused,
        pending: this.st.pending ? { label: this.st.pending.label, by: this.st.pending.by } : null,
        choices: this.options().map((c) => ({ label: c.label || c.hear[0], go: typeof c.go === 'string' ? c.go : null, check: !!c.check })),
        nodes: sc ? Object.keys(sc.nodes) : [],
        list: Object.values(this.scenarios).map((s) => ({ id: s.id, title: s.title, minutes: s.minutes, blurb: s.blurb })),
        history: this.camp.history.slice(-10) } });
      this._save();
    }
    _act() { return this.st.act || null; }
    pubHero(h) { this.camp.heroes[h.id] = h; this.emit({ k: 'hero', id: h.id, hero: h }); this._save(); }
    pubCreature(c) { this.emit({ k: 'creature', id: c.id, creature: C().view(c) }); c._pubAt = this.now(); }
    _save() { if (this.store) { for (const c of Object.values(this.st.creatures)) this.camp.memory[c.id] = c.mem; this.store.save({ camp: this.camp, st: this.st }); } }

    // ---- narration
    _fill(t, ctx) {
      return String(t).replace(/\{(\w+)(?::([\w.]+))?\}/g, (m, k, arg) => {
        if (k === 'top') { const h = this._top(arg); return h ? h.name : 'someone'; }
        if (k === 'heroes') return this._names(this.standing());
        if (ctx && ctx[k] !== undefined && ctx[k] !== null) return ctx[k];
        return m;
      });
    }
    _names(hs) { const n = hs.map((h) => h.name); return n.length <= 1 ? n.join('') : `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`; }
    // lines: a string, { t, v, when } or a list of those; ctx fills the {braces}
    say(lines, ctx = {}) {
      const out = [];
      for (const l of asList(lines)) {
        const line = typeof l === 'string' ? { t: l } : l;
        if (!line || !line.t) continue;
        if (line.when !== undefined && !this.test(line.when, ctx.heroId)) continue;
        let t = this._fill(line.t, ctx);
        t = t.charAt(0).toUpperCase() + t.slice(1);
        const v = line.v || 'narrator';
        out.push({ t, v, id: D.voice.id({ t, v }) });
      }
      if (!out.length) return;
      const start = Math.max(this.now(), this.quietUntil);
      this.quietUntil = start + out.reduce((s, l) => s + D.voice.seconds(l) * 1000, 0);
      this.emit({ k: 'say', lines: out, at: Date.now() });
    }
    sayStock(key, ctx) { const v = D.lines[key]; if (v) this.say(v[Math.floor(this.rnd() * v.length)], ctx); }

    // ---- expressions
    _env(heroId) {
      const self = this;
      return {
        get(name) {
          if (name.startsWith('me.')) { const hv = self.st.hv[heroId] || {}; return hv[name.slice(3)]; }
          return self.st.vars[name];
        },
        fn: {
          top: (name) => { const h = self._top(name); return h ? self._hv(h.id, name) : 0; },
          sum: (name) => self.heroes().reduce((s, h) => s + (self._hv(h.id, name) || 0), 0),
          has: (item) => { const it = self.st.items[item]; return !!(it && it.holder); },
          heroes: () => self.present().length,
          standing: () => self.standing().length,
          hp: (id) => { const c = self.st.creatures[id]; return c ? c.hp / c.maxHp : 0; },
          mood: (id) => { const c = self.st.creatures[id]; return c ? c.mood : null; },
          last: () => !!self.st.lastOk,
          visited: (node) => !!self.st.done[`@${node}`],
        },
      };
    }
    // a hero's value: a creature's memory ("vhorr.threat") or the scenario's per-hero variable
    _hv(heroId, name) {
      const dot = name.indexOf('.'), c = dot > 0 ? this.st.creatures[name.slice(0, dot)] : null;
      if (c) { const m = c.mem[heroId]; return m ? m[name.slice(dot + 1)] || 0 : 0; }
      return (this.st.hv[heroId] || {})[name] || 0;
    }
    _top(name) {
      let best = null, bv = -Infinity;
      for (const h of this.present()) { const v = this._hv(h.id, name); if (v > bv) { bv = v; best = h; } }
      return bv > 0 ? best : null;
    }
    test(src, heroId) {
      if (src === undefined) return true;
      try { return !!X().compile(src)(this._env(heroId)); } catch (e) { this.log(`expression "${src}": ${e.message}`); return false; }
    }

    // ---- heroes and their things
    join(req, slot) {
      if (!req || !req.id) return;
      let h = this.st.heroes[req.id] || this.camp.heroes[req.id];
      const fresh = !h;
      if (!h || (req.cls && req.cls !== h.cls)) h = Object.assign(R().makeHero(req), h ? { deeds: h.deeds } : {});
      if (req.name) h.name = String(req.name).slice(0, 24);
      h.here = true; h.slot = slot === undefined ? null : slot;
      this.st.heroes[h.id] = h;
      this.pubHero(h);
      this.log(`${h.name} (${h.cls}) is here${fresh ? ', new' : ''}`);
      if (fresh && this.st.scenario && !this.st.ending) this.sayStock('joined', { hero: h.name, cls: R().classOf(h).name });
    }
    left(slot) {
      for (const h of this.heroes()) if (h.here && h.slot === slot) { h.here = false; this.pubHero(h); this.log(`${h.name} left`); }
    }
    move(heroId, x, y) {
      const h = this.st.heroes[heroId];
      if (!h || !Number.isFinite(x) || !Number.isFinite(y)) return;
      h.x = Math.round(x * 100) / 100; h.y = Math.round(y * 100) / 100;
      this.emit({ k: 'hero', id: h.id, hero: h });
    }
    act(heroId, what, args = {}) {
      const h = this.st.heroes[heroId], it = this.st.items[args.item];
      if (!h || !it) return;
      if (what === 'take' && it.shown && !it.holder) { this._give(it, h); this.sayStock('taken', { hero: h.name, item: it.name }); this._react('take', it, h); }
      else if (what === 'give' && it.holder === h.id && this.st.heroes[args.to]) { const to = this.st.heroes[args.to]; this._give(it, to); this.sayStock('given', { hero: h.name, item: it.name, target: to.name }); }
      else if (what === 'drop' && it.holder === h.id) { it.holder = null; it.x = h.x; it.y = h.y; this.emit({ k: 'item', id: it.id, item: it }); this._react('drop', it, h); }
      else if (what === 'use' && it.holder === h.id && it.heal) this._drink(h, it);
      this.pubWorld();
    }
    _give(it, h) { it.holder = h.id; it.shown = true; this.emit({ k: 'item', id: it.id, item: it }); }
    // a scenario may react to an item being taken or put down: node.on: { take: { bell: outcome } }
    _react(what, it, h) {
      const n = this.nodeDef, o = n && n.on && n.on[what] && n.on[what][it.id];
      if (o) this._outcome(o, h);
    }
    _drink(h, it) {
      const n = R().roll(it.heal, this.rnd).total, was = h.down;
      h.hp = Math.min(h.maxHp, h.hp + n); h.down = h.hp <= 0;
      it.holder = null; it.shown = false; it.used = true;
      this.emit({ k: 'item', id: it.id, item: it });
      this.sayStock('potion', { hero: h.name, item: it.name });
      if (was && !h.down) this.sayStock('up', { hero: h.name });
      this.pubHero(h);
    }

    // ---- the story
    start(id) {
      const sc = this.scenarios[id];
      if (!sc) { this.log(`no scenario ${id}`); return; }
      this.timers = []; this.quietUntil = 0;
      const keep = this.st.heroes;
      this.st = this._blank();
      this.st.heroes = keep;
      this.st.scenario = id;
      this.st.vars = Object.assign({}, sc.vars || {});
      for (const h of this.heroes()) {
        Object.assign(h, { hp: h.maxHp, down: false, uses: R().classOf(h).gift.uses, items: [] });
        this.st.hv[h.id] = Object.assign({}, sc.heroVars || {});
        this.pubHero(h);
      }
      for (const def of sc.creatures || []) {
        const c = C().make(Object.assign({}, def, { hp: def.hp + (def.hpPerHero || 0) * Math.max(1, this.present().length) }), this.camp.memory[def.id]); c.lines = def.lines || {}; this.st.creatures[c.id] = c; this.pubCreature(c);
      }
      for (const def of sc.items || []) {
        const it = { id: def.id, name: def.name, kind: def.kind || 'thing', shown: !!def.shown, holder: null, x: def.at ? def.at[0] : null, y: def.at ? def.at[1] : null, heal: def.heal || null };
        this.st.items[it.id] = it; this.emit({ k: 'item', id: it.id, item: it });
      }
      this.emit({ k: 'combat', combat: null });
      this.log(`scenario ${sc.title} starts`);
      this.enter(sc.start);
    }
    // the game master ends it, or another starts: what was shown is dropped
    stop() {
      for (const id of Object.keys(this.st.items)) this.emit({ k: 'item', id, drop: true });
      for (const id of Object.keys(this.st.creatures)) this.emit({ k: 'creature', id, drop: true });
      const keep = this.st.heroes;
      this.st = this._blank(); this.st.heroes = keep; this.timers = [];
      this.emit({ k: 'combat', combat: null });
      this.pubWorld();
    }

    enter(id, hero) {
      const sc = this.sc, n = sc && sc.nodes[id];
      if (!n) { this.log(`no node ${id}`); return; }
      if (this.st.combat) { this.st.combat = null; this.timers = []; this._pubCombat(); }
      if (++this.st.hops > MAX_HOPS) { this.log(`stopped at ${id}: too many nodes in a row (a loop in the scenario?)`); return; }
      this.st.node = id; this.st.hintIx = 0; this.st.done[`@${id}`] = true;
      if (n.act) this.st.act = n.act;
      this.lastHeard = this.now();
      this.log(`node ${id}`);
      const ctx = this._ctx(hero);
      this._effects(n.enter, hero);
      this.say(n.say, ctx);
      if (n.end) { this._end(id, n); return; }
      if (n.fight) { this.pubWorld(); this._fight(n.fight); return; }
      if (n.check) { this._check(n.check, hero); return; }
      if (n.go !== undefined && !(n.choices && n.choices.length)) { this.go(n.go, hero); return; }
      this.st.hops = 0;
      this.pubWorld();
    }
    go(target, hero) {
      for (const t of asList(target)) {
        if (typeof t === 'string') { this.enter(t, hero); return; }
        if (t && (t.when === undefined || this.test(t.when, hero && hero.id))) { this.enter(t.go, hero); return; }
      }
      this.pubWorld();
    }
    _ctx(hero) { return { hero: hero ? hero.name : this._names(this.standing()) || 'someone', heroId: hero ? hero.id : null }; }
    _end(id, n) {
      this.st.ending = { id, title: n.end.title || id };
      this.camp.history.push({ scenario: this.st.scenario, ending: this.st.ending.title, at: new Date().toISOString(), heroes: this.present().map((h) => h.name) });
      this.st.combat = null; this.emit({ k: 'combat', combat: null });
      this.log(`the end: ${this.st.ending.title}`);
      this.pubWorld();
    }

    // the choices open at this node now
    options() {
      const n = this.nodeDef;
      if (!n || this.st.ending) return [];
      return (n.choices || []).filter((c, i) => (c.when === undefined || this.test(c.when)) && !(c.once && this.st.done[`${this.st.node}#${i}`] && !c.again));
    }
    choose(c, hero, forced) {
      if (c.confirm && !forced) {
        this.st.pending = { ix: this.nodeDef.choices.indexOf(c), node: this.st.node, by: hero ? hero.name : null, heroId: hero ? hero.id : null, label: c.label, at: this.now() };
        this.sayStock('confirm', { hero: hero ? hero.name : 'Someone', label: c.label || 'do that' });
        this.pubWorld();
        return;
      }
      const key = `${this.st.node}#${this.nodeDef.choices.indexOf(c)}`;
      if (c.once && this.st.done[key]) { this.say(c.again, this._ctx(hero)); return; }
      this.st.done[key] = true;
      this.log(`${hero ? hero.name : 'the game master'}: ${c.label || c.hear[0]}`);
      this.st.hops = 0;
      this._outcome(c, hero);
    }
    // say, change, check, go: a choice, the pass or fail of a check, an item's reaction
    _outcome(o, hero) {
      const node = this.st.node;
      this.say(o.say, this._ctx(hero));
      this._effects(o, hero);
      if (o.check) { this._check(o.check, hero); return; }
      if (o.go !== undefined) this.go(o.go, hero);
      else if (this.st.node === node) this.pubWorld();
    }
    _check(ck, hero) {
      let who = hero || this.standing()[0] || null;
      const stat = ck.stat || null;
      if (ck.who === 'best' && stat) who = this.standing().reduce((a, b) => (R().stat(b, stat) > R().stat(a, stat) ? b : a), who);
      let ok;
      if (ck.who === 'group' && stat) {
        const rs = this.standing().map((h) => this._roll(h, stat, ck.dc, ck.label));
        ok = rs.filter((r) => r.ok).length * 2 >= rs.length;
      } else {
        const r = this._roll(ck.who === 'luck' ? null : who, stat, ck.dc, ck.label, ck.edge);
        ok = r.ok;
      }
      this.st.lastOk = ok;
      this._outcome((ok ? ck.pass : ck.fail) || {}, who);
    }
    _roll(h, stat, dc, label, edge = 0) {
      const charm = h && h.cls === 'wanderer' && stat === 'heart' ? 1 : 0;
      const c = R().check({ bonus: h && stat ? R().stat(h, stat) : 0, dc: dc || 10, rng: this.rnd, edge: edge || charm });
      this.emit({ k: 'roll', roll: { who: h ? h.name : 'the world', what: label || stat || 'luck', d20: c.d20, bonus: c.bonus, dc: c.dc, total: c.total, ok: c.ok, tier: R().tier(c) }, at: Date.now() });
      return c;
    }
    _effects(o, hero) {
      if (!o) return;
      for (const [k, v] of Object.entries(o.set || {})) this.st.vars[k] = v;
      for (const [k, v] of Object.entries(o.add || {})) this.st.vars[k] = (this.st.vars[k] || 0) + v;
      if (hero) for (const [k, v] of Object.entries(o.me || {})) { const hv = this.st.hv[hero.id] = this.st.hv[hero.id] || {}; hv[k] = (hv[k] || 0) + v; }
      for (const id of asList(o.show)) { const it = this.st.items[id]; if (it) { it.shown = true; this.emit({ k: 'item', id, item: it }); } }
      for (const id of asList(o.hide)) { const it = this.st.items[id]; if (it) { it.shown = false; it.holder = null; this.emit({ k: 'item', id, item: it }); } }
      if (o.give && hero && this.st.items[o.give]) this._give(this.st.items[o.give], hero);
      for (const [id, mood] of Object.entries(o.mood || {})) { const c = this.st.creatures[id]; if (c) { c.mood = mood; this.pubCreature(c); } }
      if (hero) for (const [id, n] of Object.entries(o.respect || {})) { const c = this.st.creatures[id]; if (c) C().respect(c, hero.id, n); }
      if (hero) for (const [id, n] of Object.entries(o.threat || {})) { const c = this.st.creatures[id]; if (c) C().mem(c, hero.id).threat += n; }
      if (o.hurt) for (const h of o.hurt.who === 'all' ? this.standing() : hero ? [hero] : []) this._damage(h, R().roll(o.hurt.dmg, this.rnd).total);
      if (o.heal) for (const h of this.present()) { h.hp = h.maxHp; h.down = false; this.pubHero(h); }
    }
    _damage(h, n) {
      h.hp = Math.max(0, h.hp - n); h.deeds.taken += n;
      if (h.hp <= 0 && !h.down) { h.down = true; this.sayStock('down', { hero: h.name }); }
      this.pubHero(h);
    }

    // ---- what the players say
    heard(heroId, text) {
      this.st.hops = 0;
      const h = this.st.heroes[heroId] || null;
      this.lastHeard = this.now();
      this.emit({ k: 'heard', hero: heroId, name: h ? h.name : '?', text: String(text).slice(0, 300), at: Date.now() });
      if (!this.sc || this.st.ending || this.st.paused) return;
      if (this.st.pending) {
        const yn = I().yesNo(text);
        if (yn) { this._decide(yn === 'yes'); return; }
      }
      if (this.st.combat) { this._combatSpeech(h, text); return; }
      const m = I().match(text, this.options());
      if (!m && h && this._takeBySpeech(h, text)) return;
      if (!m) { this.log(`not understood from ${h ? h.name : '?'}: "${text}"`); return; }
      this.choose(m.option, h);
    }
    // "take the lantern", "pick up the potion": an item that is shown and nobody holds (a scenario's own choice comes first)
    _takeBySpeech(h, text) {
      const w = I().norm(text);
      if (!w.some((x) => ['take', 'grab', 'pick', 'get', 'carry', 'hold'].includes(x))) return false;
      const it = Object.values(this.st.items).find((i) => i.shown && !i.holder && I().norm(i.name).some((n) => n.length > 2 && w.includes(n)));
      if (!it) return false;
      this.act(h.id, 'take', { item: it.id });
      return true;
    }
    _decide(yes) {
      const p = this.st.pending;
      this.st.pending = null;
      if (!p || p.node !== this.st.node) return this.pubWorld();
      const c = this.nodeDef.choices[p.ix];
      if (!yes) { this.sayStock('confirm.no'); this.pubWorld(); return; }
      this.choose(c, this.st.heroes[p.heroId] || null, true);
    }

    // ---- the fight
    _fight(f) {
      const foes = asList(f.foes).filter((id) => this.st.creatures[id]);
      for (const id of foes) { const c = this.st.creatures[id]; c.mood = 'fight'; this.pubCreature(c); }
      const order = [];
      for (const h of this.standing()) order.push({ kind: 'hero', id: h.id, init: R().check({ bonus: R().stat(h, 'grace') + (h.cls === 'outrider' ? 100 : 0), dc: 0, rng: this.rnd }).total });
      for (const id of foes) order.push({ kind: 'foe', id, init: R().check({ bonus: 2, dc: 0, rng: this.rnd }).total });
      order.sort((a, b) => b.init - a.init);
      this.st.combat = { foes, order, turn: -1, round: 1, def: f, defending: {}, guard: {}, ward: false, since: this.now() };
      this.sayStock('fight.start');
      this._next();
    }
    _pubCombat() { const cb = this.st.combat; this.emit({ k: 'combat', combat: cb && { foes: cb.foes, order: cb.order, turn: cb.turn, round: cb.round } }); }
    _next() {
      const cb = this.st.combat;
      if (!cb || this._over()) return;
      for (let k = 0; k < cb.order.length * 2; k++) {
        cb.turn++;
        if (cb.turn >= cb.order.length) { cb.turn = 0; cb.round++; }
        const t = cb.order[cb.turn];
        if (t.kind === 'foe') { const c = this.st.creatures[t.id]; if (c && c.mood === 'fight') break; }
        else { const h = this.st.heroes[t.id]; if (h && h.here && !h.down) break; }
      }
      this._turn(false);
    }
    _turn(again) {
      const cb = this.st.combat, t = cb && cb.order[cb.turn];
      if (!t) return;
      cb.since = this.now();
      this._pubCombat();
      if (t.kind === 'foe') { this._later(FOE_PAUSE, () => this._foeTurn(t.id)); return; }
      const h = this.st.heroes[t.id];
      delete cb.defending[h.id];
      this.sayStock(again ? 'turn.again' : 'turn', { hero: h.name });
    }
    _later(s, fn) { this.timers.push({ at: Math.max(this.now(), this.quietUntil) + s * 1000, fn }); }
    _combatSpeech(h, text) {
      const cb = this.st.combat, t = cb.order[cb.turn];
      // the scenario's own choices are open in a fight too (talk, surrender, ring the bell); then the fight's moves
      const opts = this.options().map((o) => ({ hear: o.hear, scen: o })).concat(COMBAT);
      const m = I().match(text, opts);
      if (!m) { this.log(`not understood in the fight from ${h ? h.name : '?'}: "${text}"`); return; }
      if (m.option.scen) { this.choose(m.option.scen, h); return; }
      if (!h || !t || t.kind !== 'hero' || t.id !== h.id) { this.log(`${h ? h.name : '?'} spoke out of turn: "${text}"`); return; }
      this._heroMove(h, m.option.id, text);
    }
    _foeFor(text) {
      const cb = this.st.combat, words = I().norm(text);
      const named = cb.foes.find((id) => { const c = this.st.creatures[id]; return c.mood === 'fight' && words.includes(c.name.toLowerCase().split(' ')[0]); });
      return this.st.creatures[named || cb.foes.find((id) => this.st.creatures[id].mood === 'fight')];
    }
    _friendFor(h, text) {
      const words = I().norm(text);
      const named = this.present().find((o) => o.id !== h.id && words.includes(o.name.toLowerCase().split(' ')[0]));
      if (named) return named;
      if (words.includes('me') || words.includes('myself')) return h;
      return this.present().filter((o) => o.hp < o.maxHp).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp)[0] || h;
    }
    _heroMove(h, move, text) {
      const cb = this.st.combat, cls = R().classOf(h);
      if (move === 'attack') {
        const c = this._foeFor(text);
        if (!c) return;
        const r = this._roll(h, cls.weapon.stat, c.def, `${cls.weapon.name} at ${c.name}`, 0);
        const ctx = { hero: h.name, foe: c.name, weapon: cls.weapon.name };
        const tier = R().tier(r);
        if (r.ok) {
          let dmg = R().roll(cls.weapon.dmg, this.rnd).total;
          if (r.crit) dmg += R().roll(cls.weapon.dmg, this.rnd).total;
          h.deeds.hits++; h.deeds.dealt += dmg;
          this.st.hv[h.id] = this.st.hv[h.id] || {};
          this.st.hv[h.id].dealt = (this.st.hv[h.id].dealt || 0) + dmg;
          this.sayStock(`hit.${tier}`, ctx);
          const what = C().hurt(c, h.id, dmg);
          this._creatureLine(c, 'hurt', h);
          if (what.includes('grudge')) this.sayStock('grudge', ctx);
          if (what.includes('flee')) { this.sayStock('flee', ctx); this._creatureLine(c, 'flee', h); }
          if (what.includes('dead')) this.sayStock('dead', ctx);
          this.pubCreature(c); this.pubHero(h);
        } else this.sayStock(tier === 'bad' ? 'miss.bad' : 'miss', ctx);
      } else if (move === 'defend') { cb.defending[h.id] = true; this.sayStock('defend', { hero: h.name }); }
      else if (move === 'guard' && h.cls === 'warden' && h.uses > 0) {
        const friend = this._friendFor(h, text); h.uses--;
        if (friend && friend.id !== h.id) cb.guard[friend.id] = h.id;
        this.sayStock('guard', { hero: h.name, target: friend ? friend.name : 'the others' }); this.pubHero(h);
      } else if (move === 'ward' && h.cls === 'kindler' && h.uses > 0) { h.uses--; cb.ward = true; this.sayStock('ward', { hero: h.name }); this.pubHero(h); }
      else if (move === 'mend' && h.cls === 'mender') {
        const friend = this._friendFor(h, text);
        if (h.uses <= 0) this.sayStock('mend.none', { hero: h.name });
        else {
          h.uses--;
          const was = friend.down;
          friend.hp = Math.min(friend.maxHp, friend.hp + R().roll(R().classOf(h).gift.heal, this.rnd).total); friend.down = friend.hp <= 0;
          this.sayStock('mend', { hero: h.name, target: friend.id === h.id ? 'their own' : friend.name });
          if (was && !friend.down) this.sayStock('up', { hero: friend.name });
          this.pubHero(friend); this.pubHero(h);
        }
      } else if (move === 'potion') {
        const it = Object.values(this.st.items).find((i) => i.holder === h.id && i.heal);
        if (it) this._drink(h, it); else this.sayStock('no.potion', { hero: h.name });
      } else if (move === 'flee') {
        this.sayStock('flee.try', { hero: h.name });
        if (cb.def.escape) { const r = this._roll(h, 'grace', 12, 'run'); if (r.ok) { this._endFight('escape'); return; } }
      } else { cb.defending[h.id] = true; this.sayStock('defend', { hero: h.name }); }
      if (!this._over()) this._next();
    }
    _creatureLine(c, key, h) {
      const ls = c.lines && c.lines[key];
      if (!ls || !ls.length) return;
      const pick = ls.filter((l) => typeof l === 'string' || l.when === undefined || this.test(l.when, h && h.id));
      if (!pick.length || this.rnd() > 0.6) return;
      const l = pick[Math.floor(this.rnd() * pick.length)];
      this.say(Object.assign({ v: c.voice }, typeof l === 'string' ? { t: l } : l, { when: undefined }), { hero: h ? h.name : '', foe: c.name });
    }
    _foeTurn(id) {
      const cb = this.st.combat, c = this.st.creatures[id];
      if (!cb || !c || this.st.paused) return;
      const act = C().decide(c, this.standing(), this.rnd);
      this.pubCreature(c);
      if (act.move === 'claw') {
        let h = act.target;
        const guard = cb.guard[h.id] && this.st.heroes[cb.guard[h.id]];
        if (guard && !guard.down) { this.sayStock('foe.guarded', { guard: guard.name, hero: h.name }); delete cb.guard[h.id]; h = guard; }
        const r = R().check({ bonus: c.attack.bonus, dc: h.def + (cb.defending[h.id] ? 3 : 0), rng: this.rnd, edge: act.edge || 0 });
        this.emit({ k: 'roll', roll: { who: c.name, what: `${c.attack.name} at ${h.name}`, d20: r.d20, bonus: r.bonus, dc: r.dc, total: r.total, ok: r.ok, tier: R().tier(r) }, at: Date.now() });
        const ctx = { hero: h.name, foe: c.name, attack: c.attack.name };
        if (r.ok) { this.sayStock(R().tier(r) === 'great' ? 'foe.hit.great' : 'foe.hit', ctx); this._damage(h, R().roll(c.attack.dmg, this.rnd).total * (r.crit ? 2 : 1)); }
        else this.sayStock('foe.miss', ctx);
      } else if (act.move === 'breath') {
        this.sayStock('breath', { foe: c.name });
        for (const h of act.targets) {
          const r = this._roll(h, c.breath.stat, c.breath.dc, `dodge ${c.name}'s ${c.breath.name}`);
          let dmg = R().roll(c.breath.dmg, this.rnd).total;
          if (r.ok) dmg = Math.floor(dmg / 2);
          if (cb.ward) { dmg = Math.floor(dmg / 2); this.sayStock('breath.warded', { hero: h.name }); }
          this.sayStock(r.ok ? 'breath.pass' : 'breath.fail', { hero: h.name, foe: c.name });
          this._damage(h, dmg);
        }
        cb.ward = false;
      } else if (act.move === 'flee') { c.mood = 'gone'; this.pubCreature(c); }
      if (!this._over()) this._next();
    }
    // is the fight over? goes to the node the scenario names
    _over() {
      const cb = this.st.combat;
      if (!cb) return true;
      const foes = cb.foes.map((id) => this.st.creatures[id]);
      if (!this.standing().length) { this.sayStock('all.down'); this._endFight('lose'); return true; }
      if (foes.every((c) => c.mood === 'dead')) { this._endFight('win'); return true; }
      if (foes.every((c) => c.mood === 'dead' || c.mood === 'gone' || c.mood === 'flee')) {
        for (const c of foes) if (c.mood === 'flee') { c.mood = 'gone'; this.pubCreature(c); }
        this._endFight(cb.def.fled ? 'fled' : 'win'); return true;
      }
      return false;
    }
    _endFight(how) {
      const cb = this.st.combat;
      this.st.combat = null; this.timers = [];
      this._pubCombat();
      this.log(`the fight ends: ${how}`);
      const to = cb.def[how] || cb.def.win;
      this.st.hops = 0;
      if (to) this.go(to); else this.pubWorld();
    }

    // ---- the game master
    gm(cmd) {
      if (!cmd || typeof cmd !== 'object') return;
      this.st.hops = 0;
      const h = cmd.hero ? this.st.heroes[cmd.hero] : null;
      switch (cmd.do) {
        case 'start': this.stop(); this.start(cmd.scenario); break;
        case 'stop': this.stop(); break;
        case 'goto': this.st.combat = null; this._pubCombat(); this.st.hops = 0; this.enter(cmd.node, h); break;
        case 'set': this.st.vars[cmd.name] = cmd.value; this.pubWorld(); break;
        case 'heard': if (h) this.heard(h.id, cmd.text); break;
        case 'choose': { const c = this.options()[cmd.ix]; if (c) this.choose(c, h || this.standing()[0] || null, true); break; }
        case 'say': this.say({ t: String(cmd.text || ''), v: cmd.voice || 'narrator' }); break;
        case 'hint': this._hint(); break;
        case 'pause': this.st.paused = true; this.sayStock('paused'); this.pubWorld(); break;
        case 'resume': this.st.paused = false; this.lastHeard = this.now(); this.sayStock('resumed'); this.pubWorld(); if (this.st.combat) this._turn(true); break;
        case 'next': if (this.st.combat) this._next(); break;
        case 'yes': if (this.st.pending) this._decide(true); break;
        case 'no': if (this.st.pending) this._decide(false); break;
        case 'heal': for (const x of h ? [h] : this.present()) { x.hp = x.maxHp; x.down = false; this.pubHero(x); } break;
        case 'forget': if (h) { delete this.st.heroes[h.id]; delete this.camp.heroes[h.id]; this.emit({ k: 'hero', id: h.id, drop: true }); this._save(); } break;
        case 'newcampaign': {
          this.stop();
          const here = this.present();
          this.camp = { heroes: {}, memory: {}, history: [] };
          for (const id of Object.keys(this.st.heroes)) if (!here.includes(this.st.heroes[id])) { delete this.st.heroes[id]; this.emit({ k: 'hero', id, drop: true }); }
          for (const x of here) { Object.assign(x, { hp: x.maxHp, down: false, deeds: { hits: 0, dealt: 0, taken: 0 } }); this.pubHero(x); }
          this.log('a new campaign: only the heroes who are here are kept'); this.pubWorld(); break;
        }
        case 'amnesia': this.camp.memory = {}; for (const c of Object.values(this.st.creatures)) { c.mem = {}; c.learned = []; this.pubCreature(c); } this._save(); this.log('the creatures forgot everybody'); break;
        case 'move': if (h) this.move(h.id, cmd.x, cmd.y); break;
        case 'act': if (h) this.act(h.id, cmd.what, cmd.args); break;
        default: this.log(`unknown game master command ${cmd.do}`);
      }
    }

    // ---- time
    tick() {
      const now = this.now();
      if (this.st.paused) return;
      const due = this.timers.filter((t) => t.at <= now);
      this.timers = this.timers.filter((t) => t.at > now);
      this.st.hops = 0;
      for (const t of due) t.fn();
      const quiet = now - Math.max(this.lastHeard, this.quietUntil);
      if (this.st.pending && quiet > CONFIRM_WAIT * 1000) { this.sayStock('confirm.quiet'); this._decide(true); return; }
      const cb = this.st.combat;
      if (cb) {
        const t = cb.order[cb.turn];
        if (t && t.kind === 'hero' && now - Math.max(cb.since, this.quietUntil) > TURN_WAIT * 1000) {
          const h = this.st.heroes[t.id];
          if (h) { cb.defending[h.id] = true; this.sayStock('hesitate', { hero: h.name }); }
          this._next();
        }
      } else if (this.sc && !this.st.ending && this.options().length && quiet > (this.sc.hintAfter || HINT_AFTER) * 1000) this._hint();
      for (const c of Object.values(this.st.creatures)) {
        if (C().step(c, this.standing(), 0.25, this.sc && this.sc.room) && now - (c._pubAt || 0) > 400) this.pubCreature(c);
      }
    }
    _hint() {
      const n = this.nodeDef;
      if (!n) return;
      const hints = asList(n.hints);
      this.lastHeard = this.now();
      if (this.st.hintIx < hints.length) { this.say(hints[this.st.hintIx++], this._ctx()); return; }
      const labels = this.options().filter((c) => c.label && !c.quiet).map((c) => c.label);
      if (!labels.length) return;
      const label = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')}, or ${labels[labels.length - 1]}`;
      this.sayStock('choices', { label });
    }
  }

  D.director = { Director, COMBAT };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.DND = globalThis.DND || {}));
