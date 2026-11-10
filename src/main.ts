import './styles.css';
import { CURRENTS } from './environment/current';
import { COURSES, courseFile } from './courses/registry';
import { ReplayView, type ReplayClip } from './replay/replayView';
import { Labels } from './render/labels';
import { ORIENT_LABEL, SceneView, VIEWS, overheadUp, type Overhead } from './render/scene';
import { HELD, KeyMap, type Action } from './ui/keys';
import { KeysView } from './ui/keysView';
import { D2R, V } from './core/math';
import { RULES, explain, type Incident } from './rules';
import { loadSettings, saveSettings, type Settings } from './settings';
import type { Boat } from './boat/boat';
import { randomSeed } from './core/rng';
import { DT, World, describeTide } from './sim/world';
import { CurrentField, nextSaturday, sfClock } from './environment/tide';
import { shoreRelief } from './environment/current';
import { breezeAt, windTerrain } from './environment/wind';
import { startDebrief } from './sim/startDebrief';
import type { SimEvent } from './sim/events';
import { $ } from './ui/dom';
import { horn, logMessage, messageLog, setLogClock, sound, toast } from './ui/feedback';
import { Hud, fmtClock, sideWord } from './ui/hud';
import { CourseView } from './ui/courseView';

const S: Settings = loadSettings();
if (!COURSES.some(c => c.id === S.course)) S.course = COURSES[0].id;

const view = new SceneView($<HTMLCanvasElement>('gl'));
const labels = new Labels($('labels'));
const hud = new Hud();
const replayView = new ReplayView($<HTMLCanvasElement>('rcanvas'));
const courseView = new CourseView();
const drillView = new ReplayView($<HTMLCanvasElement>('dcanvas'));
/** Start practice begins this many seconds before the gun, and the debrief comes this long after it. */
const DRILL_FROM = 60, DRILL_DEBRIEF_AT = 15;
let drillShown = false;

let w!: World;
let viewMode = 0, acc = 0;
/** Where you're looking, relative to the bow: yaw + is to port (radians), pitch + is up. Never affects steering. */
const look = { yaw: 0, pitch: 0, aft: 6.5, chase: 24 };
/* Cockpit eye: how far aft of the boat's middle you sit, m (the transom is at 3.8). Scroll or +/− moves it. */
const EYE_MIN = 2.6, EYE_MAX = 10;
try { const v = Number(localStorage.getItem('fbsim-eye')); if (v >= EYE_MIN && v <= EYE_MAX) look.aft = v; } catch { /* storage unavailable */ }
function setEye(aft: number): void {
  look.aft = Math.max(EYE_MIN, Math.min(EYE_MAX, aft));
  try { localStorage.setItem('fbsim-eye', look.aft.toFixed(2)); } catch { /* storage unavailable */ }
}
const LOOK_PITCH_MIN = -0.5, LOOK_PITCH_MAX = 1.1;
function setLook(yaw: number, pitch: number): void {
  look.yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw)); // keep within ±π
  look.pitch = Math.max(LOOK_PITCH_MIN, Math.min(LOOK_PITCH_MAX, pitch));
}
function lookAhead(): void { setLook(0, 0); }
let pendingPenalty: Boat | null = null;

function newGame(seed = randomSeed()): void {
  w = new World(courseFile(S.course), S, seed, S.mode === 'drill' ? { startAt: DRILL_FROM } : S.mode === 'sail' ? { freeSail: true } : {});
  acc = 0; drillShown = false;
  $('trimPanel').classList.toggle('manual', !!S.manualTrim);
  $('bTrim').textContent = S.manualTrim ? 'Trim · you' : 'Trim · crew';
  view.setWorld(w);
  labels.build(w);
}

/* ---------------- sim events → UI ---------------- */
function handle(e: SimEvent): void {
  switch (e.type) {
    case 'toast': toast(e.msg, e.ms); break;
    case 'horn': if (e.delayMs) setTimeout(() => horn(e.dur), e.delayMs); else horn(e.dur); break;
    case 'incident': showIncident(e.a, e.b, e.incident, { frames: e.frames, focus: [e.a.id, e.b.id], wind: e.wind, kind: 'incident' }); break;
    case 'finished': break;
  }
}

