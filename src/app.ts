import { coach } from './boat/coach';
import { PREP_MEANING } from './sim/signals';
import { describeSea } from './environment/sea';
import './styles.css';
import { CURRENTS } from './environment/current';
import { COURSES, courseFile } from './courses/registry';
import { RC_COURSE, chooseCourse, type CommitteeChoice } from './courses/committee';
import { PLACES } from './sim/places';
import { BoatPanel } from './ui/boatPanel';
import { Fleet } from './ui/fleet';
import { addLog, type LogEntry } from './boat/logbook';
import { HARBOR, inBasin, slipById } from './geo/marina';
import { HULL_COLORS, BRIGHT_FINISH, sailNo, type BoatSpec } from './boat/spec';
import { ReplayView, type ReplayClip } from './replay/replayView';
import { Labels } from './render/labels';
import { ORIENT_LABEL, SceneView, VIEWS, overheadUp, type Overhead } from './render/scene';
import { HELD, KeyMap, type Action } from './ui/keys';
import { KeysView } from './ui/keysView';
import { D2R, V } from './core/math';
import { EXONERATION, RULES, explain, type Incident } from './rules';
import { DEFAULT_SETTINGS, MAX_OPPONENTS, loadSettings, saveSettings, type Settings } from './settings';
import { FLEET } from './boat/boat';
import type { Boat, LineKey } from './boat/boat';
import { randomSeed } from './core/rng';
import { DT, World, describeTide } from './sim/world';
import { CAR_FORE_PINS, CAR_IN_PINS, type Controls } from './boat/controls';
import { POLE, allToCrew, byHand, linesByHand, moveLazyCar, takeLine } from './boat/physics';
import { CurrentField, nextSaturday, sfClock } from './environment/tide';
import { WIND_KINDS, WIND_KIND_LABEL, windKindFreq, windTerrain, type WindKind } from './environment/wind';
import { compass, sunPosition, sunTimes } from './environment/sun';
import { startDebrief } from './sim/startDebrief';
import type { SimEvent } from './sim/events';
import { $ } from './ui/dom';
import { horn, logMessage, messageLog, setLogClock, sound, toast } from './ui/feedback';
import { Hud, fmtClock, sideWord } from './ui/hud';
import { CourseView } from './ui/courseView';
import { onSaveTrouble, saveStatus } from './store/cloud';
import { Chart } from './ui/chart';
import { adjust as pilotAdjust, engage as pilotEngage, standby as pilotStandby, tack as pilotTack, type PilotMode } from './boat/autopilot';

const S: Settings = loadSettings();
if (S.course !== RC_COURSE && !COURSES.some(c => c.id === S.course)) S.course = COURSES[0].id;
S.raceLength ??= 'medium';
S.windKind ??= 'auto';

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
const look = { yaw: 0, pitch: 0, aft: 6.5, chase: 24, shift: 0, spin: true };
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

/** The race committee's choice of course for these conditions (worked out once per set of conditions). */
let rcCache: { key: string; pick: CommitteeChoice | null } | null = null;
function committee(s: Settings): CommitteeChoice | null {
  const key = JSON.stringify([s.windKt, s.windDay, s.windKind, s.current, s.tideDate, s.tideTime, s.raceLength, s.fleet]);
  if (rcCache?.key !== key) rcCache = { key, pick: chooseCourse(COURSES, s) };
  return rcCache.pick;
}

/** What each kind of wind is like on the Bay. */
const KIND_NOTE: Record<WindKind, string> = {
  west: 'Usually the sea breeze through the Gate: it builds through the afternoon and blows hardest in the slot toward Alcatraz. In winter a southwesterly or westerly can also come with a front: gusty, with a big swell outside.',
  north: 'Behind a cold front, or the dry offshore wind: it comes down off the Marin hills and Angel Island, gusty and shifty in their lee, steadier out in the middle.',
  south: 'Ahead of a storm: it comes over the city, gusty, often with rain; it can veer quickly to the west as the front passes.',
  light: 'Hardly any wind and no settled direction: patches of breeze come and go. Keep the boat moving and sail to the pressure.'
};

function newGame(seed = randomSeed()): void {
  // in the showroom (editing one of your boats, or her page in the Fleet): she's the boat shown, her flags flying
  const shown: BoatSpec | null = boatPanel?.open ? boatPanel.editing : fleet?.showing ?? null, showFlags = !!shown;
  const WS = shown && shown.id !== S.boatId ? (() => { const o = S.opponents.filter(x => x !== shown.id); return { ...S, boat: shown, opponents: o, fleet: o.length }; })() : S;
  const rc = S.course === RC_COURSE ? committee(WS) : null;
  const courseSignal = rc ? { no: rc.est.no, why: rc.why } : undefined;
  w = new World(rc ? rc.est.file : courseFile(S.course === RC_COURSE ? COURSES[0].id : S.course), WS, seed,
    S.mode === 'drill' ? { startAt: DRILL_FROM, showFlags, courseSignal } : S.mode === 'sail' && !shown ? { freeSail: true } : { showFlags, courseSignal, ...(shown ? { startAt: S.seq * 60 } : {}) });
  acc = 0; drillShown = false;
  showTrimOwner(); showLash();
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
    markName: mr ? w.C.marks[mr.idx].name : inc.rule === '18.3' ? w.nextMark(user)?.name : undefined, markOverlapped: mr?.overlapped, turned: inc.turned, hailRole: inc.hailRole,
    part: inc.part, exoneratedBy: inc.exoneratedBy != null ? w.boats[inc.exoneratedBy].name : undefined
  });
  const exonerated = inc.exoneratedBy != null;
  $('rEyebrow').textContent = youFault ? `Foul · ${inc.kind === 'contact' ? 'Contact' : inc.kind === 'hail' ? 'Didn\'t answer a hail' : 'Forced to avoid'}` : `${other.name} fouled you`;
  $('rTitle').textContent = RULES[inc.rule][0];
  $('rRule').textContent = RULES[inc.rule][1] + (exonerated ? ' ' + EXONERATION : '');
  $('rVerdict').className = 'verdict' + (youFault ? '' : ' ok');
  $('rWhat').textContent = ex.what;
  $('rTip').textContent = ex.tip;
  const turns = w.penaltyDeg === 720 ? 'two turns' : 'one turn';
  $('rPen').textContent = exonerated ? `No penalty: ${youFault ? 'you were' : `${inc.fouler.name} was`} compelled by ${w.boats[inc.exoneratedBy!].name}'s foul (Rule 43.1(a)).` : youFault
    ? `Penalty: ${turns} (${w.penaltyDeg}°). Get clear of other boats, then turn ${w.penaltyDeg === 720 ? 'two full circles' : 'one full circle'} in the same direction: each one includes a tack and a gybe (Rule 44.2).`
    : `${other.name} takes a ${turns} penalty.`;
  logMessage(`${youFault ? 'Foul' : `${other.name} fouled you`}: ${RULES[inc.rule][0]}. ${ex.what}`);
  pendingPenalty = exonerated ? null : inc.fouler;
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
}
function holdBtn(id: string, on: () => void, off: () => void): void {
  const el = $(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); el.classList.add('on'); on(); });
  const end = () => { el.classList.remove('on'); off(); };
  (['pointerup', 'pointercancel', 'lostpointercapture'] as const).forEach(ev => el.addEventListener(ev, end));
}

/* The tiller. Its handle goes from −1 (pushed to port) to +1 (pushed to starboard); pushing it to
 * starboard turns the boat to port, as on a real boat. It stays where you leave it. */
function setTiller(v: number): void { const u = w.user; u.tiller = Math.max(-1, Math.min(1, v)); if (u.lashed != null) u.lashed = u.tiller; }
/* Lashing the tiller: a line from the tiller to a cleat holds it where you leave it, hands off (heaving to). Drag the
 * tiller bar to move the lashing; take the tiller (T, a click, A/D) and it comes off. */
