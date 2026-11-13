import { DrillTracker } from './drill';
import { FLEET, bow, stern, type Boat } from '../boat/boat';
import { HOVE, apparent, asternCoast, crewRig, moveBoat, settleTrim } from '../boat/physics';
import orc from '../boat/data/nordic-folkboat-orc.json';
import { HANDLING } from '../boat/dynamics';
import { defaultControls } from '../boat/controls';
import { D2R, KT, LOA, V, brg, clamp, cross, dist, dot, ZONE, markDist, markReach, n360, segPt, sub, wrap, type Vec } from '../core/math';
import { makeRng, type Rng } from '../core/rng';
import { OUTBOARDS } from '../boat/motor';
import { buildCourse, classifyLegs, type Course, type CourseFile, type CourseMark } from '../courses/course';
import { CURRENTS, currentAt, currentVector, windOnWater, type CurrentPreset } from '../environment/current';
import { CurrentField, nextSaturday, sfClock, sfLocalToUtcMin, stationsFor } from '../environment/tide';
import { FLAT_SEA, SeaField, type SeaHere } from '../environment/sea';
import { dayWeather, turnWeather, type DayWeather } from '../environment/weather';
import { Puffs, breezeAt, landLee, windAt, windTerrain, type Breeze, type Wind, type WindDay, type WindKind, type WindModel } from '../environment/wind';
import { ShiftField, shiftStats } from '../environment/shifts';
import { GUSTS, GustField, sigmaU } from '../environment/gusts';
import { SUBSTANTIAL_TURN, hailRange, obstructionAhead } from './obstruction';
import { SHORE, alongside, landAlong, onLand, shoreDist, shoreNearest, terrainNearest, wharfNearest } from '../geo/shore';
import { RECORD_EVERY_STEPS, RECORD_KEEP, TRACK_EVERY_STEPS, TRACK_FROM, snapshot, trackSnapshot, type Frame } from '../replay/recorder';
import { RULE16_WINDOW, assessPair, notRacing, type Incident, clearAstern, cpa, hullGap, newPairRecord, rightOfWay, type PairRecord, type RulesContext, type Verdict } from '../rules';
import { beatAngle, polar, runAngle } from '../boat/polar';
import { aimPoint, crabFor, sailable } from '../ai/ai';
import type { Settings } from '../settings';
import { aiThink, crewPoleCall } from '../ai/ai';
import { legacyKnobs } from '../ai/skipper';
import type { SimEvent } from './events';
import { Traffic, VESSEL, vesselHull, type Vessel } from './traffic';
import { lineTransit } from './transits';
import { SHIP_AIR, WindSum, addBoatWake, addCommitteeWake, addShipWake, type Shadow } from '../environment/shadows';
import { WAKE_PIERS, addPierWakes, withPierWakes } from '../environment/pierWakes';
import { destMark, place as getPlace } from './places';
import { berthClear, harborOf, hitsHarbor, inBasin, pushOffPlan, slipById, slipPlace, type Slip } from '../geo/marina';
import { ensignFor, sailNo } from '../boat/spec';
import { ensignDue } from '../boat/colours';
import { condition, stepJumpers } from '../boat/condition';
import { TUNE_PRESETS, fixTune, heikkilaFor, presetFor, type RigTune } from '../boat/rigTune';
import { outlookFor } from './outlook';
import { genericSpec, realSpec, genericTag, isGeneric } from '../boat/generic';

/** Map and label colours for your own boats when they race against you (the stock boats have their own). */
const OPP_TAGS = ['#c08cff', '#ff9f43', '#4dd8e8', '#ff7ab8', '#a3e05a', '#f2d24b', '#9fb4ff'];
const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
import { DEFAULT_CREW, DEFAULT_SKILL, newCrew, type CrewSpec } from '../boat/crewPhys';
import { newPilot, pilotStep, type Pilot } from '../boat/autopilot';
import { landAt } from '../environment/sea';
import { toLL } from '../geo/geo';
import { CANCEL_KT, FLAG_NAME, X_FLAG_MAX, cancelSignal, flagsAt, inTriangle, startSequence, type Flag, type PrepFlag, type Signal } from './signals';
import { RaceLog } from './debrief';

/** Fixed simulation step. Rendering runs at whatever rate the browser gives; the sim always steps at 60 Hz. */
export const DT = 1 / 60;
/** Two-turns penalty, in degrees of turning. */
export const TWO_TURNS = 720;

/** Start a penalty of `deg` degrees (360 = one turn, 720 = two). */
export function startPenalty(b: Boat, deg: number): void { b.penalty = b.penaltyTotal = deg; b.penaltyTurned = 0; b.penaltyDir = 0; }
/** Add `deg` degrees to a penalty she's already doing, or start one. */
export function addPenalty(b: Boat, deg: number): void { if (b.penalty > 0) { b.penalty += deg; b.penaltyTotal += deg; } else startPenalty(b, deg); }

/** One-Turn Penalty for touching a mark (Rules 31 and 44.1), degrees. */
export const ONE_TURN = 360;
/** Half the hull's width for mark contact, m (a Folkboat is 2.2 m wide, narrower toward the ends). */
const HULL_HALF_BEAM = 0.85;

/** A mark a boat could touch: where it is and how big its float is. A boat (the committee boat) is a line from `p`
 * to `q` with half-width `r`. `rule31`: touching it is a Rule 31 touch (otherwise it's just something solid). */
export interface Touchable { name: string; p: Vec; r: number; q?: Vec; rule31?: boolean }
/** Gap between a hull (bow to stern) and a mark or the committee boat's hull, m (before subtracting widths). */
function solidGap(bw: Vec, st: Vec, m: Touchable): number {
  if (!m.q) return segPt(m.p, bw, st);
  return Math.min(segPt(m.p, bw, st), segPt(m.q, bw, st), segPt(bw, m.p, m.q), segPt(st, m.p, m.q));
}
/**
 * Rule 44.1(a): a Part 2 breach and a rule 31 touch "in the same incident" need only the Part 2 penalty. "Incident" isn't
 * defined; US Sailing Appeal 65: "The test of whether two occurrences were one or two incidents is whether the second
 * occurrence was the inevitable result of the first. Times, distances, the actions of each boat and the prevailing
 * conditions are all relevant." The sim's sign of it: the touch came while she was still caught up in that foul, within
 * ENGAGED of the boat she fouled, or at the mark where the foul happened (the foul within ENGAGED of it), and within
 * TANGLE_MAX. A touch after she has sailed clear of both is a new incident however soon it comes.
 */
const ENGAGED = 2 * LOA;
/** Rule 44.1: a tangle after a foul (the boats still together, the turns not begun) counts as one incident for at most this long, s. */
const TANGLE_MAX = 30;

/** Rule 43.1(a), how soon: a helmsman's reaction and a turn's worth, s (the 1 s reaction of rule 16.1's RESPOND_DELAY
 * and about 2 s to turn: a modelling choice). */
const COMPELLED_WINDOW = 3;
/* Rule 43.1(a): "When as a consequence of breaking a rule a boat has compelled another boat to break a rule, the other
 * boat is exonerated for her breach." Causal: compelled when, by the time it was clear the other boat had broken a rule,
 * she could no longer avoid her own breach (US Appeals 2 and 19; WS Cases 3, 30, 51; Appeal 78 for a chain). The sim's
 * sign of it: the boat that broke a rule against her is still within ENGAGED of her when she breaks hers (she's still
 * dealing with that boat: swerving from her, or pushed by her), within COMPELLED_WINDOW. */

export interface StartReport { delay: number; frac: number; kt: number }

/** Where a boat was at the start signal. */
export interface GunSnap {
  d: number; // bow distance from the line, m (+ = over)
  frac: number; // position along the line, 0 = pin end, 1 = committee end
  v: number; // speed through the water, m/s
  target: number; // close-hauled target speed for that wind, m/s
  ocs: boolean;
  penalty: boolean; // doing penalty turns at the gun
}

export interface WorldOptions {
  /** Begin this many seconds before the start signal instead of at the warning signal (start practice). */
  startAt?: number;
  /** The start-line drill alone: no other boats, the line and course laid as for the fleet (its length is set for it). */
  solo?: boolean;
  /** Just sail: no race, no other boats, no start sequence. */
  freeSail?: boolean;
  /** Fly your flags even though it's a race (to see them while setting up your boat). */
  showFlags?: boolean;
  /** The race committee chose this course: its number (flown in numeral pennants) and why. */
  courseSignal?: { no: number; why: string };
}

/** Her middle and heading turned by `a` deg about a point on her centreline `pivot` m ahead of her middle (bow 3.8, stern −3.8). */
function swingAbout(c0: Vec, h0: number, pivot: number, a: number): { c: Vec; h: number } {
  const u0 = V(h0), P = { x: c0.x + u0.x * pivot, y: c0.y + u0.y * pivot }, u = V(h0 + a);
  return { c: { x: P.x - u.x * pivot, y: P.y - u.y * pivot }, h: h0 + a };
}
/** The shove the crew gives her as they step aboard, m/s: about a slow walk. From then on her own way carries her (physics.ts). */
export const SHOVE = 0.5;
/** How fast the crew walks her back by hand, m/s; and the slowest they swing her round about her bow, deg/s, in no wind. */
const WALK = 0.45, CREW_TURN = 2;
/**
 * The water's resistance to her swinging about her bow, N·m per (rad/s)²: her keel and hull broadside to the water,
 * ½·ρ·Cd·∫r³dA along her length (the lateral area spread evenly over it: A·L³/4). About 1×10⁵: at 3°/s about 300 N·m.
 */
const SWING_DRAG = 0.5 * 1025 * HOVE.crossCd * HOVE.latArea * orc.boat.imsL ** 3 / 4;
/** How fast the wind on her side swings her about her bow, deg/s: its turning force (side windage, acting at her middle, 3.8 m from the bow) against the water's. */
function windSwing(kt: number, rel: number): number {
  const vSide = kt * KT * Math.sin(rel * D2R), torque = 0.5 * 1.225 * HOVE.windSide * vSide * vSide * 3.8;
  return Math.sqrt(torque / SWING_DRAG) / D2R;
}

/** Racing from her slip: how long before the warning signal she's in it, s (time to push off, get out of the harbor and sail to the line). */
export function slipLeadTime(slip: Slip, line: Vec): number {
  const d = Math.hypot(line.x - slip.p.x, line.y - slip.p.y) * 1.4 + 250; // not a straight line: the fairways, the entrance, tacking
  return Math.min(120, Math.max(15, Math.ceil((d / 1.8 / 60 + 8) / 5) * 5)) * 60; // at about 3.5 kt, plus pushing off and getting the sails up (up to two hours: from South Beach or Tiburon it's 5–7 km)
}

/**
 * How good each club boat's (generic AI) crew is, 0 novice … 1 expert (boat/crewPhys.ts): where they put their weight,
 * how quickly and how well they work the boat. Until the Yacht Club has crews of its own, a spread like a club fleet's.
 * Your own saved boats raced against you have a club-level crew.
 */
const AI_CREW_SKILL: Record<string, number> = { Red: 0.75, Blue: 0.6, Green: 0.5, Black: 0.85, Varnish: 0.45 };
function aiCrew(name: string, who = name): CrewSpec {
  const skill = AI_CREW_SKILL[name] ?? DEFAULT_SKILL;
  // real people, not three of the same: heights across about the adult range (1.60–1.92 m: US adults average about
  // 1.75 m for men and 1.62 m for women, CDC NHANES) and builds from slight to solid (about BMI 21–28; estimates), from
  // the boat's name so a crew is the same race to race. Their weights are scaled so each boat carries the standard
  // crew's total (230 kg): the same weight aboard; a taller crew reaches slightly further out (about ±1% of the
  // righting moment, inside the speed target's rounding)
  let h = 2166136261; for (const ch of who) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => { h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h ^= h >>> 12; return (h >>> 0) / 4294967296; };
  const ppl = [DEFAULT_CREW.helm, ...DEFAULT_CREW.crew].map(() => { const ht = 1.6 + 0.32 * (rnd() + rnd()) / 2; return { h: Math.round(ht * 100) / 100, w: (21 + 7 * rnd()) * ht * ht }; });
  const total = [DEFAULT_CREW.helm, ...DEFAULT_CREW.crew].reduce((a, p) => a + p.w, 0), k = total / ppl.reduce((a, p) => a + p.w, 0);
  const [helm, ...crew] = ppl.map(p => ({ h: p.h, w: Math.round(p.w * k * 10) / 10, skill }));
  return { helm, crew };
}

/** Your crew from the settings (0–2 crew besides you at the helm). */
function userCrew(s: Settings): CrewSpec {
  const c = s.crew ?? { n: 2, helm: DEFAULT_CREW.helm, people: DEFAULT_CREW.crew };
  return { helm: c.helm, crew: c.people.slice(0, c.n) };
}

const pairKey = (A: Boat, B: Boat) => A.id < B.id ? A.id + '-' + B.id : B.id + '-' + A.id;

/** The settings the conditions panel sets: what applyConditions takes mid-sail (windDir, a replay's legacy pin, isn't one: it stays the sail's). */
export const CONDITION_KEYS = ['windKt', 'windKind', 'windTurn', 'windDay', 'chop', 'swellHs', 'swellDay', 'sea', 'current', 'rain', 'fog', 'traffic'] as const;

/** How often (steps) an AI boat thinks: 3 steps, 20 times a second (and every step in close quarters). */
export const AI_EVERY = 3;
/** Close quarters (m): four of her lengths (LOA 7.64 m), a length beyond the zone's three (RRS Definitions, Zone). */
export const CLOSE_M = 4 * LOA;

export class World {
  readonly C: Course;
  settings: Settings;
  readonly seed: number;
  readonly rng: Rng;
  /** The current near the start line, summarized (direction, speed, words). Updated as the tide changes. */
  cur: CurrentPreset;
  cvec: Vec; // current near the start line, m/s
  /** Real tide: NOAA-based current field, and the start signal's time (minutes since epoch, UTC). */
  tide: CurrentField | null = null;
  gunUtc: number = 0;
  /** Race day (YYYY-MM-DD, San Francisco) and whether the clock time matters (real tide or sea breeze). */
  raceDate: string = '';
  realTime: boolean = false;
  /** The afternoon westerly from the NOAA records (Settings.windKt 0), and which kind of day. */
  seaBreeze: boolean;
  windDay: WindDay;
  /** The kind of wind the day brings: the westerly, a northerly, a southerly, or light and variable. */
  windKind: WindKind;
  /** The day's weather: observed, forecast, or from the records (environment/weather.ts). */
  weather: DayWeather;
  /** Racing in the real day's wind (observed or forecast). */
  get realWind(): boolean { return this.weather.source === 'observed' || this.weather.source === 'forecast'; }
  breeze: Breeze | null = null;
  /** Puffs and lulls drifting across the course. */
  puffs: Puffs;
  windModel: WindModel;
  /** Ship traffic, and where the vessels are now. */
  traffic: Traffic;
  vessels: Vessel[] = [];
  private warned = new Map<number, number>();
  /** The waves: chop from the wind and current, swell through the Gate (or flat water). */
  sea: SeaField;

  t: number; // race time, s; negative before the start signal
  steps = 0;
  running = false;
  paused = false;
  speed = 1;
  wind: Wind = { from: 0, kt: 0 };
  avgFrom: number; // ~1 min running mean of the wind direction, for lift/header calls
  boats: Boat[] = [];
  pairs: Record<string, PairRecord> = {};
  rec: Frame[] = [];
  /** The tack and gybe drill (sim/drill.ts): your manoeuvres scored, in that mode only. */
  readonly drill: DrillTracker | null;
  /** Racing: the whole race once a second (the race replay), from just before the gun. */
  track: Frame[] = [];
  horns: Record<number, boolean> = {};
  startReport: StartReport | null = null;
  fouls = 0;
  fouledBy = 0;
  finishShown = false;
  /** This outing's gone into the boats' logbooks (boat/logbook.ts). */
  logged = false;
  userFinishT: number | null = null;
  groundToast = { t: -99 };
  events: SimEvent[] = [];
  /** When each boat last broke a Part 2 rule, and last touched a mark (Rule 44.1(a)); who last fouled each boat (Rule 43.1(a)). */
  private lastFoul = new Map<number, { t: number; x: number; y: number; vs: number }>();
  /** Rule 44.1: each boat's last penalized foul, against whom, and whether she has since been clear of that boat. */
  private lastFoulVs = new Map<number, { vs: number; t: number; clear: boolean }>();
  private lastTouch = new Map<number, { t: number; near: number[] }>(); // (the boats within ENGAGED of her as she touched)
  private fouledAt = new Map<number, { by: number; t: number }>();
  /** Recent headings per boat, one every 0.1 s, oldest first (for Rule 16.1). */
  private hHist: number[][] = [];

  /** The starting signals, the flags flying now, and the X flag (individual recall). */
  readonly sequence: Signal[];
  readonly prepFlag: PrepFlag;
  flags: Flag[] = [];
  /** Racing called off for the wind (signals.ts CANCEL_KT): when, the wind then, and the signal flying. */
  cancelled: { t: number; kt: number; up: Flag[]; say: string } | null = null;
  /** The wind the committee reads over the course, over about two minutes (kt). */
  private cbMean: number | null = null;
  private cbWin: number[] = [];
  private xUntil = -Infinity;
  /** Every boat at the start signal (null until the gun). */
  gun: { windFrom: number; boats: GunSnap[] } | null = null;
  /** Race time each boat started (crossed the line properly), or null. */
  startTimes: (number | null)[] = [];
  readonly startAt: number;
  readonly freeSail: boolean;
  private showFlags = false;
  /** Just sail: where you're heading (a mark in all but name: the dials measure to it), or null. */
  dest: CourseMark | null = null;
  /** Your tiller pilot (cruising only: RRS 52 says a racing boat's rudder is worked by the crew's own power). */
  readonly pilot: Pilot = newPilot();
  /** The course number the committee is flying (numeral pennants), and why they chose it; null when you chose it. */
  courseSignal: { no: number; why: string } | null = null;
  /** Racing: the tactics debrief's log of your race (null when just sailing). */
  log: RaceLog | null = null;
  /** Your boat's slip in her home marina (geo/marina.ts), if she has one. */
  homeSlip: Slip | null = null;
  /** Just sail: when you got there (sim time), or null. */
  arrivedT: number | null = null;
  /** You start in her slip (Cruise, or Race with time to sail out to the line). */
  readonly fromSlip: boolean = false;
  /** How far you've sailed, over the ground, m. */
  sailedM = 0;

