import { CoachMemory } from './boat/coach';
import './styles.css';
import { COURSES } from './courses/registry';
import { RC_COURSE, chooseCourse, type CommitteeChoice } from './courses/committee';
import { OUTBOARDS } from './boat/motor';
import { ghostGap, ghostsFor, loadGhost, setupKey, type Ghost } from './replay/ghost';
import { BoatPanel } from './ui/boatPanel';
import { Fleet } from './ui/fleet';
import { loadLog, type LogEntry } from './boat/logbook';
import { harborAt, inBasin } from './geo/marina';
import { HULL_COLORS, BRIGHT_FINISH, sailNo } from './boat/spec';
import { ReplayView, type ReplayClip } from './replay/replayView';
import { RaceReplay } from './replay/raceReplay';
import { Labels } from './render/labels';
import { ORIENT_LABEL, SceneView, VIEWS, overheadUp, type Overhead } from './render/scene';
import { HELD, KeyMap, type Action } from './ui/keys';
import { KeysView } from './ui/keysView';
import { D2R, V } from './core/math';
import { EXONERATION, RULES, explain, scoreOrder, type Incident } from './rules';
import { MAX_OPPONENTS, loadSettings, saveSettings, type Settings } from './settings';
import { FLEET } from './boat/boat';
import { currentSeason, seasonById, seasonResults, seasons, standings, type SeasonResult, type Series } from './club/season';
import { seasonHtml } from './ui/season';
import { fillFleet, genericSpec, genericTag, isGeneric, isReal } from './boat/generic';
import { placeAmong, realFleetIds, realRace, realRaces, sailKey } from './sim/realRaces';
import type { Boat, LineKey } from './boat/boat';
import { CONDITION_KEYS } from './sim/world';
import { WorkerHost, type SimHost, type SimView } from './sim/host';
import type { Command, CtlKey } from './sim/commands';
import { POLE, byHand, linesByHand } from './boat/physics';
import type { PlaceAcross, PlaceFore } from './boat/crewPhys';
import { ensureMembers, loadMembers, pullCrew, saveMembers, type Member } from './club/members';
import { installSkipperUI } from './ui/skipperUI';
installSkipperUI(); // (the Members tab's skipper half: her ratings, what's said of her, her record)
import { SailBand } from './ui/sailBand';
import { WindLadder } from './render/windLadder';
import { LINE_NAME } from './ui/lines';
import { autoAcross, openCrewChoices, showCrewRow, toggleCrewOpen } from './ui/crewWords';
import { PerfMeter } from './ui/perfMeter';
import { degAndPoint, turnWords } from './core/compass';
import { WIND_KIND_LABEL, type WindKind } from './environment/wind';
import { sunPosition } from './environment/sun';
import { type StartStats } from './sim/startDebrief';
import type { SimEvent } from './sim/events';
import { $ } from './ui/dom';
import { horn, logMessage, messageLog, setLogClock, sound, toast, headline } from './ui/feedback';
import { Hud, fmtClock } from './ui/hud';
import { CourseView } from './ui/courseView';
import { NavView } from './ui/navView';
import { FIELD_LAYERS, fieldLayer, layerMenu, withLayer, type LayerKey, type MenuView, type MenuChoice } from './ui/layers';
import { Chart } from './ui/chart';
import { SetupChart, type SetupPicks } from './ui/setupChart';
import { PlanChart } from './ui/planChart';
import { FlowPanel } from './ui/flowPanel';
import type { PilotMode } from './boat/autopilot';
import { Nav, type Place } from './ui/nav';
import { installDevHandles } from './app/devHandles';
import { mountDrills } from './app/drills';
import { mountResults } from './app/results';
import { mountSetup } from './app/setup';

/**
 * What the app's parts (src/app/*.ts) reach of its own state: each a getter, so a part sees it as it is now, and a
 * setter where a part changes it. (Read when a part's code runs, after app.ts has set them up.)
 */
const ctx = {
  get activeGhost() { return activeGhost; }, set activeGhost(v) { activeGhost = v; },
  get host() { return host; }, set host(v) { host = v; },
  get hud() { return hud; },
  get look() { return look; },
  get nav() { return nav; },
  get over() { return over; },
  get planChart() { return planChart; },
  get setLook() { return setLook; },
  get showroomTwa() { return showroomTwa; }, set showroomTwa(v) { showroomTwa = v; },
  get view() { return view; },
  get w() { return w; }, set w(v) { w = v; },
  get DRILL_FROM() { return DRILL_FROM; },
  get S() { return S; },
  get beginRace() { return setup.beginRace; },
  get beginLesson() { return setup.beginLesson; },
  get openLessons() { return setup.openLessons; },
  get drillRuns() { return drillRuns; },
  get drillShown() { return drillShown; }, set drillShown(v) { drillShown = v; },
  get drillView() { return drillView; },
  get esc() { return esc; },
  get openSetup() { return setup.openSetup; },
  get send() { return send; },
  get setControlsIdle() { return setControlsIdle; },
  get drills() { return drills; },
  get incidentClips() { return incidentClips; }, set incidentClips(v) { incidentClips = v; },
  get mmss() { return mmss; },
  get pendingGhost() { return pendingGhost; }, set pendingGhost(v) { pendingGhost = v; },
  get pendingSeason() { return pendingSeason; }, set pendingSeason(v) { pendingSeason = v; },
  get raceReplay() { return raceReplay; },
  get realResults() { return realResults; },
  get replayPin() { return replayPin; }, set replayPin(v) { replayPin = v; },
  get resultsShown() { return resultsShown; }, set resultsShown(v) { resultsShown = v; },
  get seasonLine() { return seasonLine; },
  get seasonRaceOf() { return seasonRaceOf; },
  get seasonResult() { return seasonResult; },
  get titleCase() { return titleCase; },
  get KIND_NOTE() { return KIND_NOTE; },
  get MEMBERS() { return MEMBERS; },
  get SIM_GUARD() { return SIM_GUARD; },
  get SIM_INPROC() { return SIM_INPROC; },
  get adjustUi() { return adjustUi; },
  get boatPanel() { return boatPanel; },
  get committee() { return committee; },
  get condLive() { return condLive; }, set condLive(v) { condLive = v; },
  get courseView() { return courseView; },
  get fleet() { return fleet; },
  get ghostNext() { return ghostNext; },
  get hhmm() { return hhmm; },
  get insetViews() { return insetViews; },
  get keymap() { return keymap; },
  get keysHint() { return keysHint; },
  get labels() { return labels; },
  get navView() { return navView; },
  get pendingPenalty() { return pendingPenalty; }, set pendingPenalty(v) { pendingPenalty = v; },
  get prepared() { return prepared; }, set prepared(v) { prepared = v; },
  get realRaceHolds() { return realRaceHolds; },
  get results() { return results; },
  get setupChart() { return setupChart; },
  get setupTimer() { return setupTimer; }, set setupTimer(v) { setupTimer = v; },
  get showBar() { return showBar; },
  get showCond() { return showCond; }, set showCond(v) { showCond = v; },
  get showCrewPlace() { return showCrewPlace; },
  get showLash() { return showLash; },
  get showMin() { return showMin; },
  get showSaved() { return showSaved; }, set showSaved(v) { showSaved = v; },
  get showTrimOwner() { return showTrimOwner; },
  get shownDest() { return shownDest; }, set shownDest(v) { shownDest = v; },
  get speedSet() { return speedSet; }, set speedSet(v) { speedSet = v; },
  get still() { return still; }, set still(v) { still = v; },
  get unshown() { return unshown; }, set unshown(v) { unshown = v; },
  get word() { return word; },
};
export type AppCtx = typeof ctx;

const S: Settings = loadSettings();
// the Yacht Club's members (club/members.ts): you and your crew, assigned to your boat's seats; the race's crew comes from them
const MEMBERS: Member[] = loadMembers();
/** Your boat's crew from her seats (after choosing a boat, or at the start); saves what changed. */
function crewFromClub(): void { if (ensureMembers(S, MEMBERS)) { saveMembers(MEMBERS); saveSettings(S); } pullCrew(S, MEMBERS); }
crewFromClub();
if (S.course !== RC_COURSE && !COURSES.some(c => c.id === S.course)) S.course = COURSES[0].id;
S.raceLength ??= 'medium';
// a new player's first race: the committee chooses the course for the day, as at a real club race (saves keep theirs)
try { if (!localStorage.getItem('fbsim-settings-v2')) S.course = RC_COURSE; } catch { /* storage unavailable */ }
S.windKind ??= 'auto';

const view = new SceneView($<HTMLCanvasElement>('gl'));
const labels = new Labels($('labels'));
const hud = new Hud();
const replayView = new ReplayView($<HTMLCanvasElement>('rcanvas'));
const courseView = new CourseView();
const navView = new NavView();
const drillView = new ReplayView($<HTMLCanvasElement>('dcanvas'));
const raceReplay = new RaceReplay($('raceReplay'));
/** Start practice begins this many seconds before the gun, and the debrief comes this long after it. */
const DRILL_FROM = 120, DRILL_DEBRIEF_AT = 15;
/** The start-line drill's attempts this session, for the run to compare (newest last). */
const drillRuns: (StartStats & { n: number; from: number; solo: boolean })[] = [];
let drillShown = false;

/** The race: the host runs it (sim/host.ts); the page reads it through the view `w` and changes it only by `send`. */
let host!: SimHost;
/** The race in the page's own thread (?inproc): for the dev handles and check scripts that change the World directly. */
const SIM_INPROC = /[?&]inproc\b/.test(location.search);
/** Development only: the view refuses writes (sim/host.ts guarded), to find any the compiler can't see. */
const SIM_GUARD = import.meta.env.DEV && /[?&]simguard\b/.test(location.search);
let w!: SimView;
const send = (c: Command) => host.send(c);
/** An older race sailed again that was saved with a pinned 'Wind from' (before Turn the wind): its direction, for that race only. */
let replayPin: number | null = null;
let viewMode = 0;
/** Where you're looking, relative to the bow: yaw + is to port (radians), pitch + is up. Never affects steering. */
const look: { yaw: number; pitch: number; aft: number; chase?: number; shift: number; panelShift: number; spin: boolean; fov?: number } = { yaw: 0, pitch: 0, aft: 6.5, chase: undefined, shift: 0, panelShift: 0, spin: true }; // (chase: unset is the framed distance, design/chase-layout.html)
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
/**
 * Looking at the cabin-top instrument (render/tacktick.ts): the eye at the helm, on the windward side as in the cockpit
 * view, turned and tipped down to its face, held there each frame (she heels and tacks) until you press the key again or
 * change view. The view, eye and look you had are put back after.
 */
let instLook: { view: number; aft: number; yaw: number; pitch: number } | null = null;
function toggleInstrumentLook(): void {
  if (instLook) { const b = instLook; instLook = null; look.fov = undefined; setView(b.view); look.aft = b.aft; setLook(b.yaw, b.pitch); return; }
  if (!view.userMesh?.instrument) return;
  instLook = { view: viewMode, aft: look.aft, yaw: look.yaw, pitch: look.pitch };
  // the eye at the helm, and the view narrowed to about 22° (as your eye settles on a small thing 2½ m off: the unit is
  // drawn true to size, its 28 mm digits a few pixels high in the cockpit view's 72°)
  setView(0); look.aft = EYE_MIN; look.fov = 22; aimAtInstrument();
}
/** Each frame while you look at it: nudge the look so the instrument's face sits in the middle of the view (she heels,
 * pitches and changes side at a tack, so the first aim drifts). */
function centreInstrument(): void {
  const inst = view.userMesh?.instrument; if (!inst) return;
  const cam = view.camera, p = inst.grp.getWorldPosition(cam.position.clone()); p.y += 0.07; p.project(cam);
  if (p.z > 1 || !Number.isFinite(p.x)) { aimAtInstrument(); return; } // (behind the eye, as just after a tack: start again)
  const half = cam.fov / 2 * D2R;
  setLook(look.yaw - p.x * half * cam.aspect * 0.3, look.pitch + p.y * half * 0.3);
}
function aimAtInstrument(): void {
  const inst = view.userMesh?.instrument; if (!inst) return;
  // the cockpit eye's place in her frame (as render/scene.ts sets it), and the instrument's face
  const aft = look.aft, side = w.user.rel >= 0 ? 1 : -1;
  const ex = Math.max(0.35, 0.8 - (aft - 3.3) * 0.06) * side, ey = 1.6 + Math.max(0, aft - 3.3) * 0.25;
  const t = inst.grp.position, dx = t.x - ex, dy = t.y + 0.07 - ey, dz = t.z - aft;
  setLook(Math.atan2(-dx, -dz), Math.atan2(dy, Math.hypot(dx, dz)) + 4 * D2R); // (the cockpit camera tips down 4° of its own)
}
let setupChart: SetupChart | null = null;
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

/**
 * The showroom's own time of day (minutes after midnight, local) and conditions (the panel's settings): her on show at dawn,
 * at dusk with her lights on, or in a blow, without changing the day and conditions of your races and cruises. Null: the
 * day's own. (The world's clock starts the start sequence before the start time: the time set is the one shown.)
 */
