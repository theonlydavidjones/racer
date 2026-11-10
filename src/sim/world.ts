import { FLEET, bow, stern, type Boat } from '../boat/boat';
import { moveBoat } from '../boat/physics';
import { defaultControls } from '../boat/controls';
import { D2R, KT, LOA, V, brg, cross, dist, dot, markDist, n360, segPt, sub, wrap, type Vec } from '../core/math';
import { makeRng, type Rng } from '../core/rng';
import { buildCourse, type Course, type CourseFile, type CourseMark } from '../courses/course';
import { CURRENTS, currentAt, currentVector, shoreRelief, windOnWater, type CurrentPreset } from '../environment/current';
import { CurrentField, nextSaturday, sfClock, sfLocalToUtcMin, stationsFor } from '../environment/tide';
import { FLAT_SEA, SeaField, type SeaHere } from '../environment/sea';
import { dayWeather, type DayWeather } from '../environment/weather';
import { Puffs, landLee, windAt, windTerrain, type Breeze, type Wind, type WindDay, type WindKind, type WindModel } from '../environment/wind';
import { onLand, shoreDist } from '../geo/shore';
import { RECORD_EVERY_STEPS, RECORD_KEEP, snapshot, type Frame } from '../replay/recorder';
import { RULE16_WINDOW, assessPair, type Incident, clearAstern, cpa, hullGap, newPairRecord, rightOfWay, type PairRecord, type RulesContext, type Verdict } from '../rules';
import { beatAngle, polar, runAngle } from '../boat/polar';
import { aimPoint, sailable } from '../ai/ai';
import type { Settings } from '../settings';
import { aiThink } from '../ai/ai';
import type { SimEvent } from './events';
import { Traffic, VESSEL, vesselHull, type Vessel } from './traffic';
import { lineTransit } from './transits';
import { SHIP_AIR, WindSum, addBoatWake, addCommitteeWake, addShipWake, type Shadow } from '../environment/shadows';
import { destMark, place as getPlace } from './places';
import { sailNo } from '../boat/spec';
import { condition } from '../boat/condition';

/** Map and label colours for your own boats when they race against you (the stock boats have their own). */
const OPP_TAGS = ['#c08cff', '#ff9f43', '#4dd8e8', '#ff7ab8', '#a3e05a', '#f2d24b', '#9fb4ff'];
const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, c => c.toUpperCase());
import { DEFAULT_CREW, newCrew, type CrewSpec } from '../boat/crewPhys';
import { landAt } from '../environment/sea';
import { toLL } from '../geo/geo';
import { FLAG_NAME, X_FLAG_MAX, flagsAt, inTriangle, startSequence, type Flag, type PrepFlag, type Signal } from './signals';
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
/** How long after a Part 2 foul a mark touch counts as the same incident (Rule 44.1(a)), s. */
const SAME_INCIDENT = 8;
/** A boat forced into a breach by another boat's breach this recently is exonerated (Rule 43.1(a)), s. */
const COMPELLED_WINDOW = 3;

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
  /** Just sail: no race, no other boats, no start sequence. */
  freeSail?: boolean;
  /** Fly your flags even though it's a race (to see them while setting up your boat). */
  showFlags?: boolean;
  /** The race committee chose this course: its number (flown in numeral pennants) and why. */
  courseSignal?: { no: number; why: string };
}

/** Your crew from the settings (0–2 crew besides you at the helm). */
function userCrew(s: Settings): CrewSpec {
  const c = s.crew ?? { n: 2, helm: DEFAULT_CREW.helm, people: DEFAULT_CREW.crew };
  return { helm: c.helm, crew: c.people.slice(0, c.n) };
}

const pairKey = (A: Boat, B: Boat) => A.id < B.id ? A.id + '-' + B.id : B.id + '-' + A.id;

