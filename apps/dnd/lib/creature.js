// The creatures' minds: no script and no language model, a few goals with scores (design, section 4). The host runs them.
// A creature remembers each hero: threat (harm done to it), respect (kind words, gifts) and how many times that hero has wounded it;
// the memory goes into the campaign's save, so next time it meets the same hero it remembers. It learns: wounded three times by one
// hero it holds a grudge (it goes for that hero first, and harder). It turns to face whoever it is after. No DOM, no network.
// Positions are on the floor in the common frame (metres: x along the room, y across it); a hero whose position is not known (a
// trial run without headsets, nobody has tapped the map) is placed by chance where geometry would be needed.
//   make(def, memory) -> creature           memory: { heroId: { threat, respect, wounds } } from the campaign, or nothing
//   target(c, heroes) -> hero | null        who it is after now
//   decide(c, heroes, rng) -> { move: 'claw' | 'breath' | 'flee', target, targets }
//   hurt(c, heroId, n) -> [what changed: 'grudge', 'flee', 'dead']
//   step(c, heroes, dt)                     turn (and walk) toward its target; says whether it moved
(function (D) {
  const TAU = Math.PI * 2;
  const wrap = (a) => ((a % TAU) + TAU + Math.PI) % TAU - Math.PI;

  function make(def, memory) {
    const c = {
      id: def.id, name: def.name, voice: def.voice || 'narrator', kind: def.kind || 'beast',
      hp: def.hp, maxHp: def.hp, def: def.def || 12, size: def.size || 1,
      x: def.at ? def.at[0] : 2, y: def.at ? def.at[1] : 1.5, yaw: def.yaw || 0,
      mood: def.mood || 'watch', target: null,
      attack: Object.assign({ name: 'claws', bonus: 4, dmg: '1d8' }, def.attack || {}),
      breath: def.breath ? Object.assign({ name: 'breath', dmg: '2d6', dc: 12, stat: 'grace', every: 3, len: 4, angle: 60 }, def.breath) : null,
      speed: def.speed || 0.6, reach: def.reach || 1.2, flee: def.flee === undefined ? 0.25 : def.flee,
      sinceBreath: 99, mem: {}, learned: [],
    };
    for (const [id, m] of Object.entries(memory || {})) c.mem[id] = Object.assign({ threat: 0, respect: 0, wounds: 0 }, m);
    return c;
  }
  const mem = (c, id) => (c.mem[id] = c.mem[id] || { threat: 0, respect: 0, wounds: 0 });
  const placed = (h) => Number.isFinite(h.x) && Number.isFinite(h.y);
  const dist = (c, h) => (placed(h) ? Math.hypot(h.x - c.x, h.y - c.y) : 2.5);
  const standing = (heroes) => heroes.filter((h) => h.here && !h.down);
  const grudge = (c, id) => c.learned.includes(`grudge:${id}`);

  // Fighting: whoever hurt it most, near ones first, a grudge above all. Talking: the one it respects most.
  function target(c, heroes) {
    const hs = standing(heroes);
    if (!hs.length) return null;
    const score = (h) => {
      const m = mem(c, h.id);
      if (c.mood === 'talk') return m.respect * 2 - m.threat + Math.max(0, 4 - dist(c, h)) * 0.1;
      return m.threat * 2 + Math.max(0, 4 - dist(c, h)) + (grudge(c, h.id) ? 6 : 0) - m.respect * 0.5;
    };
    return hs.reduce((a, b) => (score(b) > score(a) ? b : a));
  }

  // the heroes in the cone in front of it (breath): by geometry when we know where they stand, by chance when not
  function inCone(c, heroes, rnd) {
    const b = c.breath, hs = standing(heroes);
    return hs.filter((h) => {
      if (!placed(h)) return rnd() < 0.45;
      const d = dist(c, h), a = Math.abs(wrap(Math.atan2(h.y - c.y, h.x - c.x) - c.yaw));
      return d <= b.len + c.size * 0.5 && a <= (b.angle * Math.PI) / 360;
    });
  }

  function decide(c, heroes, rnd) {
    c.sinceBreath++;
    if (c.mood === 'flee') return { move: 'flee' };
    const t = target(c, heroes);
    if (!t) return { move: 'wait' };
    c.target = t.id;
    if (placed(t)) c.yaw = Math.atan2(t.y - c.y, t.x - c.x);
    if (c.breath && c.sinceBreath >= c.breath.every) {
      const cone = inCone(c, heroes, rnd);
      if (cone.length >= 2 || (cone.length === 1 && standing(heroes).length === 1)) { c.sinceBreath = 0; return { move: 'breath', targets: cone, target: t }; }
    }
    return { move: 'claw', target: t, edge: grudge(c, t.id) ? 1 : 0 };
  }

  function hurt(c, heroId, n) {
    const out = [];
    c.hp = Math.max(0, c.hp - n);
    if (heroId) {
      const m = mem(c, heroId);
      m.threat += n; m.wounds++;
      if (m.wounds >= 3 && !grudge(c, heroId)) { c.learned.push(`grudge:${heroId}`); out.push('grudge'); }
    }
    if (c.hp <= 0) { c.mood = 'dead'; out.push('dead'); }
    // badly hurt, it flees; unless it holds a grudge: then pride keeps it fighting to the end
    else if (c.mood !== 'flee' && c.flee > 0 && c.hp <= c.maxHp * c.flee && !c.learned.some((l) => l.startsWith('grudge:'))) { c.mood = 'flee'; out.push('flee'); }
    return out;
  }
  function respect(c, heroId, n) { mem(c, heroId).respect += n; }

  // between turns: turn toward its target (or the nearest hero when awake and watching), step in when fighting
  function step(c, heroes, dt, room) {
    if (c.mood === 'asleep' || c.mood === 'dead' || c.mood === 'gone') return false;
    const hs = standing(heroes).filter(placed);
    let t = hs.find((h) => h.id === c.target);
    if (!t && hs.length) t = hs.reduce((a, b) => (dist(c, b) < dist(c, a) ? b : a));
    if (!t) return false;
    const want = Math.atan2(t.y - c.y, t.x - c.x), turn = wrap(want - c.yaw), rate = 1.6 * dt;
    let moved = Math.abs(turn) > 0.02;
    c.yaw = wrap(c.yaw + Math.max(-rate, Math.min(rate, turn)));
    if (c.mood === 'fight' && dist(c, t) > c.reach + c.size * 0.5 && Math.abs(turn) < 0.5) {
      const d = Math.min(c.speed * dt, dist(c, t) - c.reach - c.size * 0.5);
      c.x += Math.cos(c.yaw) * d; c.y += Math.sin(c.yaw) * d;
      if (room) { c.x = Math.max(0, Math.min(room.w, c.x)); c.y = Math.max(0, Math.min(room.d, c.y)); }
      moved = true;
    }
    return moved;
  }

  // what is saved and shown: everything but functions (there are none) and with rounded numbers
  function view(c) {
    return { id: c.id, name: c.name, kind: c.kind, hp: c.hp, maxHp: c.maxHp, mood: c.mood, target: c.target, size: c.size,
      x: Math.round(c.x * 100) / 100, y: Math.round(c.y * 100) / 100, yaw: Math.round(c.yaw * 100) / 100, mem: c.mem, learned: c.learned };
  }

  D.creature = { make, mem, target, decide, hurt, respect, step, view, inCone };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.DND = globalThis.DND || {}));
