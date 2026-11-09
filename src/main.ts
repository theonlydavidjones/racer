import './styles.css';
import { tackTarget } from './boat/physics';
import { CURRENTS } from './environment/current';
import { COURSES, courseFile } from './courses/registry';
import { ReplayView, type ReplayClip } from './replay/replayView';
import { Labels } from './render/labels';
import { SceneView, VIEWS } from './render/scene';
import { RULES, explain, type Incident } from './rules';
import { loadSettings, saveSettings, type Settings } from './settings';
import type { Boat } from './boat/boat';
import { randomSeed } from './core/rng';
import { DT, World } from './sim/world';
import { startDebrief } from './sim/startDebrief';
import type { SimEvent } from './sim/events';
import { $ } from './ui/dom';
import { horn, sound, toast } from './ui/feedback';
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
const look = { yaw: 0, pitch: 0 };
const LOOK_PITCH_MIN = -0.5, LOOK_PITCH_MAX = 1.1;
function setLook(yaw: number, pitch: number): void {
  look.yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw)); // keep within ±π
  look.pitch = Math.max(LOOK_PITCH_MIN, Math.min(LOOK_PITCH_MAX, pitch));
}
function lookAhead(): void { setLook(0, 0); }
let pendingPenalty: Boat | null = null;

function newGame(seed = randomSeed()): void {
  w = new World(courseFile(S.course), S, seed, S.mode === 'drill' ? { startAt: DRILL_FROM } : {});
  acc = 0; drillShown = false;
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
    markName: mr ? w.C.marks[mr.idx].name : undefined, markOverlapped: mr?.overlapped, turned: inc.turned
  });
  $('rEyebrow').textContent = youFault ? `Foul · ${inc.kind === 'contact' ? 'Contact' : 'Forced to avoid'}` : `${other.name} fouled you`;
  $('rTitle').textContent = RULES[inc.rule][0];
  $('rRule').textContent = RULES[inc.rule][1];
  $('rVerdict').className = 'verdict' + (youFault ? '' : ' ok');
  $('rWhat').textContent = ex.what;
  $('rTip').textContent = ex.tip;
  $('rPen').textContent = youFault ? 'Penalty: two turns (720°). Steer in two full circles, keeping clear of everyone while you turn.' : `${other.name} takes a two-turns penalty.`;
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
    if (pendingPenalty.isUser) toast('Do your two turns now: hold one steering button for two full circles.', 4000);
    pendingPenalty = null;
  }
  w.paused = false;
};

/* ---------------- input ---------------- */
function setControlsIdle(): void {
  const u = w.user; u.steer = 0; u.luff = false;
  ['bLeft', 'bRight', 'bLuff'].forEach(id => $(id).classList.remove('on'));
}
function doTack(): void {
  const u = w.user; if (!w.running || w.paused) return;
  const t = tackTarget(u); u.turnDir = t.dir; u.turnTarget = t.target;
}
function holdBtn(id: string, on: () => void, off: () => void): void {
  const el = $(id);
  el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); el.classList.add('on'); on(); });
  const end = () => { el.classList.remove('on'); off(); };
  (['pointerup', 'pointercancel', 'lostpointercapture'] as const).forEach(ev => el.addEventListener(ev, end));
}
holdBtn('bLeft', () => { w.user.steer = -1; }, () => { if (w.user.steer === -1) w.user.steer = 0; });
holdBtn('bRight', () => { w.user.steer = 1; }, () => { if (w.user.steer === 1) w.user.steer = 0; });
holdBtn('bLuff', () => { w.user.luff = true; }, () => { w.user.luff = false; });
$('bTack').addEventListener('click', doTack);
function togglePole(): void { if (!w.running || w.paused) return; w.user.poleWant = !w.user.poleWant; }
$('bPole').addEventListener('click', togglePole);
$('bView').onclick = () => { viewMode = (viewMode + 1) % 3; lookAhead(); $('bView').textContent = 'View · ' + VIEWS[viewMode]; };
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