export class World {
  readonly C: Course;
  readonly settings: Settings;
  readonly seed: number;
  readonly rng: Rng;
  /** The current near the start line, summarized (direction, speed, words). Updated as the tide changes. */
  cur: CurrentPreset;
  cvec: Vec; // current near the start line, m/s
  /** Real tide: NOAA-based current field, and the start signal's time (minutes since epoch, UTC). */
  readonly tide: CurrentField | null = null;
  readonly gunUtc: number = 0;
  /** Race day (YYYY-MM-DD, San Francisco) and whether the clock time matters (real tide or sea breeze). */
  readonly raceDate: string = '';
  readonly realTime: boolean = false;
  /** The afternoon westerly from the NOAA records (Settings.windKt 0), and which kind of day. */
  readonly seaBreeze: boolean;
  readonly windDay: WindDay;
  /** The kind of wind the day brings: the westerly, a northerly, a southerly, or light and variable. */
  readonly windKind: WindKind;
  /** The day's weather: observed, forecast, or from the records (environment/weather.ts). */
  readonly weather: DayWeather;
  /** Racing in the real day's wind (observed or forecast). */
  get realWind(): boolean { return this.weather.source === 'observed' || this.weather.source === 'forecast'; }
  breeze: Breeze | null = null;
  /** Puffs and lulls drifting across the course. */
  readonly puffs: Puffs;
  readonly windModel: WindModel;
  /** Ship traffic, and where the vessels are now. */
  readonly traffic: Traffic;
  vessels: Vessel[] = [];
  private warned = new Map<number, number>();
  /** The waves: chop from the wind and current, swell through the Gate (or flat water). */
  readonly sea: SeaField;

  t: number; // race time, s; negative before the start signal
  steps = 0;
  running = false;
  paused = false;
  speed = 1;
  wind: Wind;
  avgFrom: number; // ~1 min running mean of the wind direction, for lift/header calls
  boats: Boat[] = [];
  pairs: Record<string, PairRecord> = {};
  rec: Frame[] = [];
  horns: Record<number, boolean> = {};
  startReport: StartReport | null = null;
  fouls = 0;
  fouledBy = 0;
  finishShown = false;
  userFinishT: number | null = null;
  groundToast = { t: -99 };
  events: SimEvent[] = [];
  /** When each boat last broke a Part 2 rule, and last touched a mark (Rule 44.1(a)); who last fouled each boat (Rule 43.1(a)). */
  private lastFoul = new Map<number, number>();
  private lastTouch = new Map<number, number>();
  private fouledAt = new Map<number, { by: number; t: number }>();
  /** Recent headings per boat, one every 0.1 s, oldest first (for Rule 16.1). */
  private hHist: number[][] = [];

  /** The starting signals, the flags flying now, and the X flag (individual recall). */
  readonly sequence: Signal[];
  readonly prepFlag: PrepFlag;
  flags: Flag[] = [];
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
  /** The course number the committee is flying (numeral pennants), and why they chose it; null when you chose it. */
  courseSignal: { no: number; why: string } | null = null;
  /** Racing: the tactics debrief's log of your race (null when just sailing). */
  log: RaceLog | null = null;
  /** Just sail: when you got there (sim time), or null. */
  arrivedT: number | null = null;