function lash(): void {
  if (!w.running || w.paused) return;
  const u = w.user;
  if (u.lashed != null) { unlash(); return; }
  pilotOff('Pilot on standby.'); releaseTiller();
  u.lashed = u.tiller; showLash();
  const t = u.tiller, lee = (u.tack === 'S') === (t < 0); // on starboard tack the leeward side is port
  const fast = u.v > 2 / 1.944 && lee && Math.abs(t) > 0.15 && !((u.jibBacked ?? 0) > 0.5);
  toast(fast ? `Tiller lashed to leeward with way on (${(u.v * 1.944).toFixed(1)} kt): she'll round up and tack. To heave to, back the jib first and let her slow to a knot or two, then lash.`
    : Math.abs(t) < 0.04 ? 'Tiller lashed amidships. Push it where you want it (◀ ▶ beside Unlash, or hold the tiller and lash again).'
    : `Tiller lashed ${Math.round(Math.abs(t) * 100)}% to ${t > 0 ? 'starboard' : 'port'} (${lee ? 'to leeward: she turns toward the wind' : 'to windward: she bears away'}). ◀ ▶ move the lashing; take the tiller to undo it.`, fast ? 6000 : 4500);
}
function unlash(): void { const u = w.user; if (u.lashed == null) return; u.lashed = null; showLash(); toast('Lashing off: you have the tiller.', 2000); }
function showLash(): void {
  const l = w.user.lashed, on = l != null;
  const txt = !on ? 'Lash tiller' : `Lashed ${Math.abs(l) < 0.04 ? 'amidships' : `${Math.round(Math.abs(l) * 100)}% ${l > 0 ? 'stbd' : 'port'}`} · unlash`;
  if ($('bLash').textContent !== txt) $('bLash').textContent = txt;
  $('bLash').setAttribute('aria-pressed', String(on)); $('tiller').classList.toggle('lashed', on);
  $('bLashP').hidden = $('bLashS').hidden = !on;
}
$('bLash').onclick = lash;
// move the lashing a notch (a tenth of the way to hard over): ◀ pushes the tiller to port, ▶ to starboard
$('bLashP').onclick = () => { if (w.user.lashed != null) setTiller(w.user.tiller - 0.1); };
$('bLashS').onclick = () => { if (w.user.lashed != null) setTiller(w.user.tiller + 0.1); };
function centreTiller(): void { setTiller(0); }
function showTiller(): void {
  const t = w.user.tiller; showLash();
  $('tillerHandle').style.left = `${50 + t * 44}%`;
  if (tillerHeld) $('tgCur').style.left = `${50 + t * TILLER_SPAN * 100}%`;
  $('tiller').setAttribute('aria-valuenow', String(Math.round(t * 100)));
  $('tillerLab').textContent = w.user.lashed != null ? `Tiller lashed · ${Math.abs(t) < 0.04 ? 'amidships' : `${Math.round(Math.abs(t) * 100)}% to ${t > 0 ? 'stbd' : 'port'}`} · drag to move it`
    : Math.abs(t) < 0.04 ? 'Tiller · centred' : `Tiller · ${Math.round(Math.abs(t) * 100)}% to ${t > 0 ? 'stbd' : 'port'} · turning ${t > 0 ? 'to port' : 'to starboard'}`;
}
// Tiller bar: drag the handle left/right. Let go and it springs back to centre.
let barDrag = false;
{
  const pad = $('tiller');
  let start: { x: number; t: number } | null = null;
  pad.addEventListener('pointerdown', e => {
    e.preventDefault(); pad.setPointerCapture?.(e.pointerId);
    pilotOff('Pilot on standby: you have the tiller.');
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
  pilotOff('Pilot on standby: you have the tiller.'); unlash();
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
  if (w.pilot.mode !== 'off' || w.user.lashed != null) return; // the pilot's ram has it, or it's lashed
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

/* ---------------- sail trim: who trims, the sheets, and every other line ---------------- */
type CtlKey = Exclude<keyof Controls, 'car'>;
type CtlItem = { key: CtlKey | 'carFore' | 'carIn'; label: string; group: string };
/** The lines, grouped as they are on Josephine. */
const CTL_UI: CtlItem[] = [
  { group: 'Cockpit thwart', key: 'mainsheet', label: 'Mainsheet' },
  { group: 'Cockpit thwart', key: 'traveller', label: 'Traveller' },
  { group: 'Cockpit thwart', key: 'backstay', label: 'Backstay' },
  { group: 'Piano', key: 'vang', label: 'Vang' },
  { group: 'Piano', key: 'outhaul', label: 'Outhaul' },
  { group: 'Piano', key: 'cunningham', label: 'Cunningham' },
  { group: 'Piano', key: 'downhaul', label: 'Downhaul' },
  { group: 'Piano', key: 'jibCunningham', label: 'Jib Cunningham' },
  { group: 'Winches', key: 'jibsheet', label: 'Jib sheet' },
  { group: 'Winches', key: 'jibsheetW', label: 'Windward sheet' },
  { group: 'Cabin top: the lazy jib car', key: 'carFore', label: 'Car fore–aft' },
  { group: 'Cabin top: the lazy jib car', key: 'carIn', label: 'Car in–out' }
];
/** The line a control row works: the two car rows are one line, the lazy car. */
const lineOf = (k: CtlItem['key']): LineKey => (k === 'carFore' || k === 'carIn' ? 'car' : k);
let ctlSel = 0;
const btnCmd: Partial<Record<CtlKey, number>> = {};
/* Who has each line. Work any line (a button, a key, or drag its bar) and that line is yours; the crew keeps every
 * other. One tap on its Auto gives it back, and the Trim button gives them all back. */
function showTrimOwner(): void {
  const mine = linesByHand(w.user), n = mine.length;
  $('bTrim').textContent = n === 0 ? 'Trim · crew' : `Trim · you ×${n} · all to crew`;
  $('bTrim').setAttribute('aria-pressed', String(n > 0));
  $('bTrim').title = n === 0 ? 'The crew trims every line. Work any line to take it.' : `Yours: ${mine.join(', ')}. Click to hand them all back to the crew.`;
  for (const [id, k] of [['bMainAuto', 'mainsheet'], ['bJibAuto', 'jibsheet']] as const) $(id).hidden = !byHand(w.user, k);
  const backed = (w.user.jibBacked ?? 0) > 0.3;
  $('bJibBack').textContent = backed ? 'Release' : 'Back';
  $('bJibBack').title = backed ? 'Let the windward jib sheet go: the jib comes across to leeward' : 'Haul the windward jib sheet: the jib backs to windward (heaving to)';
}
function giveBack(k: LineKey): void { takeLine(w.user, k, false); showTrimOwner(); }
$('bTrim').onclick = () => {
  if (!w.running) return;
  if (linesByHand(w.user).length === 0) { openLines(true); toast('The crew is trimming everything. Work any line (Trim/Ease, its −/+, or drag its bar) and that line is yours; the crew keeps the rest.', 4500); return; }
  allToCrew(w.user); S.manualTrim = 0; saveSettings(S); showTrimOwner();
  toast('Every line back to the crew.', 2500);
};
$('bMainAuto').onclick = () => giveBack('mainsheet');
$('bJibAuto').onclick = () => giveBack('jibsheet');
/** Back the jib (haul the windward sheet home), or let it go again. */
$('bJibBack').onclick = () => {
  if (!w.running || w.paused) return;
  const u = w.user;
  if ((u.jibBacked ?? 0) > 0.3 || (byHand(u, 'jibsheetW') && u.ctlTarget?.jibsheetW === 0)) { giveBack('jibsheetW'); toast('Windward jib sheet let go: the crew trims the jib on the leeward sheet again.', 3000); return; }
  takeLine(u, 'jibsheetW'); (u.ctlTarget ??= {}).jibsheetW = 0;
  toast('Hauling the windward jib sheet: the crew lets the leeward one fly and the jib backs. To heave to, ease the main until it just draws and lash the tiller to leeward.', 5500);
};
function openLines(open = $('ctlList').hidden): void {
  $('ctlList').hidden = !open; $('trimPanel').classList.toggle('lines', !!open); $('tpMore').textContent = open ? 'Lines ▾' : 'Lines ▸'; $('tpMore').setAttribute('aria-expanded', String(open));
}
$('tpMore').onclick = () => openLines();
/* The trim coach: opens beside the trim panel and updates live, so you can work a line and watch what it does. */
let coachT = 0, coachWhy = false;
function renderCoach(): void {
  const r = coach(w.user), esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const acts = r.actions, crew = linesByHand(w.user).length === 0;
  $('coachSum').textContent = acts.length ? `${acts.length} thing${acts.length > 1 ? 's' : ''} worth fixing` : 'Nothing to fix';
  // underway: short action items, biggest gain first; the full explanation only when paused (you can't read paragraphs and steer)
  let html = acts.length
    ? `<ol class="coach-acts">${acts.map(a => `<li><span class="gain">+${(a.gain * 100).toFixed(a.gain < 0.01 ? 1 : 0)}%</span>${a.who === 'crew' ? '<span class="who">crew</span>' : ''}${esc(a.text)}</li>`).join('')}</ol>`
    : `<p class="coach-ok">Trim's right. ${crew ? 'The crew has it.' : 'Keep it there.'}</p>`;
  html += coachWhy || w.paused ? r.items.map(i => `<div class="coach-item${i.ok ? '' : ' fix'}"><b>${esc(i.head)}</b>${esc(i.text)}</div>`).join('') + (w.paused ? '' : '<button type="button" class="linkbtn coach-why" data-why="0">Hide why</button>')
    : '<button type="button" class="linkbtn coach-why" data-why="1">Why? Show the reasons</button>';
  $('coachBody').innerHTML = html;
}
$('bCoach').onclick = () => { const p = $('coachPanel'); p.hidden = !p.hidden; if (!p.hidden) renderCoach(); };
$('bCoachX').onclick = () => { $('coachPanel').hidden = true; };
// the reasons, on a click (no need to pause: they update live, like the rest of the coach)
$('coachBody').addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-why]'); if (!b) return; coachWhy = b.dataset.why === '1'; renderCoach(); });
function coachTick(dt: number): void { if ($('coachPanel').hidden) return; coachT += dt; if (coachT > 0.6) { coachT = 0; renderCoach(); } }
/** Sheets read backwards on their bars (full = trimmed in), the traveller from windward to leeward. */
const barOf = (k: CtlKey, v: number) => (k === 'mainsheet' || k === 'jibsheet' || k === 'jibsheetW' ? 1 - v : k === 'traveller' ? (1 - v) / 2 : v);
const valOf = (k: CtlKey, fx: number) => (k === 'mainsheet' || k === 'jibsheet' || k === 'jibsheetW' ? 1 - fx : k === 'traveller' ? 1 - 2 * fx : fx);
/** Build the rows once: label, a bar, −/+ (hold to keep pulling or easing), and who has it (tap Auto to give it back). */
{
  const list = $('ctlList'); let group = '';
  CTL_UI.forEach((it, i) => {
    if (it.group !== group) { group = it.group; const g = document.createElement('div'); g.className = 'ctl-group'; g.textContent = group; list.appendChild(g); }
    const row = document.createElement('div'); row.className = 'ctl-row'; row.dataset.i = String(i);
    row.innerHTML = `<span class="ctl-lab">${it.label}</span><span class="ctl-bar" title="Drag to set: the line is yours"><span class="ctl-fill"></span><span class="ctl-tgt"></span></span><span class="ctl-val"></span><span class="ctl-btns"><button type="button" data-d="-1" aria-label="${it.label}: less">−</button><button type="button" data-d="1" aria-label="${it.label}: more">+</button></span><button type="button" class="ctl-own" aria-label="${it.label}: give it back to the crew">Auto</button>`;
    row.onclick = () => { ctlSel = i; };
    (row.querySelector('.ctl-own') as HTMLButtonElement).onclick = e => { e.stopPropagation(); if (byHand(w.user, lineOf(it.key))) giveBack(lineOf(it.key)); };
    // drag the bar to where you want the line: it's hauled or eased there at the usual pace (winches, tackles, crew)
    const bar = row.querySelector('.ctl-bar') as HTMLElement;
    const setFrom = (e: PointerEvent) => {
      const r = bar.getBoundingClientRect(), fx = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), u = w.user;
      if (it.key === 'carFore' || it.key === 'carIn') {
        const lazy = u.ctl.car[u.tack], n = it.key === 'carFore' ? CAR_FORE_PINS : CAR_IN_PINS, cur = it.key === 'carFore' ? lazy.fore : lazy.ins, want = Math.round(fx * (n - 1));
        if (want !== cur) stepCar(it.key, want - cur);
        return;
      }
      (u.ctlTarget ??= {})[it.key] = valOf(it.key, fx);
    };
    bar.addEventListener('pointerdown', e => { if (!w.running) return; e.preventDefault(); ctlSel = i; bar.setPointerCapture(e.pointerId); bar.classList.add('drag'); setFrom(e); });
    bar.addEventListener('pointermove', e => { if (bar.hasPointerCapture(e.pointerId)) setFrom(e); });
    const endDrag = (e: PointerEvent) => { if (bar.hasPointerCapture(e.pointerId)) bar.releasePointerCapture(e.pointerId); bar.classList.remove('drag'); };
    bar.addEventListener('pointerup', endDrag); bar.addEventListener('pointercancel', endDrag);
    row.querySelectorAll<HTMLButtonElement>('.ctl-btns button').forEach(bt => {
      const d = Number(bt.dataset.d);
      if (it.key === 'carFore' || it.key === 'carIn') { bt.onclick = () => stepCar(it.key as 'carFore' | 'carIn', d); return; }
      bt.addEventListener('pointerdown', e => { e.preventDefault(); btnCmd[it.key as CtlKey] = d; bt.classList.add('on'); applyHeld(); });
      const end = () => { if (btnCmd[it.key as CtlKey] === d) delete btnCmd[it.key as CtlKey]; bt.classList.remove('on'); applyHeld(); };
      bt.addEventListener('pointerup', end); bt.addEventListener('pointerleave', end); bt.addEventListener('pointercancel', end);
    });
    list.appendChild(row);
  });
}
function stepCar(k: 'carFore' | 'carIn', d: number): void {
  if (!w.running || w.paused) return;
  takeLine(w.user, 'car');
  moveLazyCar(w.user, k === 'carFore' ? d : 0, k === 'carIn' ? d : 0);
}
/** Show every line's setting and who has it (you can watch the crew work theirs too). */
function showLines(): void {
  showTrimOwner();
  if ($('ctlList').hidden) return;
  const u = w.user, c = u.ctl, lazy = c.car[u.tack], loaded = c.car[u.tack === 'S' ? 'P' : 'S'];
  const lee = u.tack === 'S' ? 'port' : 'stbd', wind = u.tack === 'S' ? 'stbd' : 'port';
  document.querySelectorAll<HTMLElement>('#ctlList .ctl-row').forEach(row => {
    const i = Number(row.dataset.i), it = CTL_UI[i];
    let f = 0, txt = '';
    switch (it.key) {
      case 'mainsheet': f = 1 - c.mainsheet; txt = `boom ${Math.round(u.sheets.main)}°`; break;
      case 'jibsheet': f = 1 - c.jibsheet; txt = (u.jibBacked ?? 0) > 0.3 ? 'let go' : `${Math.round(u.sheets.jib)}°`; break;
      case 'jibsheetW': f = 1 - c.jibsheetW; txt = (u.jibBacked ?? 0) > 0 ? `aback ${Math.round(-u.sheets.jib)}°` : c.jibsheetW > 0.95 ? 'slack' : 'easing'; break;
      case 'traveller': f = (1 - c.traveller) / 2; txt = c.traveller < -0.05 ? 'to windward' : c.traveller > 0.05 ? 'to leeward' : 'centred'; break;
      case 'carFore': f = lazy.fore / (CAR_FORE_PINS - 1); txt = `pin ${lazy.fore + 1} (on ${loaded.fore + 1})`; break;
      case 'carIn': f = lazy.ins / (CAR_IN_PINS - 1); txt = `pin ${lazy.ins + 1} (on ${loaded.ins + 1})`; break;
      default: f = c[it.key]; txt = `${Math.round(f * 100)}%`;
    }
    if (it.key === 'jibsheet' || it.key === 'jibsheetW') (row.querySelector('.ctl-lab') as HTMLElement).textContent = `${it.label} · ${it.key === 'jibsheet' ? lee : wind}`;
    (row.querySelector('.ctl-fill') as HTMLElement).style.width = `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`;
    // where you've dragged it to, while the line is still on its way there
    const tg = it.key === 'carFore' || it.key === 'carIn' ? undefined : u.ctlTarget?.[it.key], tgEl = row.querySelector('.ctl-tgt') as HTMLElement;
    tgEl.hidden = tg == null;
    if (tg != null) tgEl.style.left = `${Math.round(barOf(it.key as CtlKey, tg) * 100)}%`;
    const mine = byHand(u, lineOf(it.key));
    row.classList.toggle('mine', mine);
    const own = row.querySelector('.ctl-own') as HTMLButtonElement;
    own.textContent = mine ? 'Auto' : 'crew'; own.disabled = !mine;
    own.title = mine ? 'Yours: tap to give it back to the crew' : 'The crew has this line: work it to take it';
    (row.querySelector('.ctl-val') as HTMLElement).textContent = txt;
    row.classList.toggle('sel', i === ctlSel);
  });
}
const sheetBtn = (id: string, key: 'mainsheet' | 'jibsheet', dir: -1 | 1) =>
  holdBtn(id, () => { btnCmd[key] = dir; applyHeld(); }, () => { if (btnCmd[key] === dir) delete btnCmd[key]; applyHeld(); });
sheetBtn('bMainIn', 'mainsheet', -1); sheetBtn('bMainOut', 'mainsheet', 1); sheetBtn('bJibIn', 'jibsheet', -1); sheetBtn('bJibOut', 'jibsheet', 1);
function togglePole(): void {
  if (!w.running || w.paused) return;
  const u = w.user; u.poleWant = !u.poleWant;
  toast(u.poleWant ? `Crew: setting the whisker pole (about ${POLE.set} s). It pays sailing deep, past about 150° true; on a reach the poled-out jib is aback.` : `Crew: stowing the pole (about ${POLE.stow} s).`, 3000);
}
// act on the press itself, and don't take keyboard focus (a later key press must not toggle it again)
$('bPole').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); togglePole(); });
$('bPole').addEventListener('click', e => { if (e.detail === 0) togglePole(); }); // keyboard activation only
function doHail(): void { if (w.running && !w.paused) w.userHail(); }
$('bHail').onclick = doHail;
/* Push off from her slip: the crew walks her out and swings her round (sim/world.ts). */
function pushOff(): void { if (w.running && !w.paused) w.pushOff(); }
$('bPushOff').onclick = pushOff;
/* Hoist or strike a sail (the crew does it at their pace: boat/physics.ts crewRig). */
function halyard(sail: 'main' | 'jib'): void { if (!w.running || w.paused) return; const r = w.user.rig; w.setSail(sail, !(r ? (sail === 'main' ? r.mainUp : r.jibUp) : true)); }
// (on press, like the pole button: the label changes as the crew works, and a click needs the same thing under the pointer at both ends)
for (const [id, sail] of [['bJib', 'jib'], ['bMain', 'main']] as const) {
  $(id).addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); halyard(sail); });
  $(id).addEventListener('click', e => { if (e.detail === 0) halyard(sail); }); // keyboard activation only
}
/* The tiller pilot (boat/autopilot.ts): cruising only, since RRS 52 says a racing boat's rudder is worked by her
 * crew's own power. Taking the tiller (T, a click, the tiller bar) puts it on standby, as unhooking the ram does. */