let lastClip: ReplayClip | null = null;
function showIncident(A: Boat, B: Boat, inc: Incident<Boat>, clip: ReplayClip): void {
  setControlsIdle();
  const user = A.isUser ? A : B, other = A.isUser ? B : A, youFault = inc.fouler.isUser;
  const mr = inc.verdict.mr;
  const ex = explain({
    youFouled: youFault, other: other.name, userTack: user.tack, rule: inc.rule, kind: inc.kind, byWhy: inc.byWhy,
    markName: mr ? w.C.marks[mr.idx].name : inc.rule === '18.3' ? w.nextMark(user)?.name : undefined, markOverlapped: mr?.overlapped, turned: inc.turned, hailRole: inc.hailRole
  });
  $('rEyebrow').textContent = youFault ? `Foul · ${inc.kind === 'contact' ? 'Contact' : inc.kind === 'hail' ? 'Didn\'t answer a hail' : 'Forced to avoid'}` : `${other.name} fouled you`;
  $('rTitle').textContent = RULES[inc.rule][0];
  $('rRule').textContent = RULES[inc.rule][1];
  $('rVerdict').className = 'verdict' + (youFault ? '' : ' ok');
  $('rWhat').textContent = ex.what;
  $('rTip').textContent = ex.tip;
  const turns = w.penaltyDeg === 720 ? 'two turns' : 'one turn';
  $('rPen').textContent = youFault
    ? `Penalty: ${turns} (${w.penaltyDeg}°). Get clear of other boats, then turn ${w.penaltyDeg === 720 ? 'two full circles' : 'one full circle'} in the same direction: each one includes a tack and a gybe (Rule 44.2).`
    : `${other.name} takes a ${turns} penalty.`;
  logMessage(`${youFault ? 'Foul' : `${other.name} fouled you`}: ${RULES[inc.rule][0]}. ${ex.what}`);
  pendingPenalty = inc.fouler;
  lastClip = clip;
  $('replay').hidden = false;
  replayView.play(w, clip);
}
$('bReplay').onclick = () => { if (lastClip) replayView.play(w, lastClip); };
$('bCont').onclick = () => {
  $('replay').hidden = true; replayView.stop();
  if (pendingPenalty) {
    w.assignPenalty(pendingPenalty);
    if (pendingPenalty.isUser) toast(`Do your ${w.penaltyDeg === 720 ? 'two turns' : 'turn'} now: put the tiller over and keep turning the same way.`, 4000);
    pendingPenalty = null;
  }
  w.paused = false;
};

/* ---------------- input ---------------- */
function setControlsIdle(): void {
  const u = w.user; u.steer = 0; u.luff = false; u.sheetCmd.main = u.sheetCmd.jib = 0;
  ['bLuff'].forEach(id => $(id).classList.remove('on'));
}
function holdBtn(id: string, on: () => void, off: () => void): void {
  const el = $(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); el.classList.add('on'); on(); });
  const end = () => { el.classList.remove('on'); off(); };
  (['pointerup', 'pointercancel', 'lostpointercapture'] as const).forEach(ev => el.addEventListener(ev, end));
}
holdBtn('bLuff', () => { w.user.luff = true; }, () => { w.user.luff = held.has('luff'); });

/* The tiller. Its handle goes from −1 (pushed to port) to +1 (pushed to starboard); pushing it to
 * starboard turns the boat to port, as on a real boat. It stays where you leave it. */
function setTiller(v: number): void { w.user.tiller = Math.max(-1, Math.min(1, v)); }
function centreTiller(): void { setTiller(0); }
function showTiller(): void {
  const t = w.user.tiller;
  $('tillerHandle').style.left = `${50 + t * 44}%`;
  if (tillerHeld) $('tgCur').style.left = `${50 + t * TILLER_SPAN * 100}%`;
  $('tiller').setAttribute('aria-valuenow', String(Math.round(t * 100)));
  $('tillerLab').textContent = Math.abs(t) < 0.04 ? 'Tiller · centred' : `Tiller · ${Math.round(Math.abs(t) * 100)}% to ${t > 0 ? 'stbd' : 'port'} · turning ${t > 0 ? 'to port' : 'to starboard'}`;
}
// Tiller bar: drag the handle left/right. Let go and it springs back to centre.
let barDrag = false;
{
  const pad = $('tiller');
  let start: { x: number; t: number } | null = null;
  pad.addEventListener('pointerdown', e => {
    e.preventDefault(); pad.setPointerCapture?.(e.pointerId);
    start = { x: e.clientX, t: w.user.tiller }; barDrag = true;
  });
  pad.addEventListener('pointermove', e => { if (start) setTiller(start.t + (e.clientX - start.x) / (pad.clientWidth * 0.45)); });
  const end = () => { start = null; barDrag = false; };
  pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
}
/* Holding the tiller with the trackpad or mouse: while you hold it, the cursor's left–right position IS
 * the tiller handle. The middle of the screen is centred; to the right pushes the handle to starboard
 * (the boat turns to port). T, a click on the water, or Esc takes it or lets go. Let go and it springs
 * back to centre. Over the buttons and panels the tiller stays put, so you can reach them. */