let showMin: number | null = null, showCond: Partial<Settings> | null = null;
/** The settings the conditions panel had before it was opened from the showroom (put back when it closes). */
let showSaved: Partial<Settings> | null = null;
const hhmm = (m: number) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, '0')}:${String(((m % 60) + 60) % 60).padStart(2, '0')}`;
/** The conditions panel open from the pause menu: its changes go to the sail that's running, not a new one. */
let condLive = false;
/** Ghost races (replay/ghost.ts): the ghost chosen in Run a past race, the one being raced now (while the race is the
 * ghost's very race), and your run of the race just logged (kept as a ghost if you save it). */
let ghostNext: Ghost | null = null, activeGhost: Ghost | null = null, pendingGhost: Ghost | null = null;
const setup = mountSetup(ctx); // (src/app/setup.ts)
/*
 * The setup's changes build the race but not the scene (the owner, 13 Nov 2026: "let me finish configuring the race
 * before loading up the game"). prepare() builds the one World the setup's cards and charts read (its course, weather,
 * tide, start) and hands it to the host, in the same worker (sim/host.ts rebuild, adopting it as the mirror); show()
 * builds the scene for it, once, at Start or Cast off. Between the two the view is `still`: the last frame stays on the
 * screen, nothing is drawn or sailed (the World handed over must stay untouched until the race starts), and the game's
 * own displays are put away (body.still).
 */
let still = false, unshown = false;
/** How many Worlds the page has built (for the checks: a setup change builds one, after the debounce). */
let prepared = 0;
let setupTimer = 0;

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
/** This race's rule incidents, for the race replay (by Moment.ref). */
let incidentClips: { clip: ReplayClip; title: string; what: string; t?: number }[] = [];
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
  // (a boat not racing, finished or retired, that breaks rule 23.1 can't take turns for it: rule 44.1's penalties are for
  // an incident while racing; she can be protested)
  const notRacing = inc.part === '23.1';
  // (Part 2 preamble: before the preparatory signal, after a postponement or abandonment, or once finished or retired, a
  // boat breaking a rule of Part 2 isn't penalized for it, except rule 14 with injury or serious damage, and rule 23.1)
  const preamble = !!inc.notRacing;
  $('rPen').textContent = preamble ? `No penalty: ${youFault ? 'you weren\'t' : `${inc.fouler.name} wasn't`} racing${w.cancelled ? ' (racing was called off)' : ''}. The right-of-way rules still apply between boats out here, but a boat not racing isn't penalized for breaking them (Part 2 preamble).` : notRacing ? `No turns: ${youFault ? 'you weren\'t' : `${inc.fouler.name} wasn't`} racing, and a turns penalty is only for an incident while racing (Rule 44.1). ${youFault ? `${other.name} may protest you` : `You may protest ${inc.fouler.name}`} instead.` : exonerated ? `No penalty: ${youFault ? 'you were' : `${inc.fouler.name} was`} compelled by ${w.boats[inc.exoneratedBy!].name}'s foul (Rule 43.1(a)).` : youFault
    ? `Penalty: ${turns} (${w.penaltyDeg}°). Get clear of other boats, then turn ${w.penaltyDeg === 720 ? 'two full circles' : 'one full circle'} in the same direction: each one includes a tack and a jibe (Rule 44.2).${w.protestsOn ? ` Skip them and ${other.name} may protest.` : ''}`
    : w.protestsOn ? `${other.name}'s ${turns} penalty is theirs to take (Rule 44.1). To protest, hail "Protest!" now (${keymap.label('hail')}).` : `${other.name} takes a ${turns} penalty.`;
  logMessage(`${youFault ? 'Foul' : `${other.name} fouled you`}: ${RULES[inc.rule][0]}. ${ex.what}`);
  pendingPenalty = exonerated || notRacing || preamble ? null : inc.fouler;
  lastClip = clip;
  if (w.log) {
    const title = `${youFault ? 'Your foul' : `${other.name} fouled you`}: ${RULES[inc.rule][0]}`;
    send({ k: 'logNote', note: { key: 'rule', t0: w.t - 10, t1: w.t, x: user.x, y: user.y, lost: 0, text: title, ref: incidentClips.length } });
    incidentClips.push({ clip, title, what: ex.what, t: w.t });
  }
  $('replay').hidden = false;
  replayView.play(w, clip);
}
$('bReplay').onclick = () => { if (lastClip) replayView.play(w, lastClip); };
$('bCont').onclick = () => {
  $('replay').hidden = true; replayView.stop();
  if (pendingPenalty) {
    send({ k: 'penalty', boat: pendingPenalty.id });
    if (pendingPenalty.isUser) toast(`Do your ${w.penaltyDeg === 720 ? 'two turns' : 'turn'} now: put the tiller over and keep turning the same way.`, 4000);
    pendingPenalty = null;
  }
  send({ k: 'pause', on: false });
};

/* ---------------- input ---------------- */
function setControlsIdle(): void {
  send({ k: 'handsOff' });
}

/** A cluster button's word (under its icon), set only when it changes. */
function word(id: string, t: string): void { const e = $(id).querySelector('.w'); if (e && e.textContent !== t) e.textContent = t; }

/* The tiller. Its handle goes from −1 (pushed to port) to +1 (pushed to starboard); pushing it to
 * starboard turns the boat to port, as on a real boat. It stays where you leave it. */
function setTiller(v: number): void { send({ k: 'tiller', v }); }
/* Lashing the tiller: a line from the tiller to a cleat holds it where you leave it, hands off (heaving to). It's done on
 * the tiller itself: right-click (or double-click, or the key) to lash it where it is. The lashing shows on the tiller guide; a click
 * or A/D takes the tiller and the lashing comes off; double-click again to lash it somewhere else. */
const lashWhere = (t: number) => Math.abs(t) < 0.04 ? 'amidships' : `${Math.round(Math.abs(t) * 100)}% to ${t > 0 ? 'starboard' : 'port'}`;
function lash(): void {
  if (!w.running || w.paused) return;
  const u = w.user;
  if (u.lashed != null) { unlash(); return; }
  pilotOff('Pilot on standby.'); releaseTiller();
  send({ k: 'lash', on: true }); showLash();
  const t = u.tiller, lee = (u.tack === 'S') === (t < 0); // on starboard tack the leeward side is port
  const fast = u.v > 2 / 1.944 && lee && Math.abs(t) > 0.15 && !((u.jibBacked ?? 0) > 0.5);
  toast(fast ? `Tiller lashed to leeward with way on (${(u.v * 1.944).toFixed(1)} kt): she'll round up and tack. To heave to, back the jib first and let her slow to a knot or two, then lash.`
    : Math.abs(t) < 0.04 ? 'Tiller lashed amidships. To lash it elsewhere, take the tiller, move it, and right-click (or double-click).'
    : `Tiller lashed ${lashWhere(t)} (${lee ? 'to leeward: she turns toward the wind' : 'to windward: she bears away'}). Click or ${keymap.label('steerPort')}/${keymap.label('steerStbd')} takes the tiller; right-click or double-click lashes it again.`, fast ? 6000 : 4500);
}
function unlash(): void { const u = w.user; if (u.lashed == null) return; send({ k: 'lash', on: false }); showLash(); toast('Lashing off: you have the tiller.', 2000); }
function showLash(): void {
  const l = w.user.lashed, on = l != null;
  document.body.classList.toggle('lashed', on); $('tiller').classList.toggle('lashed', on);
  if (on) {
    $('tgCur').style.left = `${50 + l * TILLER_SPAN * 100}%`;
    const txt = `Tiller lashed ${lashWhere(l)} · click to take it`; if ($('tgLash').textContent !== txt) $('tgLash').textContent = txt;
  }
}
function centreTiller(): void { setTiller(0); }
function showTiller(): void {
  const t = w.user.tiller; showLash();
  $('tillerHandle').style.left = `${50 + t * 44}%`;
  if (tillerHeld) $('tgCur').style.left = `${50 + t * TILLER_SPAN * 100}%`;
  $('tiller').setAttribute('aria-valuenow', String(Math.round(t * 100)));
  $('tillerLab').textContent = w.user.lashed != null ? `Tiller lashed · ${Math.abs(t) < 0.04 ? 'amidships' : `${Math.round(Math.abs(t) * 100)}% to ${t > 0 ? 'stbd' : 'port'}`} · drag to move it`
    : Math.abs(t) < 0.04 ? 'Tiller · centered' : `Tiller · ${Math.round(Math.abs(t) * 100)}% to ${t > 0 ? 'stbd' : 'port'} · turning ${t > 0 ? 'to port' : 'to starboard'}`;
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
  if (!toldTiller) { toldTiller = true; toast(`You have the tiller. Slide left or right: the screen's center line is straight ahead, right of it turns you to port, left of it to starboard. ${keymap.label('takeTiller')}, Esc or a click lets go.`, 5000); }
}
function releaseTiller(): void {
  if (!tillerHeld) return;
  tillerHeld = false; document.body.classList.remove('tiller-held'); $('tiller').classList.remove('held');
}
const overControl = (t: EventTarget | null) => t instanceof Element && !!t.closest('button, a, input, select, #tiller, #msgLog, #map, #trimPanel, .overlay, .layerpop');
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
  else look.chase = Math.max(8, Math.min(90, (look.chase ?? view.chaseDist) * Math.exp(e.deltaY * 0.0015))); // chase: closer or farther (from the framed distance)
}, { passive: false });

/* ---------------- sail trim: who trims, the sheets, and every other line ---------------- */
type CtlItem = { key: CtlKey | 'carFore' | 'carIn'; label: string; group: string };
/** The lines, grouped as they are on Josephine. */
const CTL_UI: CtlItem[] = [
  { group: 'Cockpit thwart', key: 'mainsheet', label: 'Mainsheet' },
  { group: 'Cockpit thwart', key: 'traveller', label: 'Traveler' },
  { group: 'Cockpit thwart', key: 'backstay', label: 'Backstay' },
  { group: 'Piano', key: 'vang', label: 'Vang' },
  { group: 'Piano', key: 'outhaul', label: 'Outhaul' },
  { group: 'Piano', key: 'cunningham', label: 'Cunningham' },
  { group: 'Piano', key: 'downhaul', label: 'Main halyard' },
  { group: 'Piano', key: 'jibCunningham', label: 'Jib Cunningham' },
  { group: 'Piano', key: 'jibHalyard', label: 'Jib halyard' },
  { group: 'Winches', key: 'jibsheet', label: 'Jib sheet' },
  { group: 'Winches', key: 'jibsheetW', label: 'Windward sheet' },
  { group: 'Cabin top: the lazy jib car', key: 'carFore', label: 'Car fore–aft' },
  { group: 'Cabin top: the lazy jib car', key: 'carIn', label: 'Car in–out' }
];
let ctlSel = 0;
const btnCmd: Partial<Record<CtlKey, number>> = {};
/* Who has each line. Work any line (a button, a key, or drag its bar) and that line is yours; the crew keeps every
 * other. Each line, the sheets and the crew's weight have a Crew · You switch: tap Crew to give it back, You to take it
 * where it is. */
function showTrimOwner(): void {
  const mine = linesByHand(w.user), n = mine.length, names = mine.map(k => LINE_NAME[k]);
  $('tpWho').textContent = n === 0 ? 'Crew trims every line' : n <= 2 ? `You have the ${names.join(' and the ')}` : `You have ${n} lines`;
  $('tpWho').title = n === 0 ? 'The crew trims every line. Work any line in the sail controls and that one is yours.' : `Yours: ${names.join(', ')}. The crew trims the rest. Tap a line's amber name to give it back.`;
  $('tpWho').parentElement!.classList.toggle('mine', n > 0);
}
function giveBack(k: LineKey): void { send({ k: 'line', key: k, mine: false }); showTrimOwner(); }
/** Every Crew · You switch in the trim panel: a line's (data-line), or the crew's weight ("crew"). */
document.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('.who [data-who]'); if (!b || !w.running) return;
  e.stopPropagation();
  const line = b.closest<HTMLElement>('.who')!.dataset.line!, you = b.dataset.who === 'you';
  if (line === 'crew') {
    const c = w.user.crew; if (!c) return;
    if (you) { if (!c.place) setPlace('across', autoAcross(w.user)); }
    else if (c.place) { send({ k: 'crewPlace', place: null }); showCrewPlace(); toast('Crew back on auto: they place their own weight again.', 2500); }
    return;
  }
  const k = line as LineKey;
  if (you === byHand(w.user, k)) return;
  if (you) { send({ k: 'line', key: k, mine: true }); showTrimOwner(); toast(`The ${LINE_NAME[k]} is yours: it stays where it is until you work it, or tap Crew.`, 3000); }
  else { giveBack(k); toast(`The ${LINE_NAME[k]} is the crew's again.`, 2000); }
});
// the crew's weight lives in a pop-up on the Crew button, bottom right (the chase-view layout), or opened from the
// Coach card's crew line. The owner (13 Nov 2026): the button back on the surface, so you can find where the crew sit
// when you need them (in irons, their weight to leeward helps her bear away)
function crewPopOpen(open = !!$('crewPop').hidden, from: 'button' | 'coach' = 'coach'): void {
  $('crewPop').hidden = !open; $('bCrew').setAttribute('aria-expanded', String(open)); $('bCrew').classList.toggle('on', open);
  if (!open) return;
  const pop = $('crewPop').style;
  // (from the button: just above it, bottom right, as before, with the places to sit open; from the Coach card's crew
  // line: just above that card, on the left, clear of the band)
  if (from === 'button') { pop.bottom = pop.left = pop.right = ''; openCrewChoices(); showCrewPlace(); }
  else { const r = $('trimPanel').getBoundingClientRect(); pop.bottom = `${Math.round(innerHeight - r.top + 8)}px`; pop.left = `${Math.round(r.left)}px`; pop.right = 'auto'; }
}
$('bCrew').onclick = () => crewPopOpen(undefined, 'button');
// the crew line in the Coach card is redrawn every frame: catch its clicks on the card
$('trimPanel').addEventListener('click', e => { if ((e.target as HTMLElement).closest('.tp-crew')) crewPopOpen(); });
$('tpCrewLine').onclick = () => { if (!w.user.crew?.place) { toggleCrewOpen(); showCrewPlace(); } };
/* The sail controls band (ui/sailBand.ts): every line, laid out as you face forward from the helm. */
const band = new SailBand({
  world: () => w,
  send,
  hold: (k, d) => { if (d == null) delete btnCmd[k]; else btnCmd[k] = d; applyHeld(); },
  changed: () => showTrimOwner(),
  toast: (m, ms) => toast(m, ms),
  allBack: () => { send({ k: 'allToCrew' }); S.manualTrim = 0; saveSettings(S); showTrimOwner(); toast('Hand Back: every line and both jib cars back to the crew. The pole stays yours.', 2500); },
  pole: () => togglePole(),
  hailWords: () => w.hailOption()?.words ?? null,
  hail: () => doHail(),
  hailKey: () => keymap.label('hail'),
  // what the control under the mouse (or last touched) does: in the Coach card, not a hover title over the controls
  help: t => {
    const e = $('tpHelp'); e.hidden = !t; if (!t) return;
    const i = t.indexOf(': '), b = document.createElement('b');
    if (i > 0 && i < 40) { b.textContent = t.slice(0, i); e.replaceChildren(b, ' ' + t.slice(i + 2)); } else e.replaceChildren(t);
  }
}, document.body);
// the tiller strip on the band's top edge, and her outboard's control head above the band on the left. The tiller
// pilot goes bottom left with the Navigator, its panel opening along the bottom edge in place of its button, never up over
// the boat (owner, v148: the pilot's panel over the band hid her hull)
band.tillerSlot.append($('tiller'), $('motorHead'));
$('helmBar').append($('bPilot'), $('pilot'));
function openLines(open = !band.open): void {
  band.show(open); S.band = open ? 1 : 0; saveSettings(S);
  document.body.classList.toggle('band-open', open);
  $('tpMore').textContent = open ? 'Sail controls ▾' : 'Sail controls ▸'; $('tpMore').setAttribute('aria-expanded', String(open));
  $('bBand').classList.toggle('on', open); $('bBand').setAttribute('aria-pressed', String(open));
  requestAnimationFrame(() => chaseFrame());
}
/**
 * The chase camera's frame (render/scene.ts setChaseFrame, design/chase-layout.html): where the sail controls band's top
 * edge is over the 3D view (its tabs included), or the view's bottom when it's put away. On a change of size, when the
 * band opens or shuts, and once a second for anything else that moves it.
 */