function pilotOn(mode: Exclude<PilotMode, 'off'>): void {
  if (!w.running || w.paused) return;
  if (!w.freeSail) { toast('No autopilot when racing: RRS 52 says a racing boat\'s rudder is worked only by her crew\'s own power. Cruising, it\'s yours.', 5000); return; }
  const u = w.user;
  if (u.docked || u.pushing || (u.astern ?? 0) > 0.1 || u.v < 0.5) { toast('Get her sailing first: a tiller pilot needs way on to steer.', 3500); return; }
  unlash();
  if (mode === 'nav' && (!w.dest || w.arrivedT != null)) { toast('Nav needs somewhere to go: tap the map and pick a destination.', 4000); return; }
  releaseTiller(); pilotEngage(u, w.pilot, mode);
}
function pilotOff(msg?: string): void { if (w.pilot.mode === 'off') return; pilotStandby(w.pilot); if (msg) toast(msg, 2500); }
let pilotShown = '';
/** Each frame: the steering keys turn the pilot's course (20°/s held), and the control head shows what it's doing. */
function pilotTick(dt: number): void {
  const p = w.pilot, on = p.mode !== 'off' && w.running;
  if (on && !w.paused) { const d = (held.has('steerStbd') ? 1 : 0) - (held.has('steerPort') ? 1 : 0); if (d) pilotAdjust(w.user, p, d * 20 * dt); }
  const chip = $('bPilot'), hide = !w.running || !w.freeSail;
  if (chip.hidden !== hide) chip.hidden = hide;
  chip.classList.toggle('on', on);
  const panel = $('pilot'); if (panel.hidden === on) { panel.hidden = !on; document.body.classList.toggle('pilot-on', on); }
  if (!on) return;
  const u = w.user, side = (a: number) => `${Math.abs(Math.round(a))}° ${a >= 0 ? 'stbd' : 'port'}`;
  let txt: string;
  if (p.mode === 'auto') txt = `Holding ${String(Math.round(p.course) % 360).padStart(3, '0')}°`;
  else if (p.mode === 'wind') txt = `Apparent wind ${side(p.awa)}`;
  else {
    const d = w.dest; const nm = d ? Math.hypot(d.p.x - u.x, d.p.y - u.y) / 1852 : 0;
    txt = d ? `→ ${d.name.replace(/^Off /, '')} · ${nm < 0.1 ? Math.round(nm * 1852) + ' m' : nm.toFixed(1) + ' nm'} · ${String(Math.round(p.navH) % 360).padStart(3, '0')}°` : 'No destination';
  }
  if (txt !== pilotShown) { $('pilotRead').textContent = txt; pilotShown = txt; }
  for (const b of panel.querySelectorAll<HTMLButtonElement>('[data-pm]')) b.classList.toggle('on', b.dataset.pm === p.mode);
}
$('bPilot').onclick = () => { if (w.pilot.mode === 'off') pilotOn('auto'); else pilotOff('Pilot on standby: you have the tiller.'); };
for (const b of $('pilot').querySelectorAll<HTMLButtonElement>('[data-pm]')) b.onclick = () => pilotOn(b.dataset.pm as Exclude<PilotMode, 'off'>);
for (const b of $('pilot').querySelectorAll<HTMLButtonElement>('[data-pa]')) b.onclick = () => {
  const a = b.dataset.pa!, p = w.pilot;
  if (a === 'off') pilotOff('Pilot on standby: you have the tiller.');
  else if (a === 'tack') { if (p.mode === 'nav') toast('Nav calls its own tacks, on the laylines. Switch to Auto or Wind to tack when you choose.', 3500); else pilotTack(w.user, p); }
  else pilotAdjust(w.user, p, +a);
};
/** The halyard buttons: a sail that's down (or on its way up or down) always has one; striking a sail is for the marina. */
function sailButtons(): void {
  const u = w.user, r = u.rig, inMarina = inBasin(u);
  for (const [k, id] of [['jib', 'bJib'], ['main', 'bMain']] as const) {
    const h = r ? r[k] : 1, up = r ? (k === 'main' ? r.mainUp : r.jibUp) : true, el = $(id);
    const hide = !w.running || (up && h >= 1 && !inMarina), txt = up ? (h < 1 ? `Hoisting ${k}…` : `Strike ${k}`) : h > 0 ? `Striking ${k}…` : `Hoist ${k}`;
    if (el.hidden !== hide) el.hidden = hide;
    if (el.textContent !== txt) el.textContent = txt; // (only when it changes)
    el.classList.toggle('on', !up && h === 0);
  }
}
$('bView').onclick = () => setView((viewMode + 1) % 3);
$('bLook').onclick = lookAhead;
// Course view: from the setup screen (before racing) or any time during the race. The race keeps running.
$('bCourse').onclick = () => courseView.toggle(w);
$('bPreview').onclick = () => courseView.open(w);
$('bCvClose').onclick = () => courseView.close();
$('bFast').onclick = () => { w.speed = w.speed === 1 ? 2 : w.speed === 2 ? 4 : 1; $('bFast').textContent = 'Speed ' + w.speed + '×'; };
$('bSound').onclick = () => { sound.on = !sound.on; $('bSound').textContent = sound.on ? 'Sound on' : 'Sound off'; };
$('bPause').onclick = () => {
  if (!w.running) return; w.paused = true; setControlsIdle(); $('pause').hidden = false;
  const d = $('pauseDebrief'), html = w.userFinishT == null ? debriefHtml('Your race so far') : ''; d.innerHTML = html; d.hidden = !html;
};
$('bResume').onclick = () => { $('pause').hidden = true; w.paused = false; };
$('bRestart').onclick = () => { $('pause').hidden = true; beginRace(); };
$('bSettings').onclick = () => { $('pause').hidden = true; openSetup(); };
$('bAgain').onclick = () => { $('results').hidden = true; beginRace(); };
$('bSet2').onclick = () => { $('results').hidden = true; openSetup(); };
// Tap the inset map: the chart, full screen, with the sail paused (pick a destination there when cruising)
let chartDest: unknown = null;
const chart = new Chart(hud, () => { if (w.dest !== chartDest) view.refreshCourse(w); });
$('map').addEventListener('click', () => { if (!w.running || chart.isOpen) return; releaseTiller(); setControlsIdle(); chartDest = w.dest; chart.open(w); });

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
  u.steer = w.pilot.mode !== 'off' ? 0 : (held.has('steerStbd') ? 1 : 0) - (held.has('steerPort') ? 1 : 0); // (on the pilot, the steering keys turn its course: pilotTick)
  u.luff = held.has('luff');
  // the lines you're working: sheet keys, the selected line's keys, and the panel's buttons
  const cmd: Partial<Record<CtlKey, number>> = { ...btnCmd };
  const add = (k: CtlKey, d: number) => { if (d) cmd[k] = Math.max(-1, Math.min(1, (cmd[k] ?? 0) + d)); };
  add('mainsheet', (held.has('mainOut') ? 1 : 0) - (held.has('mainIn') ? 1 : 0));
  add('jibsheet', (held.has('jibOut') ? 1 : 0) - (held.has('jibIn') ? 1 : 0));
  const sel = CTL_UI[ctlSel];
  if (sel.key !== 'carFore' && sel.key !== 'carIn') add(sel.key, (held.has('ctlUp') ? 1 : 0) - (held.has('ctlDown') ? 1 : 0));
  if (u.steer && u.lashed != null) unlash(); // a hand on the tiller: the lashing comes off
  u.ctlCmd = cmd; u.sheetCmd.main = cmd.mainsheet ?? 0; u.sheetCmd.jib = cmd.jibsheet ?? 0;
}
function setView(i: number): void {
  viewMode = i; lookAhead();
  $('bView').textContent = 'View · ' + VIEWS[viewMode];
  $('bOrient').hidden = viewMode !== 2;
}
const anyOverlay = () => !$('keepAsk').hidden || chart.isOpen || !$('home').hidden || !$('club').hidden || fleet.open || boatPanel.open || !$('setup').hidden || !$('replay').hidden || !$('results').hidden || !$('drill').hidden || !$('pause').hidden;
addEventListener('keydown', e => {
  if (keysView.isOpen) return; // the settings screen handles keys while it's open
  if (chart.isOpen && e.key !== 'Escape') return; // the chart is paused: only Esc, to close it
  if (!$('keepAsk').hidden) return; // save or discard first
  const a = keymap.actionFor(e.key);
  if (e.key === 'Escape') {
    if (courseView.isOpen) { courseView.close(); return; }
    if (chart.isOpen) { chart.close(); return; }
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
  if ((a === 'ctlUp' || a === 'ctlDown') && !e.repeat) { const k = CTL_UI[ctlSel].key; if (k === 'carFore' || k === 'carIn') { stepCar(k, a === 'ctlUp' ? 1 : -1); return; } }
  if (HELD.has(a)) { if (!e.repeat) { held.add(a); applyHeld(); } return; }
  if (e.repeat) return;
  switch (a) {
    case 'ctlPrev': ctlSel = (ctlSel + CTL_UI.length - 1) % CTL_UI.length; openLines(true); break;
    case 'ctlNext': ctlSel = (ctlSel + 1) % CTL_UI.length; openLines(true); break;
    case 'takeTiller': if (tillerHeld) releaseTiller(); else takeTiller(lastCursorX); break;
    case 'centreTiller': pilotOff('Pilot on standby.'); unlash(); centreTiller(); break;
    case 'lashTiller': lash(); break;
    case 'autopilot': if (w.pilot.mode === 'off') pilotOn('auto'); else pilotOff('Pilot on standby: you have the tiller.'); break;
    case 'pole': togglePole(); break;
    case 'hail': doHail(); break;
    case 'pushOff': pushOff(); break;
    case 'jibHalyard': halyard('jib'); break;
    case 'mainHalyard': halyard('main'); break;
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
  // the course picker, grouped (Seaweed Soup starting west / east, practice), each with its marks and length
  const groups = new Map<string, typeof COURSES>();
  for (const c of COURSES) { const g = c.group ?? 'Practice'; if (!groups.has(g)) groups.set(g, []); groups.get(g)!.push(c); }
  const shortMark = (k: string) => k === 'X' ? '' : k;
  const label = (c: typeof COURSES[number]) => {
    if (!c.group) return c.title;
    const route = c.legs.map(l => shortMark(l.mark)).filter(Boolean).join(' → ');
    return `${c.title.replace('Seaweed Soup · ', '')} · ${route}${c.distanceNm ? ` · ${c.distanceNm} nm` : ''}`;
  };
  const sel = $('courseSel') as HTMLSelectElement;
  sel.innerHTML = `<option value="${RC_COURSE}">The race committee's choice (Seaweed Soup)</option>` + [...groups].map(([g, cs]) => `<optgroup label="${g}">${cs.map(c => `<option value="${c.id}">${label(c)}</option>`).join('')}</optgroup>`).join('');
  sel.value = S.course;
  sel.onchange = () => { S.course = sel.value; newGame(); courseCard(); tideBox(); };
  // Just sail: where from, and where to
  const opts = (blank: string | null) => (blank ? `<option value="">${blank}</option>` : '') + (['Spots', 'Marks and buoys'] as const)
    .map(g => `<optgroup label="${g}">${PLACES.filter(p => p.group === g).map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</optgroup>`).join('');
  const from = $('sailFromSel') as HTMLSelectElement, to = $('sailToSel') as HTMLSelectElement;
  from.innerHTML = '<option value="slip" id="optSlipFrom">Her slip, West Harbor</option>' + opts(null);
  to.innerHTML = opts('Nowhere in particular').replace('</option>', '</option><option value="slip" id="optSlipTo">Back to her slip, West Harbor</option>');
  from.value = S.sailFrom ?? 'cityfront'; to.value = S.sailTo ?? '';
  from.onchange = () => { S.sailFrom = from.value; newGame(); };
  to.onchange = () => { S.sailTo = to.value; newGame(); };
  $('setup').querySelector('[data-k="current"]')!.innerHTML = Object.values(CURRENTS).map(c => `<button type="button" data-v="${c.id}">${c.button}</button>`).join('');
}
function courseCard(): void {
  const C = w.C;
  const chips = ['<span class="m">Start</span>']
    .concat(C.marks.map(m => `<span class="m ${m.type === 'pass' ? 'x' : m.side}">${m.name.split(' ')[0]}${m.type === 'pass' ? '' : ' ' + sideWord(m.side)}</span>`))
    .concat(['<span class="m">Finish</span>']);
  const sig = w.courseSignal;
  $('courseCard').innerHTML = (sig ? `<div class="rcpick"><b>The committee will fly course ${sig.no}</b><small>${sig.why}</small></div>` : '')
    + `<div class="legs">${chips.join('<span class="arr">→</span>')}</div><small>${C.notes}</small>`;
  $('lengthField').hidden = S.mode === 'sail' || S.course !== RC_COURSE;
  $('biasField').hidden = !C.biasAdjustable;
  $('seqField').hidden = S.mode !== 'race';
  $('prepField').hidden = S.mode === 'sail';
  $('prepNote').textContent = PREP_MEANING[S.prepFlag ?? 'P'];
  $('fleetField').hidden = S.mode === 'sail';
  { // racing from her slip: sail out to the line from West Harbor
    const sl = slipById(S.boat.slip), btn = $<HTMLButtonElement>('raceFromSlip');
    $('raceFromField').hidden = S.mode !== 'race';
    btn.disabled = !sl; btn.textContent = sl ? `Her slip (${sl.id})` : 'Her slip (she has none)';
    if (!sl && S.raceFrom === 'slip') S.raceFrom = 'water';
    S.raceFrom ??= 'water';
    $('raceFromNote').textContent = S.raceFrom === 'slip' && w.fromSlip
      ? `She starts in her slip in ${HARBOR.name}, ${Math.round((w.startAt - S.seq * 60) / 60)} minutes before the warning signal: push off, sail out of the harbor and over to the line. (Speed up the clock if you like.)`
      : 'You start near the line, a few minutes before the start.';
  }
  { // her slip, if she has one (Marina)
    const sl = S.boat.slip, f = $<HTMLOptionElement>('optSlipFrom'), t = $<HTMLOptionElement>('optSlipTo');
    f.textContent = sl ? `Her slip, West Harbor (${sl})` : 'Her slip, West Harbor (give her one in the Fleet)'; f.disabled = !sl;
    t.textContent = sl ? `Back to her slip, West Harbor (${sl})` : 'Back to her slip (give her one in the Fleet)'; t.disabled = !sl;
    if (!sl && (S.sailFrom === 'slip' || S.sailTo === 'slip')) { if (S.sailFrom === 'slip') S.sailFrom = 'cityfront'; if (S.sailTo === 'slip') S.sailTo = ''; ($('sailFromSel') as HTMLSelectElement).value = S.sailFrom; ($('sailToSel') as HTMLSelectElement).value = S.sailTo; }
  }
  $('courseField').hidden = S.mode === 'sail'; $('courseCard').hidden = S.mode === 'sail'; $('sailField').hidden = S.mode !== 'sail';
  $('penaltyField').hidden = S.mode === 'sail';
  $('modeNote').textContent = S.mode === 'drill'
    ? 'Starts one minute before the gun. Fifteen seconds after it you get a debrief and an overhead replay, and can try the same start again.'
    : S.mode === 'sail'
    ? 'Cruise: open water, no other boats, no start and no clock: practise steering, trimming and the pole.'
    : 'The whole race, from the warning signal to the finish.';
  $('bGo').textContent = S.mode === 'drill' ? 'Practise a start' : S.mode === 'sail' ? 'Cast off' : 'Start the sequence';
  const cruise = S.mode === 'sail';
  $('setupTitle').textContent = $('setupEyebrow').textContent = cruise ? 'Cruise' : 'Race';
  $('setupLede').textContent = cruise ? 'Sail anywhere on the Bay in the day\'s real wind, tide and sea: choose where to start and, if you like, where you\'re going.'
    : 'Race Folkboats off a real start line with real current. Every foul pauses the race and replays it from overhead with the rule that applies.';
  $('modeField').hidden = cruise;
  adjustUi();
}
/* Real tide: race day, start time, and a graph of the current at the start line through the day. */
function tideBox(): void {
  $('tideBox').hidden = false; $('currentNote').hidden = S.current === 'real';
  $('windDaySeg').hidden = !w.seaBreeze || w.realWind;
  { // where the day's weather comes from, what the records say for the month, and what today is
    const mo = Number(w.raceDate.slice(5, 7)) - 1, f = windKindFreq(mo), month = new Date(w.raceDate + 'T12:00').toLocaleDateString('en-US', { month: 'long' });
    const odds = WIND_KINDS.filter(k => f[k] >= 0.01).map(k => `${WIND_KIND_LABEL[k].toLowerCase()} ${Math.round(f[k] * 100)}%`).join(', ');
    const wx = w.weather, day = new Date(w.raceDate + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    const span = (() => { const ks: number[] = [], ds: number[] = []; for (let m = 0; m <= 240; m += 30) { const b = wx.at(w.gunUtc - 60 + m); ks.push(b.kt); ds.push(b.from); } return `${Math.round(Math.min(...ks))}–${Math.round(Math.max(...ks))} kt`; })();
    const src = wx.source === 'observed' ? `What happened on ${day}: ${WIND_KIND_LABEL[wx.kind].toLowerCase()}, ${span} around the race (the wind observed every 6 minutes at Fort Point, its real shifts and gusts)${wx.realSwell ? ', and the swell observed at the Bar buoy' : ''}.`
      : wx.source === 'forecast' ? `The National Weather Service forecast for ${day} (issued ${new Date(wx.issued!).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', minute: '2-digit' })}): ${WIND_KIND_LABEL[wx.kind].toLowerCase()}, ${span} around the race${wx.realSwell ? ', and its swell forecast outside the Gate' : ''}. Hour by hour; the shifts and puffs within the hour are the sim's.`
      : wx.source === 'records' ? `No observations or forecast for ${day} yet: a ${WIND_KIND_LABEL[wx.kind].toLowerCase()} day, drawn from the ${month} records.`
      : `You chose a ${WIND_KIND_LABEL[wx.kind].toLowerCase()} day${f[w.windKind] < 0.02 ? ` (it almost never blows in ${month}; you get the westerly)` : ''}, from the ${month} records.`;
    $('windKindNote').textContent = `${src} Across the course: ${wx.fieldSource}${S.aids ? ' (shaded on the map)' : ''}. ${month} race days at Fort Point, 2021–25: ${odds}. ${KIND_NOTE[w.windKind]}`;
  }

  $('swellDaySeg').hidden = w.sea.flat || w.weather.realSwell;
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
    const f = new CurrentField(w.tide.stations), fl = V(f.stations.find(s => s.id === 'SFB1204')?.flood ?? 88);
    const pts: number[] = [];
    for (let i = 0; i <= n; i++) { f.setTime(from + (to - from) * i / n); const c = f.atShore(p); pts.push((c.x * fl.x + c.y * fl.y) / 0.5144); }
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
    for (let i = 0; i <= n; i++) { const b = w.weather.at(from + (to - from) * i / n); kts.push(b.kt * windTerrain(p, b.from)); }
    const kmax = Math.max(10, Math.ceil(Math.max(...kts) / 5) * 5), yk = (v: number) => bot - v / kmax * (bot - top);
    ctx.strokeStyle = '#7fe0a8'; ctx.lineWidth = 2; ctx.beginPath(); kts.forEach((v, i) => (i ? ctx.lineTo(x(i), yk(v)) : ctx.moveTo(x(i), yk(v)))); ctx.stroke();
    ctx.font = '600 10px system-ui, sans-serif'; ctx.fillStyle = '#7fe0a8'; ctx.textAlign = 'right';
    ctx.fillText(`WIND ${kmax} kt`, W - 10, top + 2); ctx.fillText('0', W - 10, bot);
    const b = w.weather.at(w.gunUtc), b2 = w.weather.at(w.gunUtc + 90), k = windTerrain(p, b.from);
    const trend = b2.kt > b.kt + 0.6 ? `building to ${Math.round(b2.kt * k)} kt` : b2.kt < b.kt - 0.6 ? `easing to ${Math.round(b2.kt * k)} kt` : 'steady';
    notes.push(`${WIND_KIND_LABEL[w.windKind].toLowerCase()} ${Math.round(b.kt * k)} kt from ${w.windKind === 'light' ? 'all over' : Math.round(b.from) + '°'} near the line, ${trend} over the next 90 minutes${w.windKind === 'west' ? ' (more out in the slot)' : ''}`);
  }
  { // the sun: when it's up, and where it is at the gun
    const st = sunTimes(w.gunUtc * 60000), sp = sunPosition(w.gunUtc * 60000);
    ctx.fillStyle = 'rgba(8,14,30,.35)';
    if (Number.isFinite(st.set)) { const xs = tx(st.set / 60000); if (xs < W - 8) ctx.fillRect(Math.max(8, xs), top - 6, W - 8 - Math.max(8, xs), bot - top + 12); }
    if (Number.isFinite(st.rise)) { const xr = tx(st.rise / 60000); if (xr > 8) ctx.fillRect(8, top - 6, Math.min(W - 16, xr - 8), bot - top + 12); }
    notes.push(sp.el > 0 ? `sun ${Math.round(sp.el)}° up in the ${compass(sp.az)}, sets ${sfClock(st.set / 60000)}` : `after sunset (${sfClock(st.set / 60000)}): racing in the dusk`);
  }
  ctx.strokeStyle = '#ffb627'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx(w.gunUtc), top - 6); ctx.lineTo(tx(w.gunUtc), bot + 6); ctx.stroke();
  ctx.font = '600 10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(232,238,246,.8)'; ctx.textAlign = 'center';
  for (let m = Math.ceil(from / 60) * 60; m <= to; m += 60) ctx.fillText(sfClock(m).slice(0, 2) + ':00', tx(m), H - 4);
  ctx.fillStyle = '#ffb627'; ctx.fillText('gun', tx(w.gunUtc), 10);
  const day = new Date(w.raceDate + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  $('tideNote').textContent = `${day}, gun at ${sfClock(w.gunUtc)}: ${notes.join('; ')}. Shaded: about the length of a race; dark: after sunset. Sources: NOAA current predictions and wind records.`;
}
$<HTMLInputElement>('tideDate').addEventListener('change', e => { S.tideDate = (e.target as HTMLInputElement).value || nextSaturday(); saveSettings(S); newGame(); tideBox(); });
$<HTMLInputElement>('tideTime').addEventListener('change', e => { S.tideTime = (e.target as HTMLInputElement).value || '12:00'; saveSettings(S); newGame(); tideBox(); });

function paintSeg(): void {
  document.querySelectorAll<HTMLElement>('.seg[data-k]').forEach(seg => {
    const k = seg.dataset.k as keyof Settings;
    const cur = (k as string) === 'crewN' ? String(S.crew?.n ?? 2) : String(S[k]);
    seg.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.setAttribute('aria-pressed', String(cur === b.dataset.v)));
  });
}
document.querySelectorAll<HTMLElement>('.seg[data-k]').forEach(seg => seg.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest('button'); if (!b) return;
  const k = seg.dataset.k as keyof Settings, v = b.dataset.v!;
  if ((k as string) === 'crewN') { (S.crew ??= { ...DEFAULT_SETTINGS.crew }).n = Number(v) as 0 | 1 | 2; while (S.crew.people.length < 2) S.crew.people.push({ h: 1.75, w: 75 }); crewRows(); paintSeg(); newGame(); return; }
  (S as unknown as Record<string, string | number>)[k] = (k === 'current' || k === 'course' || k === 'mode' || k === 'sea' || k === 'prepFlag' || k === 'raceLength' || k === 'windKind' || k === 'raceFrom' || (k === 'fog' && v === 'real')) ? v : Number(v);
  paintSeg(); newGame(); courseCard(); tideBox();
}));
/* Crew: how many, and each person's height and weight (shown in feet and inches, and pounds). */
const LB = 0.4536, IN = 0.0254;
const fmtHeight = (m: number) => { const t = Math.round(m / IN); return `${Math.floor(t / 12)}'${t % 12}"`; };
const parseHeight = (s: string): number | null => {
  const ft = s.match(/^\s*(\d)\s*['’ ]\s*(\d{1,2})?\s*("|”)?\s*$/), cm = s.match(/^\s*(\d{3})\s*cm\s*$/i), inches = s.match(/^\s*(\d{2})\s*(in|")?\s*$/);
  if (ft) return (Number(ft[1]) * 12 + Number(ft[2] ?? 0)) * IN; if (cm) return Number(cm[1]) / 100; if (inches) return Number(inches[1]) * IN; return null;
};
function crewRows(): void {
  const c = S.crew ??= { ...DEFAULT_SETTINGS.crew }, rows = $('crewRows');
  const people = [{ who: 'You (helm)', p: c.helm }, ...c.people.slice(0, c.n).map((p, i) => ({ who: `Crew ${i + 1}`, p }))];
  rows.innerHTML = people.map((x, i) => `<span>${x.who}</span><label>Height <input data-i="${i}" data-f="h" value="${fmtHeight(x.p.h)}"></label><label>Weight <input data-i="${i}" data-f="w" value="${Math.round(x.p.w / LB)}" inputmode="numeric"> lb</label>`).join('');
  rows.querySelectorAll<HTMLInputElement>('input').forEach(inp => inp.onchange = () => {
    const i = Number(inp.dataset.i), p = i === 0 ? c.helm : c.people[i - 1];
    if (inp.dataset.f === 'h') { const h = parseHeight(inp.value); if (h && h > 1.2 && h < 2.3) p.h = h; inp.value = fmtHeight(p.h); }
    else { const lb = Number(inp.value); if (lb > 70 && lb < 400) p.w = lb * LB; inp.value = String(Math.round(p.w / LB)); }
    saveSettings(S); newGame();
  });
}
function openSetup(): void { settleLog(openSetupNow); }
function openSetupNow(): void { courseView.close(); w.running = false; ($('courseSel') as HTMLSelectElement).value = S.course; paintSeg(); crewRows(); courseCard(); $('setup').hidden = false; tideBox(); }
function beginRace(seed?: number): void { settleLog(() => beginRaceNow(seed)); }
function beginRaceNow(seed?: number): void {
  saveSettings(S);
  newGame(seed);
  logMessage(`— ${S.mode === 'sail' ? `Cruise · ${PLACES.find(p => p.id === S.sailFrom)?.name ?? ''}${w.dest ? ' to ' + w.dest.name : ''}` : S.mode === 'drill' ? 'Start practice' : 'Race'} · ${S.mode === 'sail' ? '' : w.C.title}`);
  w.running = true; w.paused = false;
  $('bFast').textContent = 'Speed 1×';
  horn(1.0);
  const m0 = w.C.marks[0];
  if (w.fromSlip) {
    const m = Math.round((w.startAt - S.seq * 60) / 60);
    toast(`In her slip in ${HARBOR.name}, ${w.homeSlip!.id}, bow in and made fast. Sails are down: hoist them at the dock or once you're clear (J jib, U main; the main goes up best head to wind). Push off (${keymap.keys.pushOff[0]?.toUpperCase() ?? 'the button'}) to shove her out astern, then sail her out through the entrance${S.mode === 'sail' ? '' : `: the warning signal is in ${m} minutes. Speed it up if you like.`}`, 7000);
    return;
  }
  toast(S.mode === 'sail'
    ? `Cruising${w.dest ? ` to ${w.dest.name}` : ''}: no race. ${Math.round(w.wind.kt)} kt from ${Math.round(w.wind.from)}°, ${w.cur.label.toLowerCase()}. Sea: ${describeSea(w.seaHere(w.user))}. Try the tiller, the trim and the pole.`
    : S.mode === 'drill'
    ? `Start practice: one minute to the gun. Be on the line at full speed when it goes. Current: ${w.cur.label}.`
    : `${S.seq}-minute sequence.${w.courseSignal ? ` The committee is flying course ${w.courseSignal.no}.` : ''} Current: ${w.cur.label}. Sea: ${describeSea(w.seaHere(w.user))}. First mark: ${m0.name} to ${m0.side === 's' ? 'starboard' : 'port'}.`, 3800);
  if (w.courseSignal && S.mode !== 'sail') logMessage(`Course ${w.courseSignal.no}, in numeral pennants on the flagpole (Rule 27.1: signalled by the warning signal). ${w.courseSignal.why}`);
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

/** The tactics debrief: what cost you time, most first, and your place at each mark. */
function debriefHtml(title: string): string {
  const log = w.log;
  if (!log || w.t <= 0) return '';
  const nth = (n: number) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th');
  const fs = log.findings(w), pl = log.places().filter(p => p.place != null);
  const items = fs.map(f => `<li><div class="dbHead"><b>${esc(f.title)}</b><span class="dbLost">${f.key === 'start' && f.lost < 2 ? 'on time' : `−${f.lost} s`}</span></div><p>${esc(f.detail)}</p><p class="dbTip">${esc(f.tip)}</p></li>`).join('');
  const marks = pl.length > 1 ? `<p class="lede">Your place at each mark: ${pl.map(p => `${esc(p.name)} ${nth(p.place!)}`).join(' → ')}.</p>` : '';
  const total = fs.reduce((a, f) => a + f.lost, 0);
  return `<div class="eyebrow">${title}</div>${items ? `<p class="lede">What cost you time, most first: about ${total} s in all. The seconds are estimates from the boat's physics.</p><ol>${items}</ol>` : '<p class="lede">Nothing cost you more than a couple of seconds.</p>'}${marks}`;
}

/* ---------------- the boats' logbooks ---------------- */
function outing(b: BoatSpec, isUser: boolean): Omit<LogEntry, 'kind' | 'title'> {
  const c = S.crew, n = c?.n ?? 2;
  return {
    boatId: b.id, at: new Date().toISOString(), day: w.raceDate, time: S.tideTime || '12:00',
    skipper: isUser ? 'you' : 'ai', crew: isUser ? (n ? `You at the helm, ${n} crew` : 'You, single-handed') : 'Generic AI skipper and crew',
    wind: `${compass(w.windModel.base)} ${Math.round(w.wind.kt)} kt`
  };
}
/** The race, into the logbook of every boat of yours in it: her place (or why she has none) and her time. */
function logRace(rows: Boat[]): void {
  if (w.logged || S.mode === 'drill') return; w.logged = true;
  const title = `${w.C.title}${w.courseSignal ? ` (course ${w.courseSignal.no})` : ''}`, out: LogEntry[] = [];
  rows.forEach((b, i) => {
    const spec = b.isUser ? S.boat : b.spec && S.boats.some(x => x.id === b.spec!.id) ? b.spec : null; if (!spec) return;
    const dsq = b.scoring === 'UFD' || b.scoring === 'BFD';
    out.push({ ...outing(spec, b.isUser), kind: 'race', title, of: rows.length,
      ...(dsq ? { code: 'DSQ' } : b.finished ? { place: i + 1, elapsed: b.finishT!, ...(b.scoring === 'ZFP' ? { code: 'ZFP' } : {}) } : { code: 'unfinished' }) });
  });
  stage(out);
}
/** Leaving an outing (back to the start page, to setup, or starting another): log it if there's anything to log. */
function logOuting(): void {
  if (!w || w.logged || S.mode === 'drill') return;
  if (S.mode === 'sail' && w.freeSail && w.t >= 60) {
    w.logged = true;
    const from = S.sailFrom === 'slip' ? `her slip (${S.boat.slip ?? ''})` : PLACES.find(p => p.id === S.sailFrom)?.name ?? 'the Bay';
    stage([{ ...outing(S.boat, true), kind: 'cruise', title: `From ${from}${w.dest ? ` to ${w.dest.name}` : ''}`, elapsed: Math.round(w.t), nm: w.sailedM / 1852, arrived: w.arrivedT != null }]);
  } else if (S.mode === 'race' && !w.freeSail && w.t > 0 && w.userFinishT == null) {
    // you left the race before finishing: retired
    w.logged = true;
    stage([{ ...outing(S.boat, true), kind: 'race', title: w.C.title, code: 'RET', of: w.boats.length }]);
  }
}
/** The sail just ended, waiting for you to say whether it goes in the logbook. */
let pending: LogEntry[] | null = null;
const ordinal = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
function stage(entries: LogEntry[]): void { if (entries.length) pending = entries; }
/**
 * Leaving a race or a cruise: ask whether to keep it in her logbook (with her race record and crew history) or
 * discard it, then carry on.
 */
function settleLog(next: () => void): void {
  logOuting();
  if (!pending) { next(); return; }
  const p = pending, e = p.find(x => x.boatId === S.boat.id) ?? p[0];
  const mins = (s?: number) => s == null ? '' : `${Math.floor(s / 60)} min`;
  $('keepTitle').textContent = e.kind === 'race' ? 'Keep this race?' : 'Keep this cruise?';
  $('keepWhat').textContent = e.kind === 'race'
    ? `${e.title}: ${e.code === 'RET' ? 'retired' : e.code === 'unfinished' ? 'not finished' : e.code === 'DSQ' ? 'disqualified' : `${ordinal(e.place!)} of ${e.of}`}${e.elapsed ? `, ${mins(e.elapsed)}` : ''}. Saved, it goes in her race record and logbook.`
    : `${e.title}: ${(e.nm ?? 0).toFixed(1)} nm in ${mins(e.elapsed)}${e.arrived ? ', arrived' : ''}. Saved, it goes in her logbook.`;
  $('keepAsk').hidden = false;
  const done = (keep: boolean) => {
    $('keepAsk').hidden = true; pending = null;
    if (keep) addLog(p);
    toast(keep ? 'Saved to her logbook.' : 'Discarded.', 2200);
    next();
  };
  $('bKeep').onclick = () => done(true); $('bDiscard').onclick = () => done(false);
}
onSaveTrouble(msg => toast(msg, 6000));
$('saveNote').textContent = saveStatus();

function showResults(): void {
  w.finishShown = true;
  const rows = w.boats.slice().sort((a, b) => (a.finished ? a.finishT! : 1e9) - (b.finished ? b.finishT! : 1e9));
  logRace(rows);
  const place = rows.indexOf(w.user) + 1;
  $('resTitle').textContent = place === 1 ? 'You won the race' : `You finished ${place}${['th', 'st', 'nd', 'rd'][place] || 'th'}`;
  const sr = w.startReport;
  $('resStart').textContent = sr ? `Your start: crossed ${sr.delay.toFixed(1)} s after the gun at ${sr.kt.toFixed(1)} kt, ${Math.round(sr.frac * 100)}% of the way from ${w.C.pinLabel} to ${w.C.committeeLabel}.` : 'No clean start recorded.';
  const code = (b: Boat) => b.scoring === 'ZFP' ? ' · ZFP: 20% penalty (Rule 30.2)' : b.scoring ? ` · ${b.scoring}: disqualified (Rule ${b.scoring === 'UFD' ? '30.3' : '30.4'})` : '';
  $('resBody').innerHTML = rows.map((b, i) => `<tr><td>${b.scoring === 'UFD' || b.scoring === 'BFD' ? 'DSQ' : b.finished ? i + 1 : '–'}</td><td><span class="dot" style="background:${b.color}"></span>${b.isUser ? 'You' : b.name} <span style="color:var(--muted)">${b.no}</span></td><td>${b.finished ? fmtClock(b.finishT!).replace('+', '') : 'Still racing'}${code(b)}</td></tr>`).join('');
  $('resFouls').textContent = `Fouls you committed: ${w.fouls}. Fouls against you: ${w.fouledBy}.`;
  const db = debriefHtml('Your race, debriefed');
  $('resDebrief').innerHTML = db; $('resDebrief').hidden = !db; $('resStart').hidden = !!db; // the debrief has the start in full
  $('results').hidden = false;
  w.paused = true;
}

/* ---------------- loop: fixed-step sim, free-running render ---------------- */
function resize(): void { view.resize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();

let last = performance.now();
/** The showroom's point of sail: a close reach, port tack (the wind 55° on her port bow); negative: starboard tack. */
let showroomTwa = 55;
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
  } else if (!w.running) {
    // nothing running (the start page, setup, the showroom): she still sails, in the real wind and physics, so her sails,
    // heel and flags agree; in the showroom on a close reach
    const showing = boatPanel.open || fleet.boatOpen;
    acc += dt; while (acc >= DT) { w.idle(DT, showing ? showroomTwa : undefined); acc -= DT; }
  }
  for (const e of w.drainEvents()) handle(e);
  $('bPushOff').hidden = !(w.running && !!w.user.docked); sailButtons();
  keyLook(dt); lookLabel(); tillerSpring(dt); pilotTick(dt); showTiller(); showLines(); coachTick(dt);
  if (boatPanel.open || fleet.boatOpen) { look.shift = Math.min(440, innerWidth) / 2; look.chase = 10; view.render(w, dt, now, 3, look, over); }
  else view.render(w, dt, now, viewMode, look, over);
  labels.update(w, view.camera, viewMode);
  hud.update(w, dt);
}

/* Your boat: the panel, with the boat in the showroom view beside it. */
let boatPanel: BoatPanel;
function boatSummary(): void {
  const b = S.boat, colour = [...HULL_COLORS, BRIGHT_FINISH].find(c => c[1] === b.hull.upper)?.[0] ?? '', p = b.perf;
  const pick = $('boatPick') as HTMLSelectElement;
  pick.innerHTML = S.boats.map(x => `<option value="${x.id}"${x.id === b.id ? ' selected' : ''}>${(x.name || 'Unnamed').replace(/</g, '&lt;')} · ${sailNo(x)}</option>`).join('');
  const cond = [p.cleanedWeeks ? `bottom ${p.cleanedWeeks} wk` : 'clean bottom', p.mainAge === 'new' && p.jibAge === 'new' ? 'new sails' : 'used sails', p.mast === 'wood' ? 'wooden mast' : ''].filter(Boolean).join(', ');
  $('boatSum').textContent = `${colour} ${b.hull.material === 'wood' ? 'wooden' : 'fiberglass'} hull; ${cond}.`;
}
($('boatPick') as HTMLSelectElement).onchange = e => {
  const b = S.boats.find(x => x.id === (e.target as HTMLSelectElement).value); if (!b) return;
  S.boat = b; S.boatId = b.id; fleetChanged(); boatSummary();
};

/* The fleet: who you race against. Stock club boats and your own saved boats (not the one you're sailing). */
function fleetChanged(): void {
  const ids = new Set(S.boats.map(b => b.id));
  S.opponents = S.opponents.filter(o => o.startsWith('stock:') || (ids.has(o) && o !== S.boatId));
  S.fleet = S.opponents.length; saveSettings(S); newGame(); oppRows();
}
function oppRows(): void {
  const chip = (id: string, name: string, no: string, colour: string, hull: string) => {
    const on = S.opponents.includes(id), full = !on && S.opponents.length >= MAX_OPPONENTS;
    return `<button type="button" class="opp" data-opp="${id}" aria-pressed="${on}"${full ? ' disabled' : ''}><i style="background:${hull};box-shadow:0 0 0 2px ${colour}"></i><span>${name}</span><small>${no}</small></button>`;
  };
  const mine = S.boats.filter(b => b.id !== S.boatId);
  $('oppList').innerHTML = `<div class="opp-h">Club boats</div>` + FLEET.slice(1).map((f, i) => chip(`stock:${i + 1}`, f.name, f.no.replace(/^US\s+/, 'USA '), f.tag, f.hull)).join('')
    + `<div class="opp-h">Your boats</div>` + (mine.length ? mine.map(b => chip(b.id, (b.name || 'Unnamed').replace(/</g, '&lt;'), sailNo(b), '#c08cff', b.hull.upper)).join('') : '<small class="opp-none">None yet: save more boats under Your boats…</small>');
  $('oppCount').textContent = S.opponents.length ? `· ${S.opponents.length} boat${S.opponents.length > 1 ? 's' : ''}` : '· nobody (a solo race)';
}
$('oppList').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-opp]'); if (!b || b.disabled) return;
  const id = b.dataset.opp!;
  S.opponents = S.opponents.includes(id) ? S.opponents.filter(x => x !== id) : [...S.opponents, id].slice(0, MAX_OPPONENTS);
  fleetChanged();
});
boatPanel = new BoatPanel(S, () => { S.fleet = S.opponents.length; saveSettings(S); newGame(); boatSummary(); oppRows(); }, () => {
  const id = boatPanel.editing.id; boatPanel.hide(); fleet.openBoat(id); // back to her page in the Fleet
});
boatPanel.onSpin = () => (look.spin = !look.spin);
$('bBoat').onclick = () => { fleetFrom = 'setup'; $('setup').hidden = true; fleet.openList(); };

