// The narrator's recordings for the DnD app, made beforehand on this PC with Piper (a local, open-source TTS: decision 2 of the design;
// check each voice model's licence). Every fixed line of every scenario, and the stock lines without names in them, become
// apps/dnd/audio/<id>.wav (id: lib/voice.js, from the voice and the words, so a changed line gets a new recording). Lines with a name
// in them ("Mira, your move") are said by the browser's own local voice instead.
//   node tools/dnd-voice.js                        list what would be recorded (apps/dnd/audio/lines.json)
//   node tools/dnd-voice.js --piper=C:\piper\piper.exe     record what is missing, with the voices in apps/dnd/audio/voices.json:
//       { "narrator": { "model": "C:/piper/en_GB-alan-medium.onnx" }, "vhorr": { "model": "...", "length_scale": 1.3 }, ... }
//   a voice not in voices.json uses the narrator's model.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const D = require('../apps/dnd/lib/all.js');

const AUDIO = path.join(__dirname, '..', 'apps', 'dnd', 'audio');
const arg = (k) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : null; };

const fixed = new Map(), named = new Set();
const add = (l, v) => {
  const line = typeof l === 'string' ? { t: l, v: v || 'narrator' } : { t: l.t, v: l.v || v || 'narrator' };
  if (!line.t) return;
  if (/\{/.test(line.t)) { named.add(line.t); return; }
  const t = line.t.charAt(0).toUpperCase() + line.t.slice(1);              // (as the director says it)
  fixed.set(D.voice.id({ t, v: line.v }), { t, v: line.v });
};
const walk = (x, v) => {
  if (Array.isArray(x)) { for (const y of x) walk(y, v); return; }
  if (!x || typeof x !== 'object') return;
  for (const k of ['say', 'hints', 'again']) for (const l of [].concat(x[k] || [])) add(l, v);
  for (const k of ['choices', 'check', 'pass', 'fail']) walk(x[k], v);
};
for (const sc of Object.values(D.scenarios)) {
  for (const n of Object.values(sc.nodes)) walk(n);
  for (const c of sc.creatures || []) for (const ls of Object.values(c.lines || {})) for (const l of ls) add(l, c.voice);
}
for (const variants of Object.values(D.lines)) for (const t of variants) add(t);

fs.mkdirSync(AUDIO, { recursive: true });
const list = [...fixed].map(([id, l]) => ({ id, v: l.v, t: l.t }));
fs.writeFileSync(path.join(AUDIO, 'lines.json'), JSON.stringify(list, null, 1));
const byVoice = {};
for (const l of list) byVoice[l.v] = (byVoice[l.v] || 0) + 1;
console.log(`${list.length} fixed lines (${Object.entries(byVoice).map(([v, n]) => `${v} ${n}`).join(', ')}); ${named.size} lines with names are left to the browser's voice`);

const piper = arg('piper');
if (piper) {
  let voices = {};
  try { voices = JSON.parse(fs.readFileSync(path.join(AUDIO, 'voices.json'), 'utf8')); } catch (e) { console.error('apps/dnd/audio/voices.json is missing: see the top of this file'); process.exit(2); }
  let made = 0, failed = 0;
  for (const l of list) {
    const out = path.join(AUDIO, `${l.id}.wav`);
    if (fs.existsSync(out)) continue;
    const v = voices[l.v] || voices.narrator;
    if (!v || !v.model) { failed++; continue; }
    const args = ['--model', v.model, '--output_file', out];
    if (v.speaker !== undefined) args.push('--speaker', String(v.speaker));
    if (v.length_scale) args.push('--length_scale', String(v.length_scale));
    const r = spawnSync(piper, args, { input: l.t, encoding: 'utf8' });
    if (r.status === 0 && fs.existsSync(out)) made++; else { failed++; console.error(`failed: ${l.id} ${l.t.slice(0, 40)}: ${(r.stderr || r.error || '').toString().slice(0, 200)}`); }
  }
  console.log(`recorded ${made}, failed ${failed}`);
}
const have = fs.readdirSync(AUDIO).filter((f) => f.endsWith('.wav')).map((f) => f.slice(0, -4));
fs.writeFileSync(path.join(AUDIO, 'index.json'), JSON.stringify({ lines: have }));
console.log(`${have.length} recordings in apps/dnd/audio (index.json written)`);
