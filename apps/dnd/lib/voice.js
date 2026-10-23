// Which recording says a line. A line is { t: text, v: voice }; its recording is audio/<id>.wav, where id is a hash of voice and
// text, so a line keeps its recording as long as its words do not change (tools/dnd-voice.js makes them with a local TTS, Piper).
// Voices: narrator, and one per creature that speaks (the scenario says which).
(function (D) {
  function id(line) {
    let h = 0x811c9dc5;
    const s = `${line.v || 'narrator'}|${line.t}`;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(16).padStart(8, '0');
  }
  // seconds the line takes to say, about (for pacing: the director does not count silence while the narrator speaks)
  const seconds = (line) => 0.6 + String(line.t).split(/\s+/).length / 2.5;
  D.voice = { id, seconds };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.DND = globalThis.DND || {}));
