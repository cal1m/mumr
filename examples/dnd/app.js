// The DnD app, phase 1: no XR, runs in any browser. Heroes (each page's own, they go when the page goes), items (shared: anybody can
// give or drop them) and a roll log (news for whoever is here). Dice are rolled on the page for now; phase 4 moves them to the host.
//   py -3 server/serve.py examples/dnd 8766 --http      then open http://localhost:8766/ in two tabs
(async function () {
  const M = window.MUMR, $ = (id) => document.getElementById(id);
  const ROLLS_KEPT = 8;
  const info = await (await fetch('/info')).json();
  const life = M.life.make({ name: navigator.userAgent.includes('OculusBrowser') ? 'Quest' : 'PC tab' });
  const link = M.link.connect(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`, { build: info.build, name: `tab ${Math.floor(Math.random() * 100)}` });
  link.onNote = (n) => life(`link: ${n}`);
  const S = new M.session.Session(link, {
    init: (doc) => { doc.heroes = {}; doc.items = {}; doc.rolls = []; },
    kinds: {
      // a hero belongs to the page that made it: only that page changes it, and it goes when that page goes
      hero: { keep: (e) => ({ key: `hero:${e.id}`, own: true, gone: { k: 'unhero', id: e.id } }), apply: (S2, e) => { S2.doc.heroes[e.id] = e.hero; } },
      unhero: { apply: (S2, e) => { delete S2.doc.heroes[e.id]; } },
      // an item is shared: an event with its key says all of the item
      item: { keep: (e) => ({ key: `item:${e.id}` }), apply: (S2, e) => { S2.doc.items[e.id] = e.item; } },
      unitem: { keep: (e) => ({ key: `item:${e.id}`, drop: true }), apply: (S2, e) => { delete S2.doc.items[e.id]; } },
      // a roll is news: it is not kept for anybody who joins later
      roll: { apply: (S2, e) => { S2.doc.rolls.push(e.roll); S2.doc.rolls.splice(0, S2.doc.rolls.length - ROLLS_KEPT); S2.notify('roll', e.roll); } },
    },
  });
  const myId = life.pid;
  const myHero = () => S.doc.heroes[myId] || null;
  const heroName = (id) => (S.doc.heroes[id] ? S.doc.heroes[id].name : 'nobody');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function adjustHp(d) {
    const h = myHero();
    if (!h) return;
    S.emit({ k: 'hero', id: myId, hero: Object.assign({}, h, { hp: Math.max(0, Math.min(h.maxHp, h.hp + d)) }) });
  }
  $('make').onclick = () => {
    const name = $('heroName').value.trim() || 'Hero';
    S.emit({ k: 'hero', id: myId, hero: Object.assign({ hp: 10, maxHp: 10 }, myHero(), { name }) });
  };
  $('hurt').onclick = () => adjustHp(-1);
  $('heal').onclick = () => adjustHp(1);
  $('addItem').onclick = () => {
    const name = $('itemName').value.trim();
    if (!name) return;
    const id = `${myId}-${Date.now()}`;
    S.emit({ k: 'item', id, item: { id, name, heroId: null } });
    $('itemName').value = '';
  };
  $('items').onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    const it = S.doc.items[b.dataset.id];
    if (!it) return;
    if (b.dataset.act === 'give' && myHero()) S.emit({ k: 'item', id: it.id, item: Object.assign({}, it, { heroId: myId }) });
    if (b.dataset.act === 'drop') S.emit({ k: 'item', id: it.id, item: Object.assign({}, it, { heroId: null }) });
    if (b.dataset.act === 'remove') S.emit({ k: 'unitem', id: it.id });
  };
  const roll = (sides) => {
    const h = myHero();
    S.emit({ k: 'roll', roll: { who: h ? h.name : 'nobody', sides, n: 1 + Math.floor(Math.random() * sides), at: Date.now() } });
  };
  $('d20').onclick = () => roll(20);
  $('d6').onclick = () => roll(6);

  function draw() {
    const mine = myHero();
    $('mine').textContent = mine ? `${mine.name}: HP ${mine.hp}/${mine.maxHp}` : 'No hero yet: type a name and press the button.';
    $('heroes').textContent = Object.values(S.doc.heroes).map((h) => `${h.name} ${h.hp}/${h.maxHp}`).join(' | ') || 'no heroes';
    $('items').innerHTML = Object.values(S.doc.items).map((it) => `<div>${esc(it.name)}, held by ${esc(heroName(it.heroId))} `
      + `${myHero() ? `<button data-id="${esc(it.id)}" data-act="give">give to me</button>` : ''}`
      + `<button data-id="${esc(it.id)}" data-act="drop">drop</button><button data-id="${esc(it.id)}" data-act="remove">remove</button></div>`).join('') || 'no items';
    $('rolls').textContent = S.doc.rolls.slice().reverse().map((r) => `${r.who} rolled d${r.sides}: ${r.n}`).join('\n');
    $('status').textContent = `${S.connected ? `connected as ${S.isViewer ? 'viewer' : `player ${S.me + 1}`}` : 'alone'}, ${S.others} other(s), event ${S.n}, round trip ${link.rtt ?? '-'} ms\n` + life.lines().slice(-6).join('\n');
  }
  for (const k of ['join', 'leave', 'peer', 'event', 'synced', 'first', 'roll']) S.on(k, draw);
  S.on('first', () => life('first one here: my world is the world'));
  S.on('synced', () => life('took the world from the server'));
  setInterval(() => { S.tick(performance.now()); draw(); }, 500);
  window.dnd = { S, link, life };
  draw();
})();