const gl = $('gl');
const TILLER_SPAN = 0.35; // fraction of the window width from centre to hard over
let tillerHeld = false, toldTiller = false, panning = false;
let lastCursorX: number | undefined;
function tillerFromCursor(x: number): void { setTiller((x - innerWidth / 2) / (innerWidth * TILLER_SPAN)); }
function takeTiller(x?: number): void {
  if (!w.running || w.paused || tillerHeld) return;
  tillerHeld = true; document.body.classList.add('tiller-held'); $('tiller').classList.add('held');
  if (x != null) tillerFromCursor(x);
  if (!toldTiller) { toldTiller = true; toast(`You have the tiller. Slide left or right: the screen's centre line is straight ahead, right of it turns you to port, left of it to starboard. ${keymap.label('takeTiller')}, Esc or a click lets go.`, 5000); }
}
function releaseTiller(): void {
  if (!tillerHeld) return;
  tillerHeld = false; document.body.classList.remove('tiller-held'); $('tiller').classList.remove('held');
}
const overControl = (t: EventTarget | null) => t instanceof Element && !!t.closest('button, a, input, select, #tiller, #msgLog, #map, #trimPanel, .overlay');
addEventListener('mousemove', e => { lastCursorX = e.clientX; if (tillerHeld && !panning && !overControl(e.target) && w.running && !w.paused) tillerFromCursor(e.clientX); });
addEventListener('blur', releaseTiller);
/** Without a hand on it (tiller held, bar dragged), the tiller eases back to centre. */
function tillerSpring(dt: number): void {
  if (tillerHeld && (!w.running || w.paused)) releaseTiller(); // paused or stopped: hands off
  if (tillerHeld || barDrag || !w.running || w.paused) return;
  const t = w.user.tiller; if (t !== 0) setTiller(t - Math.sign(t) * Math.min(Math.abs(t), 2.5 * dt));
}
// Trackpad: two-finger up/down zooms the overhead map, or moves your eye fore and aft in the cockpit. (Sideways swipes don't steer: their direction
// depends on the "natural scrolling" setting, and a stray swipe would turn the boat.)
gl.addEventListener('wheel', e => {
  e.preventDefault();
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
  if (viewMode === 2) zoomOverhead(Math.exp(e.deltaY * 0.0015));
  else if (viewMode === 0) setEye(look.aft + e.deltaY * 0.006); // cockpit: move your eye fore and aft
  else look.chase = Math.max(8, Math.min(90, look.chase * Math.exp(e.deltaY * 0.0015))); // chase: closer or farther
}, { passive: false });

// Sheets: hold Trim/Ease (or Z/X for the main, , and . for the jib) when you're trimming.
function setTrimMode(manual: boolean): void {
  S.manualTrim = manual ? 1 : 0; saveSettings(S);
  w.user.manualTrim = manual; w.user.sheetCmd.main = w.user.sheetCmd.jib = 0;
  $('bTrim').textContent = manual ? 'Trim · you' : 'Trim · crew';
  $('bTrim').setAttribute('aria-pressed', String(manual));
  $('trimPanel').classList.toggle('manual', manual);
}
$('bTrim').onclick = () => { setTrimMode(!w.user.manualTrim); toast(w.user.manualTrim ? 'You have the sheets. Watch the telltales.' : 'The crew is trimming.', 2000); };
const sheetBtn = (id: string, sail: 'main' | 'jib', dir: -1 | 1) =>
  holdBtn(id, () => { w.user.sheetCmd[sail] = dir; }, () => { if (w.user.sheetCmd[sail] === dir) w.user.sheetCmd[sail] = 0; });
sheetBtn('bMainIn', 'main', -1); sheetBtn('bMainOut', 'main', 1); sheetBtn('bJibIn', 'jib', -1); sheetBtn('bJibOut', 'jib', 1);
function togglePole(): void { if (!w.running || w.paused) return; w.user.poleWant = !w.user.poleWant; }
$('bPole').addEventListener('click', togglePole);
function doHail(): void { if (w.running && !w.paused) w.userHail(); }
$('bHail').onclick = doHail;
$('bView').onclick = () => setView((viewMode + 1) % 3);
$('bLook').onclick = lookAhead;
// Course view: from the setup screen (before racing) or any time during the race. The race keeps running.
$('bCourse').onclick = () => courseView.toggle(w);
$('bPreview').onclick = () => courseView.open(w);
$('bCvClose').onclick = () => courseView.close();
$('bFast').onclick = () => { w.speed = w.speed === 1 ? 2 : w.speed === 2 ? 4 : 1; $('bFast').textContent = 'Speed ' + w.speed + '×'; };
$('bSound').onclick = () => { sound.on = !sound.on; $('bSound').textContent = sound.on ? 'Sound on' : 'Sound off'; };
$('bPause').onclick = () => { if (!w.running) return; w.paused = true; setControlsIdle(); $('pause').hidden = false; };
$('bResume').onclick = () => { $('pause').hidden = true; w.paused = false; };
$('bRestart').onclick = () => { $('pause').hidden = true; beginRace(); };
$('bSettings').onclick = () => { $('pause').hidden = true; openSetup(); };
$('bAgain').onclick = () => { $('results').hidden = true; beginRace(); };
$('bSet2').onclick = () => { $('results').hidden = true; openSetup(); };
$('map').addEventListener('click', () => { hud.mapZoom = !hud.mapZoom; $('mapHint').textContent = hud.mapZoom ? 'Tap map · course' : 'Tap map · zoom'; });