  constructor(file: CourseFile, settings: Settings, seed: number, opts: WorldOptions = {}) {
    this.settings = { ...settings };
    this.seed = seed;
    this.rng = makeRng(seed);
    // the race day and clock, and the kind of wind the day brings (from the records for the month, or as chosen)
    this.raceDate = settings.tideDate || nextSaturday();
    this.gunUtc = sfLocalToUtcMin(this.raceDate, settings.tideTime || '12:00');
    this.windDay = settings.windDay ?? 1;
    // the real day (observed, or the forecast), or a day from the records, or the kind you chose
    this.weather = dayWeather(this.raceDate, settings.windKind ?? 'auto', this.windDay);
    this.windKind = this.weather.kind;
    const atGun = this.weather.at(this.gunUtc);
    // a westerly at a set strength (not a real day) blows from the course's own westerly (as it runs over the race area)
    if (settings.windKt !== 0 && this.windKind === 'west' && !this.realWind) { atGun.from = file.windBase; atGun.steady = 1; atGun.gust = 1.5; }
    // the course for the day's wind: a laid course is set to it; fixed marks stay put, and its legs are whatever the wind makes them
    this.C = buildCourse(file, { bias: settings.bias, fleet: settings.fleet, windFrom: atGun.from });
    this.cur = { ...(CURRENTS[settings.current] ?? CURRENTS.slack) };
    this.cvec = currentVector(this.cur);
    this.freeSail = !!opts.freeSail; this.showFlags = !!opts.showFlags;
    this.courseSignal = this.freeSail ? null : opts.courseSignal ?? null;
    this.startAt = this.freeSail ? 0 : opts.startAt ?? settings.seq * 60;
    this.t = -this.startAt;
    this.prepFlag = settings.prepFlag ?? 'P';
    this.sequence = this.freeSail ? [] : startSequence(settings.seq, this.prepFlag);
    this.flags = flagsAt(this.sequence, this.t);
    this.seaBreeze = settings.windKt === 0;
    this.realTime = settings.current === 'real' || this.seaBreeze;
    // the race day and clock: they drive the real tide and westerly, and always the sun
    this.traffic = new Traffic(settings.traffic !== 0, seed);
    this.sea = new SeaField(settings.sea === 'flat' ? null : this.weather.swell(settings.swellDay ?? 1));
    if (settings.current === 'real') {
      this.tide = new CurrentField(stationsFor(this.gunUtc - this.startAt / 60 - 30, this.gunUtc + 6 * 60));
      this.updateTide();
    }
    const r = this.rng;
    this.windModel = { base: this.C.base, kt: settings.windKt || 12, phase: [r() * 6.28, r() * 6.28, r() * 6.28], steady: atGun.steady };
    if (this.freeSail) this.dest = destMark(getPlace(settings.sailTo));
    { // the puffs: over the race area, or for just sailing, over the water between where you start and where you're going
      const from = getPlace(settings.sailFrom)?.p ?? this.C.center, to = this.dest?.p ?? from;
      const c = this.freeSail ? { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 } : this.C.center;
      const half = this.freeSail ? Math.max(3000, dist(from, to) / 2 + 1500) : 3000;
      this.puffs = new Puffs(makeRng((seed ^ 0x5eed5) >>> 0), c, half, Math.round(170 * (half / 3000) ** 2));
    }
    this.updateBreeze();
    this.wind = windAt(this.windModel, this.t);
    this.avgFrom = this.windModel.base;
    for (let i = 0; i <= (this.freeSail ? 0 : settings.fleet); i++) this.boats.push(this.makeBoat(i)); // (Setup keeps fleet = opponents.length)
    this.startTimes = this.boats.map(() => null);
    if (!this.freeSail) this.log = new RaceLog(this);
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
    const oppSpec = pick && !pick.startsWith('stock:') ? this.settings.boats?.find(b => b.id === pick) : undefined;
    const F = isUser ? FLEET[0] : FLEET[pick && pick.startsWith('stock:') ? +pick.slice(6) : 0] ?? FLEET[((i - 1) % 5) + 1];
    const place = (d: number, a: number) => ({ x: this.center.x - this.N.x * d + this.L.x * a, y: this.center.y - this.N.y * d + this.L.y * a });
    const lineH = brg(this.L.x, this.L.y);
    let p: Vec, h: number;
    if (isUser && this.freeSail) {
      // where you chose to start, on a beam reach: whichever way has more open water ahead
      const at = getPlace(this.settings.sailFrom)?.p;
      if (at) {
        p = { ...at };
        const room = (hh: number) => { const u = V(hh); let d = 0; while (d < 600 && !onLand({ x: p.x + u.x * (d + 20), y: p.y + u.y * (d + 20) })) d += 20; return d; };
        const a = n360(this.windModel.base + 90), b = n360(this.windModel.base - 90);
        h = room(a) >= room(b) ? a : b;
      } else {
        p = place(-220, 0); h = n360(lineH + 180);
        for (let k = 0; onLand(p) && k < 20; k++) p = place(-220 - 40 * k, 0);
      }
    } else if (isUser && this.startAt < 120) {
      // start practice: somewhere below the line, reaching along it, with a minute or so to go
      p = place(55 + r() * 45, (r() - 0.5) * this.lineLen * 0.6); h = n360(lineH + (r() < 0.5 ? 0 : 180));
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
      id: i, isUser, name: spec && !isUser ? titleCase(spec.name) || `Boat ${i}` : F.name, no: spec ? sailNo(spec) : F.no, color: spec && !isUser ? OPP_TAGS[(i - 1) % OPP_TAGS.length] : F.tag,
      hullColor: spec ? spec.hull.upper : F.hull, sailColor: spec ? (spec.sails.color === 'black' ? '#232427' : '#fbfaf5') : F.sail,
      build: spec ? { hull: spec.hull.material, spars: spec.perf.mast, boom: spec.perf.boom } : F.build,
      ...(spec ? { spec, cond: condition(spec, +this.raceDate.slice(5, 7) || 9), paint: { deck: spec.deck, boot: spec.hull.stripe, bottom: spec.hull.lower, boatName: spec.name } } : { paint: F.paint }),
      x: p.x, y: p.y, h, v: isUser && this.startAt < 120 ? 2 : 1.5, vx: 0, vy: 0, tack: 'S', tacking: false, lastTackT: -999,
      steer: 0, tiller: 0, turnTarget: null, turnDir: 0, luff: false, desired: h,
      penalty: 0, penaltyTotal: 0, penaltyTurned: 0, penaltyDir: 0, started: false, ocs: false, leg: 0, finished: false, finishT: null,
      prevD: null, prevAng: null, prevPass: null, nearMin: 1e9, forced14: null, markTouch: null,
      cur: { x: 0, y: 0 }, ww: { from: this.wind.from, kt: this.wind.kt }, rel: 0, twa: 90, awa: 90, arel: 90, aws: 0, sheets: { main: 30, jib: 30 }, manualTrim: isUser && !!this.settings.manualTrim, sheetCmd: { main: 0, jib: 0 }, trimAll: isUser && this.settings.manualTrim === 2, ctl: defaultControls(), ctlCmd: {}, shape: { main: { depth: 0.12, draft: 0.45, twist: 10 }, jib: null, eff: 1 }, trim: { main: { eff: 1, err: 0, flow: 'good', amount: 0 }, jib: { eff: 1, err: 0, flow: 'good', amount: 0 } }, awaSlow: 90, poleWant: false, pole: 'down', poleT: 0, poleTack: 'S',
      heel: 0, boom: 0, jib: 0, sea: FLAT_SEA, crew: newCrew(isUser ? userCrew(this.settings) : DEFAULT_CREW, 'S'),
      // flags come down for a race: they fly when you're just sailing
      ...(spec && (this.freeSail || this.showFlags) ? { burgee: spec.flags.burgee || undefined, ensign: spec.flags.ensign || undefined, special: spec.flags.special || undefined } : {}),
      ai: isUser ? null : {
        mode: 'hold', wp: r() < 0.5 ? 0 : 1, f: 0.12 + 0.76 * r(),
        depth: 55 + r() * 45, aggr: r() * 6, width: 110 + r() * 130, aware: r() < 0.7, clearing: false, plan: { leave: NaN, tReach: Infinity, coast: 0, back: false }, turnCommit: 0, commitFor: 0, duckUntil: -Infinity, lastHail: -Infinity
      }
    };
  }