function chaseFrame(): void {
  const gl = $('gl').getBoundingClientRect(), b = document.getElementById('sailBand'), r = b && !b.hidden ? b.getBoundingClientRect() : null;
  const tabs = b?.querySelector<HTMLElement>('.sb-tabs')?.getBoundingClientRect();
  // put away, the band leaves its windex where it was: she sits above that
  const wx = b && band.open ? null : b?.querySelector<HTMLElement>('.sb-wx')?.getBoundingClientRect();
  view.setChaseFrame({ top: 0, bottom: wx && wx.height > 0 ? wx.top - gl.top : r && r.height > 0 ? Math.min(r.top, tabs && tabs.height > 0 ? tabs.top : r.top) - gl.top : gl.height });
}
addEventListener('resize', chaseFrame); setInterval(chaseFrame, 1000);
/* The flow view (ui/flowPanel.ts): her sails cut across at three heights, beside the 3D view; off until you open it. The
 * picture moves left by half the panel, so she stays in the middle of what's left of the view. */
/** Re-draw the layer menus if open (a training view switched by its key: the menu's tick follows). */
let refreshMenus = () => {};
const flowPanel = new FlowPanel(document.body, () => openFlow(false));
function openFlow(open = !flowPanel.open): void {
  flowPanel.show(open);
  refreshMenus();
  document.body.classList.toggle('flow-open', open);
  look.panelShift = open ? -(flowPanel.el.getBoundingClientRect().width + 16) / 2 : 0;
}
addEventListener('resize', () => { if (flowPanel.open) look.panelShift = -(flowPanel.el.getBoundingClientRect().width + 16) / 2; });
$('tpMore').onclick = () => openLines();
$('bBand').onclick = () => openLines();
// (the owner OKd the mock-up, 13 Nov: no Sail controls button. The ▾ tab on the band's edge puts the band away; put away,
// the windex stays where it was, and a click on it brings the band back, its hover saying so)
document.querySelector<HTMLElement>('#sailBand .sb-away')!.addEventListener('click', e => { e.stopPropagation(); openLines(false); });
document.querySelector<HTMLElement>('#sailBand .sb-wx')!.addEventListener('click', () => { if (!band.open) openLines(true); });
/* The wind indicator (render/windLadder.ts, the owner's first training tool): the true and apparent wind in the air
 * beside her at three heights, off unless you turn it on (the inset map's Layers menu, or its key), and remembered. */
const ladder = new WindLadder(); ladder.grp.visible = false; view.scene.add(ladder.grp);
function windShow(on: boolean): void {
  S.windLadder = on; saveSettings(S);
  refreshMenus();
}
windShow(!!S.windLadder);
const drills = mountDrills(ctx); // (src/app/drills.ts)
/** Each frame: the ladder by her while she's sailing (not in the slip's menus or the showroom). */
function windTick(): void {
  const on = !!S.windLadder && w.running && !w.user.docked;
  ladder.grp.visible = on; if (on) ladder.update(w.user);
}
openLines((S.band ?? 1) === 1);
/* The trim coach, as a teacher (boat/coach.ts): the one thing that matters now, why, and what to look at on the boat;
 * when you fix it, it says so. Its headline sits in the trim panel and, when there's something new to say, shows on
 * the water for a few seconds; the panel beside the trim panel has the why and the tell, and the smaller things. */
const coachMem = new CoachMemory();
let coachT = 0, coachMore = false, coachTipUntil = 0, lastLeg = -1, legT = -1e9, coachShown: ReturnType<CoachMemory['step']> | null = null;
const ce = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function renderCoach(): void {
  const r = coachShown; if (!r) return;
  const v = r.view, top = v.top;
  $('coachSum').textContent = v.situation.label;
  let html = r.done ? `<p class="c-done">${ce(r.done)}</p>` : '';
  html += `<p class="c-head ${top.kind}">${ce(top.head)}</p>`;
  if (top.why) html += `<p class="c-why">${ce(top.why)}</p>`;
  if (top.look) html += `<p class="c-look"><b>Look at</b> ${ce(top.look)}</p>`;
  if (v.crew) html += `<p class="c-crew">${ce(v.crew)}</p>`;
  if (v.more.length) {
    html += `<button type="button" class="linkbtn coach-why" data-more="${coachMore ? 0 : 1}">${v.more.length} smaller thing${v.more.length > 1 ? 's' : ''} ${coachMore ? '▾' : '▸'}</button>`;
    if (coachMore) html += `<ul class="c-more">${v.more.map(l => `<li><span class="gain">+${(l.gain * 100).toFixed(l.gain < 0.01 ? 1 : 0)}%</span>${ce(l.head)}${w.paused ? `<small>${ce(l.why)}</small>` : ''}</li>`).join('')}</ul>`;
  }
  $('coachBody').innerHTML = html;
}
$('bCoach').onclick = () => { const p = $('coachPanel'); p.hidden = !p.hidden; if (!p.hidden) renderCoach(); };
$('bCoachX').onclick = () => { $('coachPanel').hidden = true; };
$('coachBody').addEventListener('click', e => { const b = (e.target as HTMLElement).closest<HTMLElement>('[data-more]'); if (!b) return; coachMore = b.dataset.more === '1'; renderCoach(); });
/** Twice a second: what the coach would say now. The headline goes in the trim panel, and briefly on the water when it's new. */
function coachTick(dt: number): void {
  if (!w.running) { $('coachTip').classList.remove('on'); return; }
  if (w.lesson) { lessonTick(); return; }
  const u = w.user;
  if (u.leg !== lastLeg) { if (lastLeg >= 0) legT = w.t; lastLeg = u.leg; }
  coachT += dt; if (coachT < 0.5 && coachShown) { tipFade(); return; }
  coachT = 0;
  coachShown = coachMem.step(u, w.t, { preStart: !w.freeSail && w.t < 0, justRounded: w.t - legT < 12 });
  const r = coachShown;
  $('tpHint').textContent = r.done ?? r.view.top.head;
  $('tpHint').className = 'tp-hint ' + (r.done ? 'done' : r.view.top.kind);
  // the headline on the water: only when the panel's shut (it says the same), for six seconds of real time, and it
  // follows the coach while it's up (it never contradicts the panel or the trim panel)
  const tip = $('coachTip'), open = !$('coachPanel').hidden;
  // (the chase-view layout: the Coach card's main line is the headline; it lights for a moment when it's new)
  if (r.fresh && !w.paused) { const h = $('tpHint'); h.classList.remove('flash'); void h.offsetWidth; h.classList.add('flash'); }
  if (r.fresh && !w.paused && !open) { tip.textContent = r.fresh; tip.className = 'on ' + (r.done ? 'done' : r.view.top.kind); coachTipUntil = performance.now() + 6000; }
  else if (tip.classList.contains('on') && !r.done) { if (r.view.top.kind === 'fix') tip.textContent = r.view.top.head; else coachTipUntil = 0; }
  if (open) coachTipUntil = 0;
  tipFade();
  if (!$('coachPanel').hidden) renderCoach();
}
/** A lesson (sim/lessons.ts): its one cue in the coach's own places (the trim panel's headline, and on the water for a few
 * seconds when it's new), with how far through the check you are; passed, it's kept with your settings. */
let lessonCue = '', lessonOf: unknown = null;
function lessonTick(): void {
  const L = w.lesson!, tip = $('coachTip');
  if (L !== lessonOf) { lessonOf = L; lessonCue = ''; } // (a new lesson, or the same one again: its first cue shows)
  $('tpHint').textContent = L.cue + (L.progress > 0 && !L.passed ? ` · ${Math.round(L.progress * 100)}%` : '');
  $('tpHint').className = 'tp-hint ' + (L.passed ? 'done' : 'fix');
  if (L.cue !== lessonCue) {
    lessonCue = L.cue;
    if (!w.paused) { tip.textContent = L.cue; tip.className = 'on ' + (L.passed ? 'done' : 'fix'); coachTipUntil = performance.now() + 6000; }
    if (L.passed && !(S.lessonsPassed ?? []).includes(L.id)) { S.lessonsPassed = [...(S.lessonsPassed ?? []), L.id]; saveSettings(S); }
    // passed: a moment to see it, then paused on the lessons, this one ticked
    if (L.passed) setTimeout(() => { if (w.lesson === L) { send({ k: 'pause', on: true }); setup.openLessons(); } }, 3000);
  }
  tipFade();
}
function tipFade(): void { if (performance.now() > coachTipUntil || w.paused) $('coachTip').classList.remove('on'); }
function stepCar(k: 'carFore' | 'carIn', d: number): void {
  if (!w.running || w.paused) return;
  send({ k: 'lazyCar', fore: k === 'carFore' ? d : 0, ins: k === 'carIn' ? d : 0 });
}
/** Every frame: who has the lines, and the band's ropes, boom and cars (you can watch the crew work theirs too). */
function showLines(): void {
  showTrimOwner();
  const k = CTL_UI[ctlSel].key; band.select(k === 'carFore' || k === 'carIn' ? null : k);
  band.update();
  word('bCrew', w.user.crew?.place ? 'Crew · you' : 'Crew · auto'); $('bCrew').classList.toggle('mine', !!w.user.crew?.place);
}
/* Placing the crew yourself (boat/crewPhys.ts): their weight across the boat and fore and aft. Choosing a place takes
 * the crew off auto and they stay there (through tacks, puffs and lulls) until you choose another or tap Auto, as a
 * sail line stays yours until you give it back. They still go where the sheets take them through a tack. */
const ACROSS: PlaceAcross[] = ['lee', 'mid', 'up', 'hike'], FORE: PlaceFore[] = ['aft', 'mid', 'fwd'];
function setPlace(part: 'across' | 'fore', v: PlaceAcross | PlaceFore): void {
  const c = w.user.crew; if (!c || !w.running) return;
  if (!c.spec.crew.length && part === 'fore') { toast('Single-handed, you can\'t leave the tiller to move forward: only your own weight across the boat moves.', 3500); return; }
  const was = !!c.place, pl = { across: c.place?.across ?? null, fore: c.place?.fore ?? null };
  if (part === 'across') pl.across = v as PlaceAcross; else pl.fore = v as PlaceFore;
  send({ k: 'crewPlace', place: pl });
  if (!was) toast('Crew off auto: they stay where you put them until you move them or tap Auto.', 3000);
  showCrewRow(w.user);
}
function stepCrew(part: 'across' | 'fore', d: number): void {
  const c = w.user.crew; if (!c) return;
  const list: string[] = part === 'across' ? ACROSS : FORE, cur = c.place?.[part] ?? (part === 'across' ? autoAcross(w.user) : 'mid');
  setPlace(part, list[Math.max(0, Math.min(list.length - 1, list.indexOf(cur) + d))] as PlaceAcross | PlaceFore);
}
const showCrewPlace = () => showCrewRow(w.user);
document.querySelectorAll<HTMLButtonElement>('#tpCrewRow [data-ca]').forEach(bt => bt.onclick = () => setPlace('across', bt.dataset.ca as PlaceAcross));
// (fore and aft there's no middle button, two "Mid"s in one row read as one: tap the lit one again to leave fore and aft
// to the crew; an across choice stays yours)
document.querySelectorAll<HTMLButtonElement>('#tpForeRow [data-cf]').forEach(bt => bt.onclick = () => {
  const c = w.user.crew, pl = c?.place;
  if (!c || !pl || pl.fore !== bt.dataset.cf) { setPlace('fore', bt.dataset.cf as PlaceFore); return; }
  send({ k: 'crewPlace', place: pl.across == null ? null : { across: pl.across, fore: null } });
  showCrewPlace(); toast(pl.across != null ? 'Fore and aft back to the crew; where they sit across stays yours.' : 'Crew back on auto: they place their own weight again.', 2500);
});
function togglePole(): void {
  if (!w.running || w.paused) return;
  const want = !w.user.poleWant; send({ k: 'pole', want }); // (the pole is always yours: your call only)
  toast(want ? `Crew: setting the whisker pole (about ${POLE.set} s). It pays sailing deep, past about 150° true; on a reach the poled-out jib is aback.` : `Crew: stowing the pole (about ${POLE.stow} s).`, 3000);
}
// act on the press itself, and don't take keyboard focus (a later key press must not toggle it again)
// the Flags tile opens the flag index; × or Esc closes it
$('sigPanel').addEventListener('click', () => hud.flagIndex(w, !!$('flagIndex').hidden));
$('bFlagIndexX').addEventListener('click', () => hud.flagIndex(w, false));
// Drag the flag index to scroll it, as you'd push a page up (the wheel scrolls it too); a drag that moves isn't a click.
{
  const fi = $('flagIndex'); let drag: { y: number; top: number; id: number; moved: boolean } | null = null;
  fi.addEventListener('pointerdown', e => {
    if (e.button !== 0 || (e.target as HTMLElement).closest('button')) return;
    drag = { y: e.clientY, top: fi.scrollTop, id: e.pointerId, moved: false };
  });
  fi.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) < 4) return;
    if (!drag.moved) { drag.moved = true; fi.setPointerCapture(e.pointerId); fi.classList.add('drag'); }
    fi.scrollTop = drag.top - dy; e.preventDefault();
  });
  const end = (e: PointerEvent) => { if (!drag || e.pointerId !== drag.id) return; drag = null; fi.classList.remove('drag'); };
  fi.addEventListener('pointerup', end); fi.addEventListener('pointercancel', end);
}
function doHail(): void { if (w.running && !w.paused) send({ k: 'hail' }); }
/* Push off from her slip: the crew walks her out and swings her round (sim/world.ts). */
function pushOff(): void { if (w.running && !w.paused) send({ k: 'pushOff' }); }
/**
 * G, by the dock: push off when she's made fast (or being walked out); coming in, lines ready (again: stand down); lying to
 * her lines along a dock, let go (sim/world.ts linesReady, letGoLines).
 */