/* ---------------- keyboard (bindings in ui/keys.ts, editable in Keyboard settings) ---------------- */
/* ---------------- message log ---------------- */
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const stamp = (t: number | null) => t == null ? '' : `<span class="lt">${fmtClock(t)}</span>`;
function renderLog(): void {
  const recent = messageLog.filter(m => !m.msg.startsWith('— ')).slice(-4).reverse();
  $('msgRecent').innerHTML = recent.map(m => `<li>${stamp(m.t)}${esc(m.msg)}</li>`).join('');
  if (!$('logView').hidden) $('logList').innerHTML = messageLog.slice().reverse().map(m =>
    m.msg.startsWith('— ') ? `<li class="sep">${esc(m.msg.slice(2))}</li>` : `<li>${stamp(m.t)}${esc(m.msg)}</li>`).join('');
}
setLogClock(() => (w && w.running ? w.t : null), renderLog);
function openLog(): void { $('logView').hidden = false; renderLog(); }
$('bLogAll').onclick = openLog;
$('bLogClose').onclick = () => { $('logView').hidden = true; };

const keymap = new KeyMap();
const keysView = new KeysView(keymap, () => keysHint());
const held = new Set<Action>();
function keysHint(): void {
  const k = (a: Action) => keymap.label(a);
  $('keysHint').textContent = `${k('takeTiller')}/click: take or let go of tiller · ${k('steerPort')}/${k('steerStbd')} steer · ${k('luff')} luff · ${k('viewCockpit')}/${k('viewChase')}/${k('viewOverhead')} views · arrows look · scroll: eye fore/aft · ${k('keys')} keys`;
}
keysHint();
hud.hailKey = () => keymap.label('hail');
$('bKeys1').onclick = () => keysView.open();
$('bKeys2').onclick = () => keysView.open();
/** Helm and sheets follow whatever is held. */
function applyHeld(): void {
  const u = w.user;
  u.steer = (held.has('steerStbd') ? 1 : 0) - (held.has('steerPort') ? 1 : 0);
  u.luff = held.has('luff') || $('bLuff').classList.contains('on');
  if (u.manualTrim) {
    u.sheetCmd.main = u.ctlCmd.mainsheet = (held.has('mainOut') ? 1 : 0) - (held.has('mainIn') ? 1 : 0);
    u.sheetCmd.jib = u.ctlCmd.jibsheet = (held.has('jibOut') ? 1 : 0) - (held.has('jibIn') ? 1 : 0);
  }
}
function setView(i: number): void {
  viewMode = i; lookAhead();
  $('bView').textContent = 'View · ' + VIEWS[viewMode];
  $('bOrient').hidden = viewMode !== 2;
}
const anyOverlay = () => !$('setup').hidden || !$('replay').hidden || !$('results').hidden || !$('drill').hidden || !$('pause').hidden;
addEventListener('keydown', e => {
  if (keysView.isOpen) return; // the settings screen handles keys while it's open
  const a = keymap.actionFor(e.key);
  if (e.key === 'Escape') {
    if (courseView.isOpen) { courseView.close(); return; }
    if (!$('logView').hidden) { $('logView').hidden = true; return; }
    if (tillerHeld) { releaseTiller(); return; } // Esc lets go of the tiller, and nothing else
    if (!$('pause').hidden) { $('bResume').click(); return; }
    if (!anyOverlay() && w.running) $('bPause').click();
    return;
  }
  if (a === 'keys') { keysView.open(); return; }
  if (a === 'log') { if ($('logView').hidden) openLog(); else $('logView').hidden = true; return; }
  if (a === 'course' && $('replay').hidden && $('results').hidden && $('drill').hidden) { courseView.toggle(w); return; }
  if (a === 'pause' && w.running) { if ($('pause').hidden) $('bPause').click(); else $('bResume').click(); return; }
  if (anyOverlay() || !a) return;
  if (a.startsWith('look') || a === 'zoomIn' || a === 'zoomOut') e.preventDefault(); // don't scroll the page
  if (HELD.has(a)) { if (!e.repeat) { held.add(a); applyHeld(); } return; }
  if (e.repeat) return;
  switch (a) {
    case 'takeTiller': if (tillerHeld) releaseTiller(); else takeTiller(lastCursorX); break;
    case 'centreTiller': centreTiller(); break;
    case 'pole': togglePole(); break;
    case 'hail': doHail(); break;
    case 'viewCockpit': setView(0); break;
    case 'viewChase': setView(1); break;
    case 'viewOverhead': setView(2); break;
    case 'cycleView': setView((viewMode + 1) % 3); break;
    case 'lookAhead': lookAhead(); break;
    case 'orient': cycleOrient(); break;
    case 'recentre': recentre(); break;
  }
});
addEventListener('keyup', e => {
  const a = keymap.actionFor(e.key);
  if (a && held.delete(a)) applyHeld();
});
addEventListener('blur', () => { held.clear(); applyHeld(); });

