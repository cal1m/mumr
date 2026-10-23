// The narrator's voice on this page. A line plays its recording (audio/<id>.wav, made beforehand on the PC with a local TTS by
// tools/dnd-voice.js) when there is one; otherwise the browser says it, with a voice that runs on this machine only (no cloud: decision
// 2 of the design). Lines play one after another; stop() empties the queue.
//   const v = DND.speaker({ onLine(line) }); v.enabled = true; v.say(lines); v.stop()
(function (D) {
  // how each voice sounds when the browser says it (a recording has its own voice: audio/voices.json for the TTS)
  const STYLE = { narrator: { pitch: 1, rate: 0.95 }, vhorr: { pitch: 0.2, rate: 0.75 }, pip: { pitch: 1.7, rate: 1.1 }, ghost: { pitch: 1.3, rate: 0.85 }, moss: { pitch: 0.6, rate: 0.85 } };
  function speaker(opts = {}) {
    let known = null, queue = [], busy = false, audio = null, local = null;
    fetch('audio/index.json').then((r) => (r.ok ? r.json() : {})).then((j) => { known = new Set(j.lines || []); }).catch(() => { known = new Set(); });
    const pickVoice = () => {
      if (local || !globalThis.speechSynthesis) return local;
      const vs = speechSynthesis.getVoices().filter((v) => v.localService && /^en/i.test(v.lang));
      local = vs.find((v) => /en-GB/i.test(v.lang)) || vs[0] || null;
      return local;
    };
    const self = {
      enabled: true,
      say(lines) { if (!self.enabled) return; queue.push(...lines); if (!busy) next(); },
      stop() { queue = []; busy = false; if (audio) { audio.pause(); audio = null; } if (globalThis.speechSynthesis) speechSynthesis.cancel(); },
      get waiting() { return queue.length + (busy ? 1 : 0); },
    };
    function next() {
      const line = queue.shift();
      if (!line) { busy = false; return; }
      busy = true;
      if (opts.onLine) opts.onLine(line);
      const done = () => { audio = null; setTimeout(next, 250); };
      if (known && known.has(line.id)) {
        audio = new Audio(`audio/${line.id}.wav`);
        audio.onended = done; audio.onerror = () => browserSay(line, done);
        audio.play().catch(() => browserSay(line, done));
      } else browserSay(line, done);
    }
    function browserSay(line, done) {
      if (!globalThis.speechSynthesis || !globalThis.SpeechSynthesisUtterance) { setTimeout(done, 1000 * D.voice.seconds(line)); return; }
      const u = new SpeechSynthesisUtterance(line.t), st = STYLE[line.v] || STYLE.narrator, v = pickVoice();
      if (v) u.voice = v;
      u.lang = v ? v.lang : 'en-GB'; u.pitch = st.pitch; u.rate = st.rate;
      let over = false;
      const end = () => { if (!over) { over = true; done(); } };
      u.onend = end; u.onerror = end;
      setTimeout(end, 4000 + 1500 * D.voice.seconds(line));          // (some browsers never say onend)
      speechSynthesis.speak(u);
    }
    if (globalThis.speechSynthesis) speechSynthesis.onvoiceschanged = () => { local = null; };
    return self;
  }
  D.speaker = speaker;
})(globalThis.DND = globalThis.DND || {});