/* ---------------- the start page: Race, Cruise, Marina, Yacht Club ---------------- */
let fleetFrom: 'home' | 'setup' = 'home';
/** The showroom: on while one of your boats is on show (her page in the Fleet, or editing her). */
function showroom(on: boolean): void {
  if (on && !document.body.classList.contains('showroom')) { look.yaw = 0.6; look.pitch = 0; }
  document.body.classList.toggle('showroom', on);
  if (!on) { look.shift = 0; look.yaw = 0; look.pitch = 0; look.chase = 24; }
}
const fleet: Fleet = new Fleet(S, {
  changed: () => { fleetChanged(); boatSummary(); },
  showroom: b => { showroom(!!b || boatPanel.open); newGame(); },
  edit: id => { showroom(true); boatPanel.show(id); newGame(); },
  sail: (id, mode, fromSlip) => {
    const b = S.boats.find(x => x.id === id); if (!b) return;
    S.boat = b; S.boatId = b.id; S.opponents = S.opponents.filter(o => o !== b.id); S.fleet = S.opponents.length;
    if (mode === 'cruise') { S.mode = 'sail'; S.sailFrom = fromSlip && b.slip ? 'slip' : S.sailFrom === 'slip' ? 'cityfront' : S.sailFrom; }
    else { if (S.mode === 'sail') S.mode = 'race'; S.raceFrom = fromSlip && b.slip ? 'slip' : 'water'; }
    saveSettings(S); boatSummary(); oppRows(); newGame(); openSetup();
  },
  back: () => { newGame(); if (fleetFrom === 'setup') openSetup(); else $('home').hidden = false; }
});
function openHome(): void { settleLog(openHomeNow); }
function openHomeNow(): void {
  $('saveNote').textContent = saveStatus();
  courseView.close(); w.running = false; w.paused = false;
  for (const id of ['setup', 'pause', 'results', 'drill', 'replay', 'club', 'coachPanel']) $(id).hidden = true;
  if (boatPanel.open) boatPanel.hide();
  fleet.close(); showroom(false);
  $('home').hidden = false;
}
document.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-home]'); if (!b) return;
  const where = b.dataset.home;
  if (where === 'home') { openHome(); return; }
  $('home').hidden = true;
  if (where === 'race') { if (S.mode === 'sail') S.mode = 'race'; saveSettings(S); newGame(); openSetup(); }
  else if (where === 'cruise') { S.mode = 'sail'; saveSettings(S); newGame(); openSetup(); }
  else if (where === 'fleet') { fleetFrom = 'home'; fleet.openList(); }
  else if (where === 'club') $('club').hidden = false;
});
$('bExit').onclick = () => openHome();
$('bExit2').onclick = () => openHome();
$('bKeys0').onclick = () => keysView.open();