  /** (kept to work out new conditions mid-sail: applyConditions) */
  private readonly file: CourseFile;
  private readonly opts: WorldOptions;

  constructor(file: CourseFile, settings: Settings, seed: number, opts: WorldOptions = {}) {
    this.file = file; this.opts = opts;
    this.settings = { ...settings };
    this.seed = seed;
    this.rng = makeRng(seed);
    this.motorRng = makeRng((seed ^ 0x6d6f74) >>> 0); // (her motor's pulls: its own draws, so the race's are as they were)
    // the race day and clock, and the kind of wind the day brings (from the records for the month, or as chosen)
    this.raceDate = settings.tideDate || nextSaturday();
    this.gunUtc = sfLocalToUtcMin(this.raceDate, settings.tideTime || '12:00');
    this.windDay = settings.windDay ?? 1;
    // the real day (observed, or the forecast), or a day from the records, or the kind you chose
    this.weather = turnWeather(dayWeather(this.raceDate, settings.windKind ?? 'auto', this.windDay), settings.windTurn ?? 0);
    this.windKind = this.weather.kind;
    const atGun = this.weather.at(this.gunUtc);
    // a westerly at a set strength (not a real day) blows from the course's own westerly (as it runs over the race area)
    if (settings.windKt !== 0 && this.windKind === 'west' && !this.realWind) { atGun.from = n360(file.windBase + (settings.windTurn ?? 0)); atGun.steady = 1; atGun.gust = 1.5; }
    if (settings.windDir != null) atGun.from = settings.windDir; // (an older replay's pinned direction)
    // the course for the day's wind: a laid course is set to it; fixed marks stay put, and its legs are whatever the wind makes them
    this.C = buildCourse(file, { bias: settings.bias, fleet: settings.fleet, windFrom: atGun.from });
    this.cur = { ...(CURRENTS[settings.current] ?? CURRENTS.slack) };
    this.cvec = currentVector(this.cur);
    this.freeSail = !!opts.freeSail; this.showFlags = !!opts.showFlags;
    this.drill = settings.mode === 'manoeuvres' ? new DrillTracker() : null;
    this.courseSignal = this.freeSail ? null : opts.courseSignal ?? null;
    this.homeSlip = slipById(settings.boat?.slip);
    // racing from her slip: the clock starts long enough before the warning signal to sail out to the line
    this.fromSlip = !!this.homeSlip && (this.freeSail ? settings.sailFrom === 'slip' : opts.startAt == null && settings.raceFrom === 'slip');
    this.startAt = this.freeSail ? 0 : opts.startAt ?? settings.seq * 60 + (this.fromSlip ? slipLeadTime(this.homeSlip!, buildCourse(file, { bias: settings.bias, fleet: settings.fleet, windFrom: file.windBase }).center) : 0);
    this.t = -this.startAt;
    this.prepFlag = settings.prepFlag ?? 'P';
    this.sequence = this.freeSail ? [] : startSequence(settings.seq, this.prepFlag);
    this.flags = flagsAt(this.sequence, this.t);
    this.seaBreeze = settings.windKt === 0;
    this.realTime = settings.current === 'real' || this.seaBreeze;
    // the race day and clock: they drive the real tide and westerly, and always the sun
    this.traffic = new Traffic(settings.traffic !== 0, seed);
    { // the sea: the day's swell (or the adjuster's), and its chop × the adjuster's
      const sw = this.weather.swell(settings.swellDay ?? 1);
      this.sea = new SeaField(settings.sea === 'flat' ? null : settings.swellHs != null ? { ...sw, hs: settings.swellHs, total: undefined } : sw, settings.chop ?? 1);
      this.sea.duration = this.seaDurationAt(this.clockUtc);
    }
    if (settings.current === 'real') {
      this.tide = new CurrentField(stationsFor(this.gunUtc - this.startAt / 60 - 30, this.gunUtc + 6 * 60));
      this.updateTide();
    }
    const r = this.rng;
    this.windModel = { base: this.C.base, kt: settings.windKt || 12, phase: [r() * 6.28, r() * 6.28, r() * 6.28], steady: atGun.steady };
    // cruising: from a place on the water or her slip in her marina, to another place or back to her slip
    if (this.freeSail) this.dest = settings.sailTo === 'slip' && this.homeSlip ? { ...destMark({ id: 'slip', name: `Her slip, ${slipPlace(this.homeSlip)}`, group: 'Spots', p: this.homeSlip.p })!, key: 'slip' } : destMark(getPlace(settings.sailTo));
    { // the puffs: over the race area, or for just sailing, over the water between where you start and where you're going
      const from = (settings.sailFrom === 'slip' ? this.homeSlip?.p : null) ?? getPlace(settings.sailFrom)?.p ?? this.C.center, to = this.dest?.p ?? from;
      const c = this.freeSail ? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } : this.C.center;
      const half = this.freeSail ? Math.max(3000, dist(from, to) / 2 + 1500) : 3000;
      this.puffs = new Puffs(makeRng((seed ^ 0x5eed5) >>> 0), c, half, Math.round(170 * (half / 3000) ** 2));
      this.fieldArea = { c, half: half + 600 };
    }
    this.updateBreeze();
    // the wind's shifts: on a past day, the record's own; otherwise a field with Fort Point's statistics for this kind of
    // day and strength, carried down the course with the wind (environment/shifts.ts; its own random numbers, so the
    // rest of the race draws what it did)
    this.windModel.shifted = true;
    if (this.weather.source !== 'observed') this.shifts = new ShiftField(makeRng((seed ^ 0x5517f7) >>> 0), this.windModel.base, this.windModel.kt * KT, this.fieldArea.c, shiftStats(this.windKind, this.windModel.kt));
    this.gusts = new GustField(makeRng((seed ^ 0x6a57) >>> 0), this.windModel.base, this.windModel.kt * KT);
    this.courseWind();
    this.buildField();
    this.avgFrom = this.windModel.base;
    for (let i = 0; i <= (this.freeSail || opts.solo ? 0 : settings.fleet); i++) this.boats.push(this.makeBoat(i)); // (Setup keeps fleet = opponents.length)
    this.startTimes = this.boats.map(() => null);
    // the sea she's in from the first frame (step() works it out twice a second after that)
    for (const b of this.boats) { b.cur = this.currentAt(b, true); b.leeK = landLee(b, this.wind.from); b.sea = this.sea.at(b, windOnWater(this.seaWind(b, b.leeK), b.cur), b.cur, q => this.currentAt(q)); }
    // her sheets trimmed for her heading from the first frame (physics.ts settleTrim); a boat in her berth has no sails up
    // (in her own wind, current and puffs included, as the first step will have it: not the course's wind)
    for (const b of this.boats) if (!b.docked && !b.handled) { b.ww = windOnWater(this.windHere(b, b), b.cur); settleTrim(b, b.ww.from, b.ww.kt); }
    if (!this.freeSail) this.tuneAtDock();
    if (!this.freeSail) this.log = new RaceLog(this);
    this.committeeFrom = this.C.base;
  }

  /** The wind the forecast gives for the race (kt): the course-wide breeze over the first hour from the gun (outlook.ts). */
  forecastKt = 0;
  /**
   * Racing, each boat's rig is tuned at the dock for the forecast, and stays so: the forestay, the shrouds and the mast's
   * foot can't be touched while racing (NFIA Class Rules 7.40, 12.10, 6.1.5). A boat set up in the Boat panel keeps her
   * own tune. With none, you're set to North Sails' setting for the forecast (rigTune.ts presetFor); the club boats
   * mostly are too, a few on Heikkilä Sailmaker's tune for the day and a few on the setting next to the right one (a crew
   * that read the forecast differently). Their own random draw, so the race's other draws (and replays) don't move.
   */
  private tuneAtDock(): void {
    const o = outlookFor(this);
    let n = 0, sum = 0; for (let m = 0; m <= 60; m += 10) { sum += o.breeze(this.gunUtc + m).kt; n++; }
    const kt = this.forecastKt = sum / n, right = presetFor(kt);
    const r = makeRng((this.seed ^ 0x71a3e) >>> 0), order = ['light', 'medium', 'strong'] as const;
    for (const b of this.boats) {
      if (b.tune) continue;
      let t: RigTune = TUNE_PRESETS[right];
      if (!b.isUser) {
        const x = r(), i = order.indexOf(right);
        if (x > 0.85) t = heikkilaFor(kt);
        else if (x > 0.7) t = TUNE_PRESETS[order[i === 0 ? 1 : i === 2 ? 1 : (r() < 0.5 ? 0 : 2)]];
      }
      b.tune = { ...t };
    }
  }

  get user(): Boat { return this.boats[0]; }
  get center(): Vec { return this.C.center; }
  get L(): Vec { return this.C.L; }
  get N(): Vec { return this.C.N; }
  get lineLen(): number { return this.C.lineLen; }
  get committee(): Vec { return this.C.committee; }
  get pin(): Vec { return this.C.pin; }

  private emit = (e: SimEvent) => { this.events.push(e); };
  drainEvents(): SimEvent[] { const e = this.events; this.events = []; return e; }

  private makeBoat(i: number): Boat {
    const isUser = i === 0, r = this.rng;
    // an opponent: a stock club boat, or one of your own saved boats (her looks and her condition), sailed by the AI
    const pick = isUser ? null : this.settings.opponents?.[i - 1] ?? `stock:${i}`;
    // (a generic club Folkboat, boat/generic.ts: her sail number clear of your boats')
    const oppSpec = pick && !pick.startsWith('stock:') ? genericSpec(pick, (this.settings.boats ?? []).map(b => b.sails.number)) ?? realSpec(pick) ?? this.settings.boats?.find(b => b.id === pick) : undefined;
    const F = isUser ? FLEET[0] : FLEET[pick && pick.startsWith('stock:') ? +pick.slice(6) : 0] ?? FLEET[((i - 1) % 5) + 1];
    const place = (d: number, a: number) => ({ x: this.center.x - this.N.x * d + this.L.x * a, y: this.center.y - this.N.y * d + this.L.y * a });
    const lineH = brg(this.L.x, this.L.y);
    let p: Vec, h: number, startStill = false, docked: Boat['docked'];
    if (isUser && this.fromSlip) {
      // in her slip, bow in (boats nose in here, never back in), made fast: push off to leave
      const slip = this.homeSlip!; p = { ...slip.p }; h = slip.heading; startStill = true;
      docked = { slip: slip.id };
    } else if (isUser && this.freeSail) {
      // where you chose to start, on a beam reach (close-hauled for the drill): whichever way has more open water ahead
      const at = getPlace(this.settings.sailFrom)?.p;
      if (at) {
        p = { ...at };
        const room = (hh: number) => { const u = V(hh); let d = 0; while (d < 600 && !onLand({ x: p.x + u.x * (d + 20), y: p.y + u.y * (d + 20) })) d += 20; return d; };
        // (the tack and gybe drill: close-hauled, ready to tack)
        const off = this.settings.mode === 'manoeuvres' ? 45 : 90, a = n360(this.windModel.base + off), b = n360(this.windModel.base - off);
        h = room(a) >= room(b) ? a : b;
      } else {
        p = place(-220, 0); h = n360(lineH + 180);
        for (let k = 0; onLand(p) && k < 20; k++) p = place(-220 - 40 * k, 0);
      }
    } else if (isUser && this.startAt < 120) {
      // start practice: somewhere below the line, reaching along it, with a minute or so to go
      p = place(55 + r() * 45, (r() - 0.5) * this.lineLen * 0.6); h = n360(lineH + (r() < 0.5 ? 0 : 180));
    } else if (isUser && this.settings.mode === 'drill') {
      // the start-line drill from 2 or 3 minutes: farther below the line, as far as a minute's run and some to spare
      // (about 150–230 m), reaching along it; moved in toward the line where that would be ashore (the Cityfront)
      let d = 60 + this.startAt * 0.7 + r() * 40; const a = (r() - 0.5) * this.lineLen * 0.6;
      p = place(d, a);
      while (onLand(p) && d > 60) { d -= 20; p = place(d, a); }
      if (onLand(p)) p = place(100, -this.lineLen * 0.1); // (as a race's start, if even that's ashore)
      h = n360(lineH + (r() < 0.5 ? 0 : 180));
    } else if (isUser) { p = place(100, -this.lineLen * 0.1); h = n360(lineH + 180); }
    else {
      let tries = 0;
      // somewhere below the line, not on land and not on top of another boat
      const crowded = (q: Vec) => this.boats.some(o => dist(o, q) < 20);
      do { p = place(70 + r() * 60, (r() - 0.5) * this.lineLen * 0.8); tries++; } while ((onLand(p) || crowded(p)) && tries < 40);
      h = n360(lineH + (r() < 0.5 ? 0 : 180));
    }
    const spec = isUser ? this.settings.boat : oppSpec; // your boat as you've set her up (or a rival you've set up)
    return {
      id: i, isUser, name: spec && !isUser ? titleCase(spec.name) || `Boat ${i}` : F.name, no: spec ? sailNo(spec) : F.no, color: spec && !isUser ? (isGeneric(spec.id) ? genericTag(spec.id) : OPP_TAGS[(i - 1) % OPP_TAGS.length]) : F.tag,
      hullColor: spec ? spec.hull.upper : F.hull, sailColor: spec ? (spec.sails.color === 'black' ? '#232427' : '#fbfaf5') : F.sail,
      build: spec ? { hull: spec.hull.material, spars: spec.perf.mast, boom: spec.perf.boom } : F.build,
      ...(spec ? { spec, cond: condition(spec, +this.raceDate.slice(5, 7) || 9), paint: { numberColor: spec.sails.numberColor, insigniaColor: spec.sails.insigniaColor, deck: spec.deck, boot: spec.hull.stripe, bottom: spec.hull.lower, boatName: spec.name, cabinTop: spec.cabinTop, poleSide: spec.poleSide, navLights: spec.navLights, hatch: spec.hatch, companionway: spec.companionway, nameColor: spec.nameColor } } : { paint: F.paint }),
      ...(spec?.perf.tune ? { tune: fixTune(spec.perf.tune) } : {}), // (her own tune, from the Boat panel)
      x: p.x, y: p.y, h, docked, ...(docked ? { rig: { main: 0, jib: 0, mainUp: false, jibUp: false } } : {}), v: startStill ? 0 : isUser && this.startAt < 120 ? 2 : 1.5, vx: 0, vy: 0, tack: 'S', tacking: false, lastTackT: -999,
      steer: 0, tiller: 0, turnTarget: null, turnDir: 0, luff: false, desired: h,
      penalty: 0, penaltyTotal: 0, penaltyTurned: 0, penaltyDir: 0, started: false, ocs: false, leg: 0, finished: false, finishT: null,
      prevD: null, prevAng: null, prevPass: null, nearMin: 1e9, forced14: null, markTouch: null,
      cur: { x: 0, y: 0 }, ww: { from: this.wind.from, kt: this.wind.kt }, rel: 0, twa: 90, awa: 90, arel: 90, aws: 0, sheets: { main: 30, jib: 30 }, manualTrim: isUser && !!this.settings.manualTrim, sheetCmd: { main: 0, jib: 0 }, trimAll: isUser && this.settings.manualTrim === 2, ctl: defaultControls(), ctlCmd: {}, shape: { main: { depth: 0.12, draft: 0.45, twist: 10 }, jib: null, eff: 1 }, trim: { main: { eff: 1, err: 0, flow: 'good', amount: 0 }, jib: { eff: 1, err: 0, flow: 'good', amount: 0 } }, awaSlow: 90, poleWant: false, poleMine: isUser && this.settings.manualTrim === 2, pole: 'down', poleT: 0, poleTack: 'S',
      heel: 0, boom: 0, jib: 0, sea: FLAT_SEA, crew: newCrew(isUser ? userCrew(this.settings) : aiCrew(spec ? '' : F.name, spec?.name ?? F.name), 'S'),
      // flags come down for a race: they fly when you're just sailing. Her club's burgee and her country's ensign
      // (officers' flags will go with skippers, in the Yacht Club)
      ...(spec && (this.freeSail || this.showFlags) ? { burgee: spec.club || undefined, ensign: ensignFor(spec.sails.country), ensignNight: !ensignDue(this.clockUtc, inBasin(p), false) } : {}),
      // her outboard, if it's on its transom bracket: tilted up, stopped (boat/motor.ts)
      ...(isUser && spec?.perf.outboard === 'bracket' ? { motor: { hp: spec.perf.outboardHp ?? 3.5, down: false, running: false, gear: 'N' as const, throttle: 0 } } : {}),
      ai: isUser ? null : (() => {
        // (her dice, drawn in this order: the same races come out of the same seeds)
        const wp = r() < 0.5 ? 0 : 1, f = 0.12 + 0.76 * r(), depth = 55 + r() * 45, aggr = r() * 6, width = 110 + r() * 130, aware = r() < 0.7;
        return {
          mode: 'hold' as const, wp: wp as 0 | 1, f, depth, aggr, width, aware, kn: legacyKnobs(aware), clearing: false, plan: { leave: NaN, tReach: Infinity, coast: 0, back: false }, turnCommit: 0, commitFor: 0, duckUntil: -Infinity, lastHail: -Infinity
        };
      })()
    };
  }

  /* ---------- queries used by AI, HUD and rendering ---------- */
  rulesCtx(): RulesContext { return { t: this.t, windFrom: this.wind.from, marks: this.C.marks, beat: beatAngle(this.wind.kt), obstacle: this.obstacle, fleet: this.boats, keepsClearOf: this.keepsClearOf }; }
  /** Who keeps clear of whom this step (for a boat as an obstruction: Definitions, Obstruction), memoised per step. */
  private kcMemo = { t: NaN, m: new Map<string, number>() };
  private keepsClearOf = (a: { id: number }, c: { id: number }): boolean => {
    if (this.kcMemo.t !== this.t) this.kcMemo = { t: this.t, m: new Map() };
    const A = this.boats.find(b => b.id === a.id), C = this.boats.find(b => b.id === c.id);
    if (!A || !C) return false;
    const key = pairKey(A, C);
    let kc = this.kcMemo.m.get(key);
    if (kc === undefined) {
      const ctx: RulesContext = { t: this.t, windFrom: this.wind.from, marks: this.C.marks, beat: beatAngle(this.wind.kt) };
      // only who is "required to keep clear" (rules 10–13, 21), not who owes room or mark-room: no pair record
      kc = rightOfWay(A, C, ctx, null).kc.id; this.kcMemo.m.set(key, kc);
    }
    return kc === A.id;
  };
  /** The wind the committee boat lies head to, at anchor: the course's at the gun, the new one after a change of conditions. */
  committeeFrom = 0;
  /** The committee boat's hull, as a line along the wind with its half-width (null if the committee end is not a boat). */
  get committeeHull(): Touchable | null {
    if (this.C.committeeKind !== 'boat') return null;
    const u = V(this.committeeFrom), c = this.C.committee;
    return { name: 'the committee boat', p: { x: c.x + u.x * 6, y: c.y + u.y * 6 }, q: { x: c.x - u.x * 6, y: c.y - u.y * 6 }, r: 2 };
  }
  /** Rule 19: the nearest obstruction (the shore, the islands and the Marin shore, the Wharf's piers and breakwaters; after the start, the committee boat) within 30 m. */
  private obstacle = (p: Vec, committee: boolean): { d: number; n: Vec; continuing: boolean } | null => {
    let best: { d: number; n: Vec; continuing: boolean } | null = null;
    const sn = shoreNearest(p), ds = sn.d;
    if (ds < 30) {
      const e = 0.5, gx = shoreDist({ x: p.x + e, y: p.y }) - shoreDist({ x: p.x - e, y: p.y }), gy = shoreDist({ x: p.x, y: p.y + e }) - shoreDist({ x: p.x, y: p.y - e });
      const l = Math.hypot(gx, gy) || 1, n = { x: gx / l, y: gy / l };
      // continuing if she'd pass alongside it for three hull lengths (a long shore, a pier's side; not a pier head)
      const q = { x: p.x - n.x * ds, y: p.y - n.y * ds };
      best = { d: ds, n, continuing: alongside(SHORE, false, sn.k, q, n) >= 3 * LOA };
    }
    // beyond the Cityfront (Alcatraz, Angel Island, the Marin shore, Treasure Island): the terrain's shore, in 50 m
    // cells, so any stretch of it she passes is more than three of her lengths (Definitions, Continuing Obstruction)
    const tn = terrainNearest(p, 30);
    if (tn && (!best || tn.d < best.d)) best = { d: tn.d, n: tn.n, continuing: true };
    // the Wharf's piers, breakwaters and docks: along a side, a continuing obstruction; at a pier head, not
    const wf = wharfNearest(p, 30);
    if (wf && (!best || wf.d < best.d)) best = { d: wf.d, n: wf.n, continuing: wf.along >= 3 * LOA };
    const cb = committee ? this.committeeHull : null;
    if (cb) {
      const d = segPt(p, cb.p, cb.q!) - cb.r;
      if (d < 30 && (!best || d < best.d)) {
        const ax = cb.q!.x - cb.p.x, ay = cb.q!.y - cb.p.y, k = Math.max(0, Math.min(1, ((p.x - cb.p.x) * ax + (p.y - cb.p.y) * ay) / (ax * ax + ay * ay)));
        const dx = p.x - (cb.p.x + ax * k), dy = p.y - (cb.p.y + ay * k), l = Math.hypot(dx, dy) || 1;
        best = { d, n: { x: dx / l, y: dy / l }, continuing: false };
      }
    }
    return best;
  };
  rights(A: Boat, B: Boat): Verdict<Boat> { return rightOfWay(A, B, this.rulesCtx(), this.pairs[pairKey(A, B)]); }
  pairRecord(A: Boat, B: Boat): PairRecord | undefined { return this.pairs[pairKey(A, B)]; }
  /** Signed distance of a point from the line; positive on the course side. */
  lineD(p: Vec): number { return (p.x - this.center.x) * this.N.x + (p.y - this.center.y) * this.N.y; }
  /** Position along the line from its centre; positive toward the committee end. */
  lineA(p: Vec): number { return (p.x - this.center.x) * this.L.x + (p.y - this.center.y) * this.L.y; }
  /** Sailing free: a cruise, or a race she's retired from (she's no longer racing: her own destination, and the tiller pilot). */
  get cruising(): boolean { return this.freeSail || !!this.user?.retired; }
  nextMark(b: Boat): CourseMark | null { return this.freeSail || (b.isUser && b.retired) ? (b.isUser && this.arrivedT == null ? this.dest : null) : b.leg < this.C.marks.length ? this.C.marks[b.leg] : null; }
  /** Mid-race, the start/finish line is an obstruction for this boat. */
  obstructed(b: Boat): boolean { return this.C.obstruction && this.t > 0 && !b.retired && b.started && b.leg >= 1 && b.leg < this.C.marks.length; }
  /** The current at p (m/s): the tide's (or the chosen preset's), eased near the shore, with the bridges' piers' wakes in it. */
  currentAt(p: Vec, lattice = false): Vec {
    return withPierWakes(p, this.streamAt(p, lattice), this.pierFlows(), this.t);
  }
  /** (`lattice`: the shore's distance off its 10 m lattice, geo/shore.ts anyShoreDistNear: only for a boat's own current,
   * every step, where the same places come up again and again; the sea map, the chart and the arrows, which sample the
   * whole area once, keep the exact distance, or they'd fill a tile for every look) */
  private streamAt(p: Vec, lattice: boolean): Vec { return this.tide ? this.tide.atShore(p, lattice) : currentAt(p, this.cvec, lattice); }
  /**
   * The stream meeting each pier, refreshed every half minute (the tide turns over hours): the open water's (the
   * stations' current there, or the preset), not eased by the shore relief, which would read the pier itself as shore.
   */
  private flowsT = NaN; private flows: Vec[] = [];
  private pierFlows(): Vec[] {
    if (!(Math.abs(this.t - this.flowsT) < 30) || (!this.tide && this.flowsC !== this.cvec)) {
      this.flowsT = this.t; this.flowsC = this.cvec; this.flows = WAKE_PIERS.map(w => this.tide ? this.tide.at(w.c) : this.cvec);
    }
    return this.flows;
  }
  private flowsC: Vec | null = null;
  /**
   * The true wind at a point: the course-wide wind (with its oscillating shifts), stronger in the slot and
   * lighter near the shore, plus whatever puff or lull is passing.
   */
  windHere(p: Vec, self?: Boat, gusts = true): Wind {
    const q = this.puffs.at(p), sh = this.shadowAt(p, self);
    if (self) self.shadowK = sh.k;
    const f = this.fieldAt(p, !!self); // (a boat's own wind: the shore's distance off the lattice, as for her current)
    // (the shifts here against the course's centre: the boat to windward has the header first)
    const s = this.shifts ? this.shifts.at(p) : null, turn = s ? s.turn - this.shiftRef.turn : 0, sk = s ? s.k / this.shiftRef.k : 1;
    // and the gusts, the turbulence of the seconds-to-a-minute, sized for the wind here (environment/gusts.ts)
    const kt = this.wind.kt * f.k * q.k * sh.k * sk, U = kt * KT, g = gusts ? this.gusts.at(p) : { u: 0, v: 0 }, sg = sigmaU(U);
    const gu = Math.max(-0.9 * U, g.u * sg), gt = Math.atan2(g.v * GUSTS.vOverU * sg, Math.max(0.3, U + gu)) / D2R;
    return { from: n360(this.wind.from + f.turn + q.veer + sh.shift + turn + gt), kt: (U + gu) / KT };
  }
  /** The gusts (environment/gusts.ts): their own random numbers, so the rest of the race draws what it did. */
  gusts: GustField;
  /** The wind's shifts (environment/shifts.ts), off on a past day (the record has its own). */
  shifts: ShiftField | null = null;
  /** The shift at the course's centre now, which the course-wide wind carries. */
  private shiftRef = { turn: 0, k: 1 };
  /** The course-wide wind now: the day's mean, with the shift at the course's centre. */
  private courseWind(): void {
    const w = windAt(this.windModel, this.t);
    if (this.shifts) { this.shiftRef = this.shifts.at(this.fieldArea.c); w.from = n360(w.from + this.shiftRef.turn); w.kt *= this.shiftRef.k; }
    this.wind = w;
  }

  /* ---------- the wind across the course (environment/weather.ts), cached on a grid ---------- */
  private fieldArea: { c: Vec; half: number } = { c: { x: 0, y: 0 }, half: 3600 };
  private field: { x0: number; y0: number; step: number; n: number; k: Float32Array; turn: Float32Array; extra: Float32Array } | null = null;
  /** Work out the wind across the course for now (every 30 s of race time). */
  private buildField(): void {
    const { c, half } = this.fieldArea, step = Math.max(250, 2 * half / 40), n = Math.ceil(2 * half / step) + 1;
    const x0 = c.x - half, y0 = c.y - half, k = new Float32Array(n * n), turn = new Float32Array(n * n), extra = new Float32Array(n * n);
    const t = this.clockUtc, from = this.wind.from;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const p = { x: x0 + i * step, y: y0 + j * step }, f = this.weather.field(p, t, from), idx = j * n + i;
      k[idx] = f.k; turn[idx] = f.turn; extra[idx] = f.k / Math.max(0.05, windTerrain(p, from));
    }
    this.field = { x0, y0, step, n, k, turn, extra };
    let sum = 0, cnt = 0; // the average over the water, for the map's shading
    for (let j = 0; j < n; j += 2) for (let i = 0; i < n; i += 2) { const p = { x: x0 + i * step, y: y0 + j * step }; if (!onLand(p)) { sum += k[j * n + i]; cnt++; } }
    this.fieldMeanK = cnt ? sum / cnt : 1;
  }
  /** The average wind factor over the water around the course (the map shades relative to it). */
  fieldMeanK = 1;
  /**
   * The day's wind across the course at p, from the grid alone (the turn, deg, and the factor on the course-wide speed,
   * without the shore's slowing close in): what carries the puffs (environment/wind.ts Puffs.step), cheaply.
   */
  fieldDrift(p: Vec): { turn: number; k: number } {
    const g = this.field;
    if (!g) return { turn: 0, k: 1 };
    const fx = clamp((p.x - g.x0) / g.step, 0, g.n - 1.001), fy = clamp((p.y - g.y0) / g.step, 0, g.n - 1.001);
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, n = g.n;
    const bl = (a: Float32Array) => (a[j * n + i] * (1 - u) + a[j * n + i + 1] * u) * (1 - v) + (a[(j + 1) * n + i] * (1 - u) + a[(j + 1) * n + i + 1] * u) * v;
    return { turn: bl(g.turn), k: bl(g.k) };
  }
  /** fieldAt(p).extra alone, without the shore and the slot at p (for drawing the wind on the water: it has its own terrain grid). */
  fieldExtra(p: Vec): number {
    const g = this.field;
    if (!g) return this.fieldAt(p).extra;
    const fx = (p.x - g.x0) / g.step, fy = (p.y - g.y0) / g.step;
    if (fx < 0 || fy < 0 || fx >= g.n - 1 || fy >= g.n - 1 || this.fieldEdge(fx, fy) < 1) return this.fieldAt(p).extra;
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, n = g.n, a = g.extra;
    return (a[j * n + i] * (1 - u) + a[j * n + i + 1] * u) * (1 - v) + (a[(j + 1) * n + i] * (1 - u) + a[(j + 1) * n + i + 1] * u) * v;
  }
  /** How far inside the grid's edge (cells) a grid position is. */
  private fieldEdge(fx: number, fy: number): number { const m = this.field!.n - 1; return Math.min(fx, fy, m - fx, m - fy); }
  /** The wind across the course from the day's weather itself (outside the grid, and blended into it at its edge). */
  private fieldExact(p: Vec): { k: number; turn: number; extra: number } {
    const f = this.weather.field(p, this.clockUtc, this.wind.from);
    return { ...f, extra: f.k / Math.max(0.05, windTerrain(p, this.wind.from)) };
  }
  /** The wind across the course at p: the factor on the course-wide speed, and the turn of its direction (deg). */
  fieldAt(p: Vec, lattice = false): { k: number; turn: number; extra: number } {
    const g = this.field;
    if (!g) return this.fieldExact(p);
    const fx = (p.x - g.x0) / g.step, fy = (p.y - g.y0) / g.step;
    if (fx < 0 || fy < 0 || fx >= g.n - 1 || fy >= g.n - 1) return this.fieldExact(p);
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, n = g.n;
    const bl = (a: Float32Array) => (a[j * n + i] * (1 - u) + a[j * n + i + 1] * u) * (1 - v) + (a[(j + 1) * n + i] * (1 - u) + a[(j + 1) * n + i + 1] * u) * v;
    // the day's pattern (smooth over kilometres) from the grid; the shore and the slot exactly, here
    let extra = bl(g.extra), turn = bl(g.turn);
    // across the grid's outermost cell, eased into the weather's own field, which holds outside it: the grid's samples
    // between its nodes, and those made up to 30 s ago, needn't match it, and a boat (and the map) crossing the edge
    // would meet a seam in the wind. At the edge itself, the exact field
    const e = this.fieldEdge(fx, fy);
    if (e < 1) { const x = this.fieldExact(p), s = e * e * (3 - 2 * e); extra = x.extra + (extra - x.extra) * s; turn = x.turn + wrap(turn - x.turn) * s; }
    return { k: windTerrain(p, this.wind.from, lattice) * extra, turn, extra }; // (`lattice`: for a boat's own wind, windHere)
  }

  /**
   * What stands in the wind upwind of a point and isn't in the wind records (environment/shadows.ts): the lee of the
   * islands and hills, and the wakes of boats (their sails), ships and the committee boat. `self`: the boat asking
   * (her own wake doesn't count; her land lee is cached, refreshed every half second).
   */
  shadowAt(p: Vec, self?: Boat): Shadow {
    const sum = new WindSum(), kt = this.wind.kt, from = this.wind.from;
    const lee = self?.leeK ?? landLee(p, from);
    for (const o of this.boats) {
      if (o === self) continue;
      const dx = p.x - o.x, dy = p.y - o.y; if (dx * dx + dy * dy > 120 * 120) continue;
      addBoatWake(sum, o, p, kt * lee);
    }
    for (const v of this.vessels) {
      const ty = VESSEL[v.kind], dx = p.x - v.x, dy = p.y - v.y, r = ty.len + 30 * SHIP_AIR[v.kind]; if (dx * dx + dy * dy > r * r) continue;
      addShipWake(sum, from, kt, v, SHIP_AIR[v.kind], ty.len, ty.beam, p);
    }
    if (this.C.committeeKind === 'boat' && !this.freeSail) addCommitteeWake(sum, from, this.C.committee, p);
    addPierWakes(sum, from, p);
    const r = sum.result(from);
    return { k: r.k * lee, shift: r.shift };
  }

  /** Definitions, Start: the boats whose hull has been entirely on the pre-start side of the line since the starting signal. */
  private belowSinceGun = new Set<number>();
  /**
   * Definitions, Racing: "from her preparatory signal until she finishes and clears the finishing line and marks or
   * retires, or until the race committee signals a general recall, postponement or abandonment".
   */
  racing(b: Boat): boolean {
    if (this.freeSail || this.cancelled || notRacing(b)) return false;
    const prep = this.sequence.find(s => s.name === 'Preparatory signal');
    return !prep || this.t >= prep.t;
  }

  /** Rule 21.1: how long (s) each returning boat has been sailing clearly away from the line (to release the latch). */
  private awayFromLine = new Map<number, number>();
  /**
   * Rule 21.1, judged each step. "Sailing towards" the pre-start side is judged from her heading through the water (a
   * boat headed back but set away by the tide is still returning). Once she is returning it holds (a latch) until her
   * hull is completely on the pre-start side, or she clearly sails away from the line for RELEASE_AWAY seconds: slowing,
   * luffing or a small turn on her way back doesn't give her rights back (Perry, on rule 21: she keeps her rights only
   * until she is sailing back, converging with the line). Under the I flag (rule 30.1) she is returning while closing on
   * the nearer end of the line to go round it, too. Not after the race is abandoned, and only within RETURN_RANGE of the
   * line: beyond that the sim can't tell a boat going back to start from one sailing the course without having started.
   */
  private returningNow(b: Boat, d: number, was: boolean): boolean {
    const C = this.C, RETURN_RANGE = 300, RELEASE_AWAY = 2;
    const hullAbove = d > 0 || this.lineD(stern(b)) > 0;
    if (this.t <= 0 || this.cancelled || b.started || b.finished || !hullAbove || d > RETURN_RANGE) { this.awayFromLine.delete(b.id); return false; }
    const u = V(b.h), un = u.x * this.N.x + u.y * this.N.y;
    if (was) {
      const away = un > 0.3 && b.v > 0.2 ? (this.awayFromLine.get(b.id) ?? 0) + DT : 0;
      this.awayFromLine.set(b.id, away);
      return away < RELEASE_AWAY;
    }
    if (b.v <= 0.2) return false;
    if (un < -0.1) return true;
    if (b.roundEnd && b.ocs) {
      // closing on the nearer end of the line, to round it (rule 30.1)
      const bw = bow(b), e = dist(bw, C.pin) < dist(bw, C.committee) ? C.pin : C.committee, l = dist(bw, e) || 1;
      return (u.x * (e.x - bw.x) + u.y * (e.y - bw.y)) / l > 0.3;
    }
    return false;
  }

  /** The sea at any point, for the wind and current there. */
  seaHere(p: Vec): SeaHere {
    const c = this.currentAt(p);
    return this.sea.at(p, windOnWater(this.seaWind(p), c), c, q => this.currentAt(q));
  }
  /**
   * The wind the sea is made by at p: the wind over the water around it (the day's field, the land's lee), not the
   * puff passing or the sails a few lengths upwind. The chop is grown by the wind over kilometres of fetch over an
   * hour or more (sea.ts), so a 30-second puff, a lull or another boat's dirty air doesn't change the sea she's in.
   * `lee`: the land's lee here, if it's known (a boat's, refreshed twice a second).
   */
  seaWind(p: Vec, lee?: number): Wind {
    // (the day's mean wind, not its shifts and pulses of a minute or two: the fetch is looked up by direction)
    const f = this.fieldAt(p), m = this.windModel;
    return { from: n360(m.base + f.turn), kt: m.kt * f.k * (lee ?? landLee(p, m.base)) };
  }
  /**
   * How long the wind has been making the sea at time tMin (minutes since epoch, UTC; sea.ts SeaField.duration). When
   * the wind follows the clock: grown from flat 8 hours before she sets out (the Bay's mornings are mostly calm) through
   * the day's own wind, 10 minutes at a time (before a past day's record starts at 10:00, the records' wind for that kind
   * of day); worked out once for each 10 minutes and kept, so the boats and the outlook see the same sea whenever they
   * ask. A set strength has been blowing for hours: fully grown for its fetch.
   */
  seaDurationAt(tMin: number): number {
    if (!this.seaBreeze) return Infinity;
    const t0 = this.gunUtc - this.startAt / 60 - 8 * 60, U = (t: number) => (this.weather.covers(t) ? this.weather.at(t) : breezeAt(t, this.windDay, this.windKind)).kt * KT;
    const nodes = this.seaNodes ??= [{ d: 0, u: 0 }], i = Math.max(0, Math.floor((tMin - t0) / 10));
    if (nodes.length <= i) { const g = new SeaField(null); g.duration = nodes[nodes.length - 1].d; g.restore(nodes[nodes.length - 1].u); while (nodes.length <= i) { g.develop(U(t0 + (nodes.length - 1) * 10 + 5), 600); nodes.push({ d: g.duration, u: g.reckonedIn }); } }
    const g = new SeaField(null), n = nodes[i]; g.duration = n.d; g.restore(n.u);
    g.develop(U(t0 + i * 10 + 5), Math.max(0, (tMin - t0 - i * 10) * 60));
    return g.duration;
  }
  private seaNodes?: { d: number; u: number }[];

  /** The sea breeze for the time of day: sets the course-wide mean direction and strength, and the gustiness. */
  private updateBreeze(): void {
    const b = this.breeze = this.weather.at(this.clockUtc);
    if (!this.seaBreeze) { // a set strength: the direction stays where it was at the gun
      if (this.windKind !== 'west' || this.realWind) { this.windModel.steady = b.steady; this.puffs.setGust(Math.max(1.5, b.gust)); } else this.puffs.setGust(1.5);
      return;
    }
    this.windModel.steady = b.steady;
    this.windModel.base = this.settings.windDir ?? b.from; this.windModel.kt = b.kt;
    this.puffs.setGust(b.gust);
  }

  /** Clock time now, minutes since epoch UTC (real tide or sea breeze). */
  get clockUtc(): number { return this.gunUtc + this.t / 60; }
  /** Local San Francisco time of day now, e.g. "12:04" (real tide only). */
  get clock(): string { return sfClock(this.clockUtc); }

  /** The real tide at the course: refresh the field, and the summary used by the HUD, maps and messages. */
  private updateTide(): void {
    const f = this.tide!, now = this.clockUtc;
    f.cover(now); f.setTime(now); // (the predictions roll on past the race's window: a long sail)
    this.cvec = this.streamAt(this.C.center, false); // (the tide at the course, not the piers' eddies)
    this.cur = { ...this.cur, ...describeTide(f, this.C.center, now), set: brg(this.cvec.x, this.cvec.y), kt: Math.hypot(this.cvec.x, this.cvec.y) / KT };
  }

  /* ---------- the fixed step ---------- */
  step(dt = DT): void {
    const prevT = this.t;
    this.t += dt;
    this.steps++;
    if (this.steps % 60 === 0) this.updateBreeze();
    if (this.steps % 1800 === 0) this.buildField();
    this.shifts?.step(dt, this.windModel.kt * KT, this.wind.from); // (the air, and its shifts, move on downwind)
    this.gusts.step(dt, this.wind.kt * KT, this.wind.from);
    this.courseWind();
    this.puffs.step(dt, this.wind, p => this.fieldDrift(p)); // each puff goes with the wind where it is
    if (this.tide) { if (this.steps % 60 === 0) this.updateTide(); else this.tide.setTime(this.clockUtc); }
    this.avgFrom = n360(this.avgFrom + wrap(this.wind.from - this.avgFrom) * dt / 60);
    if (this.steps % 30 === 1) for (const b of this.boats) b.leeK = landLee(b, this.wind.from); // the lee of the land, twice a second
    for (const b of this.boats) {
      b.forced14 = null; b.cur = this.currentAt(b, true); b.ww = windOnWater(this.windHere(b, b), b.cur);
      b.avgFrom = b.avgFrom == null ? b.ww.from : n360(b.avgFrom + wrap(b.ww.from - b.avgFrom) * Math.min(1, dt / 60)); // (her compass's average)
    }
    this.vessels = this.traffic.vessels(this.trafficT);
    if (this.steps % 30 === 1) this.sea.duration = this.seaDurationAt(this.clockUtc);
    // her ensign's hours, twice a second (boat/colours.ts): up at 0800, down at sunset, and up for entering or leaving harbour
    if (this.steps % 30 === 1) for (const b of this.boats) if (b.ensign) { const n = !ensignDue(this.clockUtc, inBasin(b), !b.docked && Math.abs(b.v) > 0.3); if (b.ensignNight !== n) b.ensignNight = n; }
    if (this.steps % 30 === 1) for (const b of this.boats) {
      b.sea = this.sea.at(b, windOnWater(this.seaWind(b, b.leeK), b.cur), b.cur, q => this.currentAt(q));
      const wk = this.traffic.wakeAt(b, this.trafficT);
      if (wk) b.sea = { ...b.sea, wake: wk };
    }
    // the AI boats think 20 times a second, each on her own step (a helmsman's reaction is a few tenths of a second; the
    // boat answers her helm every step); in close quarters (World.closeQuarters: a boat or a mark within four lengths, about to
    // touch, or taking a penalty) every step, as a helmsman there watches continuously. Their clocks run on the time since she last thought
    for (const b of this.boats) if (!b.isUser) {
      const ai = b.ai!, since = ai.thought == null ? 1 : this.steps - ai.thought;
      if (this.exactAI || since >= AI_EVERY || (this.steps + b.id) % AI_EVERY === 0 || this.closeQuarters(b)) { aiThink(this, b, dt * Math.min(AI_EVERY, Math.max(1, since))); ai.thought = this.steps; } // (no more than her usual interval: an idled world's steps aren't hers to reckon)
      this.keepClearOfShips(b);
    }
    // your crew sets and stows the pole too, unless you've taken it (the band's pole tab)
    if (!this.user.poleMine && !this.user.handled) crewPoleCall(this, this.user);
    for (const b of this.boats) if (b.jumperTarget != null) stepJumpers(b, dt, b.ww.kt); // (the crew on the jumpers' turnbuckle)
    for (const b of this.boats) {
      if (b.docked) { this.dockStep(b, dt); b.turnRate = 0; continue; }
      if (b.handled) { this.handStep(b, dt); b.turnRate = 0; continue; } // (held or walked: no turn of her own carried on)
      const x0 = b.x, y0 = b.y;
      if (b.isUser) b.pilotSteers = this.cruising && this.pilot.mode !== 'off';
      if (b.isUser && this.cruising && this.pilot.mode !== 'off') {
        pilotStep(b, this.pilot, this.arrivedT == null ? this.dest?.p ?? null : null, this.t, dt);
        if (this.pilot.alarm) { this.emit({ type: 'toast', msg: this.pilot.alarm, ms: 5000 }); this.emit({ type: 'horn', dur: 0.25 }); this.pilot.alarm = null; this.pilot.mode = 'off'; }
      }
      moveBoat(b, dt, this.t, this.emit, this.groundToast);
      if (b.isUser) this.sailedM += Math.hypot(b.x - x0, b.y - y0);
      if (b.pushing) this.walkOut(b, Math.hypot(b.x - x0, b.y - y0), dt);
    }
    this.drill?.step(this.user, this.t, dt, this.user.sea?.hsW ?? 0); // (the tack and gybe drill: the page shows its scores)
    if (!this.freeSail) { this.checkLines(prevT); this.checkMarkTouches(); }
    this.log?.step(this, dt);
    this.trackCourses();
    this.shipEncounters();
    this.checkPairs();
    if (!this.freeSail) this.signals(prevT);
    this.motorStep(dt);
    if (this.cruising) this.checkArrival();
    if (this.steps % RECORD_EVERY_STEPS === 0) {
      this.rec.push(snapshot(this.t, this.boats));
      if (this.rec.length > RECORD_KEEP) this.rec.shift();
    }
    // (the start-line drill keeps its whole short sequence, for the debrief's look at your run to the line)
    if (this.log && this.t >= (this.settings.mode === 'drill' ? -this.startAt : TRACK_FROM) && this.steps % TRACK_EVERY_STEPS === 0) this.track.push(trackSnapshot(this.t, this.boats));
  }

  private checkLines(prevT: number): void {
    if (this.cancelled && this.cancelled.t < 0) return; // (postponed before the gun, AP over A: no start, nobody over early, nobody starts)
    const gun = prevT < 0 && this.t >= 0, C = this.C, n = C.marks.length;
    if (gun) { this.snapGun(); this.belowSinceGun.clear(); }
    for (const b of this.boats) {
      const wasReturning = !!b.returning;
      b.returning = false;
      if (b.retired) continue; // (no longer racing: no start, finish, recall or rounding for her; her destination is checkArrival's)
      const bw = bow(b), d = this.lineD(bw), a = this.lineA(b);
      // Rule 21.1: after her starting signal, not yet started (over early, round an end under the I flag, or simply on the
      // course side), with her hull not completely on the pre-start side of the line or its extensions, and sailing back
      // toward it to start, she is returning and keeps clear of boats that aren't, until her hull is completely below it
      b.returning = this.returningNow(b, d, wasReturning);
      // Definitions, Start: she starts when, "her hull having been entirely on the pre-start side of the starting line at
      // or after her starting signal", any part of her hull crosses it from the pre-start side to the course side. So: has it been, since the gun?
      if (this.t >= 0 && d <= 0 && this.lineD(stern(b)) <= 0) this.belowSinceGun.add(b.id);
      // (rules 29.1 and 30.1: "any part of her hull" on the course side, so her bow or her stern; the crossing is her bow's)
      const within = Math.abs(this.lineA(bw)) <= this.lineLen / 2 + 2, over = Math.max(d, this.lineD(stern(b))) > 0;
      if (gun && ((over && Math.abs(a) < this.lineLen / 2 + 25) || b.roundEnd)) {
        b.ocs = true;
        if (b.isUser) this.emit({ type: 'toast', msg: 'Over early! Return below the line, then start. Keep clear while you do (Rule 21.1).', ms: 4500 });
      }
      // I flag: back to the pre-start side across an extension of the line (round an end) clears it, before or after the gun
      if (b.roundEnd && b.prevD != null && b.prevD > 0 && d <= 0 && Math.abs(a) > this.lineLen / 2) {
        b.roundEnd = false;
        if (b.isUser && !b.ocs) this.emit({ type: 'toast', msg: 'Back round the end: you can start now (Rule 30.1).' });
      }
      if (this.t >= 0 && b.prevD != null) {
        if (b.ocs && !b.roundEnd && d < 0 && this.lineD(stern(b)) < 0) { b.ocs = false; if (b.isUser) this.emit({ type: 'toast', msg: 'Cleared. Now start properly.' }); }
        const crossedFwd = b.prevD <= 0 && d > 0 && within, crossedBack = b.prevD > 0 && d <= 0 && within;
        if (!b.started && !b.ocs && crossedFwd && !this.belowSinceGun.has(b.id) && b.isUser) {
          this.emit({ type: 'toast', ms: 4500, msg: 'Not started: your whole hull has to be below the line after the gun before you cross it to start. Go back below it, then start.' });
        }
        if (!b.started && !b.ocs && crossedFwd && this.belowSinceGun.has(b.id)) {
          b.started = true; this.startTimes[b.id] = this.t;
          if (b.isUser) {
            const frac = (a + this.lineLen / 2) / this.lineLen;
            this.startReport = { delay: this.t, frac, kt: b.v / KT };
            const where = frac < 0.2 ? 'at the ' + C.pinLabel + ' end' : frac > 0.8 ? 'at the ' + C.committeeLabel + ' end' : 'mid-line';
            const q = this.t < 3 && b.v / KT > 4 ? 'Great start' : this.t < 8 ? 'Decent start' : 'Late start';
            this.emit({ type: 'toast', msg: `${q}: +${this.t.toFixed(1)} s, ${where}, ${(b.v / KT).toFixed(1)} kt`, ms: 4000 });
          }
        } else if (b.started && b.leg >= n && !b.finished && !b.retired && !this.cancelled && (C.finishSign > 0 ? crossedFwd : crossedBack)) { // (not once racing's called off)
          b.finished = true; b.finishT = this.t; b.cleared = false;
          if (b.isUser) { this.userFinishT = this.t; this.emit({ type: 'toast', msg: 'Finished!' }); this.emit({ type: 'horn', dur: 0.5 }); this.emit({ type: 'finished' }); }
        } else if (this.obstructed(b) && (crossedFwd || crossedBack) && b.penalty <= 0) {
          startPenalty(b, TWO_TURNS); // the Seaweed Soup addendum (B1.1) sets two turns for this, whatever the foul penalty
          if (b.isUser) this.emit({ type: 'toast', msg: 'You crossed the start/finish line mid-race. It is an obstruction here: two-turn penalty.', ms: 4500 });
        }
      }
      // Definitions, Racing: she races on until she has finished and cleared the finishing line and marks (WS Case 127):
      // here, once she is three of her lengths from the line and both its ends
      if (b.finished && !b.cleared && segPt(b, C.pin, C.committee) > 3 * LOA) b.cleared = true;
      b.prevD = d;
      this.markProgress(b);
    }
  }

  /**
   * Rule 31: while racing, a boat shall not touch a starting mark before starting, a mark that begins, bounds
   * or ends the leg she is sailing, or a finishing mark after finishing. Penalty: one turn (Rule 44.1).
   */
  touchableMarks(b: Boat): Touchable[] {
    const C = this.C, n = C.marks.length, out: Touchable[] = [];
    if (b.finished || b.retired) return out; // (no longer racing)
    const pinMark = C.marks.find(m => dist(m.p, C.pin) < 1);
    const pin: Touchable | null = C.pinKind === 'buoy' ? { name: C.pinLabel, p: C.pin, r: 0.9 }
      : pinMark ? { name: pinMark.name, p: C.pin, r: pinMark.shape === 'sphere' ? 1.2 : 1.0 } : null;
    const R = { sphere: 1.2, cylinder: 1.0, column: 1.0, lighted: 1.6, island: 0, beacon: 0.3 }; // (a beacon's pile: about 0.6 m across)
    const mk = (i: number): Touchable | null => C.marks[i].shape === 'island' ? null : { name: C.marks[i].name, p: C.marks[i].p, r: R[C.marks[i].shape] }; // an island is land: boats run aground on it instead
    const cb = this.committeeHull; // the committee boat is a starting mark too (and a finishing mark)
    if (!b.started) { if (pin) out.push(pin); if (cb) out.push(cb); return out; } // a starting mark (the line begins the first leg)
    if (b.leg === 0) { if (pin) out.push(pin); if (cb) out.push(cb); }
    const push = (t: Touchable | null) => { if (t) out.push(t); };
    if (b.leg >= 1) push(mk(b.leg - 1));
    if (b.leg < n) push(mk(b.leg));
    else { if (pin) out.push(pin); if (cb) out.push(cb); } // finishing marks
    return out;
  }

  private checkMarkTouches(): void {
    const cb = this.committeeHull;
    for (const b of this.boats) {
      const bw = bow(b), st = stern(b);
      let touching: Touchable | null = null;
      const marks = this.touchableMarks(b), solids = cb && !marks.some(m => m.q) ? [...marks, { ...cb, rule31: false }] : marks;
      for (const m of solids) {
        const gap = solidGap(bw, st, m) - m.r - HULL_HALF_BEAM;
        if (gap < 0) {
          if (m.rule31 !== false) touching = m;
          // bounce off: push her clear, away from the nearest point
          const np = m.q ? (() => { const ax = m.q!.x - m.p.x, ay = m.q!.y - m.p.y, k = Math.max(0, Math.min(1, ((b.x - m.p.x) * ax + (b.y - m.p.y) * ay) / (ax * ax + ay * ay))); return { x: m.p.x + ax * k, y: m.p.y + ay * k }; })() : m.p;
          const ax = st.x - bw.x, ay = st.y - bw.y, k = Math.max(0, Math.min(1, ((np.x - bw.x) * ax + (np.y - bw.y) * ay) / (ax * ax + ay * ay)));
          const dx = bw.x + ax * k - np.x, dy = bw.y + ay * k - np.y, l = Math.hypot(dx, dy) || 1;
          b.x -= dx / l * (gap - 0.05); b.y -= dy / l * (gap - 0.05);
          b.v *= m.q ? 0.9 : 0.97;
        }
      }
      // the same touch until she's got clearly away from that mark
      const prev = b.markTouch ? marks.find(m => m.name === b.markTouch) : undefined;
      const stillNear = !!prev && solidGap(bw, st, prev) - prev.r - HULL_HALF_BEAM < 1.5;
      if (touching && b.markTouch !== touching.name && !this.racing(b)) {
        // Rule 31 is "while racing": before her preparatory signal or once racing's called off, no penalty
        b.v *= 0.6;
        if (b.isUser) this.emit({ type: 'toast', ms: 4000, msg: `You touched ${touching.name}. You aren't racing${this.cancelled ? ' (racing is called off)' : ' yet'}, so there's no penalty: rule 31 applies while racing.` });
      } else if (touching && b.markTouch !== touching.name) {
        b.v *= 0.6;
        // Rule 44.1(a): a Part 2 foul and a mark touch in the same incident: only the Part 2 penalty
        // (still caught up in that foul: not yet a length clear of the boat she fouled since, the tangle's own test; or the
        // foul was here at this mark; and her turns not begun, which ends an incident as it does a tangle)
        const lf = this.lastFoul.get(b.id), lv = this.lastFoulVs.get(b.id);
        const atMark = !!lf && solidGap(lf, lf, touching) - touching.r < ENGAGED;
        const sameIncident = !!lf && this.t - lf.t < TANGLE_MAX && !b.penaltyDir && ((!!lv && lv.vs === lf.vs && !lv.clear) || atMark);
        if (!sameIncident) {
          addPenalty(b, ONE_TURN);
          this.lastTouch.set(b.id, { t: this.t, near: this.boats.filter(o => o !== b && hullGap(b, o) < ENGAGED).map(o => o.id) });
        }
        if (b.isUser) {
          if (!sameIncident) this.fouls++;
          this.emit({ type: 'toast', ms: 6000, msg: sameIncident
            ? `You touched ${touching.name} in the same incident as your foul. You only owe the penalty for the foul (Rule 44.1(a)).`
            : `You touched ${touching.name}. One-turn penalty (Rule 31): get clear of the mark and other boats, then turn one full circle, with a tack and a gybe.` });
        } else if (!sameIncident) this.emit({ type: 'toast', ms: 3000, msg: `${b.name} touched ${touching.name} and owes a one-turn penalty.` });
      }
      b.markTouch = touching ? touching.name : stillNear ? b.markTouch : null;
    }
  }

  private snapGun(): void {
    this.gun = {
      windFrom: this.wind.from,
      boats: this.boats.map(b => ({
        d: this.lineD(bow(b)), frac: (this.lineA(b) + this.lineLen / 2) / this.lineLen, v: b.v,
        target: polar(b.ww.kt, beatAngle(b.ww.kt)), ocs: Math.max(this.lineD(bow(b)), this.lineD(stern(b))) > 0 && Math.abs(this.lineA(b)) < this.lineLen / 2 + 25, penalty: b.penalty > 0
      }))
    };
  }

  private markProgress(b: Boat): void {
    const m = this.nextMark(b);
    if (!b.started || !m) return;
    const md = markDist(b, m);
    if (m.type === 'round') {
      if (md < (m.reach ? 250 : 75)) { // an island: anywhere off its shore counts
        // angle of the boat around the mark, measured from the outside of the rounding
        const ang = wrap((Math.atan2(b.y - m.p.y, b.x - m.p.x) - Math.atan2(m.r.y, m.r.x)) / D2R);
        if (b.prevAng != null && Math.abs(ang) < 75 && Math.abs(b.prevAng) < 75) {
          const ok = m.side === 's' ? (b.prevAng > 0 && ang <= 0) : (b.prevAng < 0 && ang >= 0);
          if (ok) this.advance(b);
        }
        b.prevAng = ang;
      } else b.prevAng = null;
    } else {
      const along = dot(sub(b, m.p), m.dir), lat = cross(m.dir, sub(b, m.p));
      if (b.prevPass != null && b.prevPass < 0 && along >= 0 && Math.abs(lat) < 400) {
        const right = m.side === 's' ? lat > 0 : lat < 0;
        if (right) this.advance(b);
        else if (b.isUser) this.emit({ type: 'toast', msg: `Wrong side of ${m.name}. Go back and leave it to ${m.side === 's' ? 'starboard' : 'port'}.`, ms: 3500 });
      }
      b.prevPass = along;
    }
    if (b.isUser) {
      b.nearMin = Math.min(b.nearMin, md);
      if (m.type === 'round' && b.nearMin < 40 && md > 170) {
        b.nearMin = 1e9;
        this.emit({ type: 'toast', msg: `You missed ${m.name}. Go back and leave it to ${m.side === 's' ? 'starboard' : 'port'}.`, ms: 3500 });
      }
    }
  }

  private advance(b: Boat): void {
    const m = this.nextMark(b)!;
    this.log?.onAdvance(this, b, b.leg);
    b.leg++; b.prevAng = null; b.prevPass = null; b.nearMin = 1e9;
    if (b.isUser) {
      const nm = this.nextMark(b);
      if (m.type === 'round') this.emit({ type: 'toast', msg: nm ? `${m.name} rounded. Next: ${nm.name} to ${nm.side === 's' ? 'starboard' : 'port'}.` : `${m.name} rounded. Head for the finish.` });
    }
  }

  /** Heading history (Rule 16.1) and proper course (Rule 17) for every boat. */
  private trackCourses(): void {
    const keep = Math.round(RULE16_WINDOW / 0.1) + 1;
    this.boats.forEach((b, i) => {
      const h = this.hHist[i] ??= [];
      if (this.steps % RECORD_EVERY_STEPS === 0) { h.push(b.h); if (h.length > keep) h.shift(); }
      b.headingAgo = h.length ? h[0] : b.h;
      const pt = this.t > 0 && b.started && !b.finished && !b.retired ? properTwa(this, b) : null, racing = pt != null; // (null: undetermined)
      b.aboveProper = racing && b.twa < pt - 10;
    });
  }

  /** The AI boats think every step (for the tests): otherwise every AI_EVERY steps, staggered, and every step in close quarters. */
  exactAI = false;
  /** Close quarters for an AI boat: another boat or a mark within CLOSE_M, about to touch (Rule 14), or taking a penalty. */
  private closeQuarters(b: Boat): boolean {
    if (b.ai?.urgent || b.penalty > 0) return true;
    const r2 = CLOSE_M * CLOSE_M, near = (p: Vec) => (p.x - b.x) ** 2 + (p.y - b.y) ** 2 < r2;
    for (const o of this.boats) if (o !== b && near(o)) return true;
    for (const m of this.C.marks) if (near(m.p)) return true; // (a mark: the rounding's timing is close work, coming or going)
    const cb = this.committeeHull; // (the committee boat by her whole hull, as avoidMarks steers round it)
    return near(this.C.pin) || (!!cb && (cb.q ? segPt(b, cb.p, cb.q) : dist(b, cb.p)) < CLOSE_M);
  }
  /** Assess every pair in full every step (for the tests): otherwise pairs far apart are let be (apart()). */
  exactPairs = false;
  /**
   * Two boats with nothing between them: over 150 m apart, not coming within 60 m of each other in the next 12 s at the
   * speeds they're going (Rule 14's and every right-of-way rule's business starts a few lengths off), neither near her
   * mark's zone, and no hail, mark-room, rule 17 or rule 15 grace on their record. Their record is set to "nothing
   * between them" (as when two boats first meet) and their full assessment skipped this step: it's the most of the
   * step's rules work (28 pairs in a fleet of eight), and the most of it is for boats a long way apart.
   * The record then differs from a full assessment's in what it remembers from far off: an overlap (the rules' is pure
   * geometry, at any distance) begun hundreds of metres away is recorded afresh when they come within 150 m, and a
   * right of way that changed hands then starts no rule 15 grace (3.5 s, and they're 140 m and more apart). Neither can
   * touch a call: incidents need contact or a forced swerve, under 10 m. tests/approx.test.ts: the same race, and the
   * same incidents and penalties, as the full assessment.
   */
  private apart(A: Boat, B: Boat, rec: PairRecord, ctx: RulesContext): boolean {
    const dx = A.x - B.x, dy = A.y - B.y;
    if (dx * dx + dy * dy < 150 * 150) return false;
    if (rec.hail || rec.r202e || rec.mark || rec.r183 || rec.r17 != null || rec.grace > ctx.t || A.forced14 === B.id || B.forced14 === A.id) return false;
    const n = ctx.marks.length, nearZone = (X: Boat) => X.leg < n && markDist(X, ctx.marks[X.leg]) < ZONE * 2.5;
    if (nearZone(A) || nearZone(B) || cpa(A, B).d < 60) return false;
    rec.kc = null; rec.rule = null; rec.wasOverlapped = false; rec.ovStart = null;
    rec.seenTack[A.id] = A.headToWindT ?? -Infinity; rec.seenTack[B.id] = B.headToWindT ?? -Infinity; // (rule 18.3: tacks seen as they happen)
    return true;
  }

  private checkPairs(): void {
    this.kcMemo = { t: this.t, m: new Map() }; // after the boats have moved this step
    const bs = this.boats, ctx = this.rulesCtx(), found: { A: Boat; B: Boat; incident: Incident<Boat> }[] = [];
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const A = bs[i], B = bs[j], key = pairKey(A, B);
      const rec = this.pairs[key] ??= newPairRecord();
      // (Rule 44.1's tangle: once a boat that fouled has been a length clear of the boat she fouled, it's over)
      for (const [X, Y] of [[A, B], [B, A]] as const) { const lf = this.lastFoulVs.get(X.id); if (lf && lf.vs === Y.id && !lf.clear && hullGap(X, Y) > LOA) lf.clear = true; }
      if (!this.exactPairs && this.apart(A, B, rec, ctx)) continue;
      const answered = rec.hail?.clearAt != null;
      // Rule 20.3: a hail passed on. Bring the hailed boat's record up to date with how the boat she passed it to answered
      const po = rec.hail?.kind === 'room' ? rec.hail.passedOn : undefined;
      if (po && po.respondedAt == null && !po.failed) {
        const mid = rec.hail!.by === A.id ? B : A, h2 = this.pairs[`${Math.min(mid.id, po.to)}-${Math.max(mid.id, po.to)}`]?.hail;
        if (h2?.kind === 'room' && h2.by === mid.id && h2.at >= po.at) { if (h2.clearAt != null) po.respondedAt = h2.clearAt; }
        else po.failed = true; // that hail lapsed unanswered (a breach was called on it)
      }
      const { incident } = assessPair(rec, A, B, ctx, { swerve: A.forced14 === B.id || B.forced14 === A.id });
      const h = rec.hail;
      if (h && h.kind === 'room' && !answered && h.clearAt != null && h.replyAt == null) {
        // the hailed boat is through the wind: now the hailing boat must tack too (Rule 20.2(d))
        const hailer = h.by === A.id ? A : B, hailed = hailer === A ? B : A;
        if (hailer.isUser) this.emit({ type: 'toast', ms: 3500, msg: `${hailed.name} is tacking to give you room. Tack now (Rule 20.2(d)).` });
      }
      if (incident) found.push({ A, B, incident });
    }
    // who fouled whom this step, before deciding penalties (Rule 43.1(a) needs the whole picture)
    for (const { A, B, incident } of found) if (incident.kind !== 'hail') { const v = incident.fouler === A ? B : A; this.fouledAt.set(v.id, { by: incident.fouler.id, t: this.t }); }
    for (const { A, B, incident } of found) {
      if (incident.kind === 'hail' && A.ai && B.ai) continue; // AI boats always answer hails; nothing to do
      // Rule 43.1(a): a boat compelled into this by another boat's breach (against her, just now) is exonerated
      const f = incident.fouler, victim = f === A ? B : A, by = this.fouledAt.get(f.id);
      // (within the time a helmsman needs to react and turn once the other boat's breach is plain, COMPELLED_WINDOW, and
      // with that boat still on her: a later breach, or one with the other gone, she could have avoided, Appeal 2.
      // A fuller test would ask escapes(), src/boat/arcs.ts, whether any turn could have kept her clear)
      const byBoat = by ? this.boats.find(o => o.id === by.by) : undefined;
      if (incident.kind !== 'hail' && by && byBoat && by.by !== victim.id && this.t - by.t < COMPELLED_WINDOW && hullGap(f, byBoat) < ENGAGED) incident.exoneratedBy = by.by;
      // Part 2 preamble: the rules of Part 2 still apply between boats that intend to race, are racing or have been racing,
      // but a boat not racing isn't penalized for breaking them (except rule 14 with injury or serious damage, which the
      // sim doesn't model, and rule 23.1, handled as its own case)
      if (!this.racing(f) && incident.part !== '23.1') incident.notRacing = true;
      if (incident.kind === 'contact') {
        A.v *= 0.35; B.v *= 0.35;
        const dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy) || 1;
        A.x -= dx / l * 0.8; A.y -= dy / l * 0.8; B.x += dx / l * 0.8; B.y += dy / l * 0.8;
      }
      // Rule 44.1: a penalty is for an incident. Contact again with the boat she fouled, while the two are still tangled
      // from that foul (she hasn't been a length clear of her since, nor begun her turns), is that same incident: no
      // second foul, and her turns aren't restarted. Once she has started turning she must keep clear of everyone
      // (rule 21.2) and should have got well clear first (rule 44.2), so a contact then is a new breach.
      const prior = this.lastFoulVs.get(f.id);
      if (incident.kind !== 'hail' && prior && prior.vs === victim.id && !prior.clear && f.penalty > 0 && !f.penaltyDir && this.t - prior.t < TANGLE_MAX) { // (penaltyDir: her turns have begun, 30° one way)
        prior.t = this.t; // (the tangle goes on)
        if (A.isUser || B.isUser) this.emit({ type: 'toast', ms: 4000, msg: `${f.isUser ? 'You' : f.name} and ${f.isUser ? victim.name : victim.isUser ? 'you' : victim.name} are still tangled from the same incident: the penalty already owed covers it (Rule 44.1). Get clear, then take the turns (Rule 44.2).` });
        continue;
      }
      // (only a foul that carries a penalty: a mark touch in the same incident is then covered by it, rule 44.1(a))
      if (incident.exoneratedBy == null && !incident.notRacing && incident.part !== '23.1') { this.lastFoul.set(f.id, { t: this.t, x: f.x, y: f.y, vs: victim.id }); this.lastFoulVs.set(f.id, { vs: victim.id, t: this.t, clear: false }); }
      if (A.isUser || B.isUser) {
        this.paused = true;
        if (incident.exoneratedBy == null && !incident.notRacing) { if (f.isUser) this.fouls++; else this.fouledBy++; }
        this.emit({ type: 'incident', a: A, b: B, incident, frames: this.rec.slice(-100).concat([snapshot(this.t, this.boats)]), wind: this.wind.from });
      } else if (incident.exoneratedBy == null && !incident.notRacing && incident.part !== '23.1') this.assignPenalty(f); // (one not racing, under 23.1, takes none: rule 44.1; one already turning owes this incident's turns too, assignPenalty)
    }
  }

  /** The race committee: flags and sounds on time (RRS 26), the individual recall (29.1), and the last-minute rules (30). */
  private signals(prevT: number): void {
    // too much wind: from two minutes before the warning signal until the race is over, the committee watches the wind
    // over the course (its middle and the marks: its own boat may sit in a lee) over a couple of minutes, and at the
    // fleet's limit calls racing off for the day
    if (this.steps % 30 === 0) { // (twice a second: a true two-minute mean, the last 240 readings)
      const pts = [this.C.center, ...this.C.marks.map(m => m.p)], kt = pts.reduce((a, p) => a + this.windHere(p).kt, 0) / pts.length;
      this.cbWin.push(kt); if (this.cbWin.length > 240) this.cbWin.shift();
      this.cbMean = this.cbWin.reduce((a, v) => a + v, 0) / this.cbWin.length;
      // (not in start practice, which is for learning starts in any breeze; not once a boat has finished, when the race
      // has been sailed; and only on a full two minutes of readings, so no single gust calls it off)
      if (!this.cancelled && this.settings.mode !== 'drill' && this.cbWin.length >= 240 && this.t >= this.sequence[0].t - 120 && !this.boats.some(b => b.finished) && this.cbMean! >= CANCEL_KT) {
        const sig = cancelSignal(this.t >= 0, this.cbMean!);
        this.cancelled = { t: this.t, kt: this.cbMean, up: sig.up, say: sig.say };
        for (const b of this.boats) { b.penalty = 0; b.penaltyTurned = 0; } // (no race, no penalty left to take)
        for (let i = 0; i < sig.sounds; i++) this.emit({ type: 'horn', dur: 0.8, delayMs: i * 1100 });
        this.emit({ type: 'toast', ms: 9000, msg: sig.say });
      } }
    if (this.cancelled) { this.flags = [...this.cancelled.up]; return; }
    if (this.steps === 1 && this.t < 0) {
      const T = this.lineTransit;
      if (T) this.emit({ type: 'toast', ms: 6000, msg: `Sight the line: from the ${this.C.committeeLabel} end, ${this.C.pinLabel} lines up with ${T.name}. Near the line, when ${this.C.pinLabel} and ${T.name} are in line, you're on it.` });
    }
    for (const sg of this.sequence) if (prevT < sg.t && this.t >= sg.t && !this.horns[sg.t]) {
      this.horns[sg.t] = true;
      this.emit({ type: 'horn', dur: sg.sound === 'long' ? 2.2 : 0.8 });
      if (sg.t === 0) {
        const over = this.boats.filter(b => b.ocs);
        if (over.length) {
          // individual recall: X up, with one sound
          this.xUntil = X_FLAG_MAX; this.emit({ type: 'horn', dur: 0.5, delayMs: 900 });
          this.emit({ type: 'toast', ms: 4000, msg: `Individual recall: X flag up, one sound. ${over.map(b => b.isUser ? 'You are' : b.name + ' is').join(', ')} over early.` });
        }
        if (!this.user.ocs) this.emit({ type: 'toast', msg: sg.say, ms: 1800 });
      } else this.emit({ type: 'toast', msg: sg.say, ms: sg.t === -60 ? 2500 : 3500 });
    }
    // the X flag comes down once every boat over early has returned (or after four minutes)
    if (this.xUntil > 0 && (this.t > this.xUntil || !this.boats.some(b => b.ocs))) {
      this.xUntil = -Infinity;
      if (this.t > 1) this.emit({ type: 'toast', msg: 'X flag down: all boats over early have returned (or the time is up).', ms: 2500 });
    }
    this.flags = flagsAt(this.sequence, this.t);
    if (this.xUntil > 0) this.flags.push('X');
    // Rule 30, in the last minute
    if (this.t >= -60 && this.t < 0 && this.prepFlag !== 'P') this.lastMinute();
  }

  /** The start line's transit, sighted from the committee end past the pin (what you line up to know you're on the line). */
  private _transit: ReturnType<typeof lineTransit> | undefined;
  get lineTransit(): ReturnType<typeof lineTransit> {
    if (this._transit === undefined) this._transit = lineTransit(this.C.committee, this.C.pin, p => landAt(p), toLL);
    return this._transit;
  }
  /** The transit on a layline: what the mark lines up with as you sail up it. */
  laylineTransit(mark: Vec, track: Vec): ReturnType<typeof lineTransit> {
    return lineTransit({ x: mark.x - track.x * 1000, y: mark.y - track.y * 1000 }, mark, p => landAt(p), toLL);
  }

  /** The traffic's clock: seconds since midnight UTC of the race day, so the ships keep their schedule through the day. */
  get trafficT(): number { return (this.clockUtc * 60) % 86400; }

  /** AI boats keep well clear of ships and ferries: they pass astern of anything that would come close. */
  private keepClearOfShips(b: Boat): void {
    for (const v of this.vessels) {
      if (!v.moving) continue;
      const ty = VESSEL[v.kind], u = V(v.h), c = cpa(b, { x: v.x, y: v.y, vx: u.x * v.v, vy: u.y * v.v });
      if (c.d > ty.len / 2 + 70 || dist(b, v) > 900) continue;
      const aim = { x: v.x - u.x * (ty.len * 0.8 + 60), y: v.y - u.y * (ty.len * 0.8 + 60) }; // behind her stern
      b.desired = sailable(b, brg(aim.x - b.x, aim.y - b.y)); b.luff = false;
    }
  }

  /** You and the traffic: warnings under the collision regulations, the danger signal, and being run down. */
  private shipEncounters(): void {
    const u = this.user;
    for (const v of this.vessels) {
      const ty = VESSEL[v.kind], hv = vesselHull(v), uv = V(v.h);
      // contact with a vessel: for any boat, pushed clear and stopped
      for (const b of this.boats) {
        const gap = Math.min(segPt(bow(b), hv.a, hv.b), segPt(stern(b), hv.a, hv.b), segPt(b, hv.a, hv.b)) - hv.r - 0.8;
        if (gap < 0) {
          const k = Math.max(0, Math.min(1, ((b.x - hv.a.x) * (hv.b.x - hv.a.x) + (b.y - hv.a.y) * (hv.b.y - hv.a.y)) / ((hv.b.x - hv.a.x) ** 2 + (hv.b.y - hv.a.y) ** 2)));
          const cx = hv.a.x + (hv.b.x - hv.a.x) * k, cy = hv.a.y + (hv.b.y - hv.a.y) * k, l = Math.hypot(b.x - cx, b.y - cy) || 1;
          b.x += (b.x - cx) / l * (-gap + 0.5); b.y += (b.y - cy) / l * (-gap + 0.5); b.v = 0;
          if (b.isUser && this.t - this.groundToast.t > 4) { this.groundToast.t = this.t; this.emit({ type: 'toast', ms: 6000, msg: `You hit the ${ty.name.toLowerCase()}. In real life that ends your day, or worse. Keep well clear of ships.` }); }
        }
      }
      if (!v.moving) continue;
      const c = cpa(u, { x: v.x, y: v.y, vx: uv.x * v.v, vy: uv.y * v.v }), close = ty.len / 2 + 60, last = this.warned.get(v.id) ?? -Infinity;
      if (dist(u, v) > 1500 || c.d > close + 120) continue;
      if (this.t - last > 90) {
        this.warned.set(v.id, this.t);
        const big = v.kind === 'container' || v.kind === 'tanker';
        this.emit({ type: 'toast', ms: 7000, msg: big
          ? `${ty.name} coming through in the channel, ${Math.round(v.v / 0.5144)} kt. She can't stop or turn for you. Keep well clear: the racing rules don't apply between you and her; the collision regulations do, and a sailing boat must not impede a vessel that can only navigate in the channel (Rule 9).`
          : `${ty.name} approaching at ${Math.round(v.v / 0.5144)} kt. The racing rules don't apply between you and her; the collision regulations do. Keep clear, and expect a wake.` });
      }
      // the danger signal: five short blasts when she's in doubt about what you're doing and you're standing into her way
      if (c.d < close && c.t < 40 && this.t - (this.warned.get(-1 - v.id) ?? -Infinity) > 45) {
        this.warned.set(-1 - v.id, this.t);
        for (let i = 0; i < 5; i++) this.emit({ type: 'horn', dur: 0.35, delayMs: i * 550 });
        this.emit({ type: 'toast', ms: 6000, msg: `Five short blasts from the ${ty.name.toLowerCase()}: the danger signal. She doubts you're keeping clear. Get out of her way now: bear away and pass astern of her.` });
      }
    }
  }

  /** The triangle formed by the ends of the starting line and the first mark (RRS 30.2–30.4). */
  get triangle(): [Vec, Vec, Vec] { return [this.C.pin, this.C.committee, this.C.marks[0].p]; }

  private lastMinute(): void {
    const f = this.prepFlag, [a, b2, c] = this.triangle;
    for (const b of this.boats) {
      if (b.retired) continue; // (she's out of the race: rule 30 is for boats starting)
      if (f === 'I') {
        // Rule 30.1: on the course side of the line or its extensions
        if (!b.roundEnd && Math.max(this.lineD(bow(b)), this.lineD(stern(b))) > 0) { // (any part of her hull: rule 30.1)
          b.roundEnd = true;
          if (b.isUser) this.emit({ type: 'toast', ms: 5000, msg: 'I flag: you were on the course side in the last minute. Sail back around an end of the line to the pre-start side, then start (Rule 30.1).' });
        }
      } else if (!b.scoring && (inTriangle(bow(b), a, b2, c) || inTriangle(b, a, b2, c) || inTriangle(stern(b), a, b2, c))) {
        b.scoring = f === 'Z' ? 'ZFP' : f === 'U' ? 'UFD' : 'BFD';
        if (b.isUser) this.emit({ type: 'toast', ms: 6000, msg: f === 'Z'
          ? 'Z flag: you were in the triangle in the last minute. 20% scoring penalty (Rule 30.2). Keep racing.'
          : `${FLAG_NAME[f]}: you were in the triangle in the last minute. Disqualified (Rule ${f === 'U' ? '30.3' : '30.4'}), without a hearing.` });
        else this.emit({ type: 'toast', ms: 3000, msg: `${b.name} was in the triangle in the last minute: ${b.scoring}.` });
      }
    }
  }

  /** In her slip and stopped, bow in? Then the crew steps onto the finger and makes her fast. */
  private bowInTold = -Infinity;
  /** She's been out of her slip (so coming back into it is coming home). */
  private leftSlip = false;
  private intoSlip(u: Boat, slip: Slip): boolean {
    if (!u.docked && dist(u, slip.p) > 8) this.leftSlip = true;
    if (u.docked || !this.leftSlip || dist(u, slip.p) > 2.5 || u.v > 0.6 || (u.astern ?? 0) > 0.05) return false;
    if (Math.abs(wrap(u.h - slip.heading)) > 35) {
      if (this.t - this.bowInTold > 20) { this.bowInTold = this.t; this.emit({ type: 'toast', msg: slip.kind === 'alongside' ? 'At an end tie she lies bow out: come alongside heading out along the dock, toward its end.' : 'Boats lie bow in here: come into the slip bow first, toward the dock.', ms: 4000 }); }
      return false;
    }
    Object.assign(u, { x: slip.p.x, y: slip.p.y, h: slip.heading, v: 0, vx: 0, vy: 0, astern: 0, steer: 0, turnTarget: null });
    u.docked = { slip: slip.id }; this.leftSlip = false;
    return true;
  }

  /**
   * Push off, as it's done with no engine (geo/marina.ts pushOffPlan, for the wind where she lies). From a slip she lies in
   * bow first: a crew member walks her back along the finger by the shroud and steps aboard at its end with a bow line led
   * round the cleat there and back aboard, which holds the bow just off the finger's end while her stern swings out across
   * the fairway (the wind swings it, downwind, if there's a breeze
   * across her; in light air the crew walks the bow round toward the way out). Brought head to wind, they hold her there
   * for you to hoist the main: push off again and they push her bow off and let her go. Otherwise they slip the line and push
   * her off forward with the boathook against the finger's end. Where the fairway's too narrow to swing her, they shove her off astern into it (steer her stern first).
   * From an end tie they push her off the dock and forward. Then she's under her own way (a slow walk, slowing on the
   * water's drag) and answers the tiller.
   */
  pushOff(): boolean {
    const u = this.user, H = u.handled;
    // held head to wind on the bow line: let her go now, her bow pushed off
    if (H?.plan.kind === 'swing' && H.plan.hold && H.held) { H.held = false; H.releasing = 0; return true; }
    const d = u.docked; if (!d) return false;
    const slip = slipById(d.slip);
    u.docked = undefined; u.astern = 0; u.v = 0;
    if (!slip) { u.v = SHOVE; return true; }
    // (the crew judge the breeze, not the gust passing: environment/gusts.ts)
    const wind = this.windHere(u, u, false), plan = pushOffPlan(slip, wind.from, wind.kt);
    u.handled = { plan, from: { x: u.x, y: u.y }, h0: u.h, s: 0, a: 0, slip: slip.id };
    // the finger she lay against: the nearest one, and which side of her it's on (a crew member walks her out along it)
    if (plan.kind !== 'off' && (u.crew?.spec.crew.length ?? 0) > 0) {
      const f = V(slip.heading), r = { x: f.y, y: -f.x }; // forward, and to starboard
      let best = { d: Infinity, lat: 2, side: 1 };
      for (const fg of harborOf(slip.marina)?.fingers ?? []) for (let k = 1; k < fg.length; k++) {
        const d = segPt(slip.p, fg[k - 1], fg[k]);
        if (d < best.d) { const m = { x: (fg[k - 1].x + fg[k].x) / 2 - slip.p.x, y: (fg[k - 1].y + fg[k].y) / 2 - slip.p.y }; const along = m.x * r.x + m.y * r.y; best = { d, lat: Math.min(2.6, d), side: along >= 0 ? 1 : -1 }; }
      }
      // the crew member walks her back by the shroud and steps aboard as the finger runs out under them (her shroud, half a
      // metre ahead of her middle, at the finger's end), a bow line led round the cleat on its end and back aboard
      u.pushing = { side: best.side, lat: best.lat, moved: 0, clear: 0.45 * slip.finger + 0.25, jump: 0 };
    }
    const hoist = plan.headToWind ? ' She\'ll be head to wind: get the main up first (U), or she\'ll soon stop.' : '';
    this.emit({ type: 'toast', ms: 7000, msg: plan.kind === 'swing'
      ? plan.hold
        ? 'Pushing off: your crew walks her back out of the slip and steps aboard at the finger\'s end, a bow line round the cleat there; the wind swings her stern round until she lies head to wind on it. Hoist the main (U), then push off again (G) and they\'ll push her bow off, slip the line and let her go.'
        : `Pushing off: your crew walks her back out of the slip and steps aboard at the finger's end, a bow line round the cleat there holding her bow while her stern swings out across the fairway; then they slip the line and push her off forward with the boathook. Steer her out (she has a little way on).${hoist}`
      : plan.kind === 'astern'
        ? `Pushing off: there's no room to swing her, so your crew walks her back and shoves her off astern into the fairway. She's going astern: steer with the tiller (the bow goes the way you push it), then get sail on her.${hoist}`
        : plan.setBack
          ? plan.h !== slip.heading
            ? plan.headToWind
              ? `Pushing off: the wind's onto the dock and nearly ahead, so your crew pushes her bow off as far as there's room. She'll be close to head to wind: get the main up first (U), then the jib, and sail off close-hauled, away from the dock.`
              : `Pushing off: the wind's blowing her onto the dock, so your crew pushes her bow off toward the wind and shoves her out at an angle. Get the jib up quickly (J), sheeted in, and sail off close-hauled, away from the dock: don't bear away toward it.`
            : `Pushing off: the wind's blowing her onto the dock and there's no room to angle her out, so she'll be set back on it. In real life you'd warp her along to the dock's end first; here, get sail up the moment she's off, sheeted in.`
          : `Pushing off: your crew shoves her off the dock and forward. Steer her out (she has a little way on).${hoist}` });
    return true;
  }

  /** The crew handling her off her berth by hand (pushOff), then letting her go: kinematic, while they hold her the physics waits. */
  private handStep(b: Boat, dt: number): void {
    const H = b.handled!, P = H.plan, x0 = b.x, y0 = b.y, steer = b.steer, helm = clamp(steer - b.tiller, -1, 1);
    const slip = H.slip ? slipById(H.slip) : null;
    this.dockStep(b, dt); // (sails weathervane, hoisting goes on)
    b.steer = steer; // (a steering key held through the push-off stays held: the keys only report a change)
    b.helm = helm; // (the rudder drawn where you hold it)
    // the rudder answers the helm as far as water flows along it, fore and aft: going astern it works backwards, the bow
    // going the way you push the tiller, as physics.ts steers her astern, in proportion to the speed (the turning circle,
    // with no floor: nothing at rest). Swinging about the bow line, or pushed off sideways, the water crosses the blade
    // broadside: whichever way it's put over it only adds a little to the stern's resistance, the same both ways, so it
    // neither hurries nor slows the swing. Held head to wind, stopped: nothing.
    const astern = (vWater: number) => -helm * 0.7 * Math.min(HANDLING.maxTurnRate, vWater / HANDLING.turnRadius / D2R);
    if (P.kind === 'off') {
      // pushed out over about three seconds; then, if need be, her bow pushed off about her stern quarter
      if (H.s < 1) { H.s = Math.min(1, H.s + dt / 3); b.x = H.from.x + (P.out.x - H.from.x) * H.s; b.y = H.from.y + (P.out.y - H.from.y) * H.s; }
      else {
        const a = wrap(P.h - H.h0);
        if (Math.abs(H.a) < Math.abs(a)) { H.a = Math.sign(a) * Math.min(Math.abs(a), Math.abs(H.a) + 4 * dt); const q = swingAbout(P.out, H.h0, -3.8, H.a); b.x = q.c.x; b.y = q.c.y; b.h = n360(q.h); }
        else this.letGo(b, P.h, SHOVE, 0);
      }
    } else {
      const u = V(H.h0), back = P.back;
      if (H.s < back) {
        // walked back by the shroud, a crew member on the finger
        const step = Math.min(WALK * dt, back - H.s); H.s += step;
        b.x = H.from.x - u.x * H.s; b.y = H.from.y - u.y * H.s; b.astern = WALK; // (going astern at a walk: as the log shows)
        // the tiller yaws her a little as she goes astern (the crew at the shroud lets her, a few degrees, clear of everything),
        // and they straighten her over the last metre, before the finger runs out, so she swings out as planned
        // (if the yaw she has wouldn't clear the boat or the dock beside her here, the crew straightens her: straight back is
        // the path the plan cleared)
        const cur = H.yaw ?? 0, straighten = cur - Math.sign(cur) * Math.min(Math.abs(cur), 3 * dt);
        const yaw = back - H.s < 1 ? straighten : cur + clamp(clamp(cur + astern(WALK) * dt, -6, 6) - cur, -3 * dt, 3 * dt);
        H.yaw = !slip || berthClear({ x: b.x, y: b.y }, n360(H.h0 + yaw), slip) ? yaw : straighten;
        b.h = n360(H.h0 + H.yaw);
        const p = b.pushing; if (p) { p.moved += step; if (p.jump === 0 && p.moved >= p.clear) p.jump = 1e-3; } // (aboard at the finger's end)
      } else if (P.kind === 'swing') {
        const start = { x: H.from.x - u.x * back, y: H.from.y - u.y * back }, ww = this.windHere(b, b, false); // (the breeze, as the crew judge it)
        if (Math.abs(H.a) < Math.abs(P.turn)) {
          // the bow held at the finger's end, the stern swinging out across the fairway: as fast as the wind on her side
          // swings her against the water's resistance (if it's helping), or the crew walks the bow round
          const rel = wrap(ww.from - n360(H.h0 + H.a)), helps = Math.sign(rel) === Math.sign(P.turn);
          const rate = Math.min(6, Math.max(CREW_TURN, helps ? windSwing(ww.kt, rel) : 0));
          // (the tiller can't hurry or slow it: the water crosses the rudder broadside)
          H.a = Math.sign(P.turn) * Math.min(Math.abs(P.turn), Math.abs(H.a) + rate * dt);
          const q = swingAbout(start, H.h0, 3.8, H.a); b.x = q.c.x; b.y = q.c.y; b.h = n360(q.h); b.astern = 0;
        } else if (P.hold && H.held !== false) {
          // head to wind, held on the bow line: waiting for the main to go up and the word to let go; she lies to the wind as
          // it shifts (a boat on a bow line follows it), within 20 degrees of where she came to
          if (H.held == null) { H.held = true; this.emit({ type: 'toast', msg: 'She\'s lying head to wind, held on the bow line (stopped: no water past the rudder, so the tiller does little). Hoist the main (U), then push off (G) to let her go.', ms: 6000 }); }
          const want = clamp(wrap(ww.from - n360(H.h0 + P.turn)), -20, 20), cur = H.follow ?? 0;
          H.follow = cur + clamp(want - cur, -CREW_TURN * dt, CREW_TURN * dt);
          const q = swingAbout(start, H.h0, 3.8, P.turn + H.follow); b.x = q.c.x; b.y = q.c.y; b.h = n360(q.h);
        } else if (P.hold && (H.releasing ?? 0) < 1) {
          // her bow pushed off the wind, about the bow, toward the way out
          H.releasing = Math.min(1, (H.releasing ?? 0) + dt * CREW_TURN * 2 / Math.abs(P.hold.off));
          const q0 = swingAbout(start, H.h0, 3.8, P.turn + (H.follow ?? 0)), q = swingAbout(q0.c, q0.h, 3.8, P.hold.off * H.releasing); b.x = q.c.x; b.y = q.c.y; b.h = n360(q.h);
        } else this.letGo(b, P.hold ? n360(H.h0 + P.turn + (H.follow ?? 0) + P.hold.off) : P.h, SHOVE, 0);
      } else {
        // shoved off astern: enough to coast her into the fairway on the water's drag
        let lo = 0, hi = 1.5; for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (asternCoast(m) < P.coast) lo = m; else hi = m; }
        this.letGo(b, P.h, 0, lo);
      }
    }
    if (b.pushing && b.pushing.jump > 0) { b.pushing.jump += dt / 0.7; if (b.pushing.jump >= 1) b.pushing = undefined; }
    if (b.handled) { b.vx = (b.x - x0) / dt; b.vy = (b.y - y0) / dt; }
  }
  /** The crew lets her go with a shove as they step aboard (ahead, or astern): from here she's under her own way. */
  private letGo(b: Boat, h: number, ahead: number, astern: number): void {
    b.handled = undefined; b.h = n360(h); b.v = ahead; b.astern = astern; b.turnTarget = null; // (a steering key held stays held)
    const u = V(h); b.vx = u.x * (ahead - astern); b.vy = u.y * (ahead - astern);
    if (b.pushing && b.pushing.jump === 0) b.pushing.jump = 1e-3;
  }

  /** The crew member walking her out: jumps aboard as her bow comes level with the end of the finger (or she stops). */
  private walkOut(b: Boat, step: number, dt: number): void {
    const p = b.pushing!;
    p.moved += step;
    if (p.jump > 0) { p.jump += dt / 0.7; if (p.jump >= 1) b.pushing = undefined; }
    else if (p.moved >= p.clear || (b.astern ?? 0) < 0.05) p.jump = 1e-3;
  }

  /**
   * While nothing's running (the start page, setting up, the showroom): your boat still sails, in the real wind and
   * physics (her trim, heel, the apparent wind her flags and windex show), held on her heading, or on `twa` (deg, to
   * starboard of the wind) if given; the race clock doesn't move and nothing else happens.
   */
  idle(dt: number, twa?: number): void {
    const u = this.user;
    if (u.docked) { this.dockStep(u, dt); return; }
    const h = twa != null ? n360(this.wind.from + twa) : u.h;
    u.h = h; u.turnTarget = null; u.steer = 0; u.tiller = 0; u.luff = false;
    u.cur = this.currentAt(u); u.ww = windOnWater(this.windHere(u, u), u.cur);
    if (this.steps % 30 === 0) u.sea = this.sea.at(u, windOnWater(this.seaWind(u, u.leeK), u.cur), u.cur, q => this.currentAt(q));
    this.steps++;
    moveBoat(u, dt, this.t, () => { /* quietly */ }, { t: Infinity });
    u.h = h; // held there
  }

  /** Hoist or strike a sail (the crew takes its time: physics.ts crewRig). */
  setSail(sail: 'main' | 'jib', up: boolean): void {
    const u = this.user, r = u.rig ??= { main: 1, jib: 1, mainUp: true, jibUp: true };
    if (sail === 'main') r.mainUp = up; else r.jibUp = up;
    if (!up && sail === 'jib') u.poleWant = false;
    this.emit({ type: 'toast', msg: `${up ? 'Hoisting' : 'Striking'} the ${sail}.`, ms: 2000 });
  }

  /** A boat in her slip: made fast, she stays put; her crew can hoist or strike sail there. */
  private dockStep(b: Boat, dt: number): void {
    b.v = 0; b.astern = 0; b.vx = 0; b.vy = 0; b.steer = 0; b.turnTarget = null;
    b.rel = wrap(b.ww.from - b.h); b.twa = Math.abs(b.rel); b.tack = b.rel >= 0 ? 'S' : 'P';
    const aw = apparent(b.ww.from, b.ww.kt, b.h, 0); b.awa = aw.awa; b.arel = aw.arel; b.aws = aw.aws; // (her flags, windex and ribbons: the wind as it is where she lies)
    const side = b.tack === 'S' ? -1 : 1, k = Math.min(1, dt * 2); // sails up at the dock weathervane, let fly
    b.boom += (side * 75 - b.boom) * k; b.jib += (side * 35 - b.jib) * k;
    crewRig(b, dt, this.emit);
  }

  /** Just sail: a new destination, a place or a spot picked on the chart. */
  setDest(p: Vec, name: string): void {
    if (!this.cruising) return;
    this.dest = destMark({ id: 'pick', name, group: 'Spots', p });
    this.arrivedT = null;
    this.emit({ type: 'toast', msg: `New destination: ${name}.`, ms: 3000 });
  }

  /** Racing, before she's finished: she retires (RET, RRS A5.1), and she's no longer racing. False if she isn't racing. */
  retire(why = ''): boolean {
    const u = this.user;
    if (this.freeSail || u.finished || u.retired) return false; // (before her preparatory signal too: a boat that retires from a race she's entered)
    u.retired = true; u.penalty = 0; u.penaltyTurned = 0; u.ocs = false; u.roundEnd = false;
    this.emit({ type: 'toast', msg: `Retired (RET, RRS A5.1)${why}: she's no longer racing. Keep clear of the boats still racing (RRS 23.1).`, ms: 5000 });
    return true;
  }
  /**
   * Racing (the definition: from her preparatory signal until she finishes or retires, or a recall, postponement or
   * abandonment): the motor's not hers to use (RRS 42.1). Before it she may motor out to the line. (42.1 forbids propulsion,
   * not a running engine: the sim asks at the pull, a simplification.)
   */
  get racingNow(): boolean { return this.racing(this.user); }

  /* ---------- her outboard (boat/motor.ts) ---------- */
  private motorRng: Rng;
  /** Tilt the outboard down into the water, or up out of it (stopping it first). */
  motorTilt(): void {
    const m = this.user.motor; if (!m) return;
    if (m.down && (m.running || m.pulling)) { m.running = false; m.pulling = undefined; }
    m.down = !m.down; if (!m.down) { m.gear = 'N'; m.throttle = 0; m.swivel = false; }
    this.emit({ type: 'toast', msg: m.down ? 'Outboard down: its leg in the water.' : 'Outboard tilted up, clear of the water.', ms: 2000 });
  }
  /**
   * Pull-start it: in neutral (it won't start in gear), tilted down. Racing, it isn't hers to use (RRS 42.1; 42.3(h): not
   * even to get clear after hitting something): `retireFirst` says she's retiring to do it. A pull takes a second and a half;
   * the first catches three times in four, a second pull nearly always (a warm motor more readily: as owners know them).
   */
  motorStart(retireFirst = false): 'ok' | 'racing' | 'tilt' | 'gear' {
    const m = this.user.motor; if (!m) return 'ok';
    if (m.running || m.pulling) return 'ok';
    if (this.racingNow) { if (!retireFirst) return 'racing'; this.retire(', to use her motor (RRS 42.1)'); }
    if (!m.down) { this.emit({ type: 'toast', msg: 'Tilt the outboard down first: the prop needs to be in the water.', ms: 2500 }); return 'tilt'; }
    if (m.gear !== 'N') { this.emit({ type: 'toast', msg: 'Put it in neutral to start it: it won\'t start in gear.', ms: 2500 }); return 'gear'; }
    m.pulling = { left: 1.5, catches: this.motorRng() < (m.warm ? 0.95 : 0.75) };
    this.emit({ type: 'toast', msg: 'Pulling the starter cord…', ms: 1500 });
    return 'ok';
  }
  motorStop(): void { const m = this.user.motor; if (!m) return; m.running = false; m.pulling = undefined; m.gear = 'N'; m.throttle = 0; }
  /** Into gear: F, N or R (the 2.5 has no reverse: swivel it round instead). Shifting is done at tick-over. */
  motorGear(g: 'F' | 'N' | 'R'): void {
    const m = this.user.motor; if (!m) return;
    if (g === 'R' && !OUTBOARDS[m.hp].reverse) { this.emit({ type: 'toast', msg: 'The 2.5 has no reverse gear: swivel it round on its bracket to push astern.', ms: 3500 }); return; }
    if (g !== m.gear) m.throttle = Math.min(m.throttle, 0.15);
    m.gear = g;
  }
  motorThrottle(t: number): void { const m = this.user.motor; if (m) m.throttle = clamp(t, 0, 1); }
  /** The 2.5: turned round on its bracket, its push goes astern (in neutral). */
  motorSwivel(): void {
    const m = this.user.motor; if (!m || OUTBOARDS[m.hp].reverse) return;
    if (m.gear !== 'N') { this.emit({ type: 'toast', msg: 'Into neutral first, then swivel it round.', ms: 2500 }); return; }
    m.swivel = !m.swivel;
    this.emit({ type: 'toast', msg: m.swivel ? 'Swivelled round: in gear it pushes her astern.' : 'Swivelled back: in gear it pushes her ahead.', ms: 2500 });
  }
  /** Made fast in her slip, the motor running: the crew casts off the lines and she's yours to motor out. */
  castOff(): boolean {
    const u = this.user, m = u.motor;
    if (!u.docked || !m?.running) return false;
    u.docked = undefined; u.v = 0; u.astern = 0;
    this.emit({ type: 'toast', msg: 'Lines in: she\'s yours. Motor her out (reverse to back out of a slip), then hoist sail and stop the motor.', ms: 5000 });
    return true;
  }
  private motorStep(dt: number): void {
    const m = this.user.motor; if (!m?.pulling) return;
    m.pulling.left -= dt;
    if (m.pulling.left > 0) return;
    if (m.pulling.catches) { m.pulling = undefined; m.running = true; m.warm = true; this.emit({ type: 'toast', msg: `The ${m.hp} hp's running.`, ms: 2000 }); }
    else { m.pulling = { left: 1.5, catches: this.motorRng() < 0.95 }; this.emit({ type: 'toast', msg: 'It didn\'t catch: another pull…', ms: 1500 }); }
  }

  /**
   * Send her home: her home slip becomes where she's going, for the navigator's passage plan and the tiller pilot (on, it
   * steers for it; you bring her into the slip yourself). Racing, before she's finished, it retires her first: she's no
   * longer racing (the definition of Racing; scored RET, RRS A5.1), so she keeps clear of the boats still racing (RRS 23.1)
   * and may use the pilot (RRS 52 binds only a boat racing). False when she has no home slip.
   */
  sendHome(): boolean {
    const slip = this.homeSlip;
    if (!slip) { this.emit({ type: 'toast', msg: 'She has no home slip: give her one in the Fleet.', ms: 3500 }); return false; }
    this.retire();
    this.dest = { ...destMark({ id: 'slip', name: `Her slip, ${slipPlace(slip)}`, group: 'Spots', p: slip.p })!, key: 'slip' };
    this.arrivedT = null;
    if (this.pilot.mode !== 'off') this.pilot.mode = 'nav';
    this.emit({ type: 'toast', msg: `Heading home: her slip, ${slipPlace(slip)}. The navigator has the passage plan${this.pilot.mode === 'nav' ? ', and the pilot is steering for it' : ''}; you bring her into the slip.`, ms: 5000 });
    return true;
  }

  /**
   * Cruising, a new start without ending the cruise: she's put at `p`, stopped, on the heading she had, her sails as they
   * were; the clock, her destination and the log carry on (the distance sailed counts only what she sails). Not racing:
   * that would be a restart. False on land.
   */
  moveHere(p: Vec, name: string): boolean {
    if (!this.freeSail || onLand(p) || hitsHarbor(p)) return false;
    const u = this.user;
    u.x = p.x; u.y = p.y; u.v = 0; u.astern = 0; u.sway = 0; u.vx = 0; u.vy = 0; u.turnTarget = null;
    u.docked = undefined; u.handled = undefined; u.pushing = undefined;
    if (this.pilot.mode !== 'off') this.pilot.mode = 'off'; // (stopped: a tiller pilot needs way on)
    if (this.dest && this.arrivedT != null && markDist(u, this.dest) > 40) this.arrivedT = null; // (somewhere to sail to again)
    this.emit({ type: 'toast', msg: `Moved to ${name}. The cruise and its log carry on.`, ms: 3500 });
    return true;
  }

  /**
   * New conditions mid-sail, at once (the owner's choice), without a restart: the kind of wind, its strength and turn, the
   * current, the sea, the rain and the fog, as the conditions panel sets them. They're worked out as a new start would work
   * them out (a World for the new settings, its environment taken over), at this moment of the sail: the boats, the clock,
   * the course (racing: the marks stay where they were laid; changing the course needs a signal), her destination and the
   * log carry on. The day and the start time stay the sail's own.
   */
  applyConditions(next: Settings): void {
    const s: Settings = { ...this.settings };
    for (const k of CONDITION_KEYS) (s as unknown as Record<string, unknown>)[k] = (next as unknown as Record<string, unknown>)[k];
    const n = new World(this.file, { ...s, fleet: 0, opponents: [] }, this.seed, { ...this.opts, startAt: this.startAt });
    this.settings = s;
    this.weather = n.weather; this.windKind = n.windKind; this.windDay = n.windDay; this.seaBreeze = n.seaBreeze; this.realTime = n.realTime;
    this.cur = n.cur; this.cvec = n.cvec; this.tide = n.tide; this.flowsT = NaN; // (the piers' wakes from the new stream at once)
    this.sea = n.sea; this.seaNodes = undefined; this.sea.duration = this.seaDurationAt(this.clockUtc); // (a sea breeze's sea grown from the new day's wind)
    if ((s.traffic !== 0) !== (this.traffic.on)) this.traffic = n.traffic; // (ships on or off; otherwise they sail on)
    this.windModel = n.windModel; this.puffs = n.puffs; this.shifts = n.shifts; this.gusts = n.gusts; this.shiftRef = { turn: 0, k: 1 };
    this.updateBreeze(); this.courseWind(); this.buildField();
    if (this.tide) this.updateTide();
    // (the boats' and the world's memory of the mean wind keep their old averages: a change this sudden reads as a big shift,
    // as it would on the water, until the new mean settles in)
    for (const b of this.boats) { b.cur = this.currentAt(b, true); b.leeK = landLee(b, this.wind.from); b.ww = windOnWater(this.windHere(b, b), b.cur); b.sea = this.sea.at(b, windOnWater(this.seaWind(b, b.leeK), b.cur), b.cur, q => this.currentAt(q)); }
    if (!this.freeSail) {
      // racing: the laid marks stay where they are, but which legs are beats, reaches and runs goes with the wind they're
      // sailed in (rule 18.1(a), the laylines, the AI); the committee boat swings to the new wind at her anchor
      classifyLegs(this.C, this.windModel.base); this.committeeFrom = this.windModel.base;
      this.cbWin = []; this.cbMean = null; // (the committee judges the new wind afresh: two minutes of it before it calls racing off)
    }
    const sea = this.sea.flat ? 'flat water' : 'the sea from the wind' + (this.sea.swell ? ' and the swell' : '');
    const laid = !this.freeSail && Math.abs(wrap(this.windModel.base - this.C.base)) > 20 ? ' The marks stay where the committee laid them, for the old wind: a real committee would postpone or move the marks (RRS 27.3, 33).' : '';
    this.emit({ type: 'toast', msg: `Conditions changed: ${Math.round(this.wind.kt)} kt from ${String(Math.round(this.wind.from) % 360).padStart(3, '0')}°, ${this.cur.label.toLowerCase()}, ${sea}.${laid}`, ms: laid ? 7000 : 4500 });
  }

  /** Just sail: tell her when she gets to where she was going. */
  private checkArrival(): void {
    const d = this.dest, u = this.user;
    if (d?.key === 'slip') { // home: in her slip, bow in, and stopped (or as good as)
      if (this.arrivedT != null || !this.homeSlip || !this.intoSlip(u, this.homeSlip)) return;
      this.arrivedT = this.t;
      this.emit({ type: 'toast', msg: `Home: nosed into her slip, ${slipPlace(this.homeSlip)}, after ${Math.floor(this.t / 60)} min, and made fast. Nicely done.`, ms: 6000 });
      return;
    }
    if (!d || this.arrivedT != null || markDist(u, d) > 40) return;
    this.arrivedT = this.t;
    if (this.pilot.mode === 'nav') { this.pilot.mode = 'auto'; this.pilot.course = n360(u.h); } // at the waypoint the pilot holds her heading, as a real one does
    const m = Math.floor(this.t / 60), s = Math.round(this.t % 60);
    this.emit({ type: 'toast', msg: `Arrived: ${d.name}, in ${m} min ${s} s. Choose somewhere new in Setup, or keep sailing.`, ms: 6000 });
    this.emit({ type: 'horn', dur: 0.4 });
  }

  /* ---------- hails ---------- */

  /** The boat on the same tack she'd hit if she tacked now: to windward of her, not astern, within 30 m; or null. */
  tackBlocker(b: Boat): Boat | null {
    const u = V(b.h), wv = V(this.wind.from);
    let best: Boat | null = null, bd = 30;
    for (const o of this.boats) {
      if (o === b || o.tack !== b.tack || o.finished) continue;
      const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy);
      const toWindward = dx * wv.x + dy * wv.y > 1, notAstern = dx * u.x + dy * u.y > -LOA;
      if (d < bd && toWindward && notAstern) { bd = d; best = o; }
    }
    return best;
  }

  /**
   * Rule 20.1 (RRS 2025–2028): may `b` hail "Room to tack" (to tack and avoid a boat on the same tack)? Only when
   * (a) she is approaching an obstruction and will soon need to make a substantial course change to avoid it safely
   * (obstructionAhead: the shore, a pier, an island, the Marin shore; any of them), and (b) she is sailing close-hauled
   * or above; and not if the obstruction is a mark and a boat that is fetching it would be required to change course as
   * a result of the hail (an island rounded as a mark, with the boat she'd hail fetching it). Returns that boat, or null.
   */
  roomBlocker(b: Boat): Boat | null {
    if (b.twa > beatAngle(b.ww.kt) + 8 || b.tacking) return null; // 20.1(b)
    const o = this.tackBlocker(b);
    if (!o) return null;
    const ob = obstructionAhead(b, b.h, b.tack, hailRange(b.v)); // 20.1(a)
    if (ob) return this.markFetchedBy(b, ob.at, o) ? null : o;
    return this.boatObstructionAhead(b, o) ? o : null;
  }
  /**
   * Rule 20.1(a) with a boat as the obstruction: a boat she must keep clear of (Definitions, Obstruction: a boat racing
   * is an obstruction to boats required to keep clear of her; WS Case 11: a starboard-tack boat ahead of two overlapped
   * port-tack boats), or one no longer racing, which she is closing on within the hail's range and would still meet if
   * she bore away SUBSTANTIAL_TURN°. Returns that boat, or null. (`o`, the boat she'd hail, isn't the obstruction.)
   */
  boatObstructionAhead(b: Boat, o: Boat): Boat | null {
    const range = hailRange(b.v), v = Math.max(b.v, 0.5);
    for (const c of this.boats) {
      if (c === b || c === o || dist(b, c) > range + LOA) continue;
      if (!notRacing(c) && !this.keepsClearOf(b, c)) continue;
      // within a hull length (between centres) of her on her course now, and still if she bore away 10°
      const meets = (h: number) => { const u = V(h), q = cpa({ x: b.x, y: b.y, vx: u.x * v, vy: u.y * v }, c); return q.d < LOA && q.t * v <= range; };
      if (meets(b.h) && meets(b.h + (b.tack === 'S' ? -SUBSTANTIAL_TURN : SUBSTANTIAL_TURN))) return c;
    }
    return null;
  }
  /** With a boat to windward she'd hit tacking, why may she not hail "Room to tack" (Rule 20.1)? Null if she may, or there's no such boat. */
  whyNoRoomHail(b: Boat): string | null {
    const o = this.tackBlocker(b);
    if (!o || this.roomBlocker(b)) return null;
    if (b.twa > beatAngle(b.ww.kt) + 8 || b.tacking) return `Not yet: you may hail "Room to tack" only when you're close-hauled or above (Rule 20.1(b)).`;
    const range = hailRange(b.v), ob = obstructionAhead(b, b.h, b.tack, range);
    if (ob) return `You may not hail: ${this.nextMark(b)?.name ?? 'the island'} is the mark and ${o.name} is fetching it (Rule 20.1). Bear away, or slow down and tack behind them.`;
    const u = V(b.h), ahead = landAlong(b, { x: b.x + u.x * range, y: b.y + u.y * range });
    if (landAlong(b, { x: b.x + u.x * 4 * range, y: b.y + u.y * 4 * range }) === Infinity) return null; // (no obstruction ahead at all)
    if (ahead <= range) return `No need to hail: bearing away about ${SUBSTANTIAL_TURN}° clears it, so it isn't a substantial course change (Rule 20.1(a)). Sail round it.`;
    return `Not yet: hail "Room to tack" when you'll soon need to change course a lot to clear the obstruction, about ${Math.round(range)} m from it at your speed (Rule 20.1(a)).`;
  }
  /** Rule 20.1's last sentence: is the obstruction at `at` her next mark (an island), with `o` fetching it? */
  private markFetchedBy(b: Boat, at: Vec, o: Boat): boolean {
    const m = this.nextMark(b);
    return !!m?.reach && m === this.nextMark(o) && dist(at, m.p) <= markReach(m, at) + 60 && this.fetchingIsland(o, m);
  }
  /** Pinned against an island mark by a boat fetching it, so she may not hail (Rule 20.1): she must find another way round. */
  roomBlockedByMark(b: Boat): boolean {
    const ob = obstructionAhead(b, b.h, b.tack, 4 * hailRange(b.v)), o = this.tackBlocker(b);
    return !!ob && !!o && this.markFetchedBy(b, ob.at, o);
  }

  /**
   * Definitions, Fetching: "in a position to pass to windward of it and leave it on the required side without changing
   * tack", for an island mark: close-hauled on her present tack she'd leave the island on the required side, and her
   * course clears its shore.
   */
  fetchingIsland(o: Boat, m: CourseMark): boolean {
    const beat = beatAngle(o.ww.kt), u = V(o.tack === 'S' ? o.ww.from - beat : o.ww.from + beat), r = sub(m.p, o), along = dot(r, u), far = Math.max(...(m.reach ?? [0]));
    if (along + far <= 0) return false; // she's past all of it
    if ((cross(u, r) > 0) !== (m.side === 'p')) return false; // (cross > 0: the island lies to port of her course)
    // "in a position to pass to windward of it": the island on her leeward side (to port on starboard tack, to starboard
    // on port); a boat leaving it on her windward side passes to leeward of it, and isn't fetching it
    if ((m.side === 'p') !== (o.tack === 'S')) return false;
    const L = Math.max(0, along) + far + 200;
    return landAlong(o, { x: o.x + u.x * L, y: o.y + u.y * L }) === Infinity;
  }

  /** Make a hail. Returns false if one is already pending between the pair. */
  hail(by: Boat, to: Boat, kind: 'room' | 'starboard', relayed = false): boolean {
    const rec = this.pairs[pairKey(by, to)] ??= newPairRecord();
    if (rec.hail && rec.hail.kind === kind) return false;
    rec.hail = { by: by.id, at: this.t, kind, headAt: { [by.id]: { h: by.h, wind: by.ww.from }, [to.id]: { h: to.h, wind: to.ww.from } }, ...(relayed ? { relayed } : {}) };
    if (kind === 'starboard' && to.ai) to.ai.duckUntil = this.t + 10;
    // An AI boat that is clear ahead, with room for the hailing boat to tack and pass astern, replies "You tack".
    const reply = kind === 'room' && !!to.ai && youTackPays(by, to);
    if (to.isUser) this.emit({ type: 'toast', msg: kind === 'room' ? `${by.name}: "Room to tack!" Tack now, or reply "You tack" and give them room (Rule 20).` : `${by.name}: "Starboard!"`, ms: 3500 });
    if (by.isUser && !reply) this.emit({ type: 'toast', msg: kind === 'room' ? `You: "Room to tack!" ${to.name} must tack or reply "You tack".` : `You: "Starboard!" ${to.name} should keep clear.`, ms: 2500 });
    if (reply) this.replyYouTack(to, by);
    return true;
  }

  /** Rule 20.2(c): `by`, hailed for room to tack by `hailer`, replies "You tack" and now owes her room to tack and avoid her. */
  replyYouTack(by: Boat, hailer: Boat): void {
    const rec = this.pairs[pairKey(by, hailer)];
    if (!rec?.hail || rec.hail.kind !== 'room' || rec.hail.by !== hailer.id || rec.hail.replyAt != null) return;
    rec.hail.replyAt = this.t;
    if (hailer.isUser) this.emit({ type: 'toast', msg: `You: "Room to tack!" ${by.name}: "You tack!" Tack now and pass astern of them. They must give you room.`, ms: 4000 });
    if (by.isUser) this.emit({ type: 'toast', msg: `You: "You tack!" Now give ${hailer.name} room to tack and pass astern of you (Rule 20.2(c)).`, ms: 4000 });
  }

  /**
   * Rule 20.3: `b` has been hailed for room to tack by `hailer` and means to respond by tacking, but a boat on the same
   * tack to windward of her stops her: she hails that boat "Room to tack" in turn (she may, even if her own hail doesn't
   * meet rule 20.1's conditions; WS Case 113: she must, as she can't otherwise tack as soon as possible, and may not
   * reply "You tack" instead). Rule 20.2 then applies between her and that boat. Returns the boat hailed, or null.
   */
  passOnHail(b: Boat, hailer: Boat): Boat | null {
    const w = this.canPassOn(b, hailer);
    if (!w) return null;
    const h = this.pairs[pairKey(b, hailer)].hail!;
    h.passedOn = { to: w.id, at: this.t };
    if (b.isUser) this.emit({ type: 'toast', ms: 4000, msg: `You pass it on to ${w.name}: "Room to tack!" Tack as soon as they respond (Rule 20.3).` });
    this.hail(b, w, 'room', true);
    return w;
  }

  /** Rule 20.3: the boat `b` could pass `hailer`'s hail on to (a boat on the same tack to windward stopping her tacking), or null. */
  canPassOn(b: Boat, hailer: Boat): Boat | null {
    const h = this.pairs[pairKey(b, hailer)]?.hail;
    if (!h || h.kind !== 'room' || h.by !== hailer.id || h.replyAt != null || h.passedOn) return null;
    const w = this.tackBlocker(b);
    if (!w || w === hailer) return null;
    if (this.pairs[pairKey(b, w)]?.hail?.kind === 'room') return null; // already a hail between them
    return w;
  }

  /** A hail for room to tack from another boat that you haven't answered yet. */
  pendingRoomHail(b: Boat): Boat | null {
    for (const o of this.boats) {
      const h = o !== b ? this.pairs[pairKey(b, o)]?.hail : null;
      if (h && h.kind === 'room' && h.by === o.id && h.replyAt == null && (b.headToWindT ?? -Infinity) < h.at && !b.tacking) return o; // (rule 20: answered by a tack, not a gybe)
    }
    return null;
  }

  /**
   * The hail you could make now, if any: the reply "You tack" to a boat that's hailed you for room; "Room to tack!" to a
   * boat to windward when you're close-hauled nearing an obstruction (Rule 20); "Starboard!" to a port-tacker on a
   * collision course. The band shows a Hail tab only while there is one.
   */
  hailOption(): { kind: 'reply' | 'room' | 'starboard'; to: Boat; words: string } | null {
    const u = this.user, hailer = this.pendingRoomHail(u);
    if (hailer) {
      // Rule 20.3: with a boat to windward stopping you tacking, and not clear ahead of the hailing boat, pass the hail on
      if (this.pairs[pairKey(u, hailer)]?.hail?.passedOn) return null; // (passed on already: tack when they respond)
      const on = !youTackPays(hailer, u) ? this.canPassOn(u, hailer) : null;
      return on ? { kind: 'room', to: on, words: 'Room to tack!' } : { kind: 'reply', to: hailer, words: 'You tack' };
    }
    const blocker = this.roomBlocker(u);
    if (blocker) return { kind: 'room', to: blocker, words: 'Room to tack!' };
    if (u.tack === 'S') {
      const port = this.boats.filter(o => o !== u && o.tack === 'P' && !o.finished)
        .map(o => ({ o, c: cpa(u, o) })).filter(x => x.c.t < 15 && x.c.d < 25).sort((a, b) => a.c.t - b.c.t)[0];
      if (port) return { kind: 'starboard', to: port.o, words: 'Starboard!' };
    }
    return null;
  }

  /** You pressed Hail: answer a hail with "You tack", hail for room to tack if you're entitled to,
   * "Starboard!" at a converging port boat, or explain why not. */
  userHail(): void {
    const u = this.user, hailer = this.pendingRoomHail(u);
    if (hailer) {
      // Rule 20.3: with a boat to windward stopping you tacking, and not clear ahead of the hailing boat, pass the hail on
      const h = this.pairs[pairKey(u, hailer)]?.hail;
      if (h?.passedOn) { this.emit({ type: 'toast', ms: 3500, msg: `You've passed the hail on. Tack as soon as ${this.boats.find(o => o.id === h.passedOn!.to)?.name ?? 'they'} respond.` }); return; }
      if (!youTackPays(hailer, u) && this.passOnHail(u, hailer)) return;
      this.replyYouTack(u, hailer); return;
    }
    const h = this.hailOption();
    if (h) { this.hail(u, h.to, h.kind as 'room' | 'starboard'); return; }
    const why = this.whyNoRoomHail(u);
    if (why) { this.emit({ type: 'toast', ms: 6000, msg: why }); return; }
    this.emit({ type: 'toast', ms: 5000, msg: 'Nothing to hail. "Room to tack!" is for when you\'re close-hauled and will soon have to change course a lot to clear an obstruction (the shore, a pier, an island), with a boat to windward stopping you tacking (Rule 20). "Starboard!" is for a port-tack boat on a collision course with you.' });
  }

  /** Start a two-turns penalty for a boat after an incident has been reviewed. */
  /** Give a boat the penalty for a Part 2 foul. A mark touch in the same incident needs no penalty of its own (Rule 44.1(a)). */
  assignPenalty(b: Boat): void {
    // (the touch she's still turning for came in this same incident: just now, where she is: rule 44.1(a), Appeal 65)
    // (the touch she's still to turn for came in this same incident: the boat she's now fouled was by her then, and her
    // turns hadn't begun: rule 44.1(a), Appeal 65. Then the foul's penalty replaces the touch's; otherwise it's owed on top)
    const lt = this.lastTouch.get(b.id), vs = this.lastFoulVs.get(b.id)?.vs;
    const touched = !!lt && this.t - lt.t < TANGLE_MAX && !b.penaltyDir && vs != null && lt.near.includes(vs) && b.penalty > 0;
    // (same incident: the foul's turns replace only the touch's one turn, keeping any others she still owes)
    if (b.penalty <= 0) startPenalty(b, this.penaltyDeg); else addPenalty(b, touched ? this.penaltyDeg - ONE_TURN : this.penaltyDeg);
    if (touched) { this.lastTouch.delete(b.id); if (b.isUser) this.emit({ type: 'toast', ms: 5000, msg: 'Your mark touch was part of the same incident, so the foul\'s penalty covers it (Rule 44.1(a)).' }); }
  }
  /** Penalty for a foul under Part 2: Two-Turns by default (Rule 44.1), One-Turn if the sailing instructions say so. */
  get penaltyDeg(): number { return (this.settings.penaltyTurns === 1 ? 1 : 2) * 360; }
}

