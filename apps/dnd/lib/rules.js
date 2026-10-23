// The rules: dice, heroes, checks, damage. Our own, inspired by the d20 games (a d20 plus a bonus against a number), with our own
// names. The host rolls everything; the players hear only what came of it, never the numbers. No DOM, no network.
//   rng(seed) -> () => [0, 1)          a seeded generator, so a test (or a replayed trial) rolls the same
//   roll('2d6+1', rng) -> { total, dice }
//   check({ bonus, dc, rng, edge }) -> { d20, total, ok, by, crit, fumble }     edge: +1 roll twice and keep the better, -1 the worse
//   makeHero({ id, name, cls }) -> a hero         CLASSES: the five callings a player picks from
//   hpWord(hp, max) -> 'unhurt' | 'scratched' | 'hurt' | 'badly hurt' | 'down'
(function (D) {
  function rng(seed) {
    let a = (seed >>> 0) || 0x9e3779b9;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const die = (sides, r) => 1 + Math.floor(r() * sides);

  // '2d6+1', 'd20', '3', '1d8-1'
  function roll(spec, r) {
    const m = /^\s*(\d*)d(\d+)\s*([+-]\s*\d+)?\s*$/.exec(String(spec));
    if (!m) { const n = parseInt(spec, 10) || 0; return { total: n, dice: [] }; }
    const dice = [];
    for (let k = 0; k < (+m[1] || 1); k++) dice.push(die(+m[2], r));
    const total = dice.reduce((s, d) => s + d, 0) + (m[3] ? parseInt(m[3].replace(/\s/g, ''), 10) : 0);
    return { total: Math.max(0, total), dice };
  }

  function check({ bonus = 0, dc = 10, rng: r, edge = 0 }) {
    let d20 = die(20, r);
    if (edge) { const b = die(20, r); d20 = edge > 0 ? Math.max(d20, b) : Math.min(d20, b); }
    const total = d20 + bonus, crit = d20 === 20, fumble = d20 === 1;
    const ok = crit || (!fumble && total >= dc);
    return { d20, bonus, dc, total, ok, by: total - dc, crit, fumble };
  }

  // The callings. Stats are bonuses: might (strength), grace (agility), wits (mind), heart (will and charm).
  const CLASSES = {
    warden: { name: 'Warden', blurb: 'shield and sword; stands in front of the others',
      hp: 14, def: 15, stats: { might: 2, grace: 0, wits: 0, heart: 1 }, weapon: { name: 'sword', bonus: 4, dmg: '1d8+2', stat: 'might' },
      gift: { id: 'guard', name: 'Guard', blurb: 'the next blow meant for a friend falls on you', uses: 2 } },
    outrider: { name: 'Outrider', blurb: 'quick, keen-eyed, deadly with a bow',
      hp: 11, def: 13, stats: { might: 0, grace: 3, wits: 1, heart: 0 }, weapon: { name: 'bow', bonus: 5, dmg: '1d8+1', stat: 'grace' },
      gift: { id: 'quick', name: 'Quick', blurb: 'you always act first in a fight', uses: 0 } },
    mender: { name: 'Mender', blurb: 'herbs and old words; keeps the others standing',
      hp: 10, def: 12, stats: { might: 0, grace: 0, wits: 1, heart: 3 }, weapon: { name: 'staff', bonus: 2, dmg: '1d6', stat: 'might' },
      gift: { id: 'mend', name: 'Mend', blurb: 'heal a friend you can reach', uses: 3, heal: '1d8+2' } },
    kindler: { name: 'Kindler', blurb: 'calls sparks and wards out of thin air',
      hp: 9, def: 11, stats: { might: -1, grace: 1, wits: 3, heart: 1 }, weapon: { name: 'sparks', bonus: 5, dmg: '1d10', stat: 'wits' },
      gift: { id: 'ward', name: 'Ward', blurb: 'a shimmer that shields everyone from the next blast', uses: 1 } },
    wanderer: { name: 'Wanderer', blurb: 'a smooth tongue and a hidden knife',
      hp: 10, def: 13, stats: { might: 0, grace: 2, wits: 1, heart: 3 }, weapon: { name: 'knife', bonus: 4, dmg: '1d6+1', stat: 'grace' },
      gift: { id: 'charm', name: 'Charm', blurb: 'words land better: talking checks roll twice', uses: 0 } },
  };

  function makeHero({ id, name, cls }) {
    const c = CLASSES[cls] || CLASSES.warden;
    return { id: String(id), name: String(name || 'Hero').slice(0, 24), cls: CLASSES[cls] ? cls : 'warden',
      hp: c.hp, maxHp: c.hp, def: c.def, stats: Object.assign({}, c.stats), uses: c.gift.uses,
      items: [], x: null, y: null, here: true, down: false, deeds: { hits: 0, dealt: 0, taken: 0 } };
  }
  const classOf = (h) => CLASSES[h.cls] || CLASSES.warden;
  const stat = (h, s) => (h.stats && h.stats[s]) || 0;

  function hpWord(hp, max) {
    if (hp <= 0) return 'down';
    const f = hp / Math.max(1, max);
    return f >= 1 ? 'unhurt' : f > 0.7 ? 'scratched' : f > 0.35 ? 'hurt' : 'badly hurt';
  }

  // how a result sounds: 'great' / 'good' / 'barely' / 'miss' / 'bad' (by how much it went over or under)
  function tier(c) {
    if (c.crit || (c.ok && c.by >= 8)) return 'great';
    if (c.ok) return c.by >= 3 ? 'good' : 'barely';
    return c.fumble || c.by <= -8 ? 'bad' : 'miss';
  }

  D.rules = { rng, roll, check, CLASSES, makeHero, classOf, stat, hpWord, tier };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.DND = globalThis.DND || {}));