  /* ---------- queries used by AI, HUD and rendering ---------- */
  rulesCtx(): RulesContext { return { t: this.t, windFrom: this.wind.from, marks: this.C.marks, beat: beatAngle(this.wind.kt), obstacle: this.obstacle }; }
  /** The committee boat's hull, as a line along the wind with its half-width (null if the committee end is not a boat). */
  get committeeHull(): Touchable | null {
    if (this.C.committeeKind !== 'boat') return null;
    const u = V(this.C.base), c = this.C.committee;
    return { name: 'the committee boat', p: { x: c.x + u.x * 6, y: c.y + u.y * 6 }, q: { x: c.x - u.x * 6, y: c.y - u.y * 6 }, r: 2 };
  }
  /** Rule 19: the nearest obstruction (the shore; after the start, the committee boat) within 30 m. */
  private obstacle = (p: Vec, committee: boolean): { d: number; n: Vec; continuing: boolean } | null => {
    let best: { d: number; n: Vec; continuing: boolean } | null = null;
    const ds = shoreDist(p);
    if (ds < 30) {
      const e = 0.5, gx = shoreDist({ x: p.x + e, y: p.y }) - shoreDist({ x: p.x - e, y: p.y }), gy = shoreDist({ x: p.x, y: p.y + e }) - shoreDist({ x: p.x, y: p.y - e });
      const l = Math.hypot(gx, gy) || 1;
      best = { d: ds, n: { x: gx / l, y: gy / l }, continuing: true };
    }
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
  nextMark(b: Boat): CourseMark | null { return this.freeSail ? (b.isUser && this.arrivedT == null ? this.dest : null) : b.leg < this.C.marks.length ? this.C.marks[b.leg] : null; }
  /** Mid-race, the start/finish line is an obstruction for this boat. */
  obstructed(b: Boat): boolean { return this.C.obstruction && this.t > 0 && b.started && b.leg >= 1 && b.leg < this.C.marks.length; }
  currentAt(p: Vec): Vec {
    if (!this.tide) return currentAt(p, this.cvec);
    const c = this.tide.at(p), k = shoreRelief(p);
    return { x: c.x * k, y: c.y * k };
  }
  /**
   * The true wind at a point: the course-wide wind (with its oscillating shifts), stronger in the slot and
   * lighter near the shore, plus whatever puff or lull is passing.
   */
  windHere(p: Vec, self?: Boat): Wind {
    const q = this.puffs.at(p), sh = this.shadowAt(p, self);
    if (self) self.shadowK = sh.k;
    return { from: n360(this.wind.from + q.veer + sh.shift), kt: this.wind.kt * windTerrain(p, this.wind.from) * q.k * sh.k };
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
    const r = sum.result(from);
    return { k: r.k * lee, shift: r.shift };
  }

  /** The sea at any point, for the wind and current there. */
  seaHere(p: Vec): SeaHere {
    const c = this.currentAt(p);
    return this.sea.at(p, windOnWater(this.windHere(p), c), c, q => this.currentAt(q));
  }

  /** The sea breeze for the time of day: sets the course-wide mean direction and strength, and the gustiness. */
  private updateBreeze(): void {
    const b = this.breeze = this.weather.at(this.clockUtc);
    if (!this.seaBreeze) { // a set strength: the direction stays where it was at the gun
      if (this.windKind !== 'west' || this.realWind) { this.windModel.steady = b.steady; this.puffs.setGust(Math.max(1.5, b.gust)); } else this.puffs.setGust(1.5);
      return;
    }
    this.windModel.steady = b.steady;
    this.windModel.base = b.from; this.windModel.kt = b.kt;
    this.puffs.setGust(b.gust);
  }

  /** Clock time now, minutes since epoch UTC (real tide or sea breeze). */
  get clockUtc(): number { return this.gunUtc + this.t / 60; }
  /** Local San Francisco time of day now, e.g. "12:04" (real tide only). */
  get clock(): string { return sfClock(this.clockUtc); }

  /** The real tide at the course: refresh the field, and the summary used by the HUD, maps and messages. */
  private updateTide(): void {
    const f = this.tide!, now = this.clockUtc;
    f.setTime(now);
    this.cvec = this.currentAt(this.C.center);
    this.cur = { ...this.cur, ...describeTide(f, this.C.center, now), set: brg(this.cvec.x, this.cvec.y), kt: Math.hypot(this.cvec.x, this.cvec.y) / KT };
  }

  /* ---------- the fixed step ---------- */
  step(dt = DT): void {
    const prevT = this.t;
    this.t += dt;
    this.steps++;
    if (this.steps % 60 === 0) this.updateBreeze();
    this.wind = windAt(this.windModel, this.t);
    this.puffs.step(dt, this.wind);
    if (this.tide) { if (this.steps % 60 === 0) this.updateTide(); else this.tide.setTime(this.clockUtc); }
    this.avgFrom = n360(this.avgFrom + wrap(this.wind.from - this.avgFrom) * dt / 60);
    if (this.steps % 30 === 1) for (const b of this.boats) b.leeK = landLee(b, this.wind.from); // the lee of the land, twice a second
    for (const b of this.boats) { b.forced14 = null; b.cur = this.currentAt(b); b.ww = windOnWater(this.windHere(b, b), b.cur); }
    this.vessels = this.traffic.vessels(this.trafficT);
    if (this.steps % 30 === 1) for (const b of this.boats) {
      b.sea = this.sea.at(b, b.ww, b.cur, q => this.currentAt(q));
      const wk = this.traffic.wakeAt(b, this.trafficT);
      if (wk) b.sea = { ...b.sea, wake: wk };
    }
    for (const b of this.boats) if (!b.isUser) { aiThink(this, b, dt); this.keepClearOfShips(b); }
    for (const b of this.boats) moveBoat(b, dt, this.t, this.emit, this.groundToast);
    if (!this.freeSail) { this.checkLines(prevT); this.checkMarkTouches(); }
    this.log?.step(this, dt);
    this.trackCourses();
    this.shipEncounters();
    this.checkPairs();
    if (!this.freeSail) this.signals(prevT);
    else this.checkArrival();
    if (this.steps % RECORD_EVERY_STEPS === 0) {
      this.rec.push(snapshot(this.t, this.boats));
      if (this.rec.length > RECORD_KEEP) this.rec.shift();
    }
  }

  private checkLines(prevT: number): void {
    const gun = prevT < 0 && this.t >= 0, C = this.C, n = C.marks.length;
    if (gun) this.snapGun();
    for (const b of this.boats) {
      const bw = bow(b), d = this.lineD(bw), a = this.lineA(b);
      const within = Math.abs(a) <= this.lineLen / 2 + 2;
      if (gun && ((d > 0 && Math.abs(a) < this.lineLen / 2 + 25) || b.roundEnd)) {
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
        if (!b.started && !b.ocs && crossedFwd) {
          b.started = true; this.startTimes[b.id] = this.t;
          if (b.isUser) {
            const frac = (a + this.lineLen / 2) / this.lineLen;
            this.startReport = { delay: this.t, frac, kt: b.v / KT };
            const where = frac < 0.2 ? 'at the ' + C.pinLabel + ' end' : frac > 0.8 ? 'at the ' + C.committeeLabel + ' end' : 'mid-line';
            const q = this.t < 3 && b.v / KT > 4 ? 'Great start' : this.t < 8 ? 'Decent start' : 'Late start';
            this.emit({ type: 'toast', msg: `${q}: +${this.t.toFixed(1)} s, ${where}, ${(b.v / KT).toFixed(1)} kt`, ms: 4000 });
          }
        } else if (b.started && b.leg >= n && !b.finished && (C.finishSign > 0 ? crossedFwd : crossedBack)) {
          b.finished = true; b.finishT = this.t;
          if (b.isUser) { this.userFinishT = this.t; this.emit({ type: 'toast', msg: 'Finished!' }); this.emit({ type: 'horn', dur: 0.5 }); this.emit({ type: 'finished' }); }
        } else if (this.obstructed(b) && (crossedFwd || crossedBack) && b.penalty <= 0) {
          startPenalty(b, TWO_TURNS); // the Seaweed Soup addendum (B1.1) sets two turns for this, whatever the foul penalty
          if (b.isUser) this.emit({ type: 'toast', msg: 'You crossed the start/finish line mid-race. It is an obstruction here: two-turn penalty.', ms: 4500 });
        }
      }
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
    if (b.finished) return out;
    const pinMark = C.marks.find(m => dist(m.p, C.pin) < 1);
    const pin: Touchable | null = C.pinKind === 'buoy' ? { name: C.pinLabel, p: C.pin, r: 0.9 }
      : pinMark ? { name: pinMark.name, p: C.pin, r: pinMark.shape === 'sphere' ? 1.2 : 1.0 } : null;
    const R = { sphere: 1.2, cylinder: 1.0, column: 1.0, lighted: 1.6, island: 0 };
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
      if (touching && b.markTouch !== touching.name) {
        b.v *= 0.6;
        // Rule 44.1(a): a Part 2 foul and a mark touch in the same incident: only the Part 2 penalty
        const sameIncident = this.t - (this.lastFoul.get(b.id) ?? -Infinity) < SAME_INCIDENT;
        if (!sameIncident) { addPenalty(b, ONE_TURN); this.lastTouch.set(b.id, this.t); }
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
        target: polar(b.ww.kt, beatAngle(b.ww.kt)), ocs: this.lineD(bow(b)) > 0 && Math.abs(this.lineA(b)) < this.lineLen / 2 + 25, penalty: b.penalty > 0
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
      b.aboveProper = this.t > 0 && b.started && !b.finished && b.twa < properTwa(this, b) - 10;
    });
  }

  private checkPairs(): void {
    const bs = this.boats, ctx = this.rulesCtx(), found: { A: Boat; B: Boat; incident: Incident<Boat> }[] = [];
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const A = bs[i], B = bs[j], key = pairKey(A, B);
      const rec = this.pairs[key] ??= newPairRecord();
      const answered = rec.hail?.respondedAt != null;
      const { incident } = assessPair(rec, A, B, ctx, { swerve: A.forced14 === B.id || B.forced14 === A.id });
      const h = rec.hail;
      if (h && h.kind === 'room' && !answered && h.respondedAt != null && h.replyAt == null) {
        // the hailed boat tacked: now the hailing boat must tack too (Rule 20.2(d))
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
      if (incident.kind !== 'hail' && by && by.by !== victim.id && this.t - by.t < COMPELLED_WINDOW) incident.exoneratedBy = by.by;
      if (incident.kind === 'contact') {
        A.v *= 0.35; B.v *= 0.35;
        const dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy) || 1;
        A.x -= dx / l * 0.8; A.y -= dy / l * 0.8; B.x += dx / l * 0.8; B.y += dy / l * 0.8;
      }
      if (incident.exoneratedBy == null) this.lastFoul.set(f.id, this.t);
      if (A.isUser || B.isUser) {
        this.paused = true;
        if (incident.exoneratedBy == null) { if (f.isUser) this.fouls++; else this.fouledBy++; }
        this.emit({ type: 'incident', a: A, b: B, incident, frames: this.rec.slice(-100).concat([snapshot(this.t, this.boats)]), wind: this.wind.from });
      } else if (incident.exoneratedBy == null && f.penalty <= 0) this.assignPenalty(f); // a boat already doing turns finishes them
    }
  }

