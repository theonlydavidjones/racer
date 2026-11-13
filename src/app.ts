import { CoachMemory } from './boat/coach';
import { PREP_MEANING } from './sim/signals';
import { describeSea } from './environment/sea';
import './styles.css';
import { CURRENTS } from './environment/current';
import { COURSES, courseFile } from './courses/registry';
import { RC_COURSE, chooseCourse, type CommitteeChoice } from './courses/committee';
import { place } from './sim/places';
import { OUTBOARDS } from './boat/motor';
import { ghostGap, ghostsFor, keepGhost, loadGhost, setupKey, trackOf, type Ghost } from './replay/ghost';
import { BoatPanel } from './ui/boatPanel';
import { Fleet } from './ui/fleet';
import { addLog, loadLog, type LogEntry, type RaceSetup } from './boat/logbook';
import { harborOf, inBasin, slipById, slipPlace } from './geo/marina';
import { HULL_COLORS, BRIGHT_FINISH, sailNo, type BoatSpec } from './boat/spec';
import { ReplayView, type ReplayClip } from './replay/replayView';
import { RaceReplay } from './replay/raceReplay';
import { tactics, type Tactics } from './replay/tactics';
import { tacticsHtml, tacticsTop, type TacShown } from './ui/tacticsView';
import { planLegs } from './sim/strategist';
import { outlookFor } from './sim/outlook';
import { beatAngle } from './boat/polar';
import { bigMoments, gapWords, legWords, rivalWho, versus, type VsInput } from './replay/versus';
import { Labels } from './render/labels';
import { ORIENT_LABEL, SceneView, VIEWS, overheadUp, type Overhead } from './render/scene';
import { HELD, KeyMap, type Action } from './ui/keys';
import { KeysView } from './ui/keysView';
import { D2R, V, brg, dist, wrap } from './core/math';
import { EXONERATION, RULES, explain, ptsText, raceScores, scoreOrder, type Incident, type ScoreOut } from './rules';
import { DEFAULT_SETTINGS, MAX_OPPONENTS, chooseWindKind, loadSettings, saveSettings, type Settings } from './settings';
import { FLEET } from './boat/boat';
import { keepSeasonRace, seasonResults, seasons, standings, type SeasonResult, type Series } from './club/season';
import { seasonHtml } from './ui/season';
import { fillFleet, genericSpec, genericTag, isGeneric, isReal } from './boat/generic';
import { placeAmong, realFleetIds, realRace, realRaces, sailKey } from './sim/realRaces';
import type { Boat, LineKey } from './boat/boat';
import { randomSeed } from './core/rng';
import { CONDITION_KEYS, World, describeTide } from './sim/world';
import { LocalHost, WorkerHost, type SimHost, type SimView, type WorldArgs } from './sim/host';
import { spawnSimWorker } from './sim/spawn';
import type { Command, CtlKey } from './sim/commands';
import { POLE, byHand, linesByHand } from './boat/physics';
import type { PlaceAcross, PlaceFore } from './boat/crewPhys';
import { YOU, ensureMembers, loadMembers, pullCrew, saveMembers, type Member } from './club/members';
import { installSkipperUI } from './ui/skipperUI';
installSkipperUI(); // (the Members tab's skipper half: her ratings, what's said of her, her record)
import { SailBand } from './ui/sailBand';
import { WindLadder } from './render/windLadder';
import { windBand, type ManoeuvreScore } from './sim/drill';
import { roundingKey, type RoundingScore } from './sim/roundings';
import { LINE_NAME } from './ui/lines';
import { autoAcross, openCrewChoices, showCrewRow, toggleCrewOpen } from './ui/crewWords';
import { CurrentField, nextSaturday, sfClock } from './environment/tide';
import { PerfMeter } from './ui/perfMeter';
import { compassPoint, degAndPoint, turnWords } from './core/compass';
import { WIND_KINDS, WIND_KIND_LABEL, windKindFreq, windTerrain, type WindKind } from './environment/wind';
import { compass, sunPosition, sunTimes } from './environment/sun';
import { startDebrief, type StartStats } from './sim/startDebrief';
import type { SimEvent } from './sim/events';
import { $ } from './ui/dom';
import { horn, logMessage, messageLog, setLogClock, sound, toast, headline } from './ui/feedback';
import { Hud, fmtClock, sideWord } from './ui/hud';
import { CourseView } from './ui/courseView';
import { NavView } from './ui/navView';
import { onSaveTrouble } from './store/cloud';
import { FIELD_LAYERS, fieldLayer, layerMenu, withLayer, type LayerKey, type MenuView } from './ui/layers';
import { Chart } from './ui/chart';
import { SetupChart, type SetupPicks } from './ui/setupChart';
import { PlanChart } from './ui/planChart';
import { passageNow, whyNot } from './sim/navigator';
import { FlowPanel } from './ui/flowPanel';
import type { PilotMode } from './boat/autopilot';
import { Nav, type Place } from './ui/nav';

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
function newGame(seed = randomSeed()): void {
  if (condLive && w?.running) { saveSettings(S); void host.ask({ k: 'conditions', settings: S }).then(() => view.conditionsChanged(w)); return; } // (redrawn once the race has them: the committee boat to the new wind) // (the owner: at once, without a restart)
  // (a setup change still waiting on its debounce is overtaken: this race is built from the settings as they are now)
  clearTimeout(setupTimer); const fs = [...setupAfter]; setupAfter.clear();
  prepare(seed); show(); fs.forEach(f => f());
}
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
function prepare(seed = randomSeed()): void {
  incidentClips = []; // (a new race: its own rule incidents)
  pendingPenalty = null; // (an incident's penalty is for the race it happened in)
  // in the showroom (editing one of your boats, or her page in the Fleet): she's the boat shown, her flags flying
  const shown: BoatSpec | null = boatPanel?.open ? boatPanel.editing : fleet?.showing ?? null, showFlags = !!shown;
  const WS0 = shown && shown.id !== S.boatId ? (() => { const o = S.opponents.filter(x => x !== shown.id); return { ...S, boat: shown, opponents: o, fleet: o.length }; })() : S;
  // (an older race sailed again keeps the direction it was pinned to, for this race only: replayPin)
  const WS1 = replayPin != null ? { ...WS0, windDir: replayPin } : WS0;
  // (on show: the showroom's own time of day and conditions, if you've set them; your races' and cruises' are untouched)
  const WS = shown ? { ...WS1, ...(showCond ?? {}), ...(showMin != null ? { tideTime: hhmm(showMin + WS1.seq) } : {}) } : WS1;
  const rc = S.course === RC_COURSE ? committee(WS) : null;
  const courseSignal = rc ? { no: rc.est.no, why: rc.why } : undefined;
  // (the practice drills, alone, in the setup's day and conditions: the tack and gybe drill off the Cityfront; the
  // mark-rounding drill round the practice course's marks, so its file is forced to the practice course)
  const soloDrill = (S.mode === 'manoeuvres' || S.mode === 'roundings') && !shown;
  const WSd = soloDrill ? { ...WS, opponents: [], fleet: 0, traffic: 0 as const, sailFrom: 'cityfront', sailTo: '' } : WS;
  const drillFile = S.mode === 'roundings' ? (COURSES.find(c => !c.group) ?? COURSES[0]) : null;
  const args: WorldArgs = { file: drillFile ?? (rc ? rc.est.file : courseFile(S.course === RC_COURSE ? COURSES[0].id : S.course)), settings: WSd, seed,
    opts: S.mode === 'drill' ? { startAt: S.drillFrom ?? DRILL_FROM, solo: S.drillSolo ?? true, showFlags, courseSignal } : (S.mode === 'sail' || soloDrill) && !shown ? { freeSail: true } : { showFlags, courseSignal, ...(shown ? { startAt: S.seq * 60 } : {}) } };
  // the one World the page builds for this race (the setup's cards read it), handed to the host as its mirror
  const facts = new World(args.file, args.settings, args.seed, args.opts);
  if (host) host.rebuild(args, facts);
  else {
    // the race in a worker of its own (sim/host.ts WorkerHost), the page drawing its mirror; in the page's own thread where
    // a worker can't start, or with ?inproc (the dev handles and the check scripts that change the World directly)
    const wk = SIM_INPROC ? null : spawnSimWorker();
    host = wk ? new WorkerHost(wk, args, SIM_GUARD, why => { document.documentElement.dataset.sim = 'local'; toast(`The race moved to the page's own thread (${why.split('\n')[0]}).`, 4000); }, facts)
      : new LocalHost(facts, SIM_GUARD);
  }
  w = host.view; shownDest = w.dest; speedSet = w.speed; drillShown = false; resultsShown = false;
  document.documentElement.dataset.sim = host.mode; // (where the race sails, for the checks: 'worker' or 'local')
  unshown = true; document.documentElement.dataset.prepared = String(++prepared);
}
/** The scene for the race prepare() built: the boats, marks and labels drawn, and the view live again. */
function show(): void {
  unshown = false; setStill(false);
  showTrimOwner(); showLash(); showCrewPlace();
  word('bCourse', w.freeSail ? 'Navigator' : 'Course'); keysHint(); insetViews();
  view.setWorld(w);
  // a ghost race: the run chosen in Run a past race, shown only while the race is that very race (its setup's key: the same
  // course, seed, start time and conditions); any other race has none
  activeGhost = ghostNext && S.mode === 'race' && setupKey(raceSetup()) === ghostNext.key ? ghostNext : null; view.setGhost(w, activeGhost?.pts ?? null);
  labels.build(w);
}
function setStill(on: boolean): void { still = on; document.body.classList.toggle('still', on); }
/** Leaving the setup without sailing (the start page): its race drawn, and live again. */
function wake(): void { if (unshown) show(); else setStill(false); }
let setupTimer = 0;
const setupAfter = new Set<() => void>();
/**
 * A choice in the setup: its race built once the clicks stop (120 ms), then `after` (the cards that read it). Outside
 * the setup (the showroom, the pause menu's conditions) the change is drawn at once, as before.
 */
