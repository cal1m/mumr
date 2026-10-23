// Pretend players for a scenario: the director plays it with heroes that say things at random (one of the phrases the node listens
// for), take what they see, agree to what is asked, and attack on their turn. No network: for the tests and tools/dnd-sim.js, to see
// that every ending can be reached and that nothing gets stuck, before real people try it.
//   play(scenario, { heroes, seed, maxSteps, onLine(line), onNote(text) }) -> { ending, nodes: [visited], steps, stuck, lines }
(function (D) {
  const PARTY = [
    { id: 'h1', name: 'Mira', cls: 'warden' }, { id: 'h2', name: 'Tobin', cls: 'mender' }, { id: 'h3', name: 'Asha', cls: 'outrider' },
    { id: 'h4', name: 'Pell', cls: 'kindler' }, { id: 'h5', name: 'Wren', cls: 'wanderer' },
  ];
  // what a player of each calling says on their turn, now and then (attack the rest of the time)
  const GIFT = { warden: 'I guard Tobin', mender: 'I heal Mira', kindler: 'ward us', outrider: 'I shoot it', wanderer: 'I stab it' };

  function play(sc, opts = {}) {
    let t = 0;
    const rnd = D.rules.rng((opts.seed || 1) * 7919);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const lines = [], nodes = new Set();
    const d = new D.director.Director({
      now: () => t, rng: D.rules.rng(opts.seed || 1), scenarios: { [sc.id]: sc },
      emit: (e) => {
        if (e.k === 'say') for (const l of e.lines) { lines.push(l); if (opts.onLine) opts.onLine(l); }
        if (e.k === 'note' && opts.onNote) opts.onNote(e.t);
      },
    });
    const party = (opts.heroes || PARTY.slice(0, opts.count || 3));
    party.forEach((h, i) => d.join(h, i));
    d.start(sc.id);
    let steps = 0, stuck = false, idle = 0;
    const speak = (h, text) => { if (opts.onNote) opts.onNote(`  ${h.name} says: ${text}`); d.heard(h.id, text); };
    for (; steps < (opts.maxSteps || 400) && !d.st.ending; steps++) {
      t += 3000; d.tick();
      const standing = d.standing();
      if (!standing.length) { t += 10000; d.tick(); continue; }
      for (const it of Object.values(d.st.items)) if (it.shown && !it.holder && rnd() < 0.5) d.act(pick(standing).id, 'take', { item: it.id });
      if (d.st.pending) { speak(pick(standing), rnd() < 0.85 ? 'yes' : 'no'); continue; }
      const cb = d.st.combat;
      if (cb) {
        const turn = cb.order[cb.turn];
        if (turn && turn.kind === 'hero') {
          const h = d.st.heroes[turn.id];
          const scen = d.options();
          if (scen.length && rnd() < 0.1) speak(h, pick(pick(scen).hear));
          else if (h.hp < h.maxHp / 3 && Object.values(d.st.items).some((i) => i.holder === h.id && i.heal)) speak(h, 'I drink the potion');
          else if (rnd() < 0.2) speak(h, GIFT[h.cls] || 'defend');
          else speak(h, rnd() < 0.1 ? 'I defend' : 'attack');
        } else { t += 6000; d.tick(); }
        continue;
      }
      const opts2 = d.options();
      if (!opts2.length) { idle++; t += 30000; d.tick(); if (idle > 20) { stuck = true; break; } continue; }
      idle = 0;
      const c = (opts.choose && opts.choose(opts2, d)) || pick(opts2);
      speak(pick(standing), pick(c.hear));
    }
    for (const k of Object.keys(d.st.done)) if (k[0] === '@') nodes.add(k.slice(1));
    return { ending: d.st.ending ? d.st.ending.id : null, nodes: [...nodes], steps, stuck: stuck || !d.st.ending, lines, director: d };
  }

  D.sim = { play, PARTY };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.DND = globalThis.DND || {}));
