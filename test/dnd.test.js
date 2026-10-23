// The DnD app (apps/dnd): its expressions, intents, rules and creatures; every scenario linted and played by pretend players; the
// director's agreement, hints, fights and saves; and the whole path through the pretend server (a player speaks, the host decides,
// the game master's page steers, a page cannot forge the host's events).
const test = require('node:test');
const assert = require('node:assert');
const M = require('../client/index.js');
const D = require('../apps/dnd/lib/all.js');
const { Hub } = require('./hubfake.js');

test('expressions: precedence, names with dots, functions, and errors', () => {
  const env = { get: (n) => ({ 'a.b': 3, c: true, s: 'x' })[n], fn: { top: (n) => (n === 'v.t' ? 5 : 0) } };
  const ev = (s) => D.expr.compile(s)(env);
  assert.strictEqual(ev('a.b >= 3 && c'), true);
  assert.strictEqual(ev('!c || a.b == 2'), false);
  assert.strictEqual(ev('1 + 2 * 3'), 7);
  assert.strictEqual(ev('top("v.t") > 4 && s == \'x\''), true);
  assert.strictEqual(ev('missing'), undefined);
  assert.ok(D.expr.check('a &&'));
  assert.ok(D.expr.check('a b'));
  assert.deepStrictEqual(D.expr.names('x.y && has("bell") || z'), ['x.y', 'z']);
});

test('intents: words in order, word starts, no-words, the best match, yes and no', () => {
  const opts = [{ id: 'fight', hear: ['attack', 'for the village'] }, { id: 'talk', hear: ['talk', 'we offer'] }, { id: 'bell', hear: ['take the bell'] }];
  const m = (t) => { const r = D.intent.match(t, opts); return r && r.option.id; };
  assert.strictEqual(m('ATTACK!'), 'fight');
  assert.strictEqual(m('we are attacking now'), 'fight');
  assert.strictEqual(m("let's not attack, let's talk"), 'talk');
  assert.strictEqual(m("don't attack"), null);
  assert.strictEqual(m('quick, take the bell and talk'), 'bell', 'more words matched wins');
  assert.strictEqual(m('the weather is nice'), null);
  assert.strictEqual(D.intent.yesNo('Yes, do it'), 'yes');
  assert.strictEqual(D.intent.yesNo('no, wait'), 'no');
  assert.strictEqual(D.intent.yesNo("I don't agree"), 'no');
  assert.strictEqual(D.intent.yesNo('maybe'), null);
});

test('rules: seeded dice, checks, words for wounds', () => {
  const r1 = D.rules.rng(5), r2 = D.rules.rng(5);
  for (let k = 0; k < 20; k++) assert.strictEqual(D.rules.roll('2d6+1', r1).total, D.rules.roll('2d6+1', r2).total);
  const r = D.rules.rng(1);
  for (let k = 0; k < 200; k++) { const t = D.rules.roll('1d8-1', r).total; assert.ok(t >= 0 && t <= 7); }
  const c = D.rules.check({ bonus: 3, dc: 12, rng: D.rules.rng(9) });
  assert.strictEqual(c.total, c.d20 + 3);
  assert.strictEqual(c.ok, c.d20 === 20 || (c.d20 !== 1 && c.total >= 12));
  assert.deepStrictEqual([10, 9, 5, 2, 0].map((hp) => D.rules.hpWord(hp, 10)), ['unhurt', 'scratched', 'hurt', 'badly hurt', 'down']);
  const h = D.rules.makeHero({ id: 'x', name: 'A', cls: 'nonsense' });
  assert.strictEqual(h.cls, 'warden');
});

test('creatures: they go for whoever hurt them, learn a grudge, flee, and breathe on who stands in front', () => {
  const c = D.creature.make({ id: 'v', name: 'V', hp: 40, at: [2, 1.5], yaw: Math.PI, breath: { every: 1 }, flee: 0.3 });
  const a = { id: 'a', here: true, x: 0.5, y: 1.4 }, b = { id: 'b', here: true, x: 0.8, y: 1.7 }, far = { id: 'f', here: true, x: 3.8, y: 0.2 };
  D.creature.hurt(c, 'f', 3);
  assert.strictEqual(D.creature.target(c, [a, b, far]).id, 'f', 'the one who hurt it');
  D.creature.hurt(c, 'a', 2); D.creature.hurt(c, 'a', 2);
  assert.deepStrictEqual(D.creature.hurt(c, 'a', 2), ['grudge']);
  assert.strictEqual(D.creature.target(c, [a, b, far]).id, 'a', 'a grudge above all');
  c.yaw = Math.PI;
  const cone = D.creature.inCone(c, [a, b, far], () => 0.9).map((h) => h.id).sort();
  assert.deepStrictEqual(cone, ['a', 'b'], 'the two in front, not the one behind');
  const act = D.creature.decide(c, [a, b, far], () => 0.9);
  assert.strictEqual(act.move, 'breath');
  // a grudge keeps it fighting when badly hurt; without one it flees
  const d = D.creature.make({ id: 'd', name: 'D', hp: 10, flee: 0.3 });
  assert.deepStrictEqual(D.creature.hurt(d, 'a', 8), ['flee']);
  assert.ok(D.creature.hurt(c, 'b', 30).includes('dead') === false && c.mood !== 'flee', 'pride: no fleeing with a grudge');
});