  /** The race committee: flags and sounds on time (RRS 26), the individual recall (29.1), and the last-minute rules (30). */
  private signals(prevT: number): void {
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
      if (f === 'I') {
        // Rule 30.1: on the course side of the line or its extensions
        if (!b.roundEnd && this.lineD(bow(b)) > 0) {
          b.roundEnd = true;
          if (b.isUser) this.emit({ type: 'toast', ms: 5000, msg: 'I flag: you were on the course side in the last minute. Sail back around an end of the line to the pre-start side, then start (Rule 30.1).' });
        }
      } else if (!b.scoring && (inTriangle(bow(b), a, b2, c) || inTriangle(b, a, b2, c))) {
        b.scoring = f === 'Z' ? 'ZFP' : f === 'U' ? 'UFD' : 'BFD';
        if (b.isUser) this.emit({ type: 'toast', ms: 6000, msg: f === 'Z'
          ? 'Z flag: you were in the triangle in the last minute. 20% scoring penalty (Rule 30.2). Keep racing.'
          : `${FLAG_NAME[f]}: you were in the triangle in the last minute. Disqualified (Rule ${f === 'U' ? '30.3' : '30.4'}), without a hearing.` });
        else this.emit({ type: 'toast', ms: 3000, msg: `${b.name} was in the triangle in the last minute: ${b.scoring}.` });
      }
    }
  }

  /** Just sail: tell her when she gets to where she was going. */
  private checkArrival(): void {
    const d = this.dest, u = this.user;
    if (!d || this.arrivedT != null || markDist(u, d) > 40) return;
    this.arrivedT = this.t;
    const m = Math.floor(this.t / 60), s = Math.round(this.t % 60);
    this.emit({ type: 'toast', msg: `Arrived: ${d.name}, in ${m} min ${s} s. Choose somewhere new in Setup, or keep sailing.`, ms: 6000 });
    this.emit({ type: 'horn', dur: 0.4 });
  }

  /* ---------- hails ---------- */

  /**
   * Rule 20.1: may `b` hail for room to tack? She must be sailing close-hauled (or above), approaching an
   * obstruction (here, the shore) so that she'll soon have to tack, with a boat on the same tack to
   * windward that she'd hit if she tacked. Returns that boat, or null.
   */
  roomBlocker(b: Boat): Boat | null {
    if (b.twa > beatAngle(b.ww.kt) + 8 || b.tacking) return null;
    const u = V(b.h), ahead = { x: b.x + u.x * 3 * LOA, y: b.y + u.y * 3 * LOA };
    if (!onLand(ahead) && shoreDist(ahead) > 15) return null;
    const wv = V(this.wind.from);
    let best: Boat | null = null, bd = 30;
    for (const o of this.boats) {
      if (o === b || o.tack !== b.tack || o.finished) continue;
      const dx = o.x - b.x, dy = o.y - b.y, d = Math.hypot(dx, dy);
      const toWindward = dx * wv.x + dy * wv.y > 1, notAstern = dx * u.x + dy * u.y > -LOA;
      if (d < bd && toWindward && notAstern) { bd = d; best = o; }
    }
    return best;
  }

  /** Make a hail. Returns false if one is already pending between the pair. */
  hail(by: Boat, to: Boat, kind: 'room' | 'starboard'): boolean {
    const rec = this.pairs[pairKey(by, to)] ??= newPairRecord();
    if (rec.hail && rec.hail.kind === kind) return false;
    rec.hail = { by: by.id, at: this.t, kind };
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

  /** A hail for room to tack from another boat that you haven't answered yet. */
  pendingRoomHail(b: Boat): Boat | null {
    for (const o of this.boats) {
      const h = o !== b ? this.pairs[pairKey(b, o)]?.hail : null;
      if (h && h.kind === 'room' && h.by === o.id && h.replyAt == null && b.lastTackT < h.at && !b.tacking) return o;
    }
    return null;
  }

  /** You pressed Hail: answer a hail with "You tack", hail for room to tack if you're entitled to,
   * "Starboard!" at a converging port boat, or explain. */
  userHail(): void {
    const u = this.user, hailer = this.pendingRoomHail(u);
    if (hailer) { this.replyYouTack(u, hailer); return; }
    const blocker = this.roomBlocker(u);
    if (blocker) { this.hail(u, blocker, 'room'); return; }
    if (u.tack === 'S') {
      const port = this.boats.filter(o => o !== u && o.tack === 'P' && !o.finished)
        .map(o => ({ o, c: cpa(u, o) })).filter(x => x.c.t < 15 && x.c.d < 25).sort((a, b) => a.c.t - b.c.t)[0];
      if (port) { this.hail(u, port.o, 'starboard'); return; }
    }
    this.emit({ type: 'toast', ms: 5000, msg: 'Nothing to hail. "Room to tack!" is for when you\'re close-hauled near the shore with a boat to windward stopping you tacking (Rule 20). "Starboard!" is for a port-tack boat on a collision course with you.' });
  }

  /** Start a two-turns penalty for a boat after an incident has been reviewed. */
  /** Give a boat the penalty for a Part 2 foul. A mark touch in the same incident needs no penalty of its own (Rule 44.1(a)). */
  assignPenalty(b: Boat): void {
    const touched = this.t - (this.lastTouch.get(b.id) ?? -Infinity) < SAME_INCIDENT && b.penalty > 0;
    startPenalty(b, this.penaltyDeg); // replaces a one-turn penalty from that touch, if she hadn't finished it
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
  const st = f.stations.reduce((a, s) => (dist(s.p, p) < dist(a.p, p) ? s : a)), ax = V(st.flood), k = shoreRelief(p);
  const g = new CurrentField(f.stations);
  const at = (m: number) => { g.setTime(m); const c = g.at(p); return (c.x * ax.x + c.y * ax.y) * k / KT; };
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
 * if it's upwind; no deeper than the best downwind angle if it's dead downwind.
 */
export function properTwa(w: World, b: Boat): number {
  const P = aimPoint(w, b), toMark = brg(P.x - b.x, P.y - b.y), twa = Math.abs(wrap(b.ww.from - toMark));
  return Math.min(Math.max(twa, beatAngle(b.ww.kt)), Math.max(runAngle(b.ww.kt), 150));
}