function berthKey(): void {
  const u = w.user; if (!w.running || w.paused) return;
  if (u.docked || u.handled) pushOff(); else if (u.mooring?.lines.length) send({ k: 'letGo' }); else send({ k: 'lines' });
}
/** The Crew panel's dock row: shown in a harbor while cruising, its words by where she is in coming in. */
function linesUi(): void {
  const u = w.user, m = u.mooring, show = w.running && w.cruising && !u.docked && !u.handled && !!harborAt(u);
  const row = $('tpDockRow'); if (row.hidden !== !show) row.hidden = !show;
  if (!show) return;
  const word = !m ? 'Lines ready' : m.phase === 'ready' ? 'Stand down' : m.lines.length ? 'Let go' : 'Lines ready';
  const sub = !m ? (u.crew?.spec.crew.length ? 'G · crew steps off at the shrouds' : 'G · you step off with the midships line') : m.phase === 'ready' ? `G · ${m.cue ?? 'coming in'}` : 'G · cast off her lines';
  if ($('bLinesW').textContent !== word) $('bLinesW').textContent = word;
  if ($('bLinesS').textContent !== sub) $('bLinesS').textContent = sub;
}
$('bLines').onclick = berthKey;
$('bPushOff').onclick = pushOff;
/* Hoist or strike a sail (the crew does it at their pace: boat/physics.ts crewRig). */
function halyard(sail: 'main' | 'jib'): void { if (!w.running || w.paused) return; const r = w.user.rig; send({ k: 'sail', sail, up: !(r ? (sail === 'main' ? r.mainUp : r.jibUp) : true) }); }
// (on press, like the pole button: the label changes as the crew works, and a click needs the same thing under the pointer at both ends)
for (const [id, sail] of [['bJib', 'jib'], ['bMain', 'main']] as const) {
  $(id).addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); halyard(sail); });
  $(id).addEventListener('click', e => { if (e.detail === 0) halyard(sail); }); // keyboard activation only
}
/* The tiller pilot (boat/autopilot.ts): cruising only, since RRS 52 says a racing boat's rudder is worked by her
 * crew's own power. Taking the tiller (T, a click, the tiller bar) puts it on standby, as unhooking the ram does. */
function pilotOn(mode: Exclude<PilotMode, 'off'>): void {
  if (!w.running || w.paused) return;
  if (!w.cruising) { toast('No autopilot when racing: RRS 52 says a racing boat\'s rudder is worked only by her crew\'s own power. Cruising, it\'s yours.', 5000); return; }
  const u = w.user;
  if (u.docked || u.pushing || (u.astern ?? 0) > 0.1 || u.v < 0.5) { toast('Get her sailing first: a tiller pilot needs way on to steer.', 3500); return; }
  unlash();
  if (mode === 'nav' && (!w.dest || w.arrivedT != null)) { toast('Nav needs somewhere to go: tap the map and pick a destination.', 4000); return; }
  releaseTiller(); send({ k: 'pilot', op: 'engage', mode });
}
function pilotOff(msg?: string): void { if (w.pilot.mode === 'off') return; send({ k: 'pilot', op: 'standby' }); if (msg) toast(msg, 2500); }
let pilotShown = '';
/** Each frame: the steering keys turn the pilot's course (20°/s held), and the control head shows what it's doing. */
function pilotTick(dt: number): void {
  const p = w.pilot, on = p.mode !== 'off' && w.running;
  if (on && !w.paused) { const d = (held.has('steerStbd') ? 1 : 0) - (held.has('steerPort') ? 1 : 0); if (d) send({ k: 'pilot', op: 'adjust', d: d * 20 * dt }); }
  const chip = $('bPilot'), hide = !w.running || !w.cruising;
  if (chip.hidden !== (hide || on)) chip.hidden = hide || on; // (while it steers, its panel takes the button's place)
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
  if (txt !== pilotShown) { $('pilotRead').textContent = txt; $('pilotRead').title = txt; pilotShown = txt; }
  for (const b of panel.querySelectorAll<HTMLButtonElement>('[data-pm]')) b.classList.toggle('on', b.dataset.pm === p.mode);
}
/** The ghost race's pacing: how far ahead or behind your ghost you are, in seconds (replay/ghost.ts ghostGap). */
function ghostNote(): void {
  const el = $('ghostNote'), g = activeGhost, gap = g && w.running && w.t > -30 ? ghostGap(g.pts, w.user, w.t) : null;
  const txt = !g || !w.running ? '' : gap == null ? 'Ghost: off its line' : Math.abs(gap) < 1 ? 'Ghost: level with you' : `Ghost: ${Math.round(Math.abs(gap))} s ${gap > 0 ? 'ahead' : 'behind'}`;
  if (el.hidden !== !txt) el.hidden = !txt;
  if (el.textContent !== txt) el.textContent = txt;
}
/* ---------------- her outboard (boat/motor.ts): the Motor button and its control head ---------------- */
let motorOpen = false;
function motorUi(): void {
  const m = w.user.motor, on = !!m && w.running && S.mode !== 'drill';
  const btn = $('bMotor'); if (btn.hidden !== !on) btn.hidden = !on;
  const head = $('motorHead'), show = on && motorOpen; if (head.hidden !== !show) head.hidden = !show;
  btn.classList.toggle('on', !!m?.running);
  if (!m || !show) return;
  $('bMoTilt').textContent = m.down ? 'Tilt up' : 'Tilt down'; $('bMoStart').textContent = m.running || m.pulling ? 'Stop' : 'Start';
  $('motorLab').textContent = `Motor ${m.hp} hp`;
  for (const b of $('moGears').querySelectorAll<HTMLButtonElement>('[data-mg]')) b.setAttribute('aria-pressed', String(b.dataset.mg === m.gear));
  const hasR = OUTBOARDS[m.hp].reverse; $('bMoR').hidden = !hasR; $('bMoSwivel').hidden = hasR; $('bMoSwivel').classList.toggle('on', !!m.swivel);
  const thr = $('moThrottle') as HTMLInputElement; if (document.activeElement !== thr) thr.value = String(Math.round(m.throttle * 100));
  $('bMoCastOff').hidden = !(w.user.docked && m.running);
  const read = !m.down ? 'Tilted up' : m.pulling ? 'Pulling the cord…' : !m.running ? 'Down · stopped' : m.gear === 'N' ? 'Running · neutral' : `Running · ${m.gear === 'R' || m.swivel ? 'astern' : 'ahead'} ${Math.round(m.throttle * 100)}%`;
  if ($('motorRead').textContent !== read) $('motorRead').textContent = read;
}
$('bMotor').onclick = () => { motorOpen = !motorOpen; motorUi(); };
function motorStartUi(): void {
  const m = w.user.motor; if (!m) return;
  if (m.running || m.pulling) { send({ k: 'motor', op: 'stop' }); return; }
  // (racing, the motor means retiring (RRS 42.1): ask first)
  void host.ask({ k: 'motor', op: 'start', retireFirst: false }).then(r => { if (r === 'racing') { send({ k: 'pause', on: true }); $('motorAsk').hidden = false; ($('bMotorNo') as HTMLButtonElement).focus(); } });
}
for (const b of $('motorHead').querySelectorAll<HTMLButtonElement>('[data-mo]')) b.onclick = () => {
  const k = b.dataset.mo;
  if (k === 'tilt') send({ k: 'motor', op: 'tilt' }); else if (k === 'start') motorStartUi(); else if (k === 'swivel') send({ k: 'motor', op: 'swivel' }); else if (k === 'castoff') send({ k: 'castOff' });
  motorUi();
};
for (const b of $('moGears').querySelectorAll<HTMLButtonElement>('[data-mg]')) b.onclick = () => { send({ k: 'motor', op: 'gear', gear: b.dataset.mg as 'F' | 'N' | 'R' }); motorUi(); };
$('moThrottle').addEventListener('input', () => send({ k: 'motor', op: 'throttle', v: Number(($('moThrottle') as HTMLInputElement).value) / 100 }));
$('bMotorYes').onclick = () => { $('motorAsk').hidden = true; send({ k: 'pause', on: false }); send({ k: 'motor', op: 'start', retireFirst: true }); word('bCourse', 'Navigator'); keysHint(); insetViews(); view.refreshCourse(w); motorUi(); };
$('bMotorNo').onclick = () => { $('motorAsk').hidden = true; send({ k: 'pause', on: false }); };

/* ---------------- Home: send her back to her home slip (racing, it retires her first) ---------------- */
function goHome(): void {
  if (!w.running) return;
  if (!w.homeSlip) { toast('She has no home slip: give her one in the Yacht Club.', 3500); return; }
  if (!w.freeSail && !w.user.finished && !w.user.retired) { send({ k: 'pause', on: true }); $('homeAsk').hidden = false; ($('bHomeNo') as HTMLButtonElement).focus(); return; }
  homeNow();
}
/** Home: the course to her slip (when she has one), the Navigator's button and keys for cruising. */
function homeNow(): void { void host.ask({ k: 'sendHome' }).then(ok => { if (ok) { word('bCourse', 'Navigator'); keysHint(); insetViews(); view.refreshCourse(w); } }); }
$('bHome').onclick = goHome;
// Home is part of the navigator (the owner, 13 Nov: "Home really belongs inside the nav experience"): its Sail home
$('bNavHome').onclick = () => { navView.close(); goHome(); };
$('bHomeYes').onclick = () => { $('homeAsk').hidden = true; send({ k: 'pause', on: false }); homeNow(); };
$('bHomeNo').onclick = () => { $('homeAsk').hidden = true; send({ k: 'pause', on: false }); };
/** The Home button: while she's out sailing or racing (not in practice, or made fast in her slip). */
function homeButton(): void {
  // (in the navigator, not on the game surface: the owner, 13 Nov; the old button stays hidden)
  const el = $('bNavHome'), u = w.user, home = w.dest?.key === 'slip' && w.arrivedT != null;
  const hide = !w.running || !w.cruising || S.mode === 'drill' || !!u.docked || !!u.handled || home;
  if (el.hidden !== hide) el.hidden = hide;
  if (!$('bHome').hidden) $('bHome').hidden = true;
  el.classList.toggle('dim', !w.homeSlip);
  const t = w.homeSlip ? 'Send her back to her home slip' : 'Send her back to her home slip (give her one in the Yacht Club first)';
  if (el.title !== t) el.title = t;
}
$('bPilot').onclick = () => { if (w.pilot.mode === 'off') pilotOn('auto'); else pilotOff('Pilot on standby: you have the tiller.'); };
for (const b of $('pilot').querySelectorAll<HTMLButtonElement>('[data-pm]')) b.onclick = () => pilotOn(b.dataset.pm as Exclude<PilotMode, 'off'>);
for (const b of $('pilot').querySelectorAll<HTMLButtonElement>('[data-pa]')) b.onclick = () => {
  const a = b.dataset.pa!, p = w.pilot;
  if (a === 'off') pilotOff('Pilot on standby: you have the tiller.');
  else if (a === 'tack') { if (p.mode === 'nav') toast('Nav calls its own tacks, on the laylines. Switch to Auto or Wind to tack when you choose.', 3500); else send({ k: 'pilot', op: 'tack' }); }
  else send({ k: 'pilot', op: 'adjust', d: +a });
};
/** The halyard buttons: a sail that's down (or on its way up or down) always has one; striking a sail is for the marina. */
function sailButtons(): void {
  const u = w.user, r = u.rig, inMarina = inBasin(u);
  for (const [k, id] of [['jib', 'bJib'], ['main', 'bMain']] as const) {
    const h = r ? r[k] : 1, up = r ? (k === 'main' ? r.mainUp : r.jibUp) : true, el = $(id);
    const hide = !w.running || (up && h >= 1 && !inMarina), txt = up ? (h < 1 ? `Hoisting ${k}…` : `Strike ${k}`) : h > 0 ? `Striking ${k}…` : `Hoist ${k}`;
    if (el.hidden !== hide) el.hidden = hide;
    word(id, txt); // (only when it changes)
    el.classList.toggle('on', !up && h === 0);
  }
}
/**
 * Strike the ensign: cruising in a blow, a crew takes the ensign down and unships its staff before it flogs itself to
 * rags; a second press hoists it again. The button shows from 20 kt of true wind (the 20 s mean the crew works by;
 * well into Beaufort force 5, 17–21 kt, the owner's mark for "high"), stays until the breeze is back under 17 (so a lull
 * doesn't flick it away), and always while the ensign is down. Racing she flies no ensign at all (world.ts takes her flags down).
 */