test('every scenario lints clean, and the linter finds what is wrong', () => {
  for (const sc of Object.values(D.scenarios)) assert.deepStrictEqual(D.lint.lint(sc).errors, [], sc.id);
  const bad = { id: 'b', title: 'B', start: 'a', vars: {}, nodes: { a: { choices: [{ label: 'x', hear: ['x'], go: 'nowhere', when: 'q &&' }] }, z: { end: { title: 'z' } } } };
  const r = D.lint.lint(bad);
  assert.ok(r.errors.some((e) => /nowhere/.test(e)));
  assert.ok(r.errors.some((e) => /expression/.test(e)));
  assert.ok(r.warnings.some((w) => /z: cannot be reached/.test(w)));
});

test('pretend players finish every scenario, and reach every ending of the Ember Hollow', () => {
  for (const sc of Object.values(D.scenarios)) {
    for (let seed = 1; seed <= 40; seed++) {
      const r = D.sim.play(sc, { seed, count: 1 + (seed % 5) });
      assert.ok(!r.stuck, `${sc.id} seed ${seed} got stuck at ${r.director.st.node}`);
    }
  }
  const endings = new Set();
  for (let seed = 1; seed <= 400 && endings.size < 4; seed++) endings.add(D.sim.play(D.scenarios.s01_ember_hollow, { seed, count: 4 }).ending);
  assert.deepStrictEqual([...endings].sort(), ['end_flies', 'end_hunt', 'end_slain', 'end_sleep']);
});

// a director with a clock of our own, three heroes, and what it said
function director(opts = {}) {
  let t = 0;
  const said = [], events = [], saved = { v: opts.saved || null };
  const d = new D.director.Director({ now: () => t, rng: D.rules.rng(opts.seed || 3), store: { load: () => saved.v, save: (o) => { saved.v = JSON.parse(JSON.stringify(o)); } },
    emit: (e) => { events.push(e); if (e.k === 'say') said.push(...e.lines.map((l) => l.t)); } });
  return { d, said, events, saved, at: (ms) => { t = ms; d.tick(); }, get t() { return t; } };
}
const PARTY = D.sim.PARTY.slice(0, 3);

test('the director: a choice that needs everyone asks first; no cancels, yes or silence goes on', () => {
  const x = director();
  PARTY.forEach((h, i) => x.d.join(h, i));
  x.d.start('s01_ember_hollow');
  x.d.gm({ do: 'goto', node: 'choice' });
  x.d.heard('h1', 'We attack!');
  assert.strictEqual(x.d.st.pending.label, 'fight');
  assert.ok(x.said.some((t) => /Mira wants to fight\. Does everyone agree/.test(t)));
  x.d.heard('h2', 'no, wait');
  assert.strictEqual(x.d.st.pending, null);
  assert.strictEqual(x.d.st.node, 'choice');
  x.d.heard('h1', 'attack');
  x.at(x.d.quietUntil + 25000);                       // nobody says a word: that is a yes
  assert.ok(x.said.includes('Nobody objects.'));
  assert.strictEqual(x.d.st.node, 'fight');
  assert.ok(x.d.st.combat, 'the fight began');
});

test('the director: silence brings the hints, then the choices said aloud', () => {
  const x = director();
  PARTY.forEach((h, i) => x.d.join(h, i));
  x.d.start('s01_ember_hollow');
  assert.strictEqual(x.d.st.node, 'chapel');
  const before = x.said.length;
  x.at(x.d.quietUntil + 61000);
  assert.ok(/The chapel is quiet/.test(x.said[before]));
  x.at(x.d.quietUntil + 61000);
  x.at(x.d.quietUntil + 61000);
  assert.ok(/^You could look at the rope, follow the footprints/.test(x.said[x.said.length - 1]) || /choice to make/.test(x.said[x.said.length - 1]));
});

test('the director: in a fight only the hero whose turn it is acts, the creature answers, and it all goes to the right node', () => {
  const x = director({ seed: 11 });
  PARTY.forEach((h, i) => x.d.join(h, i));
  x.d.start('s00_lantern_test');
  x.d.gm({ do: 'goto', node: 'hall' });
  const cb = x.d.st.combat;
  assert.ok(cb && cb.order.length === 4);
  for (let k = 0; k < 200 && x.d.st.node === 'hall'; k++) {
    const turn = x.d.st.combat && x.d.st.combat.order[x.d.st.combat.turn];
    if (!turn) break;
    if (turn.kind === 'hero') {
      const other = PARTY.find((h) => h.id !== turn.id);
      const was = x.d.st.combat.turn;
      x.d.heard(other.id, 'attack');
      assert.strictEqual(x.d.st.combat.turn, was, 'out of turn: nothing happens');
      x.d.heard(turn.id, 'I attack the dummy');
    } else x.at(Math.max(x.t, x.d.quietUntil) + 2000);
  }
  assert.ok(['after_fight', 'after_lose'].includes(x.d.st.node), x.d.st.node);
  assert.ok(x.events.some((e) => e.k === 'roll' && e.roll.who === 'the Drillmaster'), 'the dummy struck back');
  assert.ok(x.said.every((t) => !/\d/.test(t)), 'no numbers in what the narrator says');
});

