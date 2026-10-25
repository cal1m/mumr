// The PC's view of the world: a watcher (WorldFeed), no game logic. feed.session is the document, as a player has it; for things that
// move, feed.sample('token', null, feed.serverNow() - delay) (docs/HOWTO-NEW-APP.md section 5). Draw what the headsets draw from one
// module that this page and app.js both use, so they cannot differ.
(async function () {
  const M = window.MUMR, A = window.APP, $ = (id) => document.getElementById(id);
  const info = await fetch('/info').then((r) => r.json()).catch(() => ({ build: 0 }));
  const life = M.life.make({ name: 'PC view' });
  const feed = M.worldfeed.WorldFeed.connect(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`, { build: info.build, name: 'PC view', session: { game: A.GAME, player: A.PLAYER } });
  const S = feed.session;
  function draw() {
    $('world').textContent = `count ${S.game('count')}   players: ${[...S.peers.keys()].map((s) => `${s + 1} (${A.COLOURS[S.stateOf(s).colour % A.COLOURS.length]})`).join(', ') || 'none'}`;
    $('status').textContent = `${S.connected ? 'connected' : 'not connected'}, ${S.others} here\n${life.lines().slice(-6).join('\n')}`;
  }
  setInterval(draw, 500);
  draw();
})();