let ensignShown = false;
function ensignButton(): void {
  const u = w.user, tws = u.twsSlow ?? 0, el = $('bEnsign');
  ensignShown = !!u.ensign && w.running && w.freeSail && !u.ensignNight && (!!u.ensignStruck || tws >= 20 || (ensignShown && tws >= 17));
  if (el.hidden !== !ensignShown) el.hidden = !ensignShown;
  word('bEnsign', u.ensignStruck ? 'Hoist ensign' : 'Strike ensign');
  el.classList.toggle('on', !!u.ensignStruck);
}
$('bEnsign').onclick = () => { const struck = !w.user.ensignStruck; send({ k: 'ensign', struck }); toast(struck ? 'Ensign struck: down and stowed below till the breeze eases.' : 'Ensign hoisted again.', 2500); };
$('bView').onclick = () => setView((viewMode + 1) % 3);
$('bLook').onclick = lookAhead;
// Course view: from the setup screen (before racing) or any time during the race. The race keeps running.
// Cruising, the same button (and key) opens the navigator's passage plan instead.
$('bCourse').onclick = () => (w.cruising ? navView.toggle(w) : courseView.toggle(w));
$('nextCard').addEventListener('click', () => (w.cruising ? navView.toggle(w) : courseView.toggle(w)));
$('nextCard').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); (w.cruising ? navView.toggle(w) : courseView.toggle(w)); } });
$('bPreview').onclick = () => (S.mode === 'sail' ? navView.open(w) : courseView.open(w));
$('bCvClose').onclick = () => courseView.close();
$('bNavClose').onclick = () => navView.close();
/** The speed of time you've set (kept here: the race's own reaches the page a frame later, and two quick presses must make 4×). */
let speedSet = 1;
/** The results shown for this race (kept here too: the race's own flag reaches the page a frame later). */
let resultsShown = false;
$('bFast').onclick = () => { speedSet = speedSet === 1 ? 2 : speedSet === 2 ? 4 : 1; send({ k: 'speed', v: speedSet }); word('bFast', 'Speed ' + speedSet + '×'); };
$('bSound').onclick = () => { sound.on = !sound.on; word('bSound', sound.on ? 'Sound' : 'Muted'); $('bSound').classList.toggle('muted', !sound.on); $('bSound2').textContent = `Sound: ${sound.on ? 'on' : 'off'}`; };
// Sound and Exit live in the pause menu (the surface audit, owner 13 Nov: Pause and Speed stay on the surface)
$('bSound2').onclick = () => $('bSound').click();
const results = mountResults(ctx); // (src/app/results.ts)
// Tap the inset map: the chart, full screen, with the sail paused (pick a destination there when cruising)
let chartDest: unknown = null;
/** Cruise setup: the start and the destination, picked on the chart (ui/setupChart.ts); each pick rebuilds the world. */
const cruisePicks: SetupPicks = {
  world: () => w,
  get: which => (which === 'from' ? S.sailFrom ?? 'cityfront' : S.sailTo ?? ''),
  set: (which, id) => { if (which === 'from') S.sailFrom = id; else S.sailTo = id; saveSettings(S); setup.setupChanged(setup.tideBox, 0); } // (the tide graph's Arrive moves with them; at once, for the chart that redraws from it)
};
setupChart = new SetupChart(hud, cruisePicks);
/** The cruise planner: both pins on one big chart (ui/planChart.ts), opened from the setup's Where. */
const planChart = new PlanChart(hud, cruisePicks, () => setupChart?.sync(true));
$('bPlanOpen').onclick = () => { planChart.open(); openChartHook(); };
let openChartHook = () => {}; // (the field picker, set to the layers in force when the chart opens)
const chart = new Chart(hud, () => { if (w.dest !== chartDest) view.refreshCourse(w); },
  pal => { S.chartPal = pal; send({ k: 'settings', patch: { chartPal: pal } }); saveSettings(S); }, { send: c => host.send(c), ask: c => host.ask(c) });
// the map's layers: the same choices on the inset map and the full chart, saved with your settings
{
  // (a field layer, the wind, the current, the waves or the fog, switched on puts the others off: one at a time)
  // (the map's layers are the page's own settings, S: the race in its worker learns them by command, and its mirror,
  // what the maps draw from, a frame or two later. So the chips and menus read S, and the maps redraw once the race
  // has the change; drawn at once, from the mirror, a click showed nothing, and it took a second click: the owner's
  // "these buttons are requiring two clicks")
  const sendLayers = () => { send({ k: 'settings', patch: { mapLayers: S.mapLayers } }); saveSettings(S); syncField(); void host.ask({ k: 'settings', patch: {} }).then(() => { redraw(); menus.forEach(m => m()); }); };
  const setLayer = (k: LayerKey, on: boolean) => { S.mapLayers = withLayer(S, k, on); sendLayers(); };
  const redraw = () => { if (chart.isOpen) chart.draw(); if (planChart.isOpen) planChart.draw(); };
  // the chart's big picker for the field layer: Wind, Current, Waves, Fog, Off
  const fieldBtns = [...document.querySelectorAll<HTMLButtonElement>('#chartField button, #planField button')];
  const syncField = () => { const f = fieldLayer(S) ?? 'off'; for (const b of fieldBtns) b.setAttribute('aria-checked', String(b.dataset.field === f)); };
  for (const b of fieldBtns) b.addEventListener('click', () => {
    const f = b.dataset.field!;
    if (f === 'off') { S.mapLayers = { ...S.mapLayers }; for (const k of FIELD_LAYERS) S.mapLayers[k] = false; sendLayers(); }
    else setLayer(f as LayerKey, true);
  });
  syncField(); openChartHook = syncField; refreshMenus = () => menus.forEach(m => m());
  // (the training views, switched from the inset map's menu too: no buttons of their own on the game surface)
  const views: MenuView[] = [
    { name: 'Wind in the air', what: 'The true wind (white) and the apparent wind (amber) in the air beside her, at the deck, the sails\' center and the masthead', keyLabel: () => keymap.label('windLadder'), on: () => !!S.windLadder, set: on => windShow(on) },
    { name: 'Flow over the sails', what: 'The flow view: the air over the sails at three heights, and what the telltales are saying', keyLabel: () => keymap.label('flowView'), on: () => flowPanel.open, set: on => openFlow(on) }];
  // (the inset map has no buttons of its own: the owner, "those should be toggles in the full map view, with the inset
  // remembering my choices". Its layers, what it shows cruising, and the training views are all in the chart's menu)
  const insetChoice: MenuChoice = {
    heading: 'The inset map shows', shown: () => !!w?.cruising,
    options: [{ v: 'map', name: 'The water round her', what: 'The chart round her, turned north up' }, { v: 'nav', name: 'The passage', what: 'The navigator\'s course to the destination, whole; tap the inset for the passage plan' }],
    get: () => S.insetView ?? 'map', set: v => { S.insetView = v === 'nav' ? 'nav' : 'map'; saveSettings(S); insetViews(); }
  };
  const menus = [layerMenu($('bChartLayers'), $('chartLayersPop'), () => S, setLayer, () => {}, (el, f) => hud.keyInto(el, 'chart', f), views, [insetChoice])];
}
$('map').addEventListener('click', () => {
  if (!w.running || chart.isOpen) return;
  if (w.cruising && hud.insetView === 'nav') { navView.toggle(w); return; } // (the navigator's view: its passage plan)
  releaseTiller(); setControlsIdle(); chartDest = w.dest; chart.open(w); openChartHook();
});
/** Cruising, the navigator is one of the inset map's views (the owner: "It should just be a view in the inset map"),
 * chosen in the full chart's Layers menu and remembered with your settings (no buttons on the inset: the owner). */
function insetViews(): void {
  const cruising = !!w?.cruising;
  $('bCourse').hidden = true; // (the course opens from the where-next card: the surface audit, owner 13 Nov)
  hud.insetView = cruising ? S.insetView ?? 'map' : 'map'; // (chosen in the full chart's Layers menu, and remembered)
}

/* ---------------- keyboard (bindings in ui/keys.ts, editable in Keyboard settings) ---------------- */
/* ---------------- message log ---------------- */
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const stamp = (t: number | null) => t == null ? '' : `<span class="lt">${fmtClock(t)}</span>`;
/**
 * When each message arrived (wall clock, s), so the card can let it go once it's stale (the owner, 13 Nov: "it's hard to
 * tell if it's stale; maybe hiding it is the solve"). A line stays MSG_FRESH s: long enough to read a two-line message
 * twice at a glance, short enough that it doesn't linger into the next situation. The card's header and the log stay.
 */
const MSG_FRESH = 40, msgSeen = new WeakMap<object, number>();
setInterval(() => { if (messageLog.length) renderLog(); }, 5000);
function renderLog(): void {
  const now = performance.now() / 1000;
  for (const m of messageLog) if (!msgSeen.has(m)) msgSeen.set(m, now);
  const recent = messageLog.filter(m => !m.msg.startsWith('— ') && now - msgSeen.get(m)! < MSG_FRESH).slice(-4).reverse();
  $('msgLog').classList.toggle('rest', !recent.length);
  // one line each on screen, the headline (feedback.ts headline); the whole message on hover and in the log (All, or a tap)
  $('msgRecent').innerHTML = recent.map(m => { const { head, cut } = headline(m.msg);
    return `<li${cut ? ' class="cut"' : ''} title="${esc(m.msg).replace(/"/g, '&quot;')}">${stamp(m.t)}${esc(head)}</li>`; }).join('');
  if (!$('logView').hidden) $('logList').innerHTML = messageLog.slice().reverse().map(m =>
    m.msg.startsWith('— ') ? `<li class="sep">${esc(m.msg.slice(2))}</li>` : `<li>${stamp(m.t)}${esc(m.msg)}</li>`).join('');
}
setLogClock(() => (w && w.running ? w.t : null), renderLog);
function openLog(): void { $('logView').hidden = false; renderLog(); }
$('bLogAll').onclick = openLog;
$('msgRecent').addEventListener('click', openLog); // (a message's whole text is in the log)
$('bLogClose').onclick = () => { $('logView').hidden = true; };