test('the director: the game goes on after a restart from its save, and the creatures remember the heroes', () => {
  const x = director();
  PARTY.forEach((h, i) => x.d.join(h, i));
  x.d.start('s01_ember_hollow');
  x.d.heard('h3', 'I read the diary on the desk');
  x.d.heard('h3', 'take the lantern');
  assert.strictEqual(x.d.st.items.lantern.holder, 'h3');
  D.creature.hurt(x.d.st.creatures.vhorr, 'h1', 6);
  x.d.pubWorld();
  const y = director({ saved: x.saved.v });
  assert.strictEqual(y.d.st.node, 'chapel');
  assert.strictEqual(y.d.st.items.lantern.holder, 'h3');
  assert.strictEqual(y.d.present().length, 0, 'nobody is here until their page says so');
  PARTY.forEach((h, i) => y.d.join(h, i));
  y.d.heard('h3', 'light the lantern');
  assert.strictEqual(y.d.st.vars['cellar.lit'], true);
  y.d.gm({ do: 'start', scenario: 's01_ember_hollow' });
  assert.strictEqual(y.d.st.creatures.vhorr.mem.h1.threat, 6, 'Vhorr remembers who hurt him, in the next game too');
});

test('through the server: a player speaks, the host decides, the game master steers, and nobody but the host writes the world', () => {
  const hub = new Hub();
  const hostS = new M.session.Session(hub.link('host', 'host'), require('../apps/dnd/host.js').session);
  let t = 0;
  const said = [];
  const dir = new D.director.Director({ emit: (e) => hostS.emit(e), now: () => t, rng: D.rules.rng(4) });
  let live = false;
  hostS.on('join', () => { live = true; dir.online(); });
  hostS.on('event', (e, from) => {
    if (!live || from === D.game.HOST) return;
    if (e.k === 'join') dir.join(e.hero, from); else if (e.k === 'said') dir.heard(e.hero, e.text); else if (e.k === 'gm') dir.gm(e.cmd);
  });
  hub.flush();
  const a = new M.session.Session(hub.link('A'), D.game.sessionOptions());
  const gm = new M.session.Session(hub.link('gm', 'viewer'), D.game.sessionOptions());
  a.on('say', (lines) => said.push(...lines.map((l) => l.t)));
  hub.flush();
  a.emit({ k: 'join', hero: { id: 'hA', name: 'Asha', cls: 'outrider' } }); hub.flush();
  assert.strictEqual(a.doc.heroes.hA.name, 'Asha');
  assert.strictEqual(gm.doc.heroes.hA.cls, 'outrider');
  gm.emit({ k: 'gm', page: 'p1', cmd: { do: 'start', scenario: 's00_lantern_test' }, seq: 1 }); hub.flush();
  assert.strictEqual(a.doc.world.node, 'intro');
  assert.ok(said.some((t2) => /I am Pip/.test(t2)));
  a.emit({ k: 'said', hero: 'hA', text: 'Hello there, Pip!' }); hub.flush();
  assert.strictEqual(gm.doc.world.node, 'door');
  assert.strictEqual(gm.doc.heard[gm.doc.heard.length - 1].text, 'Hello there, Pip!');
  // the game master types for a player
  gm.emit({ k: 'gm', page: 'p1', cmd: { do: 'heard', hero: 'hA', text: 'I look for a latch' }, seq: 2 }); hub.flush();
  assert.ok(gm.doc.rolls.some((r) => r.what === 'spot the latch'));
  // a newcomer gets the world at once
  const b = new M.session.Session(hub.link('B'), D.game.sessionOptions()); hub.flush();
  assert.strictEqual(b.doc.world.title, 'The Lantern Test');
  assert.strictEqual(b.doc.heroes.hA.name, 'Asha');
  // a page that makes up the host's events is not believed (but the server keeps the made-up one for newcomers: the hub does not
  // know which keys are the host's; see the app's README)
  a.emit({ k: 'hero', id: 'hA', hero: Object.assign({}, a.doc.heroes.hA, { hp: 99 }) });
  a.emit({ k: 'roll', roll: { who: 'Asha', what: 'cheat', d20: 20 } }); hub.flush();
  assert.notStrictEqual(gm.doc.heroes.hA.hp, 99);
  assert.ok(!gm.doc.rolls.some((r) => r.what === 'cheat'));
  t += 1;
});