const keys: Record<string, boolean> = {};
addEventListener('keydown', e => {
  if ((e.key === 'm' || e.key === 'M') && $('replay').hidden && $('results').hidden && $('drill').hidden) { courseView.toggle(w); return; }
  if (e.key === 'Escape' && courseView.isOpen) { courseView.close(); return; }
  if (!$('setup').hidden || !$('replay').hidden || !$('results').hidden || !$('drill').hidden) return;
  const u = w.user, k = e.key;
  if (keys[k]) return; keys[k] = true;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') u.steer = -1;
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') u.steer = 1;
  else if (k === 'ArrowDown' || k === 's' || k === 'S') u.luff = true;
  else if (k === ' ' || k === 't' || k === 'T') { e.preventDefault(); doTack(); }
  else if (k === 'o' || k === 'O') togglePole();
  else if (k === 'v' || k === 'V') $('bView').click();
  else if (k === 'p' || k === 'P' || k === 'Escape') { if ($('pause').hidden) $('bPause').click(); else $('bResume').click(); }
  else if (k === 'w' || k === 'W') lookAhead();
});
addEventListener('keyup', e => {
  const u = w.user, k = e.key; keys[k] = false;
  if ((k === 'ArrowLeft' || k === 'a' || k === 'A') && u.steer === -1) u.steer = 0;
  if ((k === 'ArrowRight' || k === 'd' || k === 'D') && u.steer === 1) u.steer = 0;
  if (k === 'ArrowDown' || k === 's' || k === 'S') u.luff = false;
});
// Look around by dragging the view (mouse or finger). Double-tap/double-click looks ahead again.
let drag: { x: number; y: number; yaw0: number; pitch0: number } | null = null, lastTap = 0;
$('gl').addEventListener('pointerdown', e => {
  drag = { x: e.clientX, y: e.clientY, yaw0: look.yaw, pitch0: look.pitch };
  const now = performance.now(); if (now - lastTap < 300) lookAhead(); lastTap = now;
});
addEventListener('pointermove', e => {
  if (drag && viewMode !== 2) setLook(drag.yaw0 + (e.clientX - drag.x) * 0.006, drag.pitch0 + (e.clientY - drag.y) * 0.006);
});
/** Held keys pan the view: Q/E left/right, R/F up/down. */
function keyLook(dt: number): void {
  const rate = 1.6 * dt;
  if (keys.q || keys.Q) setLook(look.yaw + rate, look.pitch);
  if (keys.e || keys.E) setLook(look.yaw - rate, look.pitch);
  if (keys.r || keys.R) setLook(look.yaw, look.pitch + rate);
  if (keys.f || keys.F) setLook(look.yaw, look.pitch - rate);
}
function lookLabel(): void {
  const el = $('bLook'), deg = Math.round(-look.yaw * 180 / Math.PI);
  const off = Math.abs(deg) > 8 || Math.abs(look.pitch) > 0.15;
  el.hidden = !off || viewMode === 2;
  if (off) el.textContent = Math.abs(deg) <= 8 ? 'Look ahead' : `Looking ${Math.abs(deg)}° ${deg > 0 ? 'stbd' : 'port'} · ahead`;
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
  $('seqField').hidden = S.mode === 'drill';
  $('modeNote').textContent = S.mode === 'drill'
    ? 'Starts one minute before the gun. Fifteen seconds after it you get a debrief and an overhead replay, and can try the same start again.'
    : 'The whole race, from the warning signal to the finish.';
  $('bGo').textContent = S.mode === 'drill' ? 'Practice a start' : 'Start the sequence';
}
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
  paintSeg(); newGame(); courseCard();
}));
function openSetup(): void { courseView.close(); w.running = false; paintSeg(); courseCard(); $('setup').hidden = false; }
function beginRace(seed?: number): void {
  saveSettings(S);
  newGame(seed);
  w.running = true; w.paused = false;
  $('bFast').textContent = 'Speed 1×';
  horn(1.0);
  const m0 = w.C.marks[0];
  toast(S.mode === 'drill'
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
  keyLook(dt); lookLabel();
  view.render(w, dt, now, viewMode, look);
  labels.update(w, view.camera, viewMode);
  hud.update(w, dt);
}

buildSetupChoices();
newGame(); paintSeg(); courseCard();
requestAnimationFrame(frame);

// Dev-only handle for debugging and browser tests: window.sim() returns the current World.
if (import.meta.env.DEV) (window as unknown as { sim: () => World }).sim = () => w;