/* ---------------- overhead view: north / bow / wind up, zoom and pan ---------------- */
const over: Overhead = { orient: 'north', height: 170, off: { x: 0, y: 0 } };
try { const o = localStorage.getItem('fbsim-orient'); if (o === 'north' || o === 'bow' || o === 'wind') over.orient = o; } catch { /* ignore */ }
function cycleOrient(): void {
  over.orient = over.orient === 'north' ? 'bow' : over.orient === 'bow' ? 'wind' : 'north';
  try { localStorage.setItem('fbsim-orient', over.orient); } catch { /* ignore */ }
  $('bOrient').textContent = ORIENT_LABEL[over.orient];
}
$('bOrient').textContent = ORIENT_LABEL[over.orient];
$('bOrient').onclick = cycleOrient;
function zoomOverhead(k: number): void { over.height = Math.max(40, Math.min(3000, over.height * k)); }
function recentre(): void { over.off.x = 0; over.off.y = 0; }
$('bRecentre').onclick = recentre;
/** Drag the overhead map by (dx, dy) screen pixels. */
function panOverhead(dx: number, dy: number): void {
  const mpp = 2 * over.height * Math.tan(view.camera.fov * D2R / 2) / (gl.clientHeight || 1);
  const upB = overheadUp(over, w), U = V(upB), R = V(upB + 90);
  over.off.x += (-R.x * dx + U.x * dy) * mpp; over.off.y += (-R.y * dx + U.y * dy) * mpp;
}

// The view: click to take or let go of the tiller (mouse/trackpad, not overhead); on a touch screen, drag to look.
// Overhead: drag to pan, pinch or scroll to zoom. Double-tap: look ahead / back to your boat.
let drag: { x: number; y: number; yaw0: number; pitch0: number } | null = null, lastTap = 0;
const touches = new Map<number, [number, number]>();
let pinch: { d: number; h: number } | null = null;
gl.addEventListener('pointerdown', e => {
  const now = performance.now(); if (now - lastTap < 300) { if (viewMode === 2) recentre(); else lookAhead(); } lastTap = now;
  if (viewMode === 2) { gl.setPointerCapture?.(e.pointerId); touches.set(e.pointerId, [e.clientX, e.clientY]); pinch = null; panning = true; return; }
  if (e.pointerType === 'mouse' && w.running && !w.paused) { if (tillerHeld) releaseTiller(); else takeTiller(e.clientX); return; }
  drag = { x: e.clientX, y: e.clientY, yaw0: look.yaw, pitch0: look.pitch };
});
gl.addEventListener('pointermove', e => {
  const prev = touches.get(e.pointerId); if (!prev || viewMode !== 2) return;
  const cur: [number, number] = [e.clientX, e.clientY];
  if (touches.size === 1) panOverhead(cur[0] - prev[0], cur[1] - prev[1]);
  touches.set(e.pointerId, cur);
  if (touches.size === 2) {
    const [p1, p2] = [...touches.values()], d = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
    if (!pinch) pinch = { d, h: over.height }; else over.height = Math.max(40, Math.min(3000, pinch.h * pinch.d / d));
  }
});
const endTouch = (e: PointerEvent) => { touches.delete(e.pointerId); pinch = null; panning = touches.size > 0; };
gl.addEventListener('pointerup', endTouch); gl.addEventListener('pointercancel', endTouch);
addEventListener('pointermove', e => {
  if (drag && viewMode !== 2) setLook(drag.yaw0 + (e.clientX - drag.x) * 0.006, drag.pitch0 + (e.clientY - drag.y) * 0.006);
});
/** Held keys pan the view (look) or zoom the overhead map. */
function keyLook(dt: number): void {
  const rate = 1.6 * dt;
  if (held.has('lookLeft')) setLook(look.yaw + rate, look.pitch);
  if (held.has('lookRight')) setLook(look.yaw - rate, look.pitch);
  if (held.has('lookUp')) setLook(look.yaw, look.pitch + rate);
  if (held.has('lookDown')) setLook(look.yaw, look.pitch - rate);
  if (held.has('zoomIn')) { if (viewMode === 2) zoomOverhead(Math.exp(-1.2 * dt)); else if (viewMode === 0) setEye(look.aft - 2.5 * dt); else look.chase = Math.max(8, look.chase * Math.exp(-1.2 * dt)); }
  if (held.has('zoomOut')) { if (viewMode === 2) zoomOverhead(Math.exp(1.2 * dt)); else if (viewMode === 0) setEye(look.aft + 2.5 * dt); else look.chase = Math.min(90, look.chase * Math.exp(1.2 * dt)); }
}
function lookLabel(): void {
  const el = $('bLook'), deg = Math.round(-look.yaw * 180 / Math.PI);
  const off = Math.abs(deg) > 8 || Math.abs(look.pitch) > 0.15;
  el.hidden = !off || viewMode === 2;
  if (off) el.textContent = Math.abs(deg) <= 8 ? 'Look ahead' : `Looking ${Math.abs(deg)}° ${deg > 0 ? 'stbd' : 'port'} · ahead`;
  $('bRecentre').hidden = viewMode !== 2 || Math.hypot(over.off.x, over.off.y) < 5;
}
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointercancel', () => { drag = null; });