function setupChanged(after?: () => void, wait = 120): void {
  if (!still || condLive) { newGame(); after?.(); return; }
  if (after) setupAfter.add(after);
  clearTimeout(setupTimer);
  const go = () => { if (!still) return; prepare(); const fs = [...setupAfter]; setupAfter.clear(); fs.forEach(f => f()); };
  if (wait <= 0) go(); else setupTimer = window.setTimeout(go, wait);
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
/** This race's rule incidents, for the race replay (by Moment.ref). */
let incidentClips: { clip: ReplayClip; title: string; what: string }[] = [];
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
    ? `Penalty: ${turns} (${w.penaltyDeg}°). Get clear of other boats, then turn ${w.penaltyDeg === 720 ? 'two full circles' : 'one full circle'} in the same direction: each one includes a tack and a gybe (Rule 44.2).`
    : `${other.name} takes a ${turns} penalty.`;
  logMessage(`${youFault ? 'Foul' : `${other.name} fouled you`}: ${RULES[inc.rule][0]}. ${ex.what}`);
  pendingPenalty = exonerated || notRacing || preamble ? null : inc.fouler;
  lastClip = clip;
  if (w.log) {
    const title = `${youFault ? 'Your foul' : `${other.name} fouled you`}: ${RULES[inc.rule][0]}`;
    send({ k: 'logNote', note: { key: 'rule', t0: w.t - 10, t1: w.t, x: user.x, y: user.y, lost: 0, text: title, ref: incidentClips.length } });
    incidentClips.push({ clip, title, what: ex.what });
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
  { group: 'Cockpit thwart', key: 'traveller', label: 'Traveller' },
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
  allBack: () => { send({ k: 'allToCrew' }); S.manualTrim = 0; saveSettings(S); showTrimOwner(); toast('Auto-trim: every line, both jib cars and the pole back to the crew.', 2500); },
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
/* The tack and gybe drill (sim/drill.ts): each manoeuvre scored in the race, shown here in the Coach card as it's
 * scored, the whole list (and your bests, kept by manoeuvre and wind band) on the Pause screen. */
let drillSeen = 0;
const drillName = (k: 'tack' | 'gybe') => (k === 'tack' ? 'Tack' : 'Gybe');
const drillKey = (s: ManoeuvreScore) => `${s.kind}-${windBand(s.tws)}`;
function drillTick(): void {
  const el = $('tpDrill'), list = w.drill?.list;
  if (!list) { if (w.rounding) return; if (!el.hidden) { el.hidden = true; drillSeen = 0; } return; } // (the rounding drill shares the card)
  if (list.length < drillSeen) drillSeen = 0; // (a restart: a new, empty list)
  if (list.length === drillSeen) { if (!list.length) el.hidden = true; return; }
  for (let i = drillSeen; i < list.length; i++) { // (your bests: the fewest metres lost, by manoeuvre and wind band)
    const s = list[i], k = drillKey(s), b = S.practiceBest?.[k];
    if (!s.scored || s.lostM < 0) continue; // (a turn noted, not scored, is no best; nor a reading below nothing, the measure's own wander)
    if (!b || Math.max(0, s.lostM) < b.lostM) { S.practiceBest = { ...(S.practiceBest ?? {}), [k]: { lostM: Math.max(0, s.lostM), goodM: s.goodM } }; saveSettings(S); }
  }
  drillSeen = list.length;
  const s = list[list.length - 1], best = S.practiceBest?.[drillKey(s)];
  el.hidden = false;
  if (!s.scored) { el.innerHTML = '<span class="tp-dcoach"></span>'; el.querySelector('.tp-dcoach')!.textContent = s.coach; return; }
  el.innerHTML = `<b>${drillName(s.kind)} ${list.filter(x => x.kind === s.kind && x.scored).length}</b> · lost <b>${Math.max(0, Math.round(s.lostM))} m</b> (a good crew ${Math.round(s.goodM)} m)${best ? ` · best ${Math.max(0, Math.round(best.lostM))} m` : ''}<br><span class="tp-dcoach"></span>`;
  el.querySelector('.tp-dcoach')!.textContent = s.coach;
}
/* ---- the mark-rounding drill (sim/roundings.ts): the same Coach card and Pause slot, one drill at a time ---- */
const roundName = (k: 'windward' | 'leeward') => (k === 'windward' ? 'Windward mark' : 'Leeward mark');
let roundSeen = 0;
function roundTick(): void {
  const el = $('tpDrill'), list = w.rounding?.list;
  if (!list) { if (w.drill) return; if (!el.hidden) { el.hidden = true; roundSeen = 0; } return; }
  if (list.length < roundSeen) roundSeen = 0; // (a restart: a new, empty list)
  if (list.length === roundSeen) { if (!list.length) el.hidden = true; return; }
  for (let i = roundSeen; i < list.length; i++) { // (your bests: the fewest metres lost, by mark and wind band)
    const s = list[i], k = roundingKey(s), b = S.practiceBest?.[k];
    if (!s.scored || s.lostM < 0 || s.provisional) continue; // (a provisional score is no best)
    if (!b || Math.max(0, s.lostM) < b.lostM) { S.practiceBest = { ...(S.practiceBest ?? {}), [k]: { lostM: Math.max(0, s.lostM), goodM: s.goodM } }; saveSettings(S); }
  }
  roundSeen = list.length;
  const s = list[list.length - 1], best = S.practiceBest?.[roundingKey(s)];
  el.hidden = false;
  if (!s.scored) { el.innerHTML = '<span class="tp-dcoach"></span>'; el.querySelector('.tp-dcoach')!.textContent = s.coach; return; }
  el.innerHTML = `<b>${roundName(s.kind)} ${list.filter(x => x.kind === s.kind && x.scored).length}</b> · lost <b>${Math.max(0, Math.round(s.lostM))} m</b>${s.provisional ? ' (provisional: first lap)' : ''} (a good crew ${Math.round(s.goodM)} m)${best ? ` · best ${Math.max(0, Math.round(best.lostM))} m` : ''}<br><span class="tp-dcoach"></span>`;
  el.querySelector('.tp-dcoach')!.textContent = s.coach;
}
/** The Pause screen's list for the rounding drill: every rounding, its numbers, and your bests. */
function roundHtml(): string {
  const list = w.rounding?.list ?? [], f = (v: number | null, d = 0) => (v == null ? '—' : v.toFixed(d));
  const bestOf = (k: 'windward' | 'leeward') => list.reduce((bi, x, i) => (x.kind === k && x.scored && !x.provisional && x.lostM >= 0 && (bi < 0 || x.lostM < list[bi].lostM) ? i : bi), -1);
  const lit = new Set([bestOf('windward'), bestOf('leeward')]);
  const row = (s: RoundingScore, i: number) => {
    const head = `<td>${i + 1}. ${roundName(s.kind)}</td><td>${Math.round(s.tws)} kt</td>`;
    if (!s.scored) return `<tr class="noscore">${head}<td colspan="5">not scored</td></tr><tr class="dcoach"><td colspan="7">${s.coach.replace(/</g, '&lt;')}</td></tr>`;
    // approach: the tacks inside the zone (windward) or the pole down before the mark (leeward); exit: how close onto the new course
    const approach = s.kind === 'windward' ? `${s.tacks} tack${s.tacks === 1 ? '' : 's'}${s.pinchS > 2 ? `, pinched ${f(s.pinchS)} s` : s.freeS > 2 ? `, free ${f(s.freeS)} s` : ''}` : `in ${Math.round(s.entryD)} m`;
    const pole = s.kind === 'windward' ? (s.poleS == null ? 'no pole' : `+${f(s.poleS)} s`) : (s.dropS == null ? '—' : `−${f(Math.max(0, s.dropS))} s`);
    return `<tr${lit.has(i) ? ' class="best"' : ''}>${head}<td><b>${Math.max(0, Math.round(s.lostM))} m</b>${s.provisional ? '*' : ''}</td><td>${Math.round(s.goodM)} m</td><td>${approach}</td><td>${pole}</td><td>${Math.round(s.exitD)} m</td></tr><tr class="dcoach"><td colspan="7">${s.coach.replace(/</g, '&lt;')}</td></tr>`;
  };
  const rows = list.map(row).join('');
  const bests = Object.entries(S.practiceBest ?? {}).filter(([k]) => /^(wmark|lmark)-/.test(k)).map(([k, b]) => { const [kind, band] = k.split('-'); return `${kind === 'wmark' ? 'Windward' : 'Leeward'} mark, ${band} wind: ${Math.max(0, Math.round(b.lostM))} m (a good crew ${Math.round(b.goodM)} m)`; }).join(' · ');
  return `<h3>Mark roundings</h3>${list.length ? `<table class="attempts"><thead><tr><th></th><th>Wind</th><th>Lost</th><th>Good crew</th><th>Approach</th><th>Pole</th><th>Exit</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>No roundings yet: beat up to the windward mark, round it to port and set the pole for the run down to the pin; round the pin to port and beat up again.</p>'}`
    + `<p class="drillhow"><span title="Lost: what you gave away along the wind against a twin sailing on at your own pace, from 100 m before the mark to 100 m past it, through the water. Good crew: the sim's own crew, the same way. * provisional: your pace on the new leg not measured yet.">How it's scored</span></p>`
    + (bests ? `<p><b>Your bests</b>: ${bests}</p>` : '');
}
/** The Pause screen's list: every manoeuvre so far, with its numbers, and your bests. */
function drillHtml(): string {
  const list = w.drill?.list ?? [], f = (v: number | null, d = 0) => (v == null ? '—' : v.toFixed(d));
  // (the best of each kind this run, the fewest metres lost: lit, as the start-line drill lights its best)
  const bestOf = (k: 'tack' | 'gybe') => list.reduce((bi, x, i) => (x.kind === k && x.scored && x.lostM >= 0 && (bi < 0 || x.lostM < list[bi].lostM) ? i : bi), -1);
  const lit = new Set([bestOf('tack'), bestOf('gybe')]);
  const rows = list.map((s, i) => !s.scored ? `<tr class="noscore"><td>${i + 1}. ${drillName(s.kind)}</td><td>${Math.round(s.tws)} kt</td><td colspan="7">not scored</td></tr><tr class="dcoach"><td colspan="9">${s.coach.replace(/</g, '&lt;')}</td></tr>` : `<tr${lit.has(i) ? ' class="best"' : ''}><td>${i + 1}. ${drillName(s.kind)}</td><td>${Math.round(s.tws)} kt</td><td><b>${Math.max(0, Math.round(s.lostM))} m</b></td><td>${Math.round(s.goodM)} m</td><td>${f(s.rate)}°/s</td><td>${s.kind === 'tack' ? f(s.deadS, 1) + ' s' : '—'}</td><td>${f(s.overshoot)}°</td><td>${s.acrossS == null ? '—' : (s.acrossS >= 0 ? '+' : '') + s.acrossS.toFixed(1) + ' s'}</td><td>${f(s.backS)} s</td></tr><tr class="dcoach"><td colspan="9">${s.coach.replace(/</g, '&lt;')}</td></tr>`).join('');
  const bests = Object.entries(S.practiceBest ?? {}).filter(([k]) => /^(tack|gybe)-/.test(k)).map(([k, b]) => { const [kind, band] = k.split('-'); return `${kind === 'tack' ? 'Tack' : 'Gybe'}, ${band} wind: ${Math.max(0, Math.round(b.lostM))} m (a good crew ${Math.round(b.goodM)} m)`; }).join(' · ');
  return `<h3>Tacks and gybes</h3>${list.length ? `<table class="attempts"><thead><tr><th></th><th>Wind</th><th>Lost</th><th>Good crew</th><th>Turn</th><th>Head to wind</th><th>Past course</th><th>Jib / boom across</th><th>Back to speed</th></tr></thead><tbody>${rows}</tbody></table>` : '<p>No tacks or gybes yet: tack when you\'re ready, or bear away to a run, settle, and gybe.</p>'}`
    + `<p class="drillhow"><span title="Lost: what you gave away along the wind against a twin sailing on at your own pace, until you were back to 90% speed (98% after a gybe). Good crew: the sim's own crew, the same way. Only a tack from close-hauled and a gybe from a run are scored.">How it's scored</span></p>`
    + (bests ? `<p><b>Your bests</b>: ${bests}</p>` : '');
}
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
  const want = !w.user.poleWant; send({ k: 'pole', want }); // (yours now, until Auto-trim)
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
$('bPause').onclick = () => {
  if (!w.running) return; send({ k: 'pause', on: true }); setControlsIdle(); $('pause').hidden = false;
  $('bRestart').textContent = w.drill || w.rounding ? 'Restart the drill' : w.freeSail ? 'Restart this cruise' : 'Restart this race';
  const d = $('pauseDebrief'), html = w.drill ? drillHtml() : w.rounding ? roundHtml() : w.userFinishT == null ? debriefHtml('Your race so far') : ''; d.innerHTML = html; d.hidden = !html;
  mountDebriefTactics(d);
  $('pauseWatch').hidden = !html || w.track.length < 2;
};
/** What the replay's comparison with the winner needs: every boat's start, marks and finish, and the legs. */
function vsInput(log: NonNullable<typeof w.log>): VsInput {
  const C = w.C, wind = w.committeeFrom, last = C.marks[C.marks.length - 1]?.p ?? C.center;
  // the finish leg's point of sail, as the course sets the others' (courses/course.ts: within 55° of the committee's wind a beat, past 125° a run)
  const off = Math.abs(wrap(brg(C.center.x - last.x, C.center.y - last.y) - wind)), fin = off < 55 ? 'beat' : off > 125 ? 'run' : 'reach';
  return {
    frames: w.track, you: w.user.id, startTimes: w.startTimes, marks: log.boatMarks, from: C.center, finishLine: [C.pin, C.committee],
    boats: (sc => w.boats.map(b => ({ id: b.id, name: b.isUser ? 'You' : b.name, finishT: b.finished ? b.finishT : null, dsq: b.scoring === 'UFD' || b.scoring === 'BFD', points: sc.get(b.id)!.points })))(scores()),
    legs: [...C.marks.map(m => ({ name: m.name, to: m.p, kind: m.leg })), { name: 'the finish', to: C.center, kind: fin as 'beat' | 'reach' | 'run' }]
  };
}
/* ---------------- the tactical debrief (replay/tactics.ts, ui/tacticsView.ts) ---------------- */
/** The planner's ideal for this race (strategist.planLegs: costly, so once a race), and what's shown on the chart. */
let tacPlan: { w: unknown; legs: ReturnType<typeof planLegs> } | null = null;
const tacShown: TacShown = { best: true, ideal: true, boats: new Set() };
let tacShownFor: unknown = null;
/** The plan, once a race (outlookFor reads the gun's day, not the clock: the same plan the briefing showed). */
function tacPlanNow(): ReturnType<typeof planLegs> {
  if (tacPlan?.w !== w) { try { tacPlan = { w, legs: planLegs(w, outlookFor(w)) }; } catch (e) { console.warn('the tactical debrief: no ideal', e); tacPlan = { w, legs: [] }; } }
  return tacPlan.legs;
}
/** A planned leg's time, s: its sailing time and the rounding at its end (an island's, or 10 s at a mark: strategist.legEnds). */
const idealS = (P: ReturnType<typeof planLegs>, k: number) => !P[k] ? null : ((P[k + 1] ? P[k + 1].t0 - P[k].t0 : P[k].minutes) * 60);
function tacticsNow(): Tactics | null {
  const log = w.log; if (!log || w.track.length < 2 || w.drill) return null;
  tacPlanNow();
  const C = w.C, u = w.user.id, V0 = vsInput(log);
  const legs = V0.legs.map((L, k) => ({ name: L.name, from: k === 0 ? C.center : V0.legs[k - 1].to, to: L.to, kind: L.kind, ideal: idealS(tacPlan!.legs, k) }));
  // what the race log measured for you, by leg: past the layline, and each tack or gybe's cost. A moment goes to the leg
  // it happened in: a tack at its turn (the moment opens 3 s before it), a spell at its middle; the first leg from the gun
  const ends = [0, ...C.marks.map((_, k) => log.boatMarks[u]?.[k] ?? null), w.user.finished ? w.user.finishT : null];
  const at = (m: { key: string; t0: number; t1: number }) => m.key === 'tacks' ? m.t0 + 3 : (m.t0 + m.t1) / 2;
  const ms = log.moments(w), logged = legs.map((_, k) => {
    const a = ends[k], b = ends[k + 1] ?? Infinity, inLeg = (m: { key: string; t0: number; t1: number }) => a != null && at(m) >= a && at(m) < b;
    return { laylines: ms.filter(m => m.key === 'laylines' && inLeg(m)).reduce((x, m) => x + m.lost, 0), tacks: ms.filter(m => m.key === 'tacks' && inLeg(m)).map(m => m.lost) };
  });
  return tactics({ frames: w.track, you: u, beat: beatAngle(w.wind.kt), tws: w.wind.kt, hs: w.user.sea?.hsW ?? 0, legs, logged,
    boats: w.boats.map(b => ({ id: b.id, name: b.isUser ? 'You' : b.name, color: b.color, start: w.startTimes[b.id] ?? null, marks: log.boatMarks[b.id] ?? [], finishT: b.finished ? b.finishT : null })) });
}
/** Draw the tactical debrief into `host` (the results' or the pause screen's debrief, or the replay's list), and answer its chips. */
function mountTactics(host: HTMLElement, compact: boolean, onLeg: (i: number) => void): void {
  const T = tacticsNow(); if (!T || T.rows.length < 2) { host.innerHTML = ''; return; }
  if (tacShownFor !== w) {
    // a new race: the winner shown beside you (or the boat second, if you won)
    tacShownFor = w; tacShown.boats.clear();
    const V = versus(vsInput(w.log!)); if (V) tacShown.boats.add(V.rival);
  }
  // (a fleet goes by sail numbers, the owner, 13 Nov 2026: the chips say "USA 110 Varnish", the chart's tight spots "USA 110")
  const boats = w.boats.map(b => ({ id: b.id, name: b.isUser ? 'You' : `${b.no} ${b.name}`.trim(), short: b.isUser ? 'You' : b.no || b.name, color: b.color }));
  const paint = () => {
    const sc = scores(), me = sc.get(w.user.id), place = me?.rank != null ? `${ordinal(me.rank)} of ${w.boats.length}` : 'Racing';
    host.innerHTML = (compact ? '' : tacticsTop(T, place, w.user.finishT != null ? mmss(w.user.finishT) : `${mmss(w.t)} so far`)) + tacticsHtml(T, boats, w.user.id, tacShown, { compact });
  };
  paint();
  host.onclick = e => {
    const el = e.target as HTMLElement, chip = el.closest<HTMLElement>('[data-tchip]')?.dataset.tchip;
    if (chip) {
      if (chip === 'best') tacShown.best = !tacShown.best; else if (chip === 'ideal') tacShown.ideal = !tacShown.ideal;
      else if (chip !== 'you') { const id = +chip; if (tacShown.boats.has(id)) tacShown.boats.delete(id); else tacShown.boats.add(id); }
      paint(); return;
    }
    const leg = el.closest<HTMLElement>('[data-tleg]')?.dataset.tleg; if (leg != null) onLeg(+leg);
  };
}
/** The planner's ideal track on each leg, for the replay (dashed beside yours). */
const idealPaths = () => tacPlanNow().map(L => L.plans[L.best].path.map(q => q.p));

/** The race replay: your race from just before the gun, with the debrief on its track and timeline. */
function watchRace(): void {
  const log = w.log; if (!log || w.track.length < 2) return;
  raceReplay.open(w, {
    frames: w.track, moments: log.moments(w), findings: log.findings(w), wind: w.gun?.windFrom ?? w.wind.from,
    marks: log.places().filter(p => p.t != null).map(p => ({ name: p.name, t: p.t! })), clips: incidentClips,
    vs: versus(vsInput(log)), real: realLine(),
    tactics: (host, onLeg) => mountTactics(host, true, onLeg), idealPaths: idealPaths(), chosen: () => [...tacShown.boats]
  });
}
/**
 * A real past race (Charts' sim/realRaces.ts): in a line, where your time would have placed among the real fleet on the
 * day, the gap to its winner and that per mile, with the doubt about the course's length beside the per-mile figure
 * when the published distance and the course sheet disagree. (The results page has the full table: realResults.)
 */
function realLine(): string | undefined {
  const r = S.realRace ? realRace(S.realRace) : undefined; if (!r || w.userFinishT == null) return undefined;
  const fin = r.boats.filter(b => b.elapsedS != null && b.code == null).sort((a, b) => a.elapsedS! - b.elapsedS!); if (!fin.length) return undefined;
  const you = w.userFinishT, { place, of } = placeAmong(r, you), gap = you - fin[0].elapsedS!, per = gap / Math.max(0.1, r.distanceNm);
  const day = new Date(r.date + 'T12:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  // Charts' "Course uncertain: …" sentence, where the sim's own perfect boat can't match the real times (the course or
  // the recorded wind in doubt); ahead of the doubt about the distance. (Read loosely: the field lands on its own.)
  const uncertain = (r as { uncertain?: string | null }).uncertain ?? null;
  return `On ${day} (${r.event}, race ${r.raceNo}) you'd have placed ${ordinal(place)} of ${of}: ${gap <= 0 ? `${mmss(-gap)} ahead of ${titleCase(fin[0].boat)}, who won` : `${mmss(gap)} behind ${titleCase(fin[0].boat)}, who won, ${Math.round(per)} s a mile over its ${r.distanceNm} nm`}.${uncertain ? ` ${uncertain}` : ''}${r.doubt && gap > 0 ? ` ${r.doubt}` : ''}`;
}
$('bWatch').onclick = $('bWatch2').onclick = watchRace;
$('bResume').onclick = () => { $('pause').hidden = true; send({ k: 'pause', on: false }); };
$('bRestart').onclick = () => { $('pause').hidden = true; beginRace(); };
$('bSettings').onclick = () => { $('pause').hidden = true; openSetup(); };
$('bAgain').onclick = () => { $('results').hidden = true; beginRace(); };
$('bSet2').onclick = () => { $('results').hidden = true; openSetup(); };
// Tap the inset map: the chart, full screen, with the sail paused (pick a destination there when cruising)
let chartDest: unknown = null;
/** Cruise setup: the start and the destination, picked on the chart (ui/setupChart.ts); each pick rebuilds the world. */
const cruisePicks: SetupPicks = {
  world: () => w,
  get: which => (which === 'from' ? S.sailFrom ?? 'cityfront' : S.sailTo ?? ''),
  set: (which, id) => { if (which === 'from') S.sailFrom = id; else S.sailTo = id; saveSettings(S); setupChanged(tideBox, 0); } // (the tide graph's Arrive moves with them; at once, for the chart that redraws from it)
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
  const setLayer = (k: LayerKey, on: boolean) => { S.mapLayers = withLayer(S, k, on); send({ k: 'settings', patch: { mapLayers: S.mapLayers } }); saveSettings(S); syncField(); };
  const redraw = () => { if (chart.isOpen) chart.draw(); if (planChart.isOpen) planChart.draw(); };
  // the chart's big picker for the field layer: Wind, Current, Waves, Fog, Off
  const fieldBtns = [...document.querySelectorAll<HTMLButtonElement>('#chartField button, #planField button')];
  const syncField = () => { const f = fieldLayer(w?.settings ?? S) ?? 'off'; for (const b of fieldBtns) b.setAttribute('aria-checked', String(b.dataset.field === f)); };
  for (const b of fieldBtns) b.addEventListener('click', () => {
    const f = b.dataset.field!;
    if (f === 'off') { S.mapLayers = { ...S.mapLayers }; for (const k of FIELD_LAYERS) S.mapLayers[k] = false; send({ k: 'settings', patch: { mapLayers: S.mapLayers } }); saveSettings(S); syncField(); }
    else setLayer(f as LayerKey, true);
    redraw(); setTimeout(() => menus.forEach(m => m()), 30); // (after the chart's redrawn, so the key lists what's on it now)
  });
  syncField(); openChartHook = syncField; refreshMenus = () => menus.forEach(m => m());
  // (the training views, switched from the inset map's menu too: no buttons of their own on the game surface)
  const views: MenuView[] = [
    { name: 'Wind in the air', what: 'The true wind (white) and the apparent wind (amber) in the air beside her, at the deck, the sails\' centre and the masthead', keyLabel: () => keymap.label('windLadder'), on: () => !!S.windLadder, set: on => windShow(on) },
    { name: 'Flow over the sails', what: 'The flow view: the air over the sails at three heights, and what the telltales are saying', keyLabel: () => keymap.label('flowView'), on: () => flowPanel.open, set: on => openFlow(on) }];
  const menus = [layerMenu($('bMapLayers'), $('mapLayersPop'), () => w?.settings ?? S, setLayer, redraw, (el, f) => hud.keyInto(el, 'inset', f), views),
    layerMenu($('bChartLayers'), $('chartLayersPop'), () => w?.settings ?? S, setLayer, redraw, (el, f) => hud.keyInto(el, 'chart', f))];
}
$('map').addEventListener('click', () => {
  if (!w.running || chart.isOpen) return;
  if (w.cruising && hud.insetView === 'nav') { navView.toggle(w); return; } // (the navigator's view: its passage plan)
  releaseTiller(); setControlsIdle(); chartDest = w.dest; chart.open(w); openChartHook();
});
/** Cruising, the navigator is one of the inset map's views, toggled by a quiet button on its rim (the owner: "It should
 * just be a view in the inset map", and no new buttons outside it); racing, the Course button stays with the helm's. */
function insetViews(): void {
  const cruising = !!w?.cruising, b = $('bMapNav');
  b.hidden = !cruising; $('bCourse').hidden = true; // (the course opens from the where-next card: the surface audit, owner 13 Nov)
  if (!cruising) hud.insetView = 'map';
  b.setAttribute('aria-pressed', String(hud.insetView === 'nav'));
}
$('bMapNav').addEventListener('click', e => { e.stopPropagation(); hud.insetView = hud.insetView === 'nav' ? 'map' : 'nav'; insetViews(); });

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
  $('keysHint').textContent = `${k('takeTiller')}/click: take or let go of tiller · right-click, double-click or ${k('lashTiller')}: lash it · ${k('steerPort')}/${k('steerStbd')} steer · ${k('luff')} luff · ${k('viewCockpit')}/${k('viewChase')}/${k('viewOverhead')} views · arrows look · ${k('keys')} all keys`;
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
    if (boatPanel.open) { $('boatPanel').querySelector<HTMLElement>('[data-act="done"]')?.click(); return; }
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
    case 'pushOff': pushOff(); break;
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
  groups.delete('Practice');
  sel.innerHTML = [...groups].map(([g, cs]) => `<optgroup label="${g}">${cs.map(c => `<option value="${c.id}">${label(c)}</option>`).join('')}</optgroup>`).join('');
  sel.value = S.course;
  sel.onchange = () => { S.course = lastPick = sel.value; saveSettings(S); setupChanged(() => { courseCard(); tideBox(); }); };
  $('condDlg').querySelector('[data-k="current"]')!.innerHTML = Object.values(CURRENTS).map(c => `<button type="button" data-v="${c.id}">${c.button}</button>`).join('');
}
function courseCard(): void {
  const C = w.C;
  const chips = ['<span class="m">Start</span>']
    .concat(C.marks.map(m => `<span class="m ${m.type === 'pass' ? 'x' : m.side}">${m.name.split(' ')[0]}${m.type === 'pass' ? '' : ' ' + sideWord(m.side)}</span>`))
    .concat(['<span class="m">Finish</span>']);
  const sig = w.courseSignal;
  $('courseCard').innerHTML = (sig ? `<div class="rcpick"><b>The committee will fly course ${sig.no}</b><small>${sig.why}</small></div>` : '')
    + `<div class="legs">${chips.join('<span class="arr">→</span>')}</div>`;
  { // the host club: its courses and its sailing instructions
    const host = hostOf(S.course), rc = S.course === RC_COURSE;
    document.querySelectorAll<HTMLButtonElement>('#hostSeg [data-host]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.host === host)));
    document.querySelectorAll<HTMLButtonElement>('#courseMode [data-cm]').forEach(b => b.setAttribute('aria-pressed', String((b.dataset.cm === 'rc') === rc)));
    $('courseMode').hidden = host === 'practice';
    $('courseSel').hidden = host === 'practice' || rc;
    if (!rc && host !== 'practice') ($('courseSel') as HTMLSelectElement).value = S.course;
    const flag = S.prepFlag === 'black' ? 'black flag' : `${S.prepFlag ?? 'P'} flag`;
    const line = C.biasAdjustable ? ` · line ${S.bias ? (S.bias > 0 ? 'pin' : 'boat') + ' up ' + Math.abs(S.bias) + '°' : 'square'}` : '';
    $('siSum').textContent = `${host === 'practice' ? 'Practice' : 'Sailing instructions'}: ${S.seq}-min sequence · ${flag} · ${S.penaltyTurns === 1 ? 'one-turn' : 'two-turn'} penalty${line}`;
  }
  $('lengthField').hidden = S.mode === 'sail' || S.course !== RC_COURSE;
  $('biasField').hidden = !C.biasAdjustable;
  $('prepNote').textContent = PREP_MEANING[S.prepFlag ?? 'P'];
  $('fleetField').hidden = S.mode === 'sail';
  { // racing from her slip: sail out to the line from her marina
    const sl = slipById(S.boat.slip), btn = $<HTMLButtonElement>('raceFromSlip');
    $('raceFromField').hidden = S.mode === 'sail';
    btn.disabled = !sl; btn.textContent = sl ? `From her slip (${slipPlace(sl)})` : 'From her slip (she has none)';
    if (!sl && S.raceFrom === 'slip') S.raceFrom = 'water';
    S.raceFrom ??= 'water';
    $('raceFromNote').textContent = S.raceFrom === 'slip' && w.fromSlip
      ? `She starts in her slip in ${harborOf(sl!.marina)?.short ?? 'her marina'}, ${Math.round((w.startAt - S.seq * 60) / 60)} minutes before the warning signal: push off, sail out of the harbor and over to the line. (Speed up the clock if you like.)`
      : '';
  }
  { // her slip, if she has one (Marina)
    const slip = slipById(S.boat.slip);
    if (!slip && (S.sailFrom === 'slip' || S.sailTo === 'slip')) { if (S.sailFrom === 'slip') S.sailFrom = 'cityfront'; if (S.sailTo === 'slip') S.sailTo = ''; }
  }
  // racing: an outboard on the transom bracket goes below (the class rules don't allow racing with it mounted aft: NFIA
  // clarification, March 2006, under class rule 1.11); the bracket can stay
  if (S.mode !== 'sail' && S.boat.perf.outboard === 'bracket') {
    S.boat.perf.outboard = 'stowed'; saveSettings(S); if (still) prepare(); else newGame();
    toast('Her outboard\'s been taken off the bracket and stowed below for the race: the class rules don\'t allow racing with it mounted aft (NFIA, 2006, class rule 1.11). Put it back on the bracket in the Fleet for a cruise.', 7000);
  }
  const cruise = S.mode === 'sail';
  for (const id of ['hostField', 'courseField', 'fleetField']) $(id).hidden = cruise;
  $('whereField').hidden = !cruise;
  if (cruise) setupChart?.sync(); // (the chart shows where she'll really start and go: the Fleet's "Cruise her" sets her start)
  $('bDrill').hidden = cruise;
  $('bGo').textContent = cruise ? 'Cast off' : 'Start the sequence';
  $('bPreview').textContent = cruise ? 'Passage plan' : 'Course and strategist';
  $('setupTitle').textContent = cruise ? 'Cruise' : 'Create a race';
  $('setupBack').textContent = nav.backLabel() || (cruise ? '‹ Start page' : '‹ Race');
  $('whenLab').textContent = cruise ? 'When' : 'Start time'; $('timeLab').textContent = cruise ? 'Leave at' : 'Start signal';
  { const c = S.crew ?? DEFAULT_SETTINGS.crew, kg = c.helm.w + c.people.slice(0, c.n).reduce((a, p) => a + p.w, 0);
    $('crewSum').textContent = `${c.n ? `You + ${c.n}` : 'Single-handed'}, ${Math.round(kg / 0.4536)} lb aboard`; }
  adjustUi();
}
/* Real tide: race day, start time, and a graph of the current at the start line through the day. */
function tideBox(): void {
  $('currentNote').hidden = S.current === 'real';
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
    $('windKindNote').textContent = `${src} Across the course: ${wx.fieldSource}${S.aids ? ' (shaded on the map)' : ''}. ${month} race days at Fort Point, 2021–25: ${odds}. ${KIND_NOTE[w.windKind]}`.replace(/around the race/g, S.mode === 'sail' ? 'through the afternoon' : 'around the race');
    const issued = wx.issued ? new Date(wx.issued).toLocaleString('en-US', { timeZone: 'America/Los_Angeles', weekday: 'short', hour: 'numeric', minute: '2-digit' }) : '';
    condSource = !w.seaBreeze ? 'Wind: as you set it' : wx.source === 'observed' ? 'Wind: observed at Fort Point' : wx.source === 'forecast' ? `Wind: NWS forecast, issued ${issued}`
      : wx.source === 'records' ? `Wind: no forecast yet; a ${WIND_KIND_LABEL[wx.kind].toLowerCase()} day from the ${month} records` : `Wind: a ${WIND_KIND_LABEL[wx.kind].toLowerCase()} day you chose, from the ${month} records`;
  }

  $('swellDaySeg').hidden = w.sea.flat || w.weather.realSwell;
  const d = $<HTMLInputElement>('tideDate'), tm = $<HTMLInputElement>('tideTime');
  d.value = w.raceDate; tm.value = S.tideTime || '12:00';
  drawTideGraph();
}
/** Where the day's wind comes from, in one line for the conditions card (tideBox). */
let condSource = '';
/** Current (filled: flood up, ebb down) and the westerly (line, right scale) at the start line through the day; the conditions card's rows. */
function drawTideGraph(): void {
  const cv = $<HTMLCanvasElement>('tideGraph'), dpr = devicePixelRatio || 1, W = cv.clientWidth || 360, H = cv.clientHeight || 120;
  cv.width = W * dpr; cv.height = H * dpr;
  const ctx = cv.getContext('2d')!; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const p = w.C.center, from = w.gunUtc - 3 * 60, to = w.gunUtc + 4 * 60, n = 84;
  const top = 16, bot = H - 18, mid = (top + bot) / 2, x = (i: number) => 8 + (W - 16) * i / n;
  const tx = (m: number) => 8 + (W - 16) * (m - from) / (to - from);
  const cruise = S.mode === 'sail';
  // race window: the gun to about 75 minutes later
  if (!cruise) { ctx.fillStyle = 'rgba(255,182,39,.10)'; ctx.fillRect(tx(w.gunUtc), top - 6, tx(w.gunUtc + 75) - tx(w.gunUtc), bot - top + 12); }
  const rows: [string, string][] = [];
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
    rows.push(['Current', `${describeTide(f, p, w.gunUtc).label}${cruise ? '' : ' at the line'}`]);
  }
  if (w.seaBreeze) {
    // the westerly in the open water near the line, kt, on its own scale (right)
    const kts: number[] = [];
    for (let i = 0; i <= n; i++) { const b = w.weather.at(from + (to - from) * i / n); kts.push(b.kt * windTerrain(p, b.from)); }
    const kmax = Math.max(10, Math.ceil(Math.max(...kts) / 5) * 5), yk = (v: number) => bot - v / kmax * (bot - top);
    ctx.strokeStyle = '#7fe0a8'; ctx.lineWidth = 2; ctx.beginPath(); kts.forEach((v, i) => (i ? ctx.lineTo(x(i), yk(v)) : ctx.moveTo(x(i), yk(v)))); ctx.stroke();
    ctx.font = '600 10px system-ui, sans-serif'; ctx.fillStyle = '#7fe0a8'; ctx.textAlign = 'right';
    ctx.fillText(`WIND · top ${kmax} kt`, W - 10, top + 2); ctx.fillText('0', W - 10, bot);
    const b = w.weather.at(w.gunUtc), b2 = w.weather.at(w.gunUtc + 90), k = windTerrain(p, b.from);
    const trend = b2.kt > b.kt + 0.6 ? `building to ${Math.round(b2.kt * k)} kt` : b2.kt < b.kt - 0.6 ? `easing to ${Math.round(b2.kt * k)} kt` : 'steady';
    rows.unshift(['Wind', `${WIND_KIND_LABEL[w.windKind]} ${Math.round(b.kt * k)} kt from ${S.windDir != null ? `${degAndPoint(S.windDir)} (an older setting)` : w.windKind === 'light' ? 'all over' : degAndPoint(b.from) + (S.windTurn ? ` (${turnWords(S.windTurn)} from the usual ${compassPoint(b.from - S.windTurn)})` : '')}, ${trend} over 90 min${w.windKind === 'west' ? ' (more in the slot)' : ''}`]);
  } else rows.unshift(['Wind', `${Math.round(w.wind.kt)} kt from ${degAndPoint(w.wind.from)}, as you set it`]);
  if (!w.tide) rows.push(['Current', CURRENTS[S.current]?.label ?? S.current]);
  rows.push(['Sea', w.sea.flat ? 'Flat' : `${w.sea.swell ? `${Math.round(w.sea.swell.hs / 0.3048)} ft, ${Math.round(w.sea.swell.tp)} s swell outside the Gate${w.sea.swell.total ? ` (the buoy reads ${Math.round(w.sea.swell.total / 0.3048)} ft with the ocean's own wind waves, which the sea here makes for itself)` : ''}` : 'No swell'}${(S.chop ?? 1) !== 1 ? `, chop × ${(S.chop ?? 1).toFixed(1)}` : ''}${S.rain ? `, ${S.rain === 2 ? 'heavy' : 'light'} rain` : ''}${S.fog && S.fog !== 'real' ? `, ${['no', 'patchy', 'thick'][S.fog]} fog` : ''}`]);
  { // the sun: when it's up, and where it is at the gun
    const st = sunTimes(w.gunUtc * 60000), sp = sunPosition(w.gunUtc * 60000);
    ctx.fillStyle = 'rgba(8,14,30,.35)';
    if (Number.isFinite(st.set)) { const xs = tx(st.set / 60000); if (xs < W - 8) ctx.fillRect(Math.max(8, xs), top - 6, W - 8 - Math.max(8, xs), bot - top + 12); }
    if (Number.isFinite(st.rise)) { const xr = tx(st.rise / 60000); if (xr > 8) ctx.fillRect(8, top - 6, Math.min(W - 16, xr - 8), bot - top + 12); }
    rows.push(['Sun', sp.el > 0 ? `${Math.round(sp.el)}° up in the ${compass(sp.az)}, sets ${sfClock(st.set / 60000)}` : `After sunset (${sfClock(st.set / 60000)}): sailing in the dusk`]);
  }
  ctx.strokeStyle = '#ffb627'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(tx(w.gunUtc), top - 6); ctx.lineTo(tx(w.gunUtc), bot + 6); ctx.stroke();
  ctx.font = '600 10px system-ui, sans-serif'; ctx.fillStyle = 'rgba(232,238,246,.8)'; ctx.textAlign = 'center';
  for (let m = Math.ceil(from / 60) * 60; m <= to; m += 60) if (tx(m) > 20 && tx(m) < W - 20) ctx.fillText(sfClock(m).slice(0, 2) + ':00', tx(m), H - 4);
  const pn = cruise && w.dest ? passageNow(w) : null, near = pn?.eta != null && tx(pn.eta) - tx(w.gunUtc) < 44;
  ctx.fillStyle = '#ffb627'; if (near) ctx.textAlign = 'right'; ctx.fillText(cruise ? 'leave' : 'gun', tx(w.gunUtc) - (near ? 4 : 0), 10); ctx.textAlign = 'center';
  // cruising somewhere: when she'd get there leaving then (sim/navigator.ts passageNow: the course she'd sail, tacks and
  // all, in the forecast wind and NOAA's current), as a second bar; past the graph's end, an arrow at its edge
  if (pn?.eta != null) {
    const xa = tx(pn.eta), inside = xa <= W - 8, xd = Math.min(xa, W - 10);
    ctx.strokeStyle = '#3fd197'; ctx.lineWidth = 2; ctx.setLineDash(inside ? [] : [3, 3]); ctx.beginPath(); ctx.moveTo(xd, top - 6); ctx.lineTo(xd, bot + 6); ctx.stroke(); ctx.setLineDash([]);
    // (close to the leave bar, the label goes to the right of its bar, clear of 'leave')
    const close = inside && near;
    ctx.fillStyle = '#3fd197'; ctx.textAlign = !inside ? 'right' : close ? 'left' : 'center';
    ctx.fillText(inside ? 'arrive' : `arrive ${sfClock(pn.eta)} →`, !inside ? W - 12 : close ? xd + 4 : xd, 10);
  }
  const day = new Date(w.raceDate + 'T12:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (pn) rows.unshift(['Arrive', pn.eta != null ? `about ${sfClock(pn.eta)}: ${(pn.sailedM / 1852).toFixed(1)} nm over the ground in ${Math.floor(pn.minutes / 60) ? `${Math.floor(pn.minutes / 60)} h ` : ''}${Math.round(pn.minutes % 60)} min${pn.tacks.length ? `, ${pn.tacks.length} tack${pn.tacks.length > 1 ? 's' : ''}` : ''}${pn.gybes.length ? `, ${pn.gybes.length} gybe${pn.gybes.length > 1 ? 's' : ''}` : ''}` : `leaving then she can't get there: ${whyNot(pn.why)}`]);
  $('condSum').innerHTML = `<dt>When</dt><dd>${day}, ${cruise ? 'leaving' : 'gun'} at ${sfClock(w.gunUtc)}</dd>` + rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  $('tideNote').textContent = `${condSource}${w.tide ? ' · current: NOAA predictions' : ''}. Graph: flood up, ebb down, the wind as a line${cruise ? '' : ', about a race shaded'}, dark after sunset.`;
}
$<HTMLInputElement>('tideDate').addEventListener('change', e => { S.tideDate = (e.target as HTMLInputElement).value || nextSaturday(); saveSettings(S); setupChanged(tideBox); });
$<HTMLInputElement>('tideTime').addEventListener('change', e => { S.tideTime = (e.target as HTMLInputElement).value || '12:00'; saveSettings(S); setupChanged(tideBox); });

function paintSeg(): void {
  document.querySelectorAll<HTMLElement>('.seg[data-k]').forEach(seg => {
    const k = seg.dataset.k as keyof Settings;
    const cur = String(S[k]);
    seg.querySelectorAll<HTMLButtonElement>('button').forEach(b => b.setAttribute('aria-pressed', String(cur === b.dataset.v)));
  });  document.querySelectorAll<HTMLInputElement>('input[data-t]').forEach(c => { c.checked = (S[c.dataset.t as 'aids' | 'windDial' | 'camRide'] ?? 0) === 1; });
}
// the on-screen training aids: a switch each (on = shown)
document.querySelectorAll<HTMLInputElement>('input[data-t]').forEach(c => c.addEventListener('change', () => {
  const k = c.dataset.t as 'aids' | 'windDial' | 'camRide'; S[k] = c.checked ? 1 : 0; (w.settings as Settings)[k] = S[k]; saveSettings(S); paintSeg();
}));
document.querySelectorAll<HTMLElement>('.seg[data-k]').forEach(seg => seg.addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest('button'); if (!b) return;
  const k = seg.dataset.k as keyof Settings, v = b.dataset.v!;
  if (k === 'aids' || k === 'windDial') { S[k] = Number(v) as 0 | 1; (w.settings as Settings)[k] = S[k]; saveSettings(S); paintSeg(); return; }
  if (k === 'windKind') { chooseWindKind(S, v as WindKind); paintSeg(); setupChanged(() => { courseCard(); tideBox(); }); return; }
  (S as unknown as Record<string, string | number>)[k] = (k === 'current' || k === 'course' || k === 'mode' || k === 'sea' || k === 'prepFlag' || k === 'raceLength' || k === 'raceFrom' || (k === 'fog' && v === 'real')) ? v : Number(v);
  paintSeg(); setupChanged(() => { courseCard(); tideBox(); });
}));
/**
 * Your crew in the race setup (the Yacht Club, phase 3; the owner: the race setup "isn't where crew are configured",
 * but you may swap people in and out there): you at the helm, then a pick for each seat from the club's members (the
 * middle crew: the main; the forward hand: the jib, the cabin top, the pole), the seats swapped, and the members
 * themselves set up in the Yacht Club. There's no crew count (the owner): both seats left at None is single-handed, for
 * practice or a race, and a seat left empty moves the forward hand up to the middle (one crew does both jobs).
 */
function crewRows(): void {
  const rows = $('crewRows'), boat = S.boats.find(b => b.id === S.boatId) ?? S.boat, seats = boat.crewIds ?? [];
  const esc = (t: string) => t.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
  // (anyone who crews, and isn't on another seat of hers; someone on another of your boats can still be brought aboard)
  const crewers = MEMBERS.filter(m => m.id !== YOU && m.roles.includes('crew'));
  const seatName = (i: number) => (i === 0 ? 'Middle: main' : 'Forward: jib, pole');
  const pick = (i: number) => `<label>${seatName(i)} <select data-seat="${i}"><option value="">None</option>${crewers.map(m => `<option value="${esc(m.id)}"${seats[i] === m.id ? ' selected' : ''}${seats.includes(m.id) && seats[i] !== m.id ? ' disabled' : ''}>${esc(m.name)}</option>`).join('')}</select></label>`;
  const you = MEMBERS.find(m => m.id === YOU);
  rows.innerHTML = `<div class="crewline"><span class="crewyou">${esc(you?.name ?? 'You')} · helm</span>${pick(0)}${pick(1)}`
    + (seats.length === 2 ? `<button type="button" class="ghost" data-crew="swap" title="Swap the middle crew and the forward hand">Seats ⇅</button>` : '')
    + `<button type="button" class="linkbtn" data-crew="club">Edit in the Yacht Club</button></div>`;
  const changed = () => { pullCrew(S, MEMBERS); saveMembers(MEMBERS); saveSettings(S); crewRows(); setupChanged(courseCard); };
  rows.querySelectorAll<HTMLSelectElement>('select[data-seat]').forEach(sel => sel.onchange = () => {
    const ids = [...(boat.crewIds ?? [])], i = Number(sel.dataset.seat);
    if (sel.value) ids[i] = sel.value; else ids.splice(i, 1);
    boat.crewIds = ids.filter(Boolean).slice(0, 2); changed();
  });
  rows.querySelector<HTMLButtonElement>('[data-crew="swap"]')?.addEventListener('click', () => { const ids = boat.crewIds ?? []; if (ids.length === 2) boat.crewIds = [ids[1], ids[0]]; changed(); });
  rows.querySelector<HTMLButtonElement>('[data-crew="club"]')?.addEventListener('click', () => nav.go({ k: 'club', tab: 'members' }));
}
function openSetup(): void { settleLog(openSetupNow); }
function openSetupNow(): void {
  replayPin = null; // (back at the setup: an older race's pinned wind direction is done with)
  if (S.mode === 'drill' || S.mode === 'manoeuvres' || S.mode === 'roundings') { S.mode = 'race'; prepare(); }
  // (behind the setup the view is still: the last frame stays and nothing sails; a race just prepared isn't running,
  // and is sent nothing until it starts)
  setStill(true);
  courseView.close(); navView.close(); if (w.running) send({ k: 'running', on: false }); ($('courseSel') as HTMLSelectElement).value = S.course; paintSeg(); crewRows(); courseCard(); $('setup').hidden = false; if (S.mode === 'sail') setupChart?.sync(true); tideBox(); }
function beginRace(seed?: number): void { settleLog(() => beginRaceNow(seed)); }
function beginRaceNow(seed?: number): void {
  nav.reset({ k: 'setup' }); // (the pause menu's and the results' Back to setup: the setup you sailed from)
  realRaceHolds();
  saveSettings(S);
  newGame(seed);
  if (S.mode === 'manoeuvres') { logMessage('— Tacks and gybes'); send({ k: 'running', on: true }); send({ k: 'pause', on: false }); word('bFast', 'Speed 1×');
    toast(`Tacks and gybes: ${Math.round(w.wind.kt)} kt from ${Math.round(w.wind.from)}°, ${w.cur.label.toLowerCase()}. She's close-hauled: tack when you're ready, or bear away to a run, settle there, and gybe. Each one is scored against a good crew's, in the Coach card.`, 6000); return; }
  if (S.mode === 'roundings') { logMessage('— Mark roundings · the practice course'); send({ k: 'running', on: true }); send({ k: 'pause', on: false }); word('bFast', 'Speed 1×');
    const W = w.rounding!.marks[0];
    toast(`Mark roundings: ${Math.round(w.wind.kt)} kt from ${Math.round(w.wind.from)}°, ${w.cur.label.toLowerCase()}. Beat up to ${W.name.replace(/ \(.*/, '')} (leave it to port) and set the pole for the run down to the pin (the leeward mark, to port); then beat up again. Each rounding is scored against a good crew's, in the Coach card. Wide in, close out.`, 7000); return; }
  logMessage(`— ${S.mode === 'sail' ? `Cruise · ${place(S.sailFrom)?.name ?? ''}${w.dest ? ' to ' + w.dest.name : ''}` : S.mode === 'drill' ? 'Start practice' : 'Race'} · ${S.mode === 'sail' ? '' : w.C.title}`);
  send({ k: 'running', on: true }); send({ k: 'pause', on: false });
  word('bFast', 'Speed 1×');
  horn(1.0);
  const m0 = w.C.marks[0];
  if (w.fromSlip) {
    const m = Math.round((w.startAt - S.seq * 60) / 60);
    toast(`In her ${w.homeSlip!.kind === 'alongside' ? 'berth' : 'slip'} in ${harborOf(w.homeSlip!.marina)?.short ?? 'her marina'}, ${w.homeSlip!.label}, ${w.homeSlip!.kind === 'alongside' ? 'alongside the end of the dock, bow out,' : 'bow in'} and made fast. Sails are down: hoist them at the dock or once you're clear (J jib, U main; the main goes up best head to wind). Push off (${keymap.keys.pushOff[0]?.toUpperCase() ?? 'the button'}) to have the crew walk her out by hand into the fairway, then sail her out through the entrance${S.mode === 'sail' ? '' : `: the warning signal is in ${m} minutes. Speed it up if you like.`}`, 7000);
    return;
  }
  toast(S.mode === 'sail'
    ? `Cruising${w.dest ? ` to ${w.dest.name}` : ''}: no race. ${Math.round(w.wind.kt)} kt from ${Math.round(w.wind.from)}°, ${w.cur.label.toLowerCase()}. Sea: ${describeSea(w.seaHere(w.user))}.${w.dest ? ' The navigator (M) has a passage plan.' : ' Try the tiller, the trim and the pole.'}`
    : S.mode === 'drill'
    ? `Start practice${w.boats.length === 1 ? ', alone' : ''}: ${w.startAt / 60 === 1 ? 'one minute' : `${w.startAt / 60} minutes`} to the gun. Check the line head to wind, time your run in, and be on the line at full speed when it goes. Current: ${w.cur.label}.`
    : `${S.seq}-minute sequence.${w.courseSignal ? ` The committee is flying course ${w.courseSignal.no}.` : ''} The strategist's briefing is in the course view (M). Current: ${w.cur.label}. Sea: ${describeSea(w.seaHere(w.user))}. First mark: ${m0.name} to ${m0.side === 's' ? 'starboard' : 'port'}.`, 3800);
  if (w.courseSignal && S.mode !== 'sail') logMessage(`Course ${w.courseSignal.no}, in numeral pennants on the flagpole (Rule 27.1: signalled by the warning signal). ${w.courseSignal.why}`);
}

/* ---------------- start practice debrief ---------------- */
let drillClip: ReplayClip | null = null;
function showDrill(): void {
  drillShown = true; send({ k: 'pause', on: true }); setControlsIdle();
  const d = startDebrief(w);
  if (d.stats) drillRuns.push({ ...d.stats, n: drillRuns.length + 1, from: w.startAt, solo: w.boats.length === 1 });
  drillOptions(); drillTable();
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
/** The drill's two choices (inside its panel): how long before the gun each attempt starts, and alone or with the fleet. */
function drillOptions(): void {
  const from = S.drillFrom ?? DRILL_FROM, solo = S.drillSolo ?? true;
  $('dOpts').innerHTML = `<span class="dlabel">Next attempt</span><div class="seg" data-dopt="from">${[60, 120, 180].map(s => `<button type="button" data-v="${s}" aria-pressed="${s === from}">${s / 60} min</button>`).join('')}</div>`
    + `<div class="seg" data-dopt="solo"><button type="button" data-v="1" aria-pressed="${solo}">Alone</button><button type="button" data-v="0" aria-pressed="${!solo}">With the fleet</button></div>`;
}
$('dOpts').addEventListener('click', e => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('button[data-v]'), g = b?.closest<HTMLElement>('[data-dopt]')?.dataset.dopt; if (!b || !g) return;
  if (g === 'from') S.drillFrom = +b.dataset.v!; else S.drillSolo = b.dataset.v === '1';
  saveSettings(S); drillOptions();
});
/** The run of attempts this session: each start's numbers, the best marked, to see the trend. */
function drillTable(): void {
  if (drillRuns.length < 2) { $('dRuns').innerHTML = ''; return; }
  // (a start is as good as it is on time and at speed: each 10% of speed short counts as about 5 s late, the time it
  // takes a Folkboat to build that speed back)
  const score = (r: typeof drillRuns[number]) => r.grade === 'ocs' ? Infinity : Math.abs(r.lateS) + (100 - r.pct) / 2;
  const best = drillRuns.reduce((a, r) => score(r) < score(a) ? r : a);
  const endW = (e: string) => e === 'pin' ? w.C.pinLabel : e === 'committee' ? w.C.committeeLabel : 'middle';
  const rows = drillRuns.slice(-10).map(r => `<tr${r === best ? ' class="best"' : ''}><td>${r.n}</td><td>${r.grade === 'ocs' ? `over, ${Math.round(-r.behindM)} m` : r.behindM < 0 ? `past, ${Math.round(-r.behindM)} m` : `${Math.round(r.behindM)} m · ${Math.round(r.lateS)} s`}</td><td>${r.pct}%</td><td>${esc(endW(r.end))}${r.fav ? (r.onFav ? ' ✓' : '') : ''}</td><td>${r.grade}</td></tr>`).join('');
  const last = drillRuns.slice(-3), avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const clean = last.filter(r => r.grade !== 'ocs'), trend = drillRuns.length >= 4 && clean.length ? ` Your last three averaged ${Math.round(avg(clean.map(r => r.lateS)))} s late at ${Math.round(avg(last.map(r => r.pct)))}% speed${clean.length < last.length ? ` (${last.length - clean.length} over early)` : ''}.` : '';
  $('dRuns').innerHTML = `<p class="lede">Your starts this session (the best highlighted; ✓ started at the favoured end).${trend}</p><table class="res attempts"><thead><tr><th>#</th><th>At the gun</th><th>Speed</th><th>End</th><th>Grade</th></tr></thead><tbody>${rows}</tbody></table>`;
}
$('bDReplay').onclick = () => { if (drillClip) drillView.play(w, drillClip); };
$('bDAgain').onclick = () => { closeDrill(); beginRace(w.seed); };
$('bDNew').onclick = () => { closeDrill(); beginRace(); };
$('bDKeep').onclick = () => { closeDrill(); send({ k: 'pause', on: false }); };
$('bDSetup').onclick = () => { closeDrill(); openSetup(); };
$('bGo').onclick = () => { if (S.mode === 'drill') S.mode = 'race'; courseView.close(); navView.close(); $('setup').hidden = true; beginRace(); };
$('bDrill').onclick = () => { S.mode = 'drill'; courseView.close(); navView.close(); $('setup').hidden = true; beginRace(); };
$('bManoeuvres').onclick = () => { S.mode = 'manoeuvres'; courseView.close(); navView.close(); $('setup').hidden = true; beginRace(); };
$('bRoundings').onclick = () => { S.mode = 'roundings'; courseView.close(); navView.close(); $('setup').hidden = true; beginRace(); };
/* The host club: the Seaweed Soup's courses (the committee's choice, or one you pick), or the practice area's. */
const hostOf = (id: string): 'ggyc' | 'practice' => id === RC_COURSE || COURSES.find(c => c.id === id)?.group ? 'ggyc' : 'practice';
let lastPick = hostOf(S.course) === 'ggyc' && S.course !== RC_COURSE ? S.course : COURSES.find(c => c.group)!.id;
function setCourse(id: string): void { S.course = id; saveSettings(S); setupChanged(() => { courseCard(); tideBox(); }); }
$('hostSeg').addEventListener('click', e => {
  const h = (e.target as HTMLElement).closest<HTMLElement>('[data-host]')?.dataset.host; if (!h || h === hostOf(S.course)) return;
  setCourse(h === 'practice' ? COURSES.find(c => !c.group)!.id : RC_COURSE);
});
$('courseMode').addEventListener('click', e => {
  const m = (e.target as HTMLElement).closest<HTMLElement>('[data-cm]')?.dataset.cm; if (!m) return;
  setCourse(m === 'rc' ? RC_COURSE : lastPick);
});
/* Change the conditions: one dialog over the setup. */
$('bCond').onclick = () => { $('condDlg').hidden = false; };
$('bCondClose').onclick = () => {
  $('condDlg').hidden = true;
  if (condLive) { condLive = false; $('pause').hidden = false; }
  if (showSaved) { // (from the showroom: what was set becomes the showroom's, and your own conditions go back as they were)
    const cond: Partial<Settings> = {}, rec = S as unknown as Record<string, unknown>;
    for (const k of CONDITION_KEYS) (cond as Record<string, unknown>)[k] = rec[k];
    showCond = cond; Object.assign(S, showSaved); showSaved = null; saveSettings(S); paintSeg(); newGame(); showBar();
  }
};
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
$('showTime').addEventListener('change', () => { showMin = Number(($('showTime') as HTMLInputElement).value); newGame(); showBar(); });
$('bShowCond').onclick = () => {
  // the same panel; while it's open your conditions take the showroom's, and they're put back when it closes
  const saved: Partial<Settings> = {}, rec = S as unknown as Record<string, unknown>;
  for (const k of CONDITION_KEYS) (saved as Record<string, unknown>)[k] = rec[k];
  showSaved = saved; Object.assign(S, showCond ?? {}); showCond = null;
  paintSeg(); tideBox(); $('condDlg').hidden = false;
};
$('bShowReal').onclick = () => { showMin = null; showCond = null; newGame(); showBar(); };
// mid-sail (from the pause menu): the same panel, its changes taken at once by the sail that's running (newGame below)
$('bPauseCond').onclick = () => { if (!w.running) return; condLive = true; $('pause').hidden = true; tideBox(); $('condDlg').hidden = false; };
$('bCondReal').onclick = () => {
  Object.assign(S, { windKind: 'auto', windKt: 0, windDir: null, windTurn: 0, chop: 1, swellHs: null, current: 'real', rain: 0, fog: 'real' });
  saveSettings(S); paintSeg(); setupChanged(() => { courseCard(); tideBox(); });
};

/** The tactics debrief: what cost you time, most first, and your place at each mark. */
/** The tactical chart at the top of a debrief: clicking a leg opens "Watch your race" on it. */
function mountDebriefTactics(box: HTMLElement): void {
  const host = box.querySelector<HTMLElement>('.tacHost[data-tac]'); if (!host) return;
  mountTactics(host, false, i => { watchRace(); raceReplay.pickLegNo(i); });
}
function debriefHtml(title: string): string {
  const log = w.log;
  if (!log || w.t <= 0) return '';
  const nth = (n: number) => n + (['th', 'st', 'nd', 'rd'][n % 100 > 10 && n % 100 < 14 ? 0 : n % 10] || 'th');
  const fs = log.findings(w), pl = log.places().filter(p => p.place != null);
  const items = fs.map(f => `<li><div class="dbHead"><b>${esc(f.title)}</b><span class="dbLost">${f.key === 'start' && f.lost < 2 ? 'on time' : `−${f.lost} s`}</span></div><p>${esc(f.detail)}</p><p class="dbTip">${esc(f.tip)}</p></li>`).join('');
  const marks = pl.length > 1 ? `<p class="lede">Your place at each mark: ${pl.map(p => `${esc(p.name)} ${nth(p.place!)}`).join(' → ')}.</p>` : '';
  const total = fs.reduce((a, f) => a + f.lost, 0);
  return `<div class="eyebrow">${title}</div><div class="tacHost" data-tac></div>${items ? `<p class="lede">What cost you time, most first: about ${total} s in all. The seconds are estimates from the boat's physics.</p><ol>${items}</ol>` : '<p class="lede">Nothing cost you more than a couple of seconds.</p>'}${marks}${vsDebriefHtml(log)}`;
}
/**
 * Against the winner (or the boat second, if you won), in the debrief: the gap, a line for each leg, and the moments
 * that cost or gained most (her tacks and gybes against yours, on the shifts), from the race's own recorded tracks.
 * The replay ("Watch your race") has every moment, to jump to.
 */
function vsDebriefHtml(log: NonNullable<typeof w.log>): string {
  const V = w.track.length > 1 ? versus(vsInput(log)) : null;
  if (!V || V.legs.length < 2) return '';
  const sgn = (x: number) => Math.abs(x) < 0.5 ? '±0 s' : `${x > 0 ? '−' : '+'}${Math.round(Math.abs(x))} s`;
  const kindW: Record<string, string> = { beat: 'a beat', reach: 'a reach', run: 'a run' };
  const legs = V.legs.map(L => {
    const mark = L.moments.find(m => m.kind === 'mark');
    return `<li><div class="dbHead"><b>${L.i ? `Leg ${L.i}, to ${esc(L.name)} (${kindW[L.kind]})` : 'The start'}</b><span class="dbLost">${sgn(L.lost)}</span></div><p>${esc(legWords(L, V.rivalName))}${mark ? ` ${esc(mark.text)}` : ''}</p></li>`;
  }).join('');
  const big = bigMoments(V);
  const moments = big.length ? `<p class="lede">The moments that counted most:</p><ol>${big.map(m => `<li><div class="dbHead"><span><b>Leg ${m.leg}:</b> ${esc(m.text)}</span><span class="dbLost">${m.lostM > 0 ? '−' : '+'}${Math.round(Math.abs(m.lostM))} m</span></div></li>`).join('')}</ol>` : '';
  return `<div class="eyebrow">Against ${esc(V.rivalName)}, ${rivalWho(V, w.boats[V.rival].finished)}</div><p class="lede">${esc(gapWords(V))} Leg by leg, from both your tracks. Metres are ground made good up or down the course (across the mean wind; along the leg on a reach), in the same minutes of wind, less your plain speed difference: so they're the tacks and the shifts. Downwind, a lift is the wind going aft: gybe on the lifts.</p><ol>${legs}</ol>${moments}`;
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
/** The settings a race was sailed in, kept with your entry so you can sail it again (Run a past race). */
const REPLAY_KEYS = ['tideTime', 'opponents', 'realRace', 'raceLength', 'windKind', 'windKt', 'windDir', 'windTurn', 'chop', 'swellHs', 'current', 'rain', 'fog', 'windDay', 'swellDay', 'traffic', 'seq', 'prepFlag', 'penaltyTurns', 'bias', 'raceFrom', 'crew', 'sea'] as const;
function raceSetup(): RaceSetup {
  const s: Record<string, unknown> = { tideDate: w.raceDate };
  for (const k of REPLAY_KEYS) if (S[k] !== undefined) s[k] = structuredClone(S[k]);
  if (replayPin != null) s.windDir = replayPin; // (sailed again, then saved: it keeps its pinned direction)
  return { seed: w.seed, course: w.C.id, s };
}
/** The race, into the logbook of every boat of yours in it: her place (or why she has none) and her time. */
function logRace(rows: Boat[], sc: Map<number, ScoreOut>): void {
  if (w.logged || S.mode === 'drill') return; send({ k: 'shown', logged: true });
  const title = `${w.C.title}${w.courseSignal ? ` (course ${w.courseSignal.no})` : ''}`, out: LogEntry[] = [];
  rows.forEach(b => {
    const spec = b.isUser ? S.boat : b.spec && S.boats.some(x => x.id === b.spec!.id) ? b.spec : null; if (!spec) return;
    const dsq = b.scoring === 'UFD' || b.scoring === 'BFD';
    const entry: LogEntry = { ...outing(spec, b.isUser), kind: 'race', title, of: rows.length, ...(b.isUser ? { setup: raceSetup() } : {}),
      ...(dsq ? { code: 'DSQ' } : b.finished ? { place: sc.get(b.id)!.rank ?? rows.indexOf(b) + 1, ...([...sc.values()].filter(x => x.points != null && x.points === sc.get(b.id)!.points).length > 1 ? { tied: true } : {}), elapsed: b.finishT!, ...(b.scoring === 'ZFP' ? { code: 'ZFP' } : {}) } : { code: 'unfinished' }) };
    out.push(entry);
    // your run, kept as a ghost for this race if you save it (her own track from the race's, once a second)
    if (b.isUser && entry.setup) { const sr = seasonRaceOf(); pendingSeason = sr ? { ...sr, at: entry.at } : null; }
    if (b.isUser && entry.setup) pendingGhost = { at: entry.at, key: setupKey(entry.setup), elapsed: entry.elapsed, place: entry.place, of: entry.of, code: entry.code, pts: trackOf(w.track, b.id) };
  });
  stage(out);
}
/** Leaving an outing (back to the start page, to setup, or starting another): log it if there's anything to log. */
function logOuting(): void {
  if (!w || w.logged || S.mode === 'drill') return;
  if (S.mode === 'sail' && w.freeSail && w.t >= 60) {
    send({ k: 'shown', logged: true });
    const from = S.sailFrom === 'slip' ? `her slip (${(s => s ? slipPlace(s) : '')(slipById(S.boat.slip))})` : place(S.sailFrom)?.name ?? 'the Bay';
    stage([{ ...outing(S.boat, true), kind: 'cruise', title: `From ${from}${w.dest ? ` to ${w.dest.name}` : ''}`, elapsed: Math.round(w.t), nm: w.sailedM / 1852, arrived: w.arrivedT != null }]);
  } else if (S.mode === 'race' && !w.freeSail && w.cancelled) {
    // racing called off for the wind: no result, but the outing goes in her logbook
    send({ k: 'shown', logged: true });
    stage([{ ...outing(S.boat, true), kind: 'race', title: w.C.title, code: 'CXL', of: w.boats.length, setup: raceSetup() }]);
  } else if (S.mode === 'race' && !w.freeSail && w.t > 0 && w.userFinishT == null) {
    // you left the race before finishing: retired
    send({ k: 'shown', logged: true });
    stage([{ ...outing(S.boat, true), kind: 'race', title: w.C.title, code: 'RET', of: w.boats.length, setup: raceSetup() }]);
    // (a season race left unfinished: RET in the series too, if it's saved)
    { const sr = seasonRaceOf(); pendingSeason = sr && pending ? { ...sr, at: pending[0].at } : null; }
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
    ? `${e.title}: ${e.code === 'RET' ? 'retired' : e.code === 'CXL' ? 'racing cancelled for the wind' : e.code === 'unfinished' ? 'not finished' : e.code === 'DSQ' ? 'disqualified' : `${ordinal(e.place!)} of ${e.of}`}${e.elapsed ? `, ${mins(e.elapsed)}` : ''}. Saved, it goes in her race record and logbook.`
    : `${e.title}: ${(e.nm ?? 0).toFixed(1)} nm in ${mins(e.elapsed)}${e.arrived ? ', arrived' : ''}. Saved, it goes in her logbook.`;
  $('keepAsk').hidden = false;
  const done = (keep: boolean) => {
    $('keepAsk').hidden = true; pending = null;
    if (keep) addLog(p);
    if (keep && pendingGhost) keepGhost(pendingGhost); pendingGhost = null;
    if (keep && pendingSeason) { const r = seasonResult(pendingSeason.at); if (r) keepSeasonRace(pendingSeason.series.id, pendingSeason.no, r); } pendingSeason = null;
    toast(keep ? 'Saved to her logbook.' : 'Discarded.', 2200);
    next();
  };
  $('bKeep').onclick = () => done(true); $('bDiscard').onclick = () => done(false);
}
onSaveTrouble(msg => toast(msg, 6000));

/** The race's scores (Low Point, with the Z flag's 20% added in points: rules/scoring.ts), by boat id. */
function scores(): Map<number, ScoreOut> {
  // the boats still racing, in the order they're in now (most marks rounded, then nearest the next), to project them
  const C = w.C, toGo = (b: Boat) => { const m = w.nextMark(b); return dist(b, m ? m.p : C.center); };
  const out = w.boats.filter(b => !b.finished && !b.retired).sort((a, b) => b.leg - a.leg || toGo(a) - toGo(b));
  return new Map(raceScores(w.boats.map(b => ({ id: b.id, finishT: b.finished ? b.finishT : null, code: b.retired ? 'RET' : b.scoring ?? null, ahead: out.indexOf(b) }))).map(s => [s.id, s]));
}

function showResults(): void {
  send({ k: 'shown', finishShown: true }); resultsShown = true;
  // in order of points (RRS A4, 44.3(c)), then of time across the line for the boats still racing
  const sc = scores(), rows = scoreOrder([...sc.values()], id => w.boats[id].finished ? w.boats[id].finishT : null).map(s => w.boats[s.id]);
  logRace(rows, sc);
  const mine = sc.get(w.user.id)!, place = mine.rank ?? rows.indexOf(w.user) + 1, tied = rows.filter(b => sc.get(b.id)!.rank === place && sc.get(b.id)!.points === mine.points).length > 1;
  const nth = (n: number) => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');
  // a Z-flag place waits on the boats still racing: any of them finishing on fewer points beats her (44.3(c))
  $('resTitle').textContent = mine.code === 'UFD' || mine.code === 'BFD' ? 'You were disqualified'
    : !mine.final ? `On points, you're likely ${nth(place)}: boats still racing can finish ahead of your ${ptsText(mine.points!)}`
    : place === 1 ? (tied ? 'You tied for first' : 'You won the race') : `You finished ${tied ? 'equal ' : ''}${nth(place)}`;
  const sr = w.startReport;
  $('resStart').textContent = sr ? `Your start: crossed ${sr.delay.toFixed(1)} s after the gun at ${sr.kt.toFixed(1)} kt, ${Math.round(sr.frac * 100)}% of the way from ${w.C.pinLabel} to ${w.C.committeeLabel}.` : 'No clean start recorded.';
  const code = (b: Boat) => { const s = sc.get(b.id)!; return b.scoring === 'ZFP' ? ` · ZFP: ${Number.isInteger(s.across!) ? nth(s.across!) : `tied ${nth(Math.floor(s.across!))}`} across the line, +${ptsText(s.penalty)} points (Rule 30.2, 44.3(c))${s.final ? '' : '; her place waits on the boats still racing'}` : b.scoring ? ` · ${b.scoring}: disqualified (Rule ${b.scoring === 'UFD' ? '30.3' : '30.4'})` : ''; };
  const rankOf = (b: Boat) => { const s = sc.get(b.id)!; return s.code === 'UFD' || s.code === 'BFD' ? 'DSQ' : s.rank == null ? '–' : `${s.final ? '' : '~'}${rows.filter(x => sc.get(x.id)!.rank === s.rank && sc.get(x.id)!.points === s.points).length > 1 ? '=' : ''}${s.rank}`; };
  $('resBody').innerHTML = rows.map(b => `<tr><td>${rankOf(b)}</td><td><span class="dot" style="background:${b.color}"></span>${b.isUser ? 'You' : b.name} <span style="color:var(--muted)">${b.no.replace(/^US\s+/, 'USA ')}</span></td><td>${b.finished ? fmtClock(b.finishT!).replace('+', '') : 'Still racing'}${code(b)}</td><td>${sc.get(b.id)!.points != null ? ptsText(sc.get(b.id)!.points!) : ''}</td></tr>`).join('');
  $('resFouls').textContent = `Fouls you committed: ${w.fouls}. Fouls against you: ${w.fouledBy}.`;
  { const rr = realResults(); $('resReal').innerHTML = rr; $('resReal').hidden = !rr; }
  { const sl = seasonLine(); $('resSeason').innerHTML = sl; $('resSeason').hidden = !sl; }
  const db = debriefHtml('Your race, debriefed');
  $('resDebrief').innerHTML = db; $('resDebrief').hidden = !db; $('resStart').hidden = !!db; // the debrief has the start in full
  mountDebriefTactics($('resDebrief'));
  $('bWatch').hidden = !w.log || w.track.length < 2;
  $('results').hidden = false;
  send({ k: 'pause', on: true });
}

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
    if (w.userFinishT != null && !w.finishShown && !resultsShown && w.t - w.userFinishT > 3) showResults();
    if (S.mode === 'drill' && !drillShown && w.t >= DRILL_DEBRIEF_AT) showDrill();
  }
  for (const e of host.drainEvents()) handle(e);
  if (host instanceof WorkerHost) { const d = document.documentElement.dataset; d.syncFaults = String(host.faults); d.syncChecks = String(host.checks); } // (for the checks: the mirror's checks made and failed)
  // (a new destination, from the chart or a command's answer: the course drawn to it)
  if (w.dest !== shownDest) { shownDest = w.dest; if (w.running) view.refreshCourse(w); }
  $('bPushOff').hidden = !(w.running && (!!w.user.docked || !!w.user.handled?.held)); sailButtons(); homeButton(); motorUi(); ghostNote(); ensignButton(); // (held head to wind on the bow line: push off again to let her go)
  keyLook(dt); lookLabel(); tillerSpring(dt); pilotTick(dt); showTiller(); showLines(); coachTick(dt); windTick(); drillTick(); roundTick();
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
  S.fleet = S.opponents.length; saveSettings(S); oppRows(); setupChanged();
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
boatPanel = new BoatPanel(S, () => { S.fleet = S.opponents.length; saveSettings(S); newGame(); boatSummary(); oppRows(); }, () => {
  const id = boatPanel.editing.id; boatPanel.hide(); nav.go({ k: 'boat', id }); // back to her page in the Yacht Club
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
  showroom: b => { showroom(!!b || boatPanel.open); newGame(); },
  edit: id => { showroom(true); boatPanel.show(id); newGame(); },
  sail: (id, mode, fromSlip) => {
    const b = S.boats.find(x => x.id === id); if (!b) return;
    S.boat = b; S.boatId = b.id; S.opponents = S.opponents.filter(o => o !== b.id); S.fleet = S.opponents.length; crewFromClub();
    if (mode === 'cruise') { S.mode = 'sail'; S.sailFrom = fromSlip && b.slip ? 'slip' : S.sailFrom === 'slip' ? 'cityfront' : S.sailFrom; }
    else { if (S.mode === 'sail') S.mode = 'race'; S.raceFrom = fromSlip && b.slip ? 'slip' : 'water'; }
    saveSettings(S); boatSummary(); oppRows(); nav.go({ k: 'setup' });
  },
  seasonHtml: () => { const s = seasons()[0]; return s ? seasonHtml(s, seasonResults(s.id)) : ''; },
  sailSeason: no => sailSeason(no),
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
  else if (p.k === 'setup') { prepare(); openSetup(); }
  else if (p.k === 'club') { if (p.tab === 'members') fleet.openMembers(); else fleet.openList(); }
  else fleet.openBoat(p.id);
}
function openHome(): void { settleLog(openHomeNow); }
function openHomeNow(): void {
  nav.reset(); // (the start page: the bottom of the back stack)
  courseView.close(); navView.close(); if (w.running) { send({ k: 'running', on: false }); send({ k: 'pause', on: false }); }
  wake(); // (the start page: the boat sailing behind it again, the setup's race drawn if it hadn't been)
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
      + `<small>${day}, start ${r.start} · ${fin.length} finished · ${esc(titleCase(won.boat))} ${esc(won.key)} won in ${mmss(won.elapsedS!)}${r.uncertain ? ` · <span class="warn" title="${esc(r.uncertain)}">course uncertain</span>` : ''}${r.doubt ? ` · <span class="warn" title="${esc(r.doubt)}">the published distance disagrees with the course sheet</span>` : ''}</small></div>`
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
  saveSettings(S); boatSummary(); oppRows(); crewRows(); paintSeg();
  $('raceChoose').hidden = true;
  beginRace();
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
  const you = w.userFinishT, { place, of } = placeAmong(r, you), nth = ordinal(place);
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
/** Sail race `no` of the season: its real day and start, the day's observed wind and tide, its course (or the committee's), the club's fleet. */
function sailSeason(no: number): void {
  const series = seasons()[0], r = series?.races.find(x => x.no === no); if (!series || !r || r.abandoned) return;
  Object.assign(S, { mode: 'race', course: r.courseId, tideDate: r.date, tideTime: r.start, windKind: 'auto', windKt: 0, windDir: null, windTurn: 0,
    chop: 1, swellHs: null, current: 'real', sea: 'real', rain: 0, fog: 'real', realRace: r.realId ?? undefined });
  replayPin = null; ghostNext = null;
  S.opponents = [...series.fleet]; S.fleet = S.opponents.length;
  if (!S.boat.slip) S.raceFrom = 'water';
  saveSettings(S); boatSummary(); oppRows(); crewRows(); paintSeg();
  beginRace();
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
  const sc = scores(), rows = scoreOrder([...sc.values()], id => w.boats[id].finished ? w.boats[id].finishT : null).map(s => w.boats[s.id]);
  return { at, scores: rows.map((b, i) => { const s = sc.get(b.id)!; return { sail: b.no.replace(/^US\s+/, 'USA '), name: b.isUser ? (S.boat.name || 'You') : b.name, hull: hullOf(b), you: b.isUser, points: s.points ?? (b.isUser ? w.boats.length + 1 : i + 1), code: s.points == null && b.isUser ? 'RET' : s.code === 'UFD' || s.code === 'BFD' ? 'DSQ' : s.code }; }) };
}
/** At the finish of a season race: where this race puts you in the series (counted once you save it). */
function seasonLine(): string {
  const sr = seasonRaceOf(); if (!sr) return '';
  const now = seasonResult('now'); if (!now) return '';
  const res = { ...seasonResults(sr.series.id), [sr.no]: now }, { rows } = standings(sr.series, res);
  const you = rows.find(r => r.you), lead = rows[0]; if (!you) return '';
  const done = sr.series.races.filter(r => !r.abandoned).every(r => res[r.no]);
  const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
  return `<b>${esc(sr.series.title.replace(/ \d{4}.*/, ''))}: ${ordinal(you.rank)} · ${you.nett} nett</b> <span>· ${lead === you ? (done ? 'you win the series' : 'you lead') : `${esc(lead.sail)} ${esc(lead.name)} ${done ? 'wins' : 'leads'} on ${lead.nett}`} · counts when you save it</span>`;
}
/**
 * A ghost to race against, when there's a run of this very race kept (replay/ghost.ts): your best (the fastest finish), this
 * run if it's another, or none. Sailing it again, the ghost sails its run beside you.
 */
function ghostPick(e: LogEntry, i: number): string {
  const gs = ghostsFor(setupKey(e.setup)); if (!gs.length) return '';
  const mm = (s?: number) => s == null ? '' : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;
  const what = (g: typeof gs[0]) => g.code ? 'not finished' : `${g.place != null ? ordinal(g.place) + ', ' : ''}${mm(g.elapsed)}`;
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
  const result = (e: LogEntry) => e.code === 'RET' ? 'Retired' : e.code === 'CXL' ? 'Cancelled (wind)' : e.code === 'unfinished' ? 'Not finished' : e.code === 'DSQ' ? 'Disqualified' : e.place != null ? `${ordinal(e.place)} of ${e.of}` : '';
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
  if (en.setup) Object.assign(S, { windTurn: 0 }, structuredClone(en.setup.s)); else { S.tideDate = en.day; S.tideTime = en.time; }
  replayPin = S.windDir ?? null; S.windDir = null;
  S.course = course; S.mode = 'race';
  const boat = S.boats.find(x => x.id === en.boatId); if (boat) { S.boat = boat; S.boatId = boat.id; crewFromClub(); }
  if (!S.boat.slip) S.raceFrom = 'water';
  { const ids = new Set(S.boats.map(x => x.id)); S.opponents = S.opponents.filter(o => o.startsWith('stock:') || isGeneric(o) || (!!S.realRace && isReal(o)) || (ids.has(o) && o !== S.boatId)); S.fleet = S.opponents.length; }
  saveSettings(S); boatSummary(); oppRows(); crewRows(); paintSeg();
  $('raceChoose').hidden = true;
  beginRace(en.setup?.seed);
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
  inp.addEventListener('change', () => { (a.set as (v: number | null) => void)(Number(inp.value)); saveSettings(S); setupChanged(() => { courseCard(); tideBox(); }); });
  document.querySelector<HTMLButtonElement>(`[data-real="${k}"]`)!.onclick = () => { (a.set as (v: number | null) => void)(null); saveSettings(S); setupChanged(() => { courseCard(); tideBox(); }); };
}

buildSetupChoices();
newGame(); paintSeg(); crewRows(); courseCard(); tideBox(); boatSummary(); oppRows();
requestAnimationFrame(frame);

// Dev-only handle for debugging and browser tests: window.sim() returns the current World.
if (import.meta.env.DEV) Object.assign(window, { __ghost: (pts: Ghost['pts'] | null) => { activeGhost = pts ? { at: 'dev', key: 'dev', pts } : null; view.setGhost(w, pts); } }); // (a ghost on any race, for checking how it's drawn)
if (import.meta.env.DEV) Object.assign(window, { sim: () => host.world, __w: () => w, __host: () => host, __hud: hud, __plan: planChart, __look: (yaw: number, pitch: number, chase?: number) => { setLook(yaw, pitch); if (chase) look.chase = chase; }, __over: over, __view: view, __twa: (a: number) => { showroomTwa = a; }, __nav: () => nav.trail });
