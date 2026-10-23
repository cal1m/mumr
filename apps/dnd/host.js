// The DnD host module: client/host.js runs it on the PC (mumr.json "host"). It is the game master: the director (lib/director.js)
// hears what the players say and do and the game master's page's commands, rolls every die, and publishes the world. The campaign
// (heroes, what the creatures remember, the endings played) and the game in progress are saved in saves/campaign.json, so a restart
// of the host (a new build of the pages restarts it) or of the PC carries on where it was.
// Where a hero stands comes from their headset (the head in the presence stream) once players are in mixed reality; in a trial with
// phones or tabs, from a tap on the map.
const fs = require('node:fs');
const path = require('node:path');
const D = require('./lib/all.js');

const SAVE = process.env.DND_SAVE || path.join(__dirname, 'saves', 'campaign.json');

function fileStore(file) {
  let timer = null, last = null;
  const write = () => {
    timer = null;
    try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(`${file}.tmp`, JSON.stringify(last, null, 1)); fs.renameSync(`${file}.tmp`, file); } catch (e) { console.error(`save: ${e.message}`); }
  };
  return {
    load() { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return null; } },
    save(obj) { last = obj; if (!timer) timer = setTimeout(write, 500); },
  };
}

module.exports = {
  session: D.game.sessionOptions(),
  setup({ session, presence, life }) {
    let live = false;
    const dir = new D.director.Director({ emit: (e) => session.emit(e), log: life, store: fileStore(SAVE), now: () => Date.now() });
    // (the events in the server's document when the host joins are old: only what comes after counts)
    session.on('join', () => { live = true; life(`dnd: the world is published (${Object.keys(dir.st.heroes).length} heroes known, scenario ${dir.st.scenario || 'none'})`); dir.online(); });
    session.on('leave', () => { live = false; });
    session.on('event', (e, from) => {
      if (!live || from === D.game.HOST || !e) return;
      if (e.k === 'join') dir.join(e.hero, from);
      else if (e.k === 'said' && typeof e.text === 'string') dir.heard(e.hero, e.text);
      else if (e.k === 'move') dir.move(e.hero, e.x, e.y);
      else if (e.k === 'act') dir.act(e.hero, e.what, e.args || {});
      else if (e.k === 'gm') dir.gm(e.cmd);
    });
    session.on('peer', (slot, on) => { if (!on) dir.left(slot); });
    let tickAt = 0, headsAt = 0;
    return {
      bodies: [],
      step(dt, t) {
        const now = t * 1000;
        if (now - tickAt >= 250) { tickAt = now; dir.tick(); }
        // headsets: a hero stands where the head is (common frame, metres)
        if (now - headsAt >= 500) {
          headsAt = now;
          for (const p of presence.others(now)) {
            const h = Object.values(dir.st.heroes).find((x) => x.here && x.slot === p.slot);
            if (h && p.head && (!Number.isFinite(h.x) || Math.hypot(p.head[0] - h.x, p.head[1] - h.y) > 0.15)) dir.move(h.id, p.head[0], p.head[1]);
          }
        }
      },
    };
  },
};