/* ---------------- setup + flow ---------------- */
function buildSetupChoices(): void {
  $('setup').querySelector('[data-k="course"]')!.innerHTML = COURSES.map(c => `<button type="button" data-v="${c.id}">${c.title}</button>`).join('');
  $('setup').querySelector('[data-k="current"]')!.innerHTML = Object.values(CURRENTS).map(c => `<button type="button" data-v="${c.id}">${c.button}</button>`).join('');
}
function courseCard(): void {
  const C = w.C;
  const chips = ['<span class="m">Start</span>']
    .concat(C.marks.map(m => `<span class="m ${m.type === 'pass' ? 'x' : m.side}">${m.name.split(' ')[0]}${m.type === 'pass' ? '' : ' ' + sideWord(m.side)}</span>`))
    .concat(['<span class="m">Finish</span>']);
  $('courseCard').innerHTML = `<div class="legs">${chips.join('<span class="arr">→</span>')}</div><small>${C.notes}</small>`;
  $('biasField').hidden = !C.biasAdjustable;
  $('seqField').hidden = S.mode !== 'race';
  $('fleetField').hidden = S.mode === 'sail';
  $('penaltyField').hidden = S.mode === 'sail';
  $('modeNote').textContent = S.mode === 'drill'
    ? 'Starts one minute before the gun. Fifteen seconds after it you get a debrief and an overhead replay, and can try the same start again.'
    : S.mode === 'sail'
    ? 'Open water on the course, no other boats, no start and no clock: practise steering, trimming and the pole.'
    : 'The whole race, from the warning signal to the finish.';
  $('bGo').textContent = S.mode === 'drill' ? 'Practice a start' : S.mode === 'sail' ? 'Go sailing' : 'Start the sequence';
}
/* Real tide: race day, start time, and a graph of the current at the start line through the day. */
function tideBox(): void {
  $('tideBox').hidden = !w.realTime; $('currentNote').hidden = S.current === 'real';
  $('windDaySeg').hidden = !w.seaBreeze;
  if (!w.realTime) return;
  const d = $<HTMLInputElement>('tideDate'), tm = $<HTMLInputElement>('tideTime');
  d.value = w.raceDate; tm.value = S.tideTime || '12:00';
  drawTideGraph();
}
/** Current (filled: flood up, ebb down) and the westerly (line, right scale) at the start line through the day. */
function drawTideGraph(): void {
  const cv = $<HTMLCanvasElement>('tideGraph'), dpr = devicePixelRatio || 1, W = cv.clientWidth || 360, H = cv.clientHeight || 120;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const p = w.C.center, from = w.gunUtc - 3 * 60, to = w.gunUtc + 4 * 60, n = 84;
  const top = 16, bot = H - 18, mid = (top + bot) / 2, x = (i: number) => 8 + (W - 16) * i / n;
  const tx = (m: number) => 8 + (W - 16) * (m - from) / (to - from);
  // race window: the gun to about 75 minutes later
  ctx.fillStyle = 'rgba(255,182,39,.10)'; ctx.fillRect(tx(w.gunUtc), top - 6, tx(w.gunUtc + 75) - tx(w.gunUtc), bot - top + 12);
  const notes: string[] = [];
  if (w.tide) {
    // signed current at the line: + flood (east, into the Bay), − ebb
    const f = new CurrentField(w.tide.stations), k = shoreRelief(p), fl = V(f.stations.find(s => s.id === 'SFB1204')?.flood ?? 88);
    const pts: number[] = [];
    for (let i = 0; i <= n; i++) { f.setTime(from + (to - from) * i / n); const c = f.at(p); pts.push((c.x * fl.x + c.y * fl.y) * k / 0.5144); }
    const max = Math.max(1, ...pts.map(Math.abs)), y = (v: number) => mid - v / max * (bot - top) / 2;
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(8, mid); ctx.lineTo(W - 8, mid); ctx.stroke();
    for (const [sign, col] of [[1, 'rgba(111,168,255,.40)'], [-1, 'rgba(255,140,90,.40)']] as const) {
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x(0), mid);
      pts.forEach((v, i) => ctx.lineTo(x(i), sign * v > 0 ? y(v) : mid)); ctx.lineTo(x(n), mid); ctx.fill();
    }
    ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillStyle = '#9cc3ff'; ctx.fillText('FLOOD ↑', 10, top + 2);
    ctx.fillStyle = '#ffb08a'; ctx.fillText('EBB ↓', 10, bot);
    f.setTime(w.gunUtc);
    notes.push(`current ${describeTide(f, p, w.gunUtc).label} near the line`);
  }
  if (w.seaBreeze) {
    // the westerly in the open water near the line, kt, on its own scale (right)
    const kts: number[] = [];
    for (let i = 0; i <= n; i++) kts.push(breezeAt(from + (to - from) * i / n, w.windDay).kt * windTerrain(p));
    const kmax = Math.max(10, Math.ceil(Math.max(...kts) / 5) * 5), yk = (v: number) => bot - v / kmax * (bot - top);
    ctx.strokeStyle = '#7fe0a8'; ctx.lineWidth = 2; ctx.beginPath(); kts.forEach((v, i) => (i ? ctx.lineTo(x(i), yk(v)) : ctx.moveTo(x(i), yk(v)))); ctx.stroke();
    ctx.font = '600 10px system-ui, sans-serif'; ctx.fillStyle = '#7fe0a8'; ctx.textAlign = 'right';
    ctx.fillText(`WIND ${kmax} kt`, W - 10, top + 2); ctx.fillText('0', W - 10, bot);
    const b = breezeAt(w.gunUtc, w.windDay), b2 = breezeAt(w.gunUtc + 90, w.windDay);
    const trend = b2.kt > b.kt + 0.6 ? `building to ${Math.round(b2.kt * windTerrain(p))} kt` : b2.kt < b.kt - 0.6 ? `easing to ${Math.round(b2.kt * windTerrain(p))} kt` : 'steady';
    notes.push(`wind ${Math.round(b.kt * windTerrain(p))} kt from ${Math.round(b.from)}° near the line, ${trend} over the next 90 minutes (more out in the slot); a westerly blows on about ${Math.round(b.west * 100)}% of ${new Date(w.raceDate + 'T12:00').toLocaleDateString('en-US', { month: 'long' })} days at this hour`);
  }
  ctx.strokeStyle = '#ffb627'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx(w.gunUtc), top - 6); ctx.lineTo(tx(w.gunUtc), bot + 6); ctx.stroke();
  ctx.font = '600 10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(232,238,246,.8)'; ctx.textAlign = 'center';
  for (let m = Math.ceil(from / 60) * 60; m <= to; m += 60) ctx.fillText(sfClock(m).slice(0, 2) + ':00', tx(m), H - 4);
  ctx.fillStyle = '#ffb627'; ctx.fillText('gun', tx(w.gunUtc), 10);
  const day = new Date(w.raceDate + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  $('tideNote').textContent = `${day}, gun at ${sfClock(w.gunUtc)}: ${notes.join('; ')}. Shaded: about the length of a race. Sources: NOAA current predictions and wind records.`;
}
$<HTMLInputElement>('tideDate').addEventListener('change', e => { S.tideDate = (e.target as HTMLInputElement).value || nextSaturday(); saveSettings(S); newGame(); tideBox(); });
$<HTMLInputElement>('tideTime').addEventListener('change', e => { S.tideTime = (e.target as HTMLInputElement).value || '12:00'; saveSettings(S); newGame(); tideBox(); });