/**
 * The tide in words at a place: "Ebb 1.4 kt, easing · turns to flood ~13:42". The speed is the sim's own
 * current there (blended stations, eased near the shore), measured along the nearest station's flood/ebb axis.
 */
export function describeTide(f: CurrentField, p: Vec, now: number): { label: string; button: string } {
  const st = f.stations.reduce((a, s) => (dist(s.p, p) < dist(a.p, p) ? s : a)), ax = V(st.flood);
  const g = new CurrentField(f.stations);
  const at = (m: number) => { g.setTime(m); const c = g.atShore(p); return (c.x * ax.x + c.y * ax.y) / KT; };
  const v = at(now), later = at(now + 15);
  let slack = '';
  for (let m = 5; m <= 8 * 60; m += 5) if (Math.sign(at(now + m)) !== Math.sign(v)) { slack = sfClock(now + m); break; }
  if (Math.abs(v) < 0.15) return { label: `Slack, turning to ${later >= v ? 'flood' : 'ebb'}`, button: 'Slack' };
  const kind = v > 0 ? 'Flood' : 'Ebb', trend = Math.abs(later) > Math.abs(v) + 0.02 ? 'building' : Math.abs(later) < Math.abs(v) - 0.02 ? 'easing' : 'at its strongest';
  return { label: `${kind} ${Math.abs(v).toFixed(1)} kt, ${trend}${slack ? ` · turns to ${v > 0 ? 'ebb' : 'flood'} ~${slack}` : ''}`, button: kind };
}