const keymap = new KeyMap();
const keysView = new KeysView(keymap, () => keysHint());
const held = new Set<Action>();
function keysHint(): void {
  const k = (a: Action) => keymap.label(a);
  // (the keys aren't spelled out on the sailing screen, the owner, 13 Nov 2026: they're in the Keys panel; a learn-to-sail
  // mode will teach them)
  // each cluster button's name and key, on hover (the word under it is short)
  const tip: [string, string, Action][] = [['bPause', 'Pause', 'pause'],
    ['bCourse', w?.cruising ? 'Navigator: the passage plan' : 'Course and strategist', 'course'], ['bOrient', 'Overhead: north up / bow up / wind up', 'orient'],
    ['bRecentre', 'Overhead: back to your boat', 'recentre'], ['bPushOff', 'Push off: the crew shoves her off the dock astern', 'pushOff'],
    ['bJib', 'Hoist or strike the jib', 'jibHalyard'], ['bMain', 'Hoist or strike the main', 'mainHalyard'], ['bPilot', 'Tiller pilot: steers for you (cruising only)', 'autopilot']];
  for (const [id, t, a] of tip) $(id).title = `${t} (${k(a)})`;
  $('bFast').title = 'Speed up time: 1×, 2×, 4×'; $('bSound').title = 'Sound on or off';
}
keysHint();
hud.hailKey = () => keymap.label('hail');
$('bKeys2').onclick = () => keysView.open();
/** Helm and sheets follow whatever is held. */
function applyHeld(): void {
  const u = w.user;
  const steer = w.pilot.mode !== 'off' ? 0 : (held.has('steerStbd') ? 1 : 0) - (held.has('steerPort') ? 1 : 0); // (on the pilot, the steering keys turn its course: pilotTick)
  // the lines you're working: sheet keys, the selected line's keys, and the panel's buttons
  const cmd: Partial<Record<CtlKey, number>> = { ...btnCmd };
  const add = (k: CtlKey, d: number) => { if (d) cmd[k] = Math.max(-1, Math.min(1, (cmd[k] ?? 0) + d)); };
  add('mainsheet', (held.has('mainOut') ? 1 : 0) - (held.has('mainIn') ? 1 : 0));
  add('jibsheet', (held.has('jibOut') ? 1 : 0) - (held.has('jibIn') ? 1 : 0));
  const sel = CTL_UI[ctlSel];
  if (sel.key !== 'carFore' && sel.key !== 'carIn') add(sel.key, (held.has('ctlUp') ? 1 : 0) - (held.has('ctlDown') ? 1 : 0));
  if (steer && u.lashed != null) unlash(); // a hand on the tiller: the lashing comes off
  send({ k: 'helm', steer, luff: held.has('luff'), ctl: cmd });
}
function setView(i: number): void {
  viewMode = i; lookAhead(); look.chase = undefined; // (the chase view starts framed: design/chase-layout.html)
  word('bView', VIEWS[viewMode]); $('bView').title = `View: ${VIEWS[viewMode]}. Click for the next one (${keymap.label('cycleView')})`;
  $('bOrient').hidden = viewMode !== 2;
}
const anyOverlay = () => !$('motorAsk').hidden || !$('homeAsk').hidden || !$('raceChoose').hidden || !$('condDlg').hidden || !$('keepAsk').hidden || chart.isOpen || !$('home').hidden || !$('pastView').hidden || fleet.open || boatPanel.open || !$('setup').hidden || !$('replay').hidden || !$('results').hidden || !$('drill').hidden || !$('pause').hidden || raceReplay.isOpen;
addEventListener('keydown', e => {
  if (keysView.isOpen) return; // the settings screen handles keys while it's open
  // typing in a field (a time, a name, a number): the keys are the field's, not the boat's
  const tgt = e.target as HTMLElement | null;
  if (tgt && (tgt.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName)) && e.key !== 'Escape') return;
  if (chart.isOpen && e.key !== 'Escape') return; // the chart is paused: only Esc, to close it
  if (!$('keepAsk').hidden) return; // save or discard first
  if (!$('motorAsk').hidden) { if (e.key === 'Escape') $('bMotorNo').click(); return; }
  if (!$('homeAsk').hidden) { if (e.key === 'Escape') $('bHomeNo').click(); return; } // retire or keep racing first
  const a = keymap.actionFor(e.key);
  if (e.key === '`' && !a) { perf.toggle(); return; } // the frame-time readout (ui/perfMeter.ts), unless you've bound ` to something
  if (e.key === 'Escape') {
    if (!$('flagIndex').hidden) { hud.flagIndex(w, false); return; }
    if (raceReplay.isOpen) { raceReplay.close(); return; }
    if (courseView.isOpen) { courseView.close(); return; }
    if (navView.isOpen) { navView.close(); return; }
    if (chart.isOpen) { chart.close(); return; }
    if (!$('logView').hidden) { $('logView').hidden = true; return; }
    // the screens around the sailing (docs/UI-AUDIT.md §3 rule 5): Esc is back. A layer over one closes first, then a
    // sub-page (a member's page), then back to where you came from; on the start page, nothing
    if (!$('condDlg').hidden && !condLive) { $('bCondClose').click(); return; }
    if (boatPanel.open) { boatPanel.requestDone(); return; }
    if (fleet.escape()) return;
    if (!$('raceChoose').hidden || !$('pastView').hidden || !$('setup').hidden || fleet.open) { nav.back(); return; }
    if (tillerHeld) { releaseTiller(); return; } // Esc lets go of the tiller, and nothing else
    if (condLive && !$('condDlg').hidden) { $('bCondClose').click(); return; } // (back to the pause menu)
    if (!$('pause').hidden) { $('bResume').click(); return; }
    if (!anyOverlay() && w.running) $('bPause').click();
    return;
  }
  if (a === 'keys') { keysView.open(); return; }
  if (a === 'log') { if ($('logView').hidden) openLog(); else $('logView').hidden = true; return; }
  if (a === 'course' && $('replay').hidden && $('results').hidden && $('drill').hidden) { if (w.cruising) navView.toggle(w); else courseView.toggle(w); return; }
  if (raceReplay.isOpen) return; // the replay's own buttons only
  if (a === 'pause' && w.running) { if ($('pause').hidden) $('bPause').click(); else $('bResume').click(); return; }
  if (anyOverlay() || !a) return;
  if (a.startsWith('look') || a === 'zoomIn' || a === 'zoomOut') e.preventDefault(); // don't scroll the page
  if ((a === 'ctlUp' || a === 'ctlDown') && !e.repeat) { const k = CTL_UI[ctlSel].key; if (k === 'carFore' || k === 'carIn') { stepCar(k, a === 'ctlUp' ? 1 : -1); return; } }
  if (HELD.has(a)) { if (!e.repeat) { held.add(a); applyHeld(); } return; }
  if (e.repeat) return;
  switch (a) {
    case 'ctlPrev': ctlSel = (ctlSel + CTL_UI.length - 1) % CTL_UI.length; if (!band.open) openLines(true); break;
    case 'ctlNext': ctlSel = (ctlSel + 1) % CTL_UI.length; if (!band.open) openLines(true); break;
    case 'sailBand': openLines(); break;
    case 'lookInstrument': toggleInstrumentLook(); break;
    case 'flowView': openFlow(); break;
    case 'takeTiller': if (tillerHeld) releaseTiller(); else takeTiller(lastCursorX); break;
    case 'centreTiller': pilotOff('Pilot on standby.'); unlash(); centreTiller(); break;
    case 'lashTiller': lash(); break;
    case 'autopilot': if (w.pilot.mode === 'off') pilotOn('auto'); else pilotOff('Pilot on standby: you have the tiller.'); break;
    case 'pole': togglePole(); break;
    case 'crewLee': stepCrew('across', -1); break;
    case 'crewUp': stepCrew('across', 1); break;
    case 'crewFwd': stepCrew('fore', 1); break;
    case 'crewAft': stepCrew('fore', -1); break;
    case 'hail': doHail(); break;
    case 'pushOff': berthKey(); break;
    case 'navLights': { const off = !w.user.lightsOff; send({ k: 'lights', off }); toast(off ? 'Navigation lights off.' : 'Navigation lights on: lit from sunset to sunrise (under way; none in the slip).'); break; }
    case 'jibHalyard': halyard('jib'); break;
    case 'mainHalyard': halyard('main'); break;
    case 'viewCockpit': setView(0); break;
    case 'viewChase': setView(1); break;
    case 'viewOverhead': setView(2); break;
    case 'cycleView': setView((viewMode + 1) % 3); break;
    case 'windLadder': windShow(!S.windLadder); break;
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
  word('bOrient', ORIENT_LABEL[over.orient]);
}
word('bOrient', ORIENT_LABEL[over.orient]);
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
// The other ways to lash: a right-click (or a two-finger click) lashes the tiller where it is, with no browser menu; a
// double-click lashes it at the angle of the first press (the second press would otherwise have moved it). Over the
// panels the browser behaves as usual.
let firstPress: number | null = null;
gl.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (!w.running || w.paused || viewMode === 2) return;
  if (w.user.lashed != null) { unlash(); return; }
  lash();
});
gl.addEventListener('dblclick', e => e.preventDefault()); // (no zoom or text selection on a double-click over the view)
gl.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' && e.button !== 0) return; // (the right button lashes: contextmenu above)
  const now = performance.now(), dbl = now - lastTap < 300; lastTap = now;
  // a double-click with the mouse lashes the tiller at the angle of the first press; on a touch screen a double tap looks ahead
  if (dbl && e.pointerType === 'mouse' && viewMode !== 2 && w.running && !w.paused) {
    lastTap = 0; if (firstPress != null) setTiller(firstPress); firstPress = null;
    if (w.user.lashed == null) lash(); return;
  }
  if (dbl) { if (viewMode === 2) recentre(); else lookAhead(); }
  if (viewMode === 2) { gl.setPointerCapture?.(e.pointerId); touches.set(e.pointerId, [e.clientX, e.clientY]); pinch = null; panning = true; return; }
  if (e.pointerType === 'mouse' && w.running && !w.paused) { if (tillerHeld) releaseTiller(); else takeTiller(e.clientX); firstPress = w.user.tiller; return; }
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
  if (instLook) { if (viewMode !== 0) { instLook = null; look.fov = undefined; } else centreInstrument(); }
  if (held.has('zoomIn')) { if (viewMode === 2) zoomOverhead(Math.exp(-1.2 * dt)); else if (viewMode === 0) setEye(look.aft - 2.5 * dt); else look.chase = Math.max(8, (look.chase ?? view.chaseDist) * Math.exp(-1.2 * dt)); }
  if (held.has('zoomOut')) { if (viewMode === 2) zoomOverhead(Math.exp(1.2 * dt)); else if (viewMode === 0) setEye(look.aft + 2.5 * dt); else look.chase = Math.min(90, (look.chase ?? view.chaseDist) * Math.exp(1.2 * dt)); }
}
function lookLabel(): void {
  const el = $('bLook'), deg = Math.round(-look.yaw * 180 / Math.PI);
  const off = Math.abs(deg) > 8 || Math.abs(look.pitch) > 0.15;
  el.hidden = !off || viewMode === 2;
  if (off) el.title = `${Math.abs(deg) <= 8 ? 'Looking up or down' : `Looking ${Math.abs(deg)}° to ${deg > 0 ? 'starboard' : 'port'}`}: look ahead again (${keymap.label('lookAhead')})`;
  $('bRecentre').hidden = viewMode !== 2 || Math.hypot(over.off.x, over.off.y) < 5;
}
addEventListener('pointerup', () => { drag = null; });
addEventListener('pointercancel', () => { drag = null; });

/* ---------------- the showroom's own time of day and conditions ---------------- */
/** The bar under her on show: the time (and whether it's day, dusk or night there), and the conditions. */
function showBar(): void {
  const min = showMin ?? (([h, m]) => h * 60 + m)((S.tideTime || '12:00').split(':').map(Number));
  ($('showTime') as HTMLInputElement).value = String(min);
  const el = sunPosition(w.clockUtc * 60000).el; // (the sun at the time shown: the showroom's clock)
  $('showTimeV').textContent = `${hhmm(min)} · ${el > 6 ? 'day' : el > -6 ? (min < 720 ? 'dawn' : 'dusk') : 'night'}`; // (civil twilight: the sun within 6° below the horizon)
  $('bShowReal').hidden = showMin == null && showCond == null;
}
$('showTime').addEventListener('input', () => { const m = Number(($('showTime') as HTMLInputElement).value); $('showTimeV').textContent = hhmm(m); });
$('showTime').addEventListener('change', () => { showMin = Number(($('showTime') as HTMLInputElement).value); setup.newGame(); showBar(); });
$('bShowCond').onclick = () => {
  // the same panel; while it's open your conditions take the showroom's, and they're put back when it closes
  const saved: Partial<Settings> = {}, rec = S as unknown as Record<string, unknown>;
  for (const k of CONDITION_KEYS) (saved as Record<string, unknown>)[k] = rec[k];
  showSaved = saved; Object.assign(S, showCond ?? {}); showCond = null;
  setup.paintSeg(); setup.tideBox(); $('condDlg').hidden = false;
};
$('bShowReal').onclick = () => { showMin = null; showCond = null; setup.newGame(); showBar(); };
// mid-sail (from the pause menu): the same panel, its changes taken at once by the sail that's running (newGame below)
$('bPauseCond').onclick = () => { if (!w.running) return; condLive = true; $('pause').hidden = true; setup.tideBox(); $('condDlg').hidden = false; };
$('bCondReal').onclick = () => {
  Object.assign(S, { windKind: 'auto', windKt: 0, windDir: null, windTurn: 0, chop: 1, swellHs: null, current: 'real', rain: 0, fog: 'real' });
  saveSettings(S); setup.paintSeg(); setup.setupChanged(() => { setup.courseCard(); setup.tideBox(); });
};
/* ---------------- loop: fixed-step sim, free-running render ---------------- */
function resize(): void { view.resize(innerWidth, innerHeight); }
addEventListener('resize', resize); resize();

let last = performance.now();
/** The showroom's point of sail: a close reach, port tack (the wind 55° on her port bow); negative: starboard tack. */
let showroomTwa = 55;
/** The destination the course on the water was last drawn to. */
let shownDest: SimView['dest'] = null;
const perf = new PerfMeter();
function frame(now: number): void {
  requestAnimationFrame(frame);
  const t0 = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (still) return; // (behind the setup: the last frame stays, and its race waits untouched for the start)
  // the steps due (sim/host.ts: here, or in the worker): racing at the race's speed; with nothing running (the start
  // page, setup, the showroom) she still sails, in the real wind and physics, so her sails, heel and flags agree; in the
  // showroom on a close reach
  const showing = boatPanel.open || fleet.boatOpen;
  const simMs = host.advance(dt, showing ? showroomTwa : undefined);
  if (w.running && !w.paused) {
    if (w.userFinishT != null && !w.finishShown && !resultsShown && w.t - w.userFinishT > 3) results.showResults();
    if (S.mode === 'drill' && !drillShown && w.t >= DRILL_DEBRIEF_AT) drills.showDrill();
  }
  for (const e of host.drainEvents()) handle(e);
  if (host instanceof WorkerHost) { const d = document.documentElement.dataset; d.syncFaults = String(host.faults); d.syncChecks = String(host.checks); } // (for the checks: the mirror's checks made and failed)
  // (a new destination, from the chart or a command's answer: the course drawn to it)
  if (w.dest !== shownDest) { shownDest = w.dest; if (w.running) view.refreshCourse(w); }
  $('bPushOff').hidden = !(w.running && (!!w.user.docked || !!w.user.handled?.held)); sailButtons(); homeButton(); motorUi(); ghostNote(); ensignButton(); linesUi(); // (held head to wind on the bow line: push off again to let her go)
  keyLook(dt); lookLabel(); tillerSpring(dt); pilotTick(dt); showTiller(); showLines(); coachTick(dt); windTick(); drills.drillTick(); drills.roundTick();
  const t1 = performance.now();
  if (boatPanel.open || fleet.boatOpen) { look.shift = Math.min(440, innerWidth) / 2; look.chase = 10; view.render(w, dt, now, 3, look, over); }
  else view.render(w, dt, now, viewMode, look, over);
  const t2 = performance.now();
  labels.update(w, view.camera, viewMode);
  hud.update(w, dt);
  if (w.running) flowPanel.update(w.user, now, { preStart: !w.freeSail && w.t < 0 }); // (as the coach has it)
  if (perf.on) perf.frame(now, performance.now() - t0, simMs, t2 - t1, view.renderer);
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
  S.boat = b; S.boatId = b.id; crewFromClub(); fleetChanged(); boatSummary();
};

