// This page's end of the WebSocket to the PC (server/serve.py, server/hub.py). It connects, says who it is,
// keeps the connection alive, measures the round trip and comes back by itself when the Wi-Fi drops, or when the
// other end has stopped answering without the socket saying so (a headset that was taken off and came back can find a
// connection that the server gave up on long ago). It reports what happens to it (onNote) and why a close came
// (lastClose: code and reason). What the messages mean is session.js's business. Works in the browser and in Node
// (tests). No THREE and no DOM. From Nudgy (simulator/mr/link.js).
(function (M) {
  const PING = 250;            // ms: also how the hub knows this page is alive (a silent holder loses its tokens after 1 s)
  const DEAD = 4000;           // ms: nothing at all heard for this long (the server answers every ping) and the connection is not believed in
  const PAUSED = 1500;         // ms: a gap this long between two ticks of our own timer means the page was paused: nothing could have been heard either
  const BACKLOG = 16384;       // bytes waiting to go out: beyond that, motion is dropped instead of queued

  // url: ws(s)://host/ws. opts: { build (a number, or a function that returns it), name, join (more fields for the join message:
  // { role: 'viewer' }), WebSocket (for tests), now, pingMs, deadMs, retryMs (tests) }
  function connect(url, opts = {}) {
    const WS = opts.WebSocket || globalThis.WebSocket;
    const link = { slot: null, open: false, rtt: null, hello: null, why: '', sent: 0, got: 0, drops: 0, lastClose: null,
      clockOffset: null, clockSpread: null, serverNow: () => (link.clockOffset === null ? null : now() + link.clockOffset),
      onOpen: null, onText: null, onBin: null, onClose: null, onNote: null };
    const samples = [];                                         // the last pings' round trip and offset to the server's clock
    let ws = null, closed = false, tries = 0, pingT = null, retryT = null;
    const now = opts.now || (() => (globalThis.performance ? performance.now() : Date.now()));
    const pingMs = opts.pingMs || PING, deadMs = opts.deadMs || DEAD, retryMs = opts.retryMs || 1000;
    let lastIn = now(), lastTick = now();
    const note = (what) => { if (link.onNote) { try { link.onNote(what); } catch (e) { /* a note is not worth a crash */ } } };
    const hold = (t) => { if (t && t.unref) t.unref(); return t; };       // (Node: a timer must not keep a test alive)

    function start() {
      if (closed) return;
      try { ws = new WS(url); } catch (e) { retry(); return; }
      const mine = ws;
      mine.binaryType = 'arraybuffer';
      lastIn = now();
      note('connecting');
      mine.onopen = () => { if (mine === ws) note('open, joining'); if (mine === ws) mine.send(JSON.stringify(Object.assign({ t: 'join', build: typeof opts.build === 'function' ? opts.build() : opts.build, name: opts.name || '' }, opts.join || {}))); };
      mine.onmessage = (e) => {
        if (mine !== ws) return;
        link.got++; lastIn = now();
        if (typeof e.data !== 'string') { if (link.onBin) link.onBin(e.data); return; }
        let m; try { m = JSON.parse(e.data); } catch (err) { return; }
        if (!m || typeof m !== 'object') return;
        if (m.t === 'hello') { link.slot = m.slot; link.open = true; link.hello = m; link.why = ''; tries = 0; note(m.role === 'viewer' ? 'in, as a viewer' : `in, player ${m.slot + 1}`); if (link.onOpen) link.onOpen(m); }
        else if (m.t === 'refused') { link.why = String(m.why || 'refused'); closed = true; note(`refused: ${link.why}`); }       // another version, or full: coming back would not help
        else if (m.t === 'pong') {
          if (Number.isFinite(m.c)) {
            const rtt = Math.max(0, now() - m.c);
            link.rtt = Math.round(rtt);
            // The server's clock (m.s, ms): it read it somewhere between our sending the ping and our getting the answer, most likely in the
            // middle. The offset of the round trips that were quickest is the best guess (a slow one may have waited on one leg only).
            if (Number.isFinite(m.s)) {
              samples.push({ rtt, off: m.s - (m.c + rtt / 2) });
              if (samples.length > 20) samples.shift();
              const best = samples.slice().sort((a, b) => a.rtt - b.rtt).slice(0, 5), offs = best.map((q) => q.off);
              link.clockOffset = offs.reduce((a, b) => a + b, 0) / offs.length;
              link.clockSpread = Math.max(...offs) - Math.min(...offs);
            }
          }
        }
        else if (link.onText) link.onText(m);
      };
      mine.onclose = (e) => {
        if (mine !== ws) return;
        link.lastClose = { code: e && e.code !== undefined ? e.code : null, reason: e && e.reason ? e.reason : '', clean: !!(e && e.wasClean) };
        note(`closed, code ${link.lastClose.code}${link.lastClose.reason ? `, ${link.lastClose.reason}` : ''}`);
        down('lost');
      };
      mine.onerror = () => { if (mine === ws) note('socket error'); };
    }
    function down(why) {
      const was = link.open || !!link.why;
      link.open = false; link.slot = null; link.hello = null; ws = null;
      if (was && link.onClose) link.onClose(link.why || why || 'lost');
      retry();
    }
    function retry() {
      if (closed || retryT) return;
      const wait = Math.min(4000, retryMs * Math.pow(2, tries++));
      note(`reconnecting in ${(wait / 1000).toFixed(2).replace(/0$/, '')} s`);
      retryT = hold(setTimeout(() => { retryT = null; start(); }, wait));
    }
    link.sendText = (obj) => { if (!link.open || !ws || ws.readyState !== 1) return false; ws.send(JSON.stringify(obj)); link.sent++; return true; };
    link.sendBin = (bytes) => {
      if (!link.open || !ws || ws.readyState !== 1) return false;
      if (ws.bufferedAmount > BACKLOG) { link.drops++; return false; }
      ws.send(bytes); link.sent++;
      return true;
    };
    link.close = () => {
      closed = true;
      if (pingT) clearInterval(pingT);
      if (retryT) clearTimeout(retryT);
      const w = ws; ws = null;
      if (w) { try { w.close(); } catch (e) { /* already gone */ } }
      if (link.open) { link.open = false; link.slot = null; if (link.onClose) link.onClose('closed'); }
    };
    pingT = hold(setInterval(() => {
      const t = now(), gap = t - lastTick;
      lastTick = t;
      if (gap > PAUSED) { lastIn = t; note(`page was paused for ${(gap / 1000).toFixed(1)} s`); }      // (the connection gets its chance to show what came meanwhile)
      if (!(link.open && ws && ws.readyState === 1)) return;
      if (t - lastIn > deadMs) {
        note(`nothing heard for ${((t - lastIn) / 1000).toFixed(1)} s: reconnecting`);
        const w = ws; down('stalled'); try { w.close(); } catch (e) { /* already gone */ }
        return;
      }
      ws.send(JSON.stringify({ t: 'ping', c: now() }));
    }, pingMs));
    start();
    return link;
  }

  M.link = { connect, PING, DEAD };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.MUMR = globalThis.MUMR || {}));