function paintSeg(): void {
  document.querySelectorAll<HTMLElement>('.seg').forEach(seg => {
    const k = seg.dataset.k as keyof Settings;
    seg.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.setAttribute('aria-pressed', String(String(S[k]) === b.dataset.v)));
  });
}
document.querySelectorAll<HTMLElement>('.seg').forEach(seg => seg.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest('button'); if (!b) return;
  const k = seg.dataset.k as keyof Settings, v = b.dataset.v!;
  (S as unknown as Record<string, string | number>)[k] = (k === 'current' || k === 'course' || k === 'mode') ? v : Number(v);
  paintSeg(); newGame(); courseCard(); tideBox();
}));
function openSetup(): void { courseView.close(); w.running = false; paintSeg(); courseCard(); $('setup').hidden = false; tideBox(); }
function beginRace(seed?: number): void {
  saveSettings(S);
  newGame(seed);
  logMessage(`— ${S.mode === 'sail' ? 'Just sail' : S.mode === 'drill' ? 'Start practice' : 'Race'} · ${w.C.title}`);
  w.running = true; w.paused = false;
  $('bFast').textContent = 'Speed 1×';
  horn(1.0);
  const m0 = w.C.marks[0];
  toast(S.mode === 'sail'
    ? `Just sail: open water, no race. ${Math.round(w.wind.kt)} kt from ${Math.round(w.wind.from)}°, ${w.cur.label.toLowerCase()}. Try the tiller, the trim and the pole.`
    : S.mode === 'drill'
    ? `Start practice: one minute to the gun. Be on the line at full speed when it goes. Current: ${w.cur.label}.`
    : `${S.seq}-minute sequence. Current: ${w.cur.label}. First mark: ${m0.name} to ${m0.side === 's' ? 'starboard' : 'port'}.`, 3800);
}