/* The fleet: who you race against. Stock club boats and your own saved boats (not the one you're sailing). */
function fleetChanged(): void {
  const ids = new Set(S.boats.map(b => b.id));
  S.opponents = S.opponents.filter(o => o.startsWith('stock:') || isGeneric(o) || (!!S.realRace && isReal(o)) || (ids.has(o) && o !== S.boatId));
  S.fleet = S.opponents.length; saveSettings(S); oppRows(); setup.setupChanged();
}
function oppRows(): void {
  const chip = (id: string, name: string, no: string, colour: string, hull: string) => {
    const on = S.opponents.includes(id), full = !on && S.opponents.length >= MAX_OPPONENTS;
    return `<button type="button" class="opp" data-opp="${id}" aria-pressed="${on}"${full ? ' disabled' : ''}><i style="background:${hull};box-shadow:0 0 0 2px ${colour}"></i><span>${name}</span><small>${no}</small></button>`;
  };
  const mine = S.boats.filter(b => b.id !== S.boatId);
  const html = `<div class="opp-h">Club boats</div>` + FLEET.slice(1).map((f, i) => chip(`stock:${i + 1}`, f.name, f.no.replace(/^US\s+/, 'USA '), f.tag, f.hull)).join('')
    // generic club Folkboats (boat/generic.ts), to fill out the fleet: tap one to drop her, + to add another
    + `<div class="opp-h">More club Folkboats</div>` + S.opponents.filter(isGeneric).map(id => { const g = genericSpec(id, S.boats.map(b => b.sails.number))!; return chip(id, g.name.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()), sailNo(g), genericTag(id), g.hull.upper); }).join('')
    + (S.opponents.length < MAX_OPPONENTS ? `<button type="button" class="opp" data-fill="1"><span>+ Add one</span></button>` : '')
    + `<div class="opp-h">Your boats</div>` + (mine.length ? mine.map(b => chip(b.id, (b.name || 'Unnamed').replace(/</g, '&lt;'), sailNo(b), '#c08cff', b.hull.upper)).join('') : '<small class="opp-none">None yet: save more boats under Your boats…</small>');
  // The same chips as shown: change only who's picked, in place, so the chip under the pointer keeps its hover and
  // eases into its new look like every other choice; rebuild only when boats come or go.
  const list = $('oppList'), next = document.createElement('div'); next.innerHTML = html;
  const keys = (el: Element) => [...el.querySelectorAll<HTMLElement>('.opp')].map(b => b.dataset.opp ?? 'fill').join(',');
  if (keys(list) === keys(next) && list.childElementCount === next.childElementCount) {
    const now = list.querySelectorAll<HTMLButtonElement>('.opp');
    next.querySelectorAll<HTMLButtonElement>('.opp').forEach((b, i) => {
      const pr = b.getAttribute('aria-pressed'); if (pr !== null) now[i].setAttribute('aria-pressed', pr);
      now[i].disabled = b.disabled;
    });
  } else list.innerHTML = html;
  $('oppCount').textContent = S.opponents.length ? `· ${S.opponents.length} boat${S.opponents.length > 1 ? 's' : ''}` : '· nobody (a solo race)';
}
$('oppList').addEventListener('click', e => {
  if ((e.target as HTMLElement).closest('[data-fill]')) { S.opponents = fillFleet(S.opponents, S.opponents.length + 1, MAX_OPPONENTS); fleetChanged(); return; }
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-opp]'); if (!b || b.disabled) return;
  const id = b.dataset.opp!;
  S.opponents = S.opponents.includes(id) ? S.opponents.filter(x => x !== id) : [...S.opponents, id].slice(0, MAX_OPPONENTS);
  fleetChanged();
});
boatPanel = new BoatPanel(S, save => { S.fleet = S.opponents.length; if (save) saveSettings(S); setup.newGame(); boatSummary(); oppRows(); }, saved => {
  const id = boatPanel.editing.id; boatPanel.hide(); nav.go({ k: 'boat', id }); // back to her page in the Yacht Club
  if (saved) fleet.flashSaved();
});
boatPanel.onSpin = () => (look.spin = !look.spin);
$('bBoat').onclick = () => nav.go({ k: 'club' });

/* ---------------- the start page: Race, Cruise, Marina, Yacht Club ---------------- */
/** The showroom: on while one of your boats is on show (her page in the Fleet, or editing her). */
function showroom(on: boolean): void {
  if (on) queueMicrotask(showBar); // (once she's on show: the time she's shown at)
  if (on && !document.body.classList.contains('showroom')) { look.yaw = 0.6; look.pitch = 0; }
  document.body.classList.toggle('showroom', on);
  if (!on) { look.shift = 0; look.yaw = 0; look.pitch = 0; look.chase = undefined; }
}
const fleet: Fleet = new Fleet(S, {
  changed: () => { fleetChanged(); boatSummary(); },
  members: () => MEMBERS,
  // (a member changed: saved, and your boat's race crew drawn again from her seats)
  membersChanged: () => { saveMembers(MEMBERS); pullCrew(S, MEMBERS); saveSettings(S); },
  showroom: b => { showroom(!!b || boatPanel.open); setup.newGame(); },
  edit: id => { showroom(true); boatPanel.show(id); setup.newGame(); },
  sail: (id, mode, fromSlip) => {
    const b = S.boats.find(x => x.id === id); if (!b) return;
    S.boat = b; S.boatId = b.id; S.opponents = S.opponents.filter(o => o !== b.id); S.fleet = S.opponents.length; crewFromClub();
    if (mode === 'cruise') { S.mode = 'sail'; S.sailFrom = fromSlip && b.slip ? 'slip' : S.sailFrom === 'slip' ? 'cityfront' : S.sailFrom; }
    else { if (S.mode === 'sail') S.mode = 'race'; S.raceFrom = fromSlip && b.slip ? 'slip' : 'water'; }
    saveSettings(S); boatSummary(); oppRows(); nav.go({ k: 'setup' });
  },
  seasonHtml: id => { const s = (id ? seasonById(id) : undefined) ?? currentSeason(); return s ? seasonHtml(s, seasonResults(s.id), seasons(), liveBoat) : ''; },
  sailSeason: (id, no) => sailSeason(id, no),
  back: () => nav.back(),
  toBoat: id => nav.go({ k: 'boat', id }),
  backLabel: () => nav.backLabel()
});
/*
 * The back stack (ui/nav.ts; docs/UI-AUDIT.md §3): the screens around the sailing, each shown here, and named for the
 * back link of the screen above it.
 */
const nav: Nav = new Nav(showPlace, p => p.k === 'home' ? 'Start page' : p.k === 'race' ? 'Race' : p.k === 'past' ? 'Past races' : p.k === 'club' ? 'Yacht Club'
  : p.k === 'boat' ? (S.boats.find(b => b.id === p.id)?.name || 'Her page') : S.mode === 'sail' ? 'Cruise' : 'Create a race');
function showPlace(p: Place): void {
  if (p.k === 'home') { openHome(); return; }
  for (const id of ['home', 'raceChoose', 'pastView', 'setup', 'condDlg']) $(id).hidden = true;
  if (p.k !== 'club' && p.k !== 'boat' && fleet.open) fleet.close();
  if (p.k === 'race') { $('raceBack').textContent = nav.backLabel(); $('raceChoose').hidden = false; }
  else if (p.k === 'past') { $('pastBack').textContent = nav.backLabel(); pastRaces(); $('pastView').hidden = false; }
  else if (p.k === 'setup') { setup.prepare(); setup.openSetup(); }
  else if (p.k === 'club') { if (p.tab === 'members') fleet.openMembers(); else fleet.openList(); }
  else fleet.openBoat(p.id);
}
function openHome(): void { results.settleLog(openHomeNow); }
function openHomeNow(): void {
  if (boatPanel.open && boatPanel.edited) { boatPanel.leave(openHomeNow); if (boatPanel.edited) return; } // (her changes unsaved: Save or Discard first)
  nav.reset(); // (the start page: the bottom of the back stack)
  courseView.close(); navView.close(); if (w.running) { send({ k: 'running', on: false }); send({ k: 'pause', on: false }); }
  setup.wake(); // (the start page: the boat sailing behind it again, the setup's race drawn if it hadn't been)
  for (const id of ['motorAsk', 'homeAsk', 'setup', 'raceChoose', 'condDlg', 'pause', 'results', 'drill', 'replay', 'pastView', 'coachPanel']) $(id).hidden = true;
  if (raceReplay.isOpen) raceReplay.close();
  if (boatPanel.open) boatPanel.hide();
  fleet.close(); showroom(false);
  $('home').hidden = false;
}
document.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('[data-home]'); if (!b) return;
  const where = b.dataset.home;
  if (where === 'home') openHome();
  else if (where === 'back') nav.back(); // (a back link: where you came from, ui/nav.ts)
  else if (where === 'race') nav.go({ k: 'race' });
  else if (where === 'create') { if (S.mode !== 'race') S.mode = 'race'; if (S.realRace) { S.realRace = undefined; S.opponents = S.opponents.filter(o => !isReal(o)); S.fleet = S.opponents.length; } saveSettings(S); nav.go({ k: 'setup' }); }
  else if (where === 'cruise') { S.mode = 'sail'; saveSettings(S); nav.go({ k: 'setup' }); }
  else if (where === 'fleet') nav.go({ k: 'club' });
  else if (where === 'past') nav.go({ k: 'past' });
});
$('bExit').onclick = () => openHome();
$('bExit2').onclick = () => openHome();
$('bKeys0').onclick = () => keysView.open();
/* Real past races (sim/realRaces.ts; docs/VISION-ROADMAP.md near term 7): a day the San Francisco Folkboat fleet raced,
   sailed in that day's observed wind and NOAA's tide, on the course they sailed, against the real boats (by name and sail
   number), and at the finish your time among theirs. Listed in the past-race panel, no new buttons (the owner's rule). */
const titleCase = (t: string) => t.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
const mmss = (t: number) => { const s = Math.round(t); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
function realRaceRows(): void {
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const rs = realRaces();
  $('realRows').innerHTML = rs.length ? `<div class="opp-h">Real races: the San Francisco Folkboat fleet, in that day's wind and tide</div>` + rs.map(r => {
    const day = new Date(r.date + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    const fin = r.boats.filter(b => b.elapsedS != null && b.code == null).sort((a, b) => a.elapsedS! - b.elapsedS!);
    const won = fin[0];
    return `<div class="pastrow"><div><b>${esc(r.event.replace(/^GGYC Manuel Fagundes /, ''))} · race ${r.raceNo} · course ${r.courseNo} (${r.distanceNm} nm)</b>`
      + `<small>${day}, start ${r.start} · ${fin.length} finished · ${esc(titleCase(won.boat))} ${esc(won.key)} won in ${mmss(won.elapsedS!)}${r.courseFrom ? ` · <span title="${esc('The course from ' + r.courseFrom)}">course from a sailor in the race (a last-minute change)</span>` : ''}${r.uncertain ? ` · <span class="warn" title="${esc(r.uncertain)}">course uncertain</span>` : ''}${r.doubt ? ` · <span class="warn" title="${esc(r.doubt)}">the published distance disagrees with the course sheet</span>` : ''}</small></div>`
      + `<button type="button" class="ghost sm" data-real="${esc(r.id)}">Sail it</button></div>`;
  }).join('') : '';
}
$('realRows').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-real]'); if (!b) return;
  const r = realRace(b.dataset.real!); if (!r) return;
  // the day as it was: its observed wind and NOAA's tide, the sea it made, the fleet's own start; the real boats that started
  Object.assign(S, { mode: 'race', course: r.courseId, tideDate: r.date, tideTime: r.start, windKind: 'auto', windKt: 0, windDir: null, windTurn: 0,
    chop: 1, swellHs: null, current: 'real', sea: 'real', rain: 0, fog: 'real', realRace: r.id });
  replayPin = null;
  S.opponents = realFleetIds(r, S.boat.sails.number, MAX_OPPONENTS);
  S.fleet = S.opponents.length;
  if (!S.boat.slip) S.raceFrom = 'water';
  saveSettings(S); boatSummary(); oppRows(); setup.crewRows(); setup.paintSeg();
  $('raceChoose').hidden = true;
  setup.beginRace();
});
/**
 * A real race is only that race on its day: the course, the day and the gun it was sailed on, in the wind as it was. Once
 * any of those is changed in the setup it's a different race, so the real fleet and the comparison with it go.
 */
function realRaceHolds(): void {
  const r = S.realRace ? realRace(S.realRace) : undefined; if (!S.realRace) return;
  if (r && S.mode === 'race' && S.course === r.courseId && S.tideDate === r.date && S.tideTime === r.start
    && S.windKind === 'auto' && !S.windKt && !S.windTurn && S.windDir == null && replayPin == null) return;
  S.realRace = undefined; S.opponents = S.opponents.filter(o => !isReal(o)); S.fleet = S.opponents.length;
}
/** At the finish of a real past race: your time among the real fleet's, and the sim's boats beside them. */
function realResults(): string {
  const r = S.realRace ? realRace(S.realRace) : undefined; if (!r || w.userFinishT == null) return '';
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const you = w.userFinishT, { place, of } = placeAmong(r, you), nth = results.ordinal(place);
  const fin = r.boats.filter(b => b.elapsedS != null && b.code == null).sort((a, b) => a.elapsedS! - b.elapsedS!), win = fin[0].elapsedS!;
  const simT = (key: string) => w.boats.find(b => !b.isUser && b.spec?.id === `real:${r.id}:${key}`);
  // (a real boat with your sail number stays ashore: you sailed in her place)
  const mine = sailKey(S.boat.sails.number);
  const rows = [...fin.map(b => ({ name: titleCase(b.boat), no: b.key, t: b.elapsedS!, sim: simT(b.key), you: false, yours: !!mine && b.key === mine })), { name: 'You', no: '', t: you, sim: undefined, you: true, yours: false }].sort((a, b) => a.t - b.t);
  const gap = you - win, perMile = gap / Math.max(0.1, r.distanceNm);
  const simCol = rows.some(x => x.sim || x.yours); // (a season race sails the club's fleet: no real boat in the sim)
  return `<div class="eyebrow">Against the real fleet · ${new Date(r.date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>`
    + `<p class="lede">On the day you'd have been <b>${nth} of ${of}</b>: ${gap <= 0 ? `${mmss(-gap)} ahead of the winner` : `${mmss(gap)} behind the winner, ${Math.round(perMile)} s a mile`}. Their times are the published ones (${esc(r.event)}, race ${r.raceNo}: all on the same rating, so elapsed time decides)${simCol ? '; the sim\'s column is the AI sailing each boat today, a check on the sim against the real fleet' : ''}.</p>`
    + (r.uncertain ? `<p class="lede">${esc(r.uncertain)}</p>` : '')
    + (r.doubt ? `<p class="lede">${esc(r.doubt)}</p>` : '')
    + `<table class="res"><thead><tr><th></th><th>Boat</th><th>Real</th>${simCol ? '<th>In the sim</th>' : ''}</tr></thead><tbody>${rows.map((x, i) => `<tr${x.you ? ' class="you"' : ''}><td>${i + 1}</td><td>${esc(x.name)} <span style="color:var(--muted)">${esc(x.no)}</span></td><td>${mmss(x.t)}</td>${simCol ? `<td>${x.you ? '' : x.yours ? 'your number: you sailed for her' : x.sim?.finished ? mmss(x.sim.finishT!) : x.sim ? '–' : ''}</td>` : ''}</tr>`).join('')}</tbody></table>`
    + `<p class="lede"><a href="${esc(r.url)}" target="_blank" rel="noopener">The published results</a></p>`;
}

