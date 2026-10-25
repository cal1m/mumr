// Entering mixed reality, and the XR calls the plain modules need (an ES module; the page gives it THREE's renderer).
//
//   const xr = await enterXR({ renderer, life, onReset, onEnd, onVisibility, features })
//   xr.session, xr.refSpace, xr.features (what the browser granted), xr.select (inputSource -> pinching, from select events)
//   xr.anchorIO(storageKey)   the io for anchor.js Keeper (persistent anchor by its handle in localStorage)
//   xr.frame                  the current XRFrame: set it at the start of every frame callback (anchors can only be made inside one)
//   xr.shared                 the probe of the 'shared' reference space: { state, uuid } (see docs/NOTES.md, Answers 4)
//   xr.sharedFrame()          the shared space as an align.js frame in this headset's floor plan (null until it has a UUID)
//
// Every step goes to the life log, so a run on the headset says what the browser offered.
const M = () => globalThis.MUMR;
const OPTIONAL = ['hand-tracking', 'anchors', 'plane-detection', 'mesh-detection', 'body-tracking', 'shared'];

export async function enterXR({ renderer, life = () => {}, onReset = () => {}, onEnd = () => {}, onVisibility = () => {}, features = OPTIONAL } = {}) {
  const tries = [
    { requiredFeatures: ['local-floor'], optionalFeatures: features },
    { requiredFeatures: ['local-floor'], optionalFeatures: features.filter((f) => f !== 'shared' && f !== 'mesh-detection' && f !== 'body-tracking') },
    { requiredFeatures: ['local-floor'], optionalFeatures: ['hand-tracking'] },
  ];
  let session = null, err = null;
  for (const init of tries) { try { session = await navigator.xr.requestSession('immersive-ar', init); break; } catch (e) { err = e; life(`xr: refused with ${init.optionalFeatures.join(', ')}: ${e && e.message ? e.message : e}`); } }
  if (!session) throw err || new Error('no immersive-ar session');
  renderer.xr.setReferenceSpaceType('local-floor');
  await renderer.xr.setSession(session);
  const xr = { session, refSpace: renderer.xr.getReferenceSpace(), features: Array.from(session.enabledFeatures || []), select: new Map(), frame: null,
    shared: { state: 'not asked', uuid: null }, sharedSpace: null };
  life(`xr: session started; features ${xr.features.join(', ') || '(the browser does not say)'}`);
  session.addEventListener('selectstart', (e) => xr.select.set(e.inputSource, true));
  session.addEventListener('selectend', (e) => xr.select.set(e.inputSource, false));
  session.addEventListener('visibilitychange', () => { life(`xr: ${session.visibilityState}`); onVisibility(session.visibilityState); });
  session.addEventListener('end', () => { life('xr: session ended'); onEnd(); });
  if (xr.refSpace && xr.refSpace.addEventListener) {
    xr.refSpace.addEventListener('reset', (ev) => {
      const t = ev && ev.transform;
      if (t) life(`xr: reset height ${Math.round(t.position.y * 100)} cm (up), position ${Math.round(t.position.x * 100)}, ${Math.round(t.position.z * 100)} cm`);
      onReset(t ? M().align.frameFromPose(t.position, t.orientation) : null);
    });
  }
  probeShared(xr, life);

  xr.anchorIO = (key = 'mumr.anchor') => ({
    supported: xr.features.includes('anchors') && !!session.restorePersistentAnchor,
    stored: () => { try { return localStorage.getItem(key); } catch (e) { return null; } },
    store: (uuid) => { try { localStorage.setItem(key, uuid); } catch (e) { /* not kept */ } },
    restore: (uuid) => session.restorePersistentAnchor(uuid),
    create: () => (xr.frame && xr.frame.createAnchor ? xr.frame.createAnchor(new XRRigidTransform(), xr.refSpace) : Promise.reject(new Error('no frame'))),
    persist: (a) => (a.requestPersistentHandle ? a.requestPersistentHandle() : Promise.resolve(null)),
    pose: (a) => {
      const p = xr.frame && a && a.anchorSpace ? xr.frame.getPose(a.anchorSpace, xr.refSpace) : null;
      if (!p) return null;
      const m = p.transform.matrix;
      return { x: m[12], y: -m[14], yaw: Math.atan2(-m[2], m[0]) };
    },
    visible: () => !session.visibilityState || session.visibilityState === 'visible',
    now: () => performance.now(),
    life,
  });
  // The headset's own room setup (Quest: Space Setup), as Nudgy's Room setup button did. The browser allows it once in a session; after that the
  // way is to leave mixed reality and come back. -> 'started' | 'used' (once already: leave and come back) | 'none' (this browser has none)
  xr.roomUsed = false;
  xr.roomSetup = () => {
    if (!session.initiateRoomCapture) return 'none';
    if (xr.roomUsed) return 'used';
    xr.roomUsed = true;
    try { Promise.resolve(session.initiateRoomCapture()).then(() => life('xr: room setup done'), (e) => life(`xr: room setup: ${e && e.message ? e.message : e}`)); } catch (e) { life(`xr: room setup: ${e && e.message ? e.message : e}`); }
    life('xr: room setup started');
    return 'started';
  };
  xr.sharedFrame = () => {
    if (!xr.sharedSpace || !xr.shared.uuid || !xr.frame) return null;
    const p = xr.frame.getPose(xr.sharedSpace, xr.refSpace);
    return p ? M().align.fromPose(p.transform.position, p.transform.orientation) : null;
  };
  return xr;
}

// Does this browser offer a space that headsets in one room share? (Quest Browser: behind the flag "WebXR experiments")
function probeShared(xr, life) {
  const S = xr.shared;
  if (!xr.features.includes('shared')) { S.state = 'not granted (not in enabledFeatures)'; life(`xr: shared space: ${S.state}`); return; }
  S.state = 'asked';
  let req;
  try { req = xr.session.requestReferenceSpace('shared'); } catch (e) { S.state = `refused: ${e && e.name ? e.name : e}`; life(`xr: shared space: ${S.state}`); return; }
  req.then((space) => {
    xr.sharedSpace = space; S.state = 'granted';
    life(`xr: shared space granted (uuid ${space.uuid || 'not yet'})`);
    if (space.addEventListener) space.addEventListener('reset', () => life(`xr: shared space reset (uuid ${space.uuid || 'none'})`));
    const t0 = performance.now(), poll = setInterval(() => {
      if (space.uuid) { S.uuid = space.uuid; life(`xr: shared space uuid ${space.uuid} after ${Math.round(performance.now() - t0)} ms`); clearInterval(poll); }
      else if (performance.now() - t0 > 15000) { life('xr: shared space has no uuid after 15 s'); clearInterval(poll); }
    }, 500);
  }, (e) => { S.state = `refused: ${e && e.name ? e.name : e}`; life(`xr: shared space: ${S.state}`); });
}
