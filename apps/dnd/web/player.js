// The player's page: a phone, a laptop, or the headset's browser before mixed reality. It makes the hero (kept in this browser, so a
// reload or the next session finds the same hero), shows what the narrator says, sends what the player says, and lets the player
// take, give and use things and say where they stand. Nothing here decides anything: the host does (host.js, lib/director.js).
// Numbers are never shown: wounds are words, gifts are dots (design, section 1).
(async function () {
  const M = window.MUMR, D = window.DND, $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const store = { get: (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private window */ } } };

  let hero = store.get('dnd.hero', null);          // { id, name, cls }: this browser's hero
  let pickCls = hero ? hero.cls : 'warden';
  const info = await (await fetch('/info')).json();
  const life = M.life.make({ name: navigator.userAgent.includes('OculusBrowser') ? 'Quest (2D)' : 'player page' });
  const link = M.link.connect(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`, { build: info.build, name: hero ? hero.name : 'player' });
  link.onNote = (n) => life(`link: ${n}`);
  const S = new M.session.Session(link, D.game.sessionOptions());
  const voice = D.speaker();
  voice.enabled = store.get('dnd.voice', false);
  $('voice').checked = voice.enabled;
  $('voice').onchange = () => { voice.enabled = $('voice').checked; store.set('dnd.voice', voice.enabled); if (!voice.enabled) voice.stop(); };
  $('caps').onchange = () => $('captions').classList.toggle('hidden', !$('caps').checked);

  // ---- the hero
  $('classes').innerHTML = Object.entries(D.rules.CLASSES).map(([id, c]) => `<button class="card" data-cls="${id}"><b>${c.name}</b><span>${esc(c.blurb)}. ${esc(c.gift.name)}: ${esc(c.gift.blurb)}.</span></button>`).join('');
  const showPick = () => { for (const b of document.querySelectorAll('.card')) b.classList.toggle('on', b.dataset.cls === pickCls); };
  $('classes').onclick = (ev) => { const b = ev.target.closest('.card'); if (b) { pickCls = b.dataset.cls; showPick(); } };
  $('name').value = hero ? hero.name : '';
  showPick();
  const join = () => { if (hero && S.connected) S.emit({ k: 'join', hero }); };
  $('save').onclick = () => {
    const name = $('name').value.trim();
    if (!name) { $('name').focus(); return; }
    hero = { id: hero ? hero.id : `h${Math.random().toString(36).slice(2, 9)}`, name, cls: pickCls };
    store.set('dnd.hero', hero);
    life(`hero ${hero.name} (${hero.cls})`);
    join(); draw();
  };
  $('edit').onclick = () => { $('setup').classList.remove('hidden'); };
  // the host may come later than this page, or start again: say who I am whenever it comes
  S.on('join', join);
  S.on('peer', (slot, on) => { if (on && slot === D.game.HOST) join(); draw(); });

  // ---- speaking
  const send = () => {
    const text = $('words').value.trim();
    if (!text || !hero) return;
    S.emit({ k: 'said', hero: hero.id, text });
    $('words').value = '';
  };
  $('send').onclick = send;
  $('words').onkeydown = (ev) => { if (ev.key === 'Enter') send(); };

  // ---- things
  $('things').onclick = (ev) => {
    const b = ev.target.closest('button');
    if (!b || !hero) return;
    const args = { item: b.dataset.item };
    if (b.dataset.act === 'give') { const to = $(`to-${b.dataset.item}`).value; if (!to) return; args.to = to; }
    S.emit({ k: 'act', hero: hero.id, what: b.dataset.act, args });
  };
  $('map').onclick = (ev) => { if (!hero) return; const [x, y] = D.table.toFloor($('map'), S.doc, ev); S.emit({ k: 'move', hero: hero.id, x, y }); };

  // ---- the narrator
  S.on('say', (lines) => { voice.say(lines); drawCaptions(); });
  function drawCaptions() {
    const said = S.doc.said.slice(-6);
    if (!said.length) return;
    $('captions').innerHTML = said.map((l) => `<div>${l.v !== 'narrator' ? `<span class="v">${esc(l.v)}</span>` : ''}${esc(l.t)}</div>`).join('');
  }

  let lastThings = '';
  function draw() {
    const w = S.doc.world, mine = hero && S.doc.heroes[hero.id];
    $('setup').classList.toggle('hidden', !!(hero && mine));
    $('conn').textContent = !S.connected ? 'not connected' : !S.hostHere ? 'no game master PC yet' : 'connected';
    $('conn').className = `tag ${S.connected && S.hostHere ? 'good' : 'bad'}`;
    $('title').textContent = w && w.title ? w.title : 'DnD in mixed reality';
    $('act').textContent = !w || !w.scenario ? 'Waiting for the game to start' : w.ending ? `The end: ${w.ending.title}` : w.paused ? 'Paused' : w.act || '';
    const cb = S.doc.combat, turn = cb && cb.order[cb.turn];
    $('turn').classList.toggle('hidden', !(turn && hero && turn.kind === 'hero' && turn.id === hero.id));
    $('mood').textContent = cb ? `fight, round ${cb.round}` : w && w.pending ? `${w.pending.by || 'someone'} asks: ${w.pending.label}?` : '';
    if (mine) {
      const c = D.rules.CLASSES[mine.cls];
      $('heroLine').textContent = `${mine.name}, ${c.name}`;
      const gift = c.gift.uses ? ` ${c.gift.name}: ${'●'.repeat(mine.uses)}${'○'.repeat(Math.max(0, c.gift.uses - mine.uses))}` : ` ${c.gift.name}`;
      $('state').textContent = `${D.rules.hpWord(mine.hp, mine.maxHp)}.${gift}`;
      const others = Object.values(S.doc.heroes).filter((h) => h.here && h.id !== mine.id);
      const held = Object.values(S.doc.items).filter((it) => it.holder === mine.id);
      const near = Object.values(S.doc.items).filter((it) => it.shown && !it.holder);
      const html = held.map((it) => `<div class="row"><b class="grow">${esc(it.name)}</b>`
          + `${it.heal ? `<button class="small" data-act="use" data-item="${esc(it.id)}">use</button>` : ''}`
          + `${others.length ? `<select id="to-${esc(it.id)}">${others.map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}</select><button class="small" data-act="give" data-item="${esc(it.id)}">give</button>` : ''}`
          + `<button class="small" data-act="drop" data-item="${esc(it.id)}">put down</button></div>`).join('')
        + near.map((it) => `<div class="row"><span class="grow dim">${esc(it.name)} (nearby)</span><button class="small" data-act="take" data-item="${esc(it.id)}">take</button></div>`).join('')
        || '<span class="dim">You carry nothing.</span>';
      if (html !== lastThings) { lastThings = html; $('things').innerHTML = html; }      // (not every second: a choice in a list would be lost)
    }
    D.table.draw($('map'), S.doc, { me: hero && hero.id });
    $('status').textContent = `${S.connected ? `player ${S.me + 1}` : 'alone'}, ${S.others} other player(s), host ${S.hostHere ? 'here' : 'away'}, round trip ${link.rtt ?? '-'} ms`;
  }
  for (const k of ['join', 'leave', 'world', 'hero', 'creature', 'item', 'combat', 'synced', 'first']) S.on(k, draw);
  S.on('synced', drawCaptions);
  window.addEventListener('resize', draw);
  setInterval(() => { S.tick(performance.now()); draw(); }, 1000);
  window.dnd = { S, link, life, voice };
  draw();
})();
