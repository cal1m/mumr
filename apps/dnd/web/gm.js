// The game master's page, on the PC: a watcher of the world (WorldFeed, a viewer: it takes no player's place) that sees every number,
// plays the narrator through the PC's speaker, and steers the host. Its commands go as one thing it owns (gm:<page>), each replacing
// the last (a viewer may only send what it owns: server/hub.py); the host carries them out (lib/director.js gm()).
// In trial runs without speech recognition it is also the ears: the game master types what a player said, for that player.
(async function () {
  const M = window.MUMR, D = window.DND, $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const info = await (await fetch('/info')).json();
  const life = M.life.make({ name: 'game master page' });
  const feed = M.worldfeed.WorldFeed.connect(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`, { build: info.build, name: 'game master', session: D.game.sessionOptions() });
  feed.link.onNote = (n) => life(`link: ${n}`);
  const S = feed.session, doc = () => S.doc;
  const page = life.pid;
  let seq = 0, selected = null;
  const cmd = (c) => { if (!feed.announce({ k: 'gm', page, cmd: c, seq: ++seq })) alert('Not connected to the server.'); };
  const voice = D.speaker();

  $('voice').onchange = () => { voice.enabled = $('voice').checked; if (!voice.enabled) voice.stop(); };
  $('hush').onclick = () => voice.stop();
  $('start').onclick = () => { const id = $('scenario').value; if (id && (!doc().world || !doc().world.scenario || confirm('Start this scenario from the beginning?'))) cmd({ do: 'start', scenario: id }); };
  $('stop').onclick = () => { if (confirm('Stop the scenario?')) cmd({ do: 'stop' }); };
  $('pause').onclick = () => cmd({ do: doc().world && doc().world.paused ? 'resume' : 'pause' });
  $('hint').onclick = () => cmd({ do: 'hint' });
  $('next').onclick = () => cmd({ do: 'next' });
  $('yes').onclick = () => cmd({ do: 'yes' });
  $('no').onclick = () => cmd({ do: 'no' });
  $('go').onclick = () => { const n = $('goto').value; if (n && confirm(`Go to ${n}? (a fight in progress ends)`)) cmd({ do: 'goto', node: n }); };
  $('amnesia').onclick = () => { if (confirm('The creatures forget every hero (their threat, respect and grudges)?')) cmd({ do: 'amnesia' }); };
  $('newcamp').onclick = () => { if (confirm('A new campaign: the scenario stops, the history and the creatures\' memory go, absent heroes are forgotten.')) cmd({ do: 'newcampaign' }); };
  $('words').onkeydown = (ev) => {
    if (ev.key !== 'Enter') return;
    const text = $('words').value.trim(), hero = $('who').value;
    if (text && hero) { cmd({ do: 'heard', hero, text }); $('words').value = ''; }
  };
  $('sayText').onkeydown = (ev) => { if (ev.key === 'Enter' && $('sayText').value.trim()) { cmd({ do: 'say', text: $('sayText').value.trim(), voice: $('sayVoice').value }); $('sayText').value = ''; } };
  $('choices').onclick = (ev) => { const b = ev.target.closest('button'); if (b) cmd({ do: 'choose', ix: +b.dataset.ix, hero: $('who').value || null }); };
  $('heroes').onclick = (ev) => {
    const b = ev.target.closest('button'), tr = ev.target.closest('tr[data-id]');
    if (b && b.dataset.do === 'heal') cmd({ do: 'heal', hero: b.dataset.id });
    else if (b && b.dataset.do === 'forget' && confirm('Forget this hero for good?')) cmd({ do: 'forget', hero: b.dataset.id });
    else if (tr) { selected = selected === tr.dataset.id ? null : tr.dataset.id; if (selected) $('who').value = selected; draw(); }
  };
  $('vars').onclick = (ev) => {
    const td = ev.target.closest('td[data-name]');
    if (!td) return;
    const now = doc().world.vars[td.dataset.name], v = prompt(`${td.dataset.name} (JSON: true, 3, "text")`, JSON.stringify(now));
    if (v === null) return;
    try { cmd({ do: 'set', name: td.dataset.name, value: JSON.parse(v) }); } catch (e) { alert('Not JSON'); }
  };
  $('map').onclick = (ev) => { if (!selected) return; const [x, y] = D.table.toFloor($('map'), doc(), ev); cmd({ do: 'move', hero: selected, x, y }); };

  S.on('say', (lines) => voice.say(lines));
  const sel = (el, opts, keep) => { const v = el.value, html = opts.map(([val, text]) => `<option value="${esc(val)}">${esc(text)}</option>`).join(''); if (el._html !== html) { el.innerHTML = html; el._html = html; } if (keep && v) el.value = v; };
  const time = (at) => (at ? new Date(at).toTimeString().slice(0, 8) : '');

  function draw() {
    const d = doc(), w = d.world;
    $('conn').textContent = !S.connected ? 'not connected' : S.hostHere ? `host here, ${Object.values(d.heroes).filter((h) => h.here).length} heroes here` : 'NO HOST (is Node installed?)';
    $('conn').className = `tag ${S.connected && S.hostHere ? 'good' : 'bad'}`;
    if (w && w.list) sel($('scenario'), w.list.map((s) => [s.id, `${s.title} (${s.minutes} min)`]), true);
    $('pause').textContent = w && w.paused ? 'Resume' : 'Pause';
    $('act').textContent = !w || !w.scenario ? 'No scenario' : w.ending ? `The end: ${w.ending.title}` : `${w.title}: ${w.act || ''}${w.paused ? ' (paused)' : ''}`;
    $('node').textContent = w && w.node ? `node ${w.node}${w.scene ? `, scene ${w.scene}` : ''}` : '';
    $('pending').classList.toggle('hidden', !(w && w.pending)); $('yesno').classList.toggle('hidden', !(w && w.pending));
    if (w && w.pending) $('pending').textContent = `${w.pending.by || 'Someone'} wants to ${w.pending.label}. Waiting for a yes or a no.`;
    $('choices').innerHTML = w && w.choices && w.choices.length ? w.choices.map((c, i) => `<button class="small" data-ix="${i}">${esc(c.label)}${c.check ? ' <span class="dim">(check)</span>' : ''}${c.go ? ` <span class="dim">-> ${esc(c.go)}</span>` : ''}</button>`).join('') : '-';
    sel($('goto'), (w && w.nodes ? w.nodes : []).map((n) => [n, n]), true);
    const heroes = Object.values(d.heroes);
    sel($('who'), heroes.filter((h) => h.here).map((h) => [h.id, h.name]), true);
    $('heroes').innerHTML = '<tr><th>Hero</th><th>HP</th><th>Gift</th><th>Carries</th><th></th></tr>' + heroes.map((h) => {
      const c = D.rules.CLASSES[h.cls], items = Object.values(d.items).filter((it) => it.holder === h.id).map((it) => it.name).join(', ');
      return `<tr data-id="${esc(h.id)}" style="${h.id === selected ? 'outline:1px solid var(--accent)' : ''}${h.here ? '' : ';opacity:.45'}"><td>${esc(h.name)} <span class="dim">${c.name}${h.here ? '' : ', away'}${h.down ? ', DOWN' : ''}</span></td>`
        + `<td>${h.hp}/${h.maxHp}</td><td>${c.gift.name} ${h.uses}</td><td>${esc(items)}</td>`
        + `<td><button class="small" data-do="heal" data-id="${esc(h.id)}">heal</button> <button class="small" data-do="forget" data-id="${esc(h.id)}">x</button></td></tr>`;
    }).join('');
    const name = (id) => (d.heroes[id] ? d.heroes[id].name : id);
    $('creatures').innerHTML = '<tr><th>Creature</th><th>HP</th><th>Mood</th><th>Remembers</th></tr>' + Object.values(d.creatures).map((c) => `<tr><td>${esc(c.name)}</td><td>${c.hp}/${c.maxHp}</td><td>${c.mood}${c.target ? ` -> ${esc(name(c.target))}` : ''}</td>`
      + `<td>${Object.entries(c.mem || {}).map(([id, m]) => `${esc(name(id))}: threat ${m.threat}, respect ${m.respect}, wounds ${m.wounds}`).join('<br>')}${(c.learned || []).length ? `<br><span class="dim">learned: ${esc(c.learned.map((l) => l.replace(/grudge:(.*)/, (x, id) => `grudge on ${name(id)}`)).join(', '))}</span>` : ''}</td></tr>`).join('');
    const cb = d.combat;
    $('combat').innerHTML = cb ? `round ${cb.round}: ${cb.order.map((o, i) => { const n = o.kind === 'hero' ? name(o.id) : (d.creatures[o.id] || {}).name; return i === cb.turn ? `<b style="color:var(--accent)">${esc(n)}</b>` : esc(n); }).join(' → ')}` : 'no fight';
    $('vars').innerHTML = w && w.vars ? Object.entries(w.vars).map(([k, v]) => `<tr><td>${esc(k)}</td><td data-name="${esc(k)}">${esc(JSON.stringify(v))}</td></tr>`).join('') : '';
    $('said').innerHTML = d.said.slice(-14).map((l) => `<div>${l.v !== 'narrator' ? `<span class="v">${esc(l.v)}</span>` : ''}${esc(l.t)}</div>`).join('');
    $('heardLog').textContent = d.heard.slice(-12).map((h) => `${time(h.at)}  ${h.name}: ${h.text}`).join('\n');
    $('rolls').textContent = d.rolls.slice(-12).reverse().map((r) => `${r.who}, ${r.what}: d20 ${r.d20}${r.bonus >= 0 ? '+' : ''}${r.bonus} = ${r.total} vs ${r.dc}  ${r.ok ? 'OK' : 'fail'} (${r.tier})`).join('\n');
    $('notes').textContent = d.notes.slice(-14).reverse().map((n) => `${time(n.at)}  ${n.t}`).join('\n');
    $('hist').textContent = w && w.history && w.history.length ? `played: ${w.history.map((h) => h.ending).join('; ')}` : '';
    D.table.draw($('map'), d, { gm: true, selected });
  }
  for (const k of ['ready', 'lost', 'world', 'hero', 'creature', 'item', 'combat', 'roll', 'note', 'heard', 'say', 'peer']) S.on(k, draw);
  window.addEventListener('resize', draw);
  setInterval(draw, 1000);
  window.dnd = { feed, life, voice, cmd };
  draw();
})();
