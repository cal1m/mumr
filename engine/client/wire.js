// The packets that carry motion, as bytes. Latest wins: nothing here is numbered or repeated (what must arrive, in order, goes as
// JSON events: see session.js). No THREE and no DOM.
//
// Every packet starts with the same header, little-endian:
//   u8 type   u8 sender's slot (the server writes it: never trust it from a page)   u32 sender's clock (ms)
// then the body of its type. The app registers its own types; two are built in:
//   P (2)  presence: a player's head and hands. 5 x i16 head (x mm, y mm, heading 1e-4 rad, height mm, pitch 1e-4 rad)  u8 sources
//          a source: u8 id (IDS)  u8 flags  i16 yaw (1e-4 rad, -32768 = none)
//                    flag 1: 75 x i16, the 25 WebXR joints in mm;  otherwise u8 n, then n x (u8 name (NAMES), 3 x i16 mm)
//          flags: 1 joints, 2 foot, 4 grip, 8 may push but not hold, 16 pinching
//          (byte for byte Nudgy's P packet)
//   M (4)  menus: JSON (where a player's panels float and what mode they are in; ten a second, small)
// Positions are in the common frame (align.js Space): heights above the common floor.
//
// register({ type, name, pack(obj) -> Uint8Array body, unpack(DataView body) -> obj | null, blend(a, b, f) (optional: how a
// watcher interpolates two samples; without it the older one is shown), token (optional: the token whose holder alone sends it; the
// server must be told the same in its `owned`) })
(function (M) {
  const HEADER = 6;
  const T = { P: 2, M: 4 };
  const specs = new Map(), names = new Map();
  const view = (buf) => (buf instanceof ArrayBuffer ? new DataView(buf) : new DataView(buf.buffer, buf.byteOffset, buf.byteLength));

  function register(spec) {
    const { type, name } = spec;
    if (!Number.isInteger(type) || type < 1 || type > 255) throw new Error(`wire: type ${type} is not a byte`);
    if (typeof name !== 'string' || !name) throw new Error('wire: a type needs a name');
    const was = specs.get(type);
    if (was && was.name !== name) throw new Error(`wire: type ${type} is ${was.name} already`);
    if (names.has(name) && names.get(name).type !== type) throw new Error(`wire: ${name} is type ${names.get(name).type} already`);
    if (typeof spec.pack !== 'function' || typeof spec.unpack !== 'function') throw new Error(`wire: ${name} needs pack and unpack`);
    const s = Object.assign({ blend: null, token: null }, spec);
    specs.set(type, s); names.set(name, s);
    return s;
  }
  const spec = (typeOrName) => (typeof typeOrName === 'number' ? specs.get(typeOrName) : names.get(typeOrName)) || null;
  const types = () => [...specs.values()];

  // a whole packet: the header (slot 0: the server writes it) and the body
  function encode(typeOrName, obj, clock) {
    const s = spec(typeOrName);
    if (!s) throw new Error(`wire: no type ${typeOrName}`);
    const body = s.pack(obj), out = new Uint8Array(HEADER + body.length);
    out[0] = s.type;
    new DataView(out.buffer).setUint32(2, (Math.round(clock) || 0) >>> 0, true);
    out.set(body, HEADER);
    return out;
  }
  // -> { type, name, slot, clock, data } or null (an unknown type, or a body that does not parse)
  function decode(buf) {
    const d = view(buf);
    if (d.byteLength < HEADER) return null;
    const s = specs.get(d.getUint8(0));
    if (!s) return null;
    let data = null;
    try { data = s.unpack(new DataView(d.buffer, d.byteOffset + HEADER, d.byteLength - HEADER)); } catch (e) { data = null; }
    return data === null || data === undefined ? null : { type: s.type, name: s.name, slot: d.getUint8(1), clock: d.getUint32(2, true), data };
  }
  const typeOf = (buf) => { const d = view(buf); return d.byteLength >= HEADER ? d.getUint8(0) : 0; };
  const slotOf = (buf) => { const d = view(buf); return d.byteLength >= HEADER ? d.getUint8(1) : -1; };

  // Packets may arrive out of order (and a stream may start again: a page reloaded). An older one than the newest seen from the same
  // sender and type is of no use. fresh() says whether to take it, and remembers it.
  class Guard {
    constructor(restart = 5000) { this.last = new Map(); this.restart = restart; this.dropped = 0; }
    fresh(type, slot, clock) {
      const k = type * 256 + slot, last = this.last.get(k);
      if (last !== undefined && clock <= last && clock > last - this.restart) { this.dropped++; return false; }
      this.last.set(k, clock);
      return true;
    }
    // a sender starts again (another headset holds the token now; a player left): its order starts again
    forget(slot, type) { for (const k of [...this.last.keys()]) if (k % 256 === slot && (type === undefined || Math.floor(k / 256) === type)) this.last.delete(k); }
  }

  // ---- presence (P)
  const P = { ids: ['left', 'right', 'hand', 'left-foot', 'right-foot', 'mouse', 'remote', 'mouse-foot'],
    names: ['index', 'thumb', 'middle', 'ring', 'pinky', 'palm', 'ctrl', 'toe', 'heel', 'hip', 'knee', 'ankle'] };      // (appended: the first nine are Nudgy's numbers)
  const TIPS = { thumb: 4, index: 9, middle: 14, ring: 19, pinky: 24 }, PALM = [10, 11];
  const MAX_SOURCES = 8, MAX_POINTS = 12;
  const i16 = (v) => Math.max(-32767, Math.min(32767, Math.round(+v || 0)));
  const mm = (v) => i16((+v || 0) * 1000);
  const ang = (a) => i16(Math.atan2(Math.sin(+a || 0), Math.cos(+a || 0)) * 1e4);
  const whole = (s) => Array.isArray(s.joints) && s.joints.length === 25 && s.joints.every((j) => Number.isFinite(j[0]) && Number.isFinite(j[1]) && Number.isFinite(j[2]));
  // the lists of source ids and point names (an app with other inputs sets its own; every page of the app must use the same)
  function configurePresence(o) { if (o.ids) P.ids = o.ids.slice(0, 255); if (o.names) P.names = o.names.slice(0, 255); }

  function packPresence(p) {
    const sources = (p.sources || []).slice(0, MAX_SOURCES);
    let size = 11;
    for (const s of sources) size += 4 + (whole(s) ? 150 : 1 + Math.min(MAX_POINTS, (s.points || []).length) * 7);
    const out = new Uint8Array(size), d = new DataView(out.buffer), h = p.head || [];
    d.setInt16(0, mm(h[0]), true); d.setInt16(2, mm(h[1]), true); d.setInt16(4, ang(h[2]), true); d.setInt16(6, mm(h[3]), true); d.setInt16(8, ang(h[4]), true);
    out[10] = sources.length;
    let o = 11;
    for (const s of sources) {
      const w = whole(s), id = P.ids.indexOf(String(s.id));
      out[o] = id < 0 ? 2 : id;
      out[o + 1] = (w ? 1 : 0) + (s.foot ? 2 : 0) + (s.grip ? 4 : 0) + (s.noHold ? 8 : 0) + (s.pinch ? 16 : 0);
      d.setInt16(o + 2, s.yaw === undefined ? -32768 : ang(s.yaw), true);
      o += 4;
      if (w) for (const j of s.joints) { d.setInt16(o, mm(j[0]), true); d.setInt16(o + 2, mm(j[1]), true); d.setInt16(o + 4, mm(j[2]), true); o += 6; }
      else {
        const pts = (s.points || []).slice(0, MAX_POINTS);
        out[o++] = pts.length;
        for (const q of pts) { out[o] = Math.max(0, P.names.indexOf(q.name)); d.setInt16(o + 1, mm(q.x), true); d.setInt16(o + 3, mm(q.y), true); d.setInt16(o + 5, mm(q.z), true); o += 7; }
      }
    }
    return out;
  }
  function unpackPresence(d) {
    if (d.byteLength < 11) return null;
    const n = d.getUint8(10);
    if (n > MAX_SOURCES) return null;
    const p = { head: [d.getInt16(0, true) / 1000, d.getInt16(2, true) / 1000, d.getInt16(4, true) / 1e4, d.getInt16(6, true) / 1000, d.getInt16(8, true) / 1e4], sources: [] };
    let o = 11;
    for (let k = 0; k < n; k++) {
      if (o + 4 > d.byteLength) return null;
      const fl = d.getUint8(o + 1), yaw = d.getInt16(o + 2, true), s = { id: P.ids[d.getUint8(o)] || 'hand', points: [] };
      if (fl & 2) s.foot = true;
      if (fl & 4) s.grip = true;
      if (fl & 8) s.noHold = true;
      if (fl & 16) s.pinch = true;
      if (yaw !== -32768) s.yaw = yaw / 1e4;
      o += 4;
      if (fl & 1) {
        if (o + 150 > d.byteLength) return null;
        s.joints = [];
        for (let i = 0; i < 25; i++, o += 6) s.joints.push([d.getInt16(o, true) / 1000, d.getInt16(o + 2, true) / 1000, d.getInt16(o + 4, true) / 1000]);
        for (const [name, i] of Object.entries(TIPS)) s.points.push({ name, x: s.joints[i][0], y: s.joints[i][1], z: s.joints[i][2] });
        const a = s.joints[PALM[0]], b = s.joints[PALM[1]];
        s.points.push({ name: 'palm', x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2 });
      } else {
        if (o + 1 > d.byteLength) return null;
        const m = d.getUint8(o++);
        if (m > MAX_POINTS || o + m * 7 > d.byteLength) return null;
        for (let i = 0; i < m; i++, o += 7) s.points.push({ name: P.names[d.getUint8(o)] || 'index', x: d.getInt16(o + 1, true) / 1000, y: d.getInt16(o + 3, true) / 1000, z: d.getInt16(o + 5, true) / 1000 });
      }
      p.sources.push(s);
    }
    return o === d.byteLength ? p : null;
  }

  // blending for a watcher (worldfeed.js): two samples a fraction f apart
  const lerp = (a, b, f) => a + (b - a) * f;
  const lerpAng = (a, b, f) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * f;
  const lerpArr = (a, b, f) => a.map((v, i) => lerp(v, b[i], f));
  function lerpPoints(a, b, f) {
    if (!a || !b || a.length !== b.length) return a;
    return a.map((p, i) => (p.name === b[i].name ? Object.assign({}, p, { x: lerp(p.x, b[i].x, f), y: lerp(p.y, b[i].y, f), z: lerp(p.z, b[i].z, f) }) : p));
  }
  function blendPresence(A, B, f) {
    const head = [lerp(A.head[0], B.head[0], f), lerp(A.head[1], B.head[1], f), lerpAng(A.head[2], B.head[2], f), lerp(A.head[3], B.head[3], f), lerp(A.head[4], B.head[4], f)];
    const base = f < 0.5 ? A.sources : B.sources, other = f < 0.5 ? B.sources : A.sources, g = f < 0.5 ? f : 1 - f;      // (the list of the nearer sample, moved towards the other)
    const sources = base.map((s) => {
      const o = other.find((q) => q.id === s.id);
      if (!o) return s;
      const out = Object.assign({}, s, { points: lerpPoints(s.points, o.points, g) });
      if (s.joints && o.joints && s.joints.length === o.joints.length) out.joints = s.joints.map((j, i) => lerpArr(j, o.joints[i], g));
      if (Number.isFinite(s.yaw) && Number.isFinite(o.yaw)) out.yaw = lerpAng(s.yaw, o.yaw, g);
      return out;
    });
    return { head, sources };
  }

  // ---- JSON packets (M, and any app type made with jsonType)
  const enc = new TextEncoder(), dec = new TextDecoder();
  const packJson = (obj) => enc.encode(JSON.stringify(obj));
  function unpackJson(d) {
    if (d.byteLength < 2) return null;
    const obj = JSON.parse(dec.decode(new Uint8Array(d.buffer, d.byteOffset, d.byteLength)));
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : null;
  }
  const jsonType = (type, name, extra = {}) => register(Object.assign({ type, name, pack: packJson, unpack: unpackJson }, extra));

  register({ type: T.P, name: 'presence', pack: packPresence, unpack: unpackPresence, blend: blendPresence });
  jsonType(T.M, 'menus');

  M.wire = { HEADER, T, register, spec, types, encode, decode, typeOf, slotOf, Guard, jsonType, configurePresence, presence: P,
    blend: { lerp, lerpAng, lerpArr }, view };
})(typeof module !== 'undefined' ? (module.exports = require('./ns.js')) : (globalThis.MUMR = globalThis.MUMR || {}));