/** Is replying "You tack" sensible for `to`? Only when she's clear ahead of the hailing boat with a
 * length or so to spare, so the hailing boat can tack and pass astern of her. */
export function youTackPays(hailer: Boat, to: Boat): boolean {
  return clearAstern(hailer, to) && hullGap(hailer, to) > LOA * 0.6;
}

/**
 * True wind angle of a boat's proper course: roughly, the course she'd sail to finish as soon as
 * possible with no other boats around. Straight at her next mark if she can lay it; close-hauled
 * if it's upwind; no deeper than the best downwind angle if it's dead downwind. Allowing for the current: across a
 * strong tide her proper course to the mark is the crab that makes good the straight line, not the bearing of it.
 */
export function properTwa(w: World, b: Boat): number | null {
  const P = aimPoint(w, b), toMark = brg(P.x - b.x, P.y - b.y), beat = beatAngle(b.ww.kt), run = Math.max(runAngle(b.ww.kt), 150);
  const clampT = (t: number) => Math.min(Math.max(t, beat), run);
  // allowing for the current: the heading that makes good the straight line to the mark, up-tide of it by as much as
  // the current across her track would set her down (as the AI, the tiller pilot and the planner steer: crabFor), at
  // the speed she'd make on that crab (her polar speed there, found by one step of iteration from the line's bearing)
  const cur = b.cur ?? { x: 0, y: 0 }, n = V(toMark + 90), u = V(toMark), across = cur.x * n.x + cur.y * n.y;
  let twa = clampT(Math.abs(wrap(b.ww.from - toMark)));
  for (let i = 0; i < 2; i++) {
    const vs = polar(b.ww.kt, twa);
    // a cross-current as fast as she sails (crabFor's clamp) or one that leaves her no way along the line: no heading makes
    // good the line, so her proper course can't be worked out from it: give her the benefit of the doubt
    if (Math.abs(across) >= 0.9 * vs) return null;
    const h = crabFor(toMark, vs, cur), sog = vs * (V(h).x * u.x + V(h).y * u.y) + cur.x * u.x + cur.y * u.y;
    if (sog <= 0) return null;
    twa = clampT(Math.abs(wrap(b.ww.from - h)));
  }
  // (unsigned, as her own twa is: a crab carrying her through dead downwind onto the other gybe is compared by size only)
  return twa;
}
