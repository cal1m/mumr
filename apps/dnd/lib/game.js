// The shared document of the game: the session options every page uses (players, the game master's page, the host), so that what an
// event does is written once (HOWTO 2). The host (the director) writes the world; players and the game master only ask.
//
//   written by the host, kept for newcomers:   world  hero:<id>  creature:<id>  item:<id>  combat
//   news from the host (not kept):             say (the narrator's lines)  roll (the dice, for the game master's eyes)  note  heard
//   news from a player to the host:            join (my hero)  said (what I said)  move (where I stand)  act (take, give, drop, use)
//   from the game master's page (a viewer):    gm:<page>  (a viewer may only send things it owns: each command replaces the last)
// A host kind from anyone but the host is ignored (the hub writes who sent it), so a page cannot make up a roll.
(function (D) {
  const HOST = 15;
  const KEEP_NEWS = 40;
  const byHost = (S, from) => !S.connected || from === HOST;
  const news = (list, x) => { list.push(x); list.splice(0, list.length - KEEP_NEWS); };

  function sessionOptions() {
    return {
      init: (doc) => { doc.world = null; doc.heroes = {}; doc.creatures = {}; doc.items = {}; doc.combat = null; doc.said = []; doc.rolls = []; doc.notes = []; doc.heard = []; },
      kinds: {
        world: { keep: () => ({ key: 'world' }), apply: (S, e, from) => { if (byHost(S, from)) { S.doc.world = e.world; S.notify('world', e.world); } } },
        hero: { keep: (e) => ({ key: `hero:${e.id}`, drop: !!e.drop }), apply: (S, e, from) => { if (!byHost(S, from)) return; if (e.drop) delete S.doc.heroes[e.id]; else S.doc.heroes[e.id] = e.hero; S.notify('hero', e.id); } },
        creature: { keep: (e) => ({ key: `creature:${e.id}`, drop: !!e.drop }), apply: (S, e, from) => { if (!byHost(S, from)) return; if (e.drop) delete S.doc.creatures[e.id]; else S.doc.creatures[e.id] = e.creature; S.notify('creature', e.id); } },
        item: { keep: (e) => ({ key: `item:${e.id}`, drop: !!e.drop }), apply: (S, e, from) => { if (!byHost(S, from)) return; if (e.drop) delete S.doc.items[e.id]; else S.doc.items[e.id] = e.item; S.notify('item', e.id); } },
        combat: { keep: () => ({ key: 'combat' }), apply: (S, e, from) => { if (byHost(S, from)) { S.doc.combat = e.combat; S.notify('combat', e.combat); } } },
        say: { apply: (S, e, from) => { if (!byHost(S, from)) return; for (const l of e.lines || []) news(S.doc.said, Object.assign({ at: e.at }, l)); S.notify('say', e.lines || []); } },
        roll: { apply: (S, e, from) => { if (byHost(S, from)) { news(S.doc.rolls, e.roll); S.notify('roll', e.roll); } } },
        note: { apply: (S, e, from) => { if (byHost(S, from)) { news(S.doc.notes, e); S.notify('note', e); } } },
        heard: { apply: (S, e, from) => { if (byHost(S, from)) { news(S.doc.heard, e); S.notify('heard', e); } } },
        join: { apply: () => {} },
        said: { apply: () => {} },
        move: { apply: () => {} },
        act: { apply: () => {} },
        gm: { keep: (e) => ({ key: `gm:${e.page}`, own: true }), apply: () => {} },
      },
    };
  }

  D.game = { HOST, sessionOptions };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.DND = globalThis.DND || {}));
