// The counter app: what an app gives MUMR (settings, buttons, its kinds of events) and how it listens. No XR: it runs in any browser.
//   py -3 engine/server/serve.py examples/counter 8766 --http      then open http://localhost:8766/ in two tabs
(async function () {
  const M = window.MUMR, $ = (id) => document.getElementById(id);
  const HUES = ['tomato', 'gold', 'mediumseagreen', 'deepskyblue', 'orchid'];
  const info = await (await fetch('/info')).json();
  const life = M.life.make({ name: navigator.userAgent.includes('OculusBrowser') ? 'Quest' : 'PC tab' });
  const link = M.link.connect(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`, { build: info.build, name: `tab ${Math.floor(Math.random() * 100)}` });
  link.onNote = (n) => life(`link: ${n}`);
  const S = new M.session.Session(link, {
    game: { count: 0 },
    player: { hue: HUES[0] },
    press: (id, st) => (id === 'plus' ? Object.assign({}, st, { count: st.count + 1 }) : id === 'hue' ? Object.assign({}, st, { hue: HUES[(HUES.indexOf(st.hue) + 1) % HUES.length] }) : null),
    init: (doc) => { doc.notes = {}; },
    kinds: {
      // a note belongs to the page that wrote it: only it can change it, and it goes when that page goes
      note: { keep: (e) => ({ key: `note:${e.id}`, own: true, gone: { k: 'unnote', id: e.id } }), apply: (S2, e) => { S2.doc.notes[e.id] = e.text; } },
      unnote: { apply: (S2, e) => { delete S2.doc.notes[e.id]; } },
    },
  });
  $('plus').onclick = () => S.press(null, 'plus');
  $('hue').onclick = () => S.press(null, 'hue');
  $('note').onclick = () => S.emit({ k: 'note', id: life.pid, text: new Date().toLocaleTimeString() });
  function draw() {
    $('count').textContent = S.game('count');
    const me = { slot: S.me, name: 'me', hue: S.stateOf(null).hue };
    const others = [...S.peers].map(([slot, p]) => ({ slot, name: p.name, hue: S.stateOf(slot).hue }));
    $('players').innerHTML = [me, ...others].map((p) => `<span style="background:${p.hue}">${p.name}${p.slot === null ? '' : ` (${p.slot})`}</span>`).join('');
    $('notes').textContent = Object.entries(S.doc.notes).map(([id, t]) => `${id === life.pid ? 'my note' : 'a note'}: ${t}`).join(' | ');
    $('status').textContent = `${S.connected ? `connected as ${S.isViewer ? 'viewer' : `player ${S.me + 1}`}` : 'alone'}, ${S.others} other(s), event ${S.n}, round trip ${link.rtt ?? '-'} ms\n` + life.lines().slice(-6).join('\n');
  }
  for (const k of ['join', 'leave', 'peer', 'game', 'player', 'event', 'synced', 'first']) S.on(k, draw);
  S.on('first', () => life('first one here: my world is the world'));
  S.on('synced', () => life('took the world from the server'));
  setInterval(() => { S.tick(performance.now()); draw(); }, 500);
  window.counter = { S, link, life };
  draw();
})();