/* The conditions adjuster: each control is 'real' until moved; Real puts it back. */
const ADJ = {
  windKt: { el: 'adjWindKt', get: () => S.windKt || null, set: (v: number | null) => { S.windKt = v ?? 0; }, show: (v: number) => `${v} kt`, def: () => Math.round(w.wind.kt) },
  windDir: { el: 'adjWindDir', get: () => S.windDir ?? null, set: (v: number | null) => { S.windDir = v; }, show: (v: number) => `${v}°`, def: () => Math.round(w.wind.from / 5) * 5 % 360 },
  chop: { el: 'adjChop', get: () => (S.chop ?? 1) === 1 ? null : S.chop!, set: (v: number | null) => { S.chop = v ?? 1; }, show: (v: number) => v === 0 ? 'glassy' : `× ${v.toFixed(1)}`, def: () => 1 },
  swellHs: { el: 'adjSwell', get: () => S.swellHs ?? null, set: (v: number | null) => { S.swellHs = v; }, show: (v: number) => `${(v / 0.3048).toFixed(0)} ft`, def: () => +(w.sea.swell?.hs ?? 1).toFixed(1) }
} as const;
function adjustUi(): void {
  const real: string[] = [];
  for (const [k, a] of Object.entries(ADJ)) {
    const cur = a.get(), inp = $<HTMLInputElement>(a.el), btn = document.querySelector<HTMLButtonElement>(`[data-real="${k}"]`)!;
    btn.setAttribute('aria-pressed', String(cur == null)); inp.classList.toggle('dim', cur == null);
    if (cur == null) { inp.value = String(a.def()); $(a.el + 'V').textContent = 'real'; } else { inp.value = String(cur); $(a.el + 'V').textContent = a.show(cur); real.push(k); }
  }
  if (S.current !== 'real') real.push('current');
  if (S.rain) real.push('rain');
  if ((S.fog ?? 'real') !== 'real') real.push('fog');
  const names: Record<string, string> = { windKt: 'wind speed', windDir: 'wind direction', chop: 'chop', swellHs: 'swell', current: 'current', rain: 'rain', fog: 'fog' };
  $('adjSum').textContent = real.length ? `adjusted: ${real.map(k => names[k]).join(', ')}` : 'all real';
}
for (const [k, a] of Object.entries(ADJ)) {
  const inp = $<HTMLInputElement>(a.el);
  inp.addEventListener('input', () => { $(a.el + 'V').textContent = a.show(Number(inp.value)); });
  inp.addEventListener('change', () => { (a.set as (v: number | null) => void)(Number(inp.value)); saveSettings(S); newGame(); courseCard(); tideBox(); });
  document.querySelector<HTMLButtonElement>(`[data-real="${k}"]`)!.onclick = () => { (a.set as (v: number | null) => void)(null); saveSettings(S); newGame(); courseCard(); tideBox(); };
}

buildSetupChoices();
newGame(); paintSeg(); crewRows(); courseCard(); tideBox(); boatSummary(); oppRows();
requestAnimationFrame(frame);

// Dev-only handle for debugging and browser tests: window.sim() returns the current World.
if (import.meta.env.DEV) Object.assign(window, { sim: () => w, __look: (yaw: number, pitch: number, chase?: number) => { setLook(yaw, pitch); if (chase) look.chase = chase; }, __over: over, __view: view, __twa: (a: number) => { showroomTwa = a; } });