/* Run a past race: a race you've sailed, sailed again. With its saved setup it's the same race (the same seed, course,
   fleet, crew, start time and conditions settings); an older entry gives its course, day and start time. The day's
   weather is the sim's record of that day now, so a day raced on the forecast is sailed again in what was observed. */
let pastList: LogEntry[] = [];
const courseOfEntry = (e: LogEntry) => e.setup?.course && COURSES.some(c => c.id === e.setup!.course) ? e.setup.course
  : COURSES.slice().sort((a, b) => b.title.length - a.title.length).find(c => e.title.startsWith(c.title))?.id ?? null;
/* ---------------- the season (club/season.ts): a real club series, race by race, against the club's fleet ---------------- */
let pendingSeason: { series: Series; no: number; at: string } | null = null;
/** A boat as she is now, by sail number: your boats and the club's other Folkboats, from their specs (club/season.ts LiveBoat). */
const liveBoat = (sail: string) => {
  const mine = S.boats.find(b => sailNo(b).replace(/^US\s+/, 'USA ') === sail);
  if (mine) return { name: mine.name || undefined, hull: mine.hull.upper, club: mine.club };
  for (const id of seasons()[0]?.fleet ?? []) if (isGeneric(id)) { const g = genericSpec(id, S.boats.map(x => x.sails.number)); if (g && sailNo(g) === sail) return { name: g.name.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase()), hull: g.hull.upper, club: g.club }; }
  return undefined;
};
/** Sail race `no` of the season: its real day and start, the day's observed wind and tide, its course (or the committee's), the club's fleet. */
function sailSeason(id: string, no: number): void {
  const series = seasonById(id), r = series?.races.find(x => x.no === no); if (!series || !r || r.abandoned) return;
  Object.assign(S, { mode: 'race', course: r.courseId, tideDate: r.date, tideTime: r.start, windKind: 'auto', windKt: 0, windDir: null, windTurn: 0,
    chop: 1, swellHs: null, current: 'real', sea: 'real', rain: 0, fog: 'real', realRace: r.realId ?? undefined });
  replayPin = null; ghostNext = null;
  S.opponents = [...series.fleet]; S.fleet = S.opponents.length;
  if (!S.boat.slip) S.raceFrom = 'water';
  saveSettings(S); boatSummary(); oppRows(); setup.crewRows(); setup.paintSeg();
  setup.beginRace();
}
/** The season race this race is, if it's one: that race's course, day and start, in the day's real conditions, against the series' fleet. */
function seasonRaceOf(): { series: Series; no: number } | null {
  if (S.mode !== 'race' || !w || w.freeSail) return null;
  for (const series of seasons()) for (const r of series.races) {
    if (r.abandoned || S.course !== r.courseId || S.tideDate !== r.date || S.tideTime !== r.start) continue;
    if (S.windKind !== 'auto' || S.windKt || S.windTurn || S.windDir != null || replayPin != null || S.current !== 'real') continue;
    if (S.opponents.length !== series.fleet.length || !series.fleet.every(o => S.opponents.includes(o))) continue;
    return { series, no: r.no };
  }
  return null;
}
/** Her hull's colour, for a boat in the race: yours, a club boat, or one of the club's other Folkboats. */
function hullOf(b: Boat): string {
  if (b.isUser) return S.boat.hull.upper;
  const id = S.opponents[b.id - 1] ?? '';
  if (id.startsWith('stock:')) return FLEET[+id.slice(6)]?.hull ?? '#ccc';
  return (isGeneric(id) ? genericSpec(id, S.boats.map(x => x.sails.number))?.hull.upper : b.spec?.hull.upper) ?? '#ccc';
}
/** This race's scores, as the season keeps them: each boat by country and sail number; the boats still racing in the order they're in now. */
function seasonResult(at: string): SeasonResult | null {
  if (!w) return null;
  const sc = results.scores(), rows = scoreOrder([...sc.values()], id => w.boats[id].finished ? w.boats[id].finishT : null).map(s => w.boats[s.id]);
  return { at, scores: rows.map((b, i) => { const s = sc.get(b.id)!; return { sail: b.no.replace(/^US\s+/, 'USA '), name: b.isUser ? (S.boat.name || 'You') : b.name, hull: hullOf(b), you: b.isUser, club: b.isUser ? S.boat.club : b.spec?.club, points: s.points ?? (b.isUser ? w.boats.length + 1 : i + 1), code: s.points == null && b.isUser ? 'RET' : s.code === 'UFD' || s.code === 'BFD' ? 'DSQ' : s.code }; }) };
}
/** At the finish of a season race: where this race puts you in the series (counted once you save it). */
function seasonLine(): string {
  const sr = seasonRaceOf(); if (!sr) return '';
  const now = seasonResult('now'); if (!now) return '';
  const res = { ...seasonResults(sr.series.id), [sr.no]: now }, { rows } = standings(sr.series, res);
  const you = rows.find(r => r.you), lead = rows[0]; if (!you) return '';
  const done = sr.series.races.length >= sr.series.scheduled && sr.series.races.filter(r => !r.abandoned).every(r => res[r.no]); // (every scheduled race on the calendar, and sailed)
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  return `<b>${esc(sr.series.title.replace(/ \d{4}.*/, ''))}: ${results.ordinal(you.rank)} · ${you.nett} nett</b> <span>· ${lead === you ? (done ? 'you win the series' : 'you lead') : `${esc(lead.sail)} ${esc(lead.name)} ${done ? 'wins' : 'leads'} on ${lead.nett}`} · counts when you save it</span>`;
}
/**
 * A ghost to race against, when there's a run of this very race kept (replay/ghost.ts): your best (the fastest finish), this
 * run if it's another, or none. Sailing it again, the ghost sails its run beside you.
 */
function ghostPick(e: LogEntry, i: number): string {
  const gs = ghostsFor(setupKey(e.setup)); if (!gs.length) return '';
  const mm = (s?: number) => s == null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const what = (g: typeof gs[0]) => g.code ? 'not finished' : `${g.place != null ? results.ordinal(g.place) + ', ' : ''}${mm(g.elapsed)}`;
  const best = gs[0], mine = gs.find(g => g.at === e.at);
  const opts = [`<option value="${best.at}">Ghost: your best (${what(best)})</option>`]
    .concat(mine && mine !== best ? [`<option value="${mine.at}">Ghost: this run (${what(mine)})</option>`] : [])
    .concat(['<option value="">No ghost</option>']);
  return `<select class="pick sm ghostpick" data-ghost="${i}" aria-label="Race against your ghost: your own earlier run of this race">${opts.join('')}</select>`;
}
function pastRaces(): void {
  realRaceRows();
  pastList = loadLog().filter(e => e.kind === 'race' && e.skipper === 'you').sort((a, b) => b.at.localeCompare(a.at)).slice(0, 30);
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  const result = (e: LogEntry) => e.code === 'RET' ? 'Retired' : e.code === 'CXL' ? 'Canceled (wind)' : e.code === 'unfinished' ? 'Not finished' : e.code === 'DSQ' ? 'Disqualified' : e.place != null ? `${results.ordinal(e.place)} of ${e.of}` : '';
  $('pastRows').innerHTML = pastList.length ? pastList.map((e, i) => {
    const boat = S.boats.find(b => b.id === e.boatId), ok = !!courseOfEntry(e);
    const day = new Date(e.day + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    return `<div class="pastrow"><div><b>${esc(e.title)}</b><small>${day}, ${e.time} · ${esc(e.wind)} · ${esc(boat?.name || 'a boat since deleted')} · ${result(e)}${e.setup ? '' : ' · fleet and settings as they are now'}</small></div>`
      + ghostPick(e, i)
      + `<button type="button" class="ghost sm" data-past="${i}"${ok ? '' : ' disabled title="That course is no longer in the sim"'}>Sail it again</button></div>`;
  }).join('') : '<p class="lede">No races in your logbook yet. Race one, save it, and it appears here to sail again.</p>';
}
$('pastRows').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-past]'); if (!b || b.disabled) return;
  const en = pastList[Number(b.dataset.past)], course = en && courseOfEntry(en); if (!en || !course) return;
  // the ghost chosen beside it (only ever a run of this same race)
  const gsel = b.closest('.pastrow')?.querySelector<HTMLSelectElement>('select[data-ghost]'), g = gsel?.value ? loadGhost(gsel.value) : null;
  ghostNext = g && en.setup && g.key === setupKey(en.setup) ? g : null;
  // (a race saved before Turn the wind has no windTurn: it sails unturned, whatever the slider says now; one saved with
  // a pinned 'Wind from' keeps it for this race only, outside your settings, so it can't stick to the next)
  // (a race saved before On-the-water judging was umpired)
  if (en.setup) Object.assign(S, { windTurn: 0, judging: 'umpired' }, structuredClone(en.setup.s)); else { S.tideDate = en.day; S.tideTime = en.time; }
  replayPin = S.windDir ?? null; S.windDir = null;
  S.course = course; S.mode = 'race';
  const boat = S.boats.find(x => x.id === en.boatId); if (boat) { S.boat = boat; S.boatId = boat.id; crewFromClub(); }
  if (!S.boat.slip) S.raceFrom = 'water';
  { const ids = new Set(S.boats.map(x => x.id)); S.opponents = S.opponents.filter(o => o.startsWith('stock:') || isGeneric(o) || (!!S.realRace && isReal(o)) || (ids.has(o) && o !== S.boatId)); S.fleet = S.opponents.length; }
  saveSettings(S); boatSummary(); oppRows(); setup.crewRows(); setup.paintSeg();
  $('raceChoose').hidden = true;
  setup.beginRace(en.setup?.seed);
});

/* The conditions adjuster: each control is 'real' until moved; Real puts it back. */
const ADJ = {
  windKt: { el: 'adjWindKt', get: () => S.windKt || null, set: (v: number | null) => { S.windKt = v ?? 0; }, show: (v: number) => `${v} kt`, def: () => Math.round(w.wind.kt) },
  // Turn the wind: the kind of day's own direction, turned up to 30° either way (+ clockwise: a veer)
  windTurn: { el: 'adjWindTurn', get: () => S.windTurn || null, set: (v: number | null) => { S.windTurn = v ?? 0; }, show: (v: number) => turnWords(v), def: () => 0 },
  chop: { el: 'adjChop', get: () => (S.chop ?? 1) === 1 ? null : S.chop!, set: (v: number | null) => { S.chop = v ?? 1; }, show: (v: number) => v === 0 ? 'glassy' : `× ${v.toFixed(1)}`, def: () => 1 },
  swellHs: { el: 'adjSwell', get: () => S.swellHs ?? null, set: (v: number | null) => { S.swellHs = v; }, show: (v: number) => `${(v / 0.3048).toFixed(0)} ft`, def: () => +(w.sea.swell?.hs ?? 1).toFixed(1) }
} as const;
function adjustUi(): void {
  const real: string[] = [];
  for (const [k, a] of Object.entries(ADJ)) {
    const cur = a.get(), inp = $<HTMLInputElement>(a.el), btn = document.querySelector<HTMLButtonElement>(`[data-real="${k}"]`)!;
    btn.setAttribute('aria-pressed', String(cur == null)); inp.classList.toggle('dim', cur == null);
    if (cur == null) { inp.value = String(a.def()); $(a.el + 'V').textContent = k === 'windTurn' ? 'as usual' : 'real'; } else { inp.value = String(cur); $(a.el + 'V').textContent = a.show(cur); real.push(k); }
  }
  if (S.current !== 'real') real.push('current');
  if (S.rain) real.push('rain');
  if ((S.fog ?? 'real') !== 'real') real.push('fog');
  const names: Record<string, string> = { windKt: 'wind speed', windTurn: 'wind turned', chop: 'chop', swellHs: 'swell', current: 'current', rain: 'rain', fog: 'fog' };
  if (S.windKind !== 'auto') real.unshift('windKind');
  names.windKind = `the kind of wind (${WIND_KIND_LABEL[S.windKind as WindKind]?.toLowerCase() ?? S.windKind})`;
  // the turn, and where it leaves the wind
  if (S.windTurn) names.windTurn = `the wind ${turnWords(S.windTurn)}, from ${degAndPoint(w.windModel.base)}`; // (as the course is laid, and the setup card says)
  // (light and variable blows from all over: nothing to turn)
  $('windTurnRow').hidden = S.windKind === 'light';
  $('adjSum').textContent = real.length ? `Adjusted: ${real.map(k => names[k]).join(', ')}.` : 'All real.';
  $('condState').textContent = real.length ? 'adjusted' : 'real'; $('condState').classList.toggle('adj', real.length > 0);
}
for (const [k, a] of Object.entries(ADJ)) {
  const inp = $<HTMLInputElement>(a.el);
  inp.addEventListener('input', () => { $(a.el + 'V').textContent = a.show(Number(inp.value)); });
  inp.addEventListener('change', () => { (a.set as (v: number | null) => void)(Number(inp.value)); saveSettings(S); setup.setupChanged(() => { setup.courseCard(); setup.tideBox(); }); });
  document.querySelector<HTMLButtonElement>(`[data-real="${k}"]`)!.onclick = () => { (a.set as (v: number | null) => void)(null); saveSettings(S); setup.setupChanged(() => { setup.courseCard(); setup.tideBox(); }); };
}

setup.buildSetupChoices();
setup.newGame(); setup.paintSeg(); setup.crewRows(); setup.courseCard(); setup.tideBox(); boatSummary(); oppRows();
requestAnimationFrame(frame);

installDevHandles(ctx); // (src/app/devHandles.ts)