/* ---------------- start practice debrief ---------------- */
let drillClip: ReplayClip | null = null;
function showDrill(): void {
  drillShown = true; w.paused = true; setControlsIdle();
  const d = startDebrief(w);
  $('dTitle').textContent = d.title;
  const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  $('dFacts').innerHTML = d.facts.map(f => `<li>${esc(f)}</li>`).join('');
  $('dTips').innerHTML = d.tips.map(f => `<li>${esc(f)}</li>`).join('');
  $('dVerdict').className = 'verdict' + (d.grade === 'great' || d.grade === 'good' ? ' ok' : '');
  $('drill').hidden = false;
  drillClip = { frames: w.rec.slice(), focus: [w.user.id], wind: w.gun?.windFrom ?? w.wind.from, kind: 'start' };
  drillView.play(w, drillClip);
}
const closeDrill = () => { $('drill').hidden = true; drillView.stop(); };
$('bDReplay').onclick = () => { if (drillClip) drillView.play(w, drillClip); };
$('bDAgain').onclick = () => { closeDrill(); beginRace(w.seed); };
$('bDNew').onclick = () => { closeDrill(); beginRace(); };
$('bDKeep').onclick = () => { closeDrill(); w.paused = false; };
$('bDSetup').onclick = () => { closeDrill(); openSetup(); };
$('bGo').onclick = () => { courseView.close(); $('setup').hidden = true; beginRace(); };

function showResults(): void {
  w.finishShown = true;
  const rows = w.boats.slice().sort((a, b) => (a.finished ? a.finishT! : 1e9) - (b.finished ? b.finishT! : 1e9));
  const place = rows.indexOf(w.user) + 1;
  $('resTitle').textContent = place === 1 ? 'You won the race' : `You finished ${place}${['th', 'st', 'nd', 'rd'][place] || 'th'}`;
  const sr = w.startReport;
  $('resStart').textContent = sr ? `Your start: crossed ${sr.delay.toFixed(1)} s after the gun at ${sr.kt.toFixed(1)} kt, ${Math.round(sr.frac * 100)}% of the way from ${w.C.pinLabel} to ${w.C.committeeLabel}.` : 'No clean start recorded.';
  $('resBody').innerHTML = rows.map((b, i) => `<tr><td>${b.finished ? i + 1 : '–'}</td><td><span class="dot" style="background:${b.color}"></span>${b.isUser ? 'You' : b.name} <span style="color:var(--muted)">${b.no}</span></td><td>${b.finished ? fmtClock(b.finishT!).replace('+', '') : 'Still racing'}</td></tr>`).join('');
  $('resFouls').textContent = `Fouls you committed: ${w.fouls}. Fouls against you: ${w.fouledBy}.`;
  $('results').hidden = false;
  w.paused = true;
}

/* ---------------- loop: fixed-step sim, free-running render ---------------- */
function resize(): void { view.resize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();

let last = performance.now();
function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (w.running && !w.paused) {
    acc += dt * w.speed;
    while (acc >= DT) {
      w.step(DT); acc -= DT;
      if (w.paused) { acc = 0; break; }
    }
    if (w.userFinishT != null && !w.finishShown && w.t - w.userFinishT > 3) showResults();
    if (S.mode === 'drill' && !drillShown && w.t >= DRILL_DEBRIEF_AT) showDrill();
  }
  for (const e of w.drainEvents()) handle(e);
  keyLook(dt); lookLabel(); tillerSpring(dt); showTiller();
  view.render(w, dt, now, viewMode, look, over);
  labels.update(w, view.camera, viewMode);
  hud.update(w, dt);
}

buildSetupChoices();
newGame(); paintSeg(); courseCard(); tideBox();
requestAnimationFrame(frame);

// Dev-only handle for debugging and browser tests: window.sim() returns the current World.
if (import.meta.env.DEV) Object.assign(window, { sim: () => w, __look: (yaw: number, pitch: number, chase?: number) => { setLook(yaw, pitch); if (chase) look.chase = chase; } });
