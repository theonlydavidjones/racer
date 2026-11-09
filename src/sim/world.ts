import { FLEET, bow, stern, type Boat } from '../boat/boat';
import { moveBoat } from '../boat/physics';
import { D2R, KT, brg, cross, dist, dot, n360, sub, wrap, type Vec } from '../core/math';
import { makeRng, type Rng } from '../core/rng';
import { buildCourse, type Course, type CourseFile, type CourseMark } from '../courses/course';
import { CURRENTS, currentAt, currentVector, windOnWater, type CurrentPreset } from '../environment/current';
import { windAt, type Wind, type WindModel } from '../environment/wind';
import { onLand } from '../geo/shore';
import { RECORD_EVERY_STEPS, RECORD_KEEP, snapshot, type Frame } from '../replay/recorder';
import { assessPair, newPairRecord, rightOfWay, type PairRecord, type RulesContext, type Verdict } from '../rules';
import type { Settings } from '../settings';
import { aiThink } from '../ai/ai';
import type { SimEvent } from './events';

/** Fixed simulation step. Rendering runs at whatever rate the browser gives; the sim always steps at 60 Hz. */
export const DT = 1 / 60;
/** Two-turns penalty, in degrees of turning. */
export const TWO_TURNS = 720;

export interface StartReport { delay: number; frac: number; kt: number }

const pairKey = (A: Boat, B: Boat) => A.id < B.id ? A.id + '-' + B.id : B.id + '-' + A.id;

export class World {
  readonly C: Course;
  readonly settings: Settings;
  readonly seed: number;
  readonly rng: Rng;
  readonly cur: CurrentPreset;
  readonly cvec: Vec; // open-water current, m/s
  readonly windModel: WindModel;

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

  constructor(file: CourseFile, settings: Settings, seed: number) {
    this.settings = { ...settings };
    this.seed = seed;
    this.rng = makeRng(seed);
    this.C = buildCourse(file, { bias: settings.bias, fleet: settings.fleet });
    this.cur = CURRENTS[settings.current] ?? CURRENTS.slack;
    this.cvec = currentVector(this.cur);
    this.t = -settings.seq * 60;
    const r = this.rng;
    this.windModel = { base: this.C.base, kt: settings.windKt, phase: [r() * 6.28, r() * 6.28, r() * 6.28] };
    this.wind = windAt(this.windModel, this.t);
    this.avgFrom = this.C.base;
    for (let i = 0; i <= settings.fleet; i++) this.boats.push(this.makeBoat(i));
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
    const isUser = i === 0, F = FLEET[i], r = this.rng;
    const place = (d: number, a: number) => ({ x: this.center.x - this.N.x * d + this.L.x * a, y: this.center.y - this.N.y * d + this.L.y * a });
    const lineH = brg(this.L.x, this.L.y);
    let p: Vec, h: number;
    if (isUser) { p = place(100, -this.lineLen * 0.1); h = n360(lineH + 180); }
    else {
      let tries = 0;
      do { p = place(70 + r() * 60, (r() - 0.5) * this.lineLen * 0.8); tries++; } while (onLand(p) && tries < 20);
      h = n360(lineH + (r() < 0.5 ? 0 : 180));
    }
    return {
      id: i, isUser, name: F.name, no: F.no, color: F.tag, hullColor: F.hull, sailColor: F.sail, build: F.build,
      x: p.x, y: p.y, h, v: 1.5, vx: 0, vy: 0, tack: 'S', tacking: false, lastTackT: -999,
      steer: 0, turnTarget: null, turnDir: 0, luff: false, desired: h,
      penalty: 0, started: false, ocs: false, leg: 0, finished: false, finishT: null,
      prevD: null, prevAng: null, prevPass: null, nearMin: 1e9, forced14: null,
      cur: { x: 0, y: 0 }, ww: { from: this.C.base, kt: this.settings.windKt }, rel: 0, twa: 90, awa: 90, arel: 90, aws: 0, poleWant: false, pole: 'down', poleT: 0, poleTack: 'S',
      heel: 0, boom: 0, jib: 0,
      ai: isUser ? null : {
        mode: 'hold', wp: r() < 0.5 ? 0 : 1, f: 0.12 + 0.76 * r(),
        depth: 55 + r() * 45, aggr: r() * 6, width: 110 + r() * 130, aware: r() < 0.7
      }
    };
  }

  /* ---------- queries used by AI, HUD and rendering ---------- */
  rulesCtx(): RulesContext { return { t: this.t, windFrom: this.wind.from, marks: this.C.marks }; }
  rights(A: Boat, B: Boat): Verdict<Boat> { return rightOfWay(A, B, this.rulesCtx(), this.pairs[pairKey(A, B)]); }
  /** Signed distance of a point from the line; positive on the course side. */
  lineD(p: Vec): number { return (p.x - this.center.x) * this.N.x + (p.y - this.center.y) * this.N.y; }
  /** Position along the line from its centre; positive toward the committee end. */
  lineA(p: Vec): number { return (p.x - this.center.x) * this.L.x + (p.y - this.center.y) * this.L.y; }
  nextMark(b: Boat): CourseMark | null { return b.leg < this.C.marks.length ? this.C.marks[b.leg] : null; }
  /** Mid-race, the start/finish line is an obstruction for this boat. */
  obstructed(b: Boat): boolean { return this.C.obstruction && this.t > 0 && b.started && b.leg >= 1 && b.leg < this.C.marks.length; }
  currentAt(p: Vec): Vec { return currentAt(p, this.cvec); }

  /* ---------- the fixed step ---------- */
  step(dt = DT): void {
    const prevT = this.t;
    this.t += dt;
    this.steps++;
    this.wind = windAt(this.windModel, this.t);
    this.avgFrom = n360(this.avgFrom + wrap(this.wind.from - this.avgFrom) * dt / 60);
    for (const b of this.boats) { b.forced14 = null; b.cur = this.currentAt(b); b.ww = windOnWater(this.wind, b.cur); }
    for (const b of this.boats) if (!b.isUser) aiThink(this, b, dt);
    for (const b of this.boats) moveBoat(b, dt, this.t, this.emit, this.groundToast);
    this.checkLines(prevT);
    this.checkPairs();
    this.signals(prevT);
    if (this.steps % RECORD_EVERY_STEPS === 0) {
      this.rec.push(snapshot(this.t, this.boats));
      if (this.rec.length > RECORD_KEEP) this.rec.shift();
    }
  }

  private checkLines(prevT: number): void {
    const gun = prevT < 0 && this.t >= 0, C = this.C, n = C.marks.length;
    for (const b of this.boats) {
      const bw = bow(b), d = this.lineD(bw), a = this.lineA(b);
      const within = Math.abs(a) <= this.lineLen / 2 + 2;
      if (gun && d > 0 && Math.abs(a) < this.lineLen / 2 + 25) {
        b.ocs = true;
        if (b.isUser) this.emit({ type: 'toast', msg: 'Over early! Return below the line, then start. Keep clear while you do (Rule 22.1).', ms: 4500 });
      }
      if (this.t >= 0 && b.prevD != null) {
        if (b.ocs && d < 0 && this.lineD(stern(b)) < 0) { b.ocs = false; if (b.isUser) this.emit({ type: 'toast', msg: 'Cleared. Now start properly.' }); }
        const crossedFwd = b.prevD <= 0 && d > 0 && within, crossedBack = b.prevD > 0 && d <= 0 && within;
        if (!b.started && !b.ocs && crossedFwd) {
          b.started = true;
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
          b.penalty = TWO_TURNS;
          if (b.isUser) this.emit({ type: 'toast', msg: 'You crossed the start/finish line mid-race. It is an obstruction here: two-turn penalty.', ms: 4500 });
        }
      }
      b.prevD = d;
      this.markProgress(b);
    }
  }

  private markProgress(b: Boat): void {
    const m = this.nextMark(b);
    if (!b.started || !m) return;
    const md = dist(b, m.p);
    if (m.type === 'round') {
      if (md < 75) {
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
    b.leg++; b.prevAng = null; b.prevPass = null; b.nearMin = 1e9;
    if (b.isUser) {
      const nm = this.nextMark(b);
      if (m.type === 'round') this.emit({ type: 'toast', msg: nm ? `${m.name} rounded. Next: ${nm.name} to ${nm.side === 's' ? 'starboard' : 'port'}.` : `${m.name} rounded. Head for the finish.` });
    }
  }

  private checkPairs(): void {
    const bs = this.boats, ctx = this.rulesCtx();
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const A = bs[i], B = bs[j], key = pairKey(A, B);
      const rec = this.pairs[key] ??= newPairRecord();
      const { incident } = assessPair(rec, A, B, ctx, { swerve: A.forced14 === B.id || B.forced14 === A.id });
      if (!incident) continue;
      if (incident.kind === 'contact') {
        A.v *= 0.35; B.v *= 0.35;
        const dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy) || 1;
        A.x -= dx / l * 0.8; A.y -= dy / l * 0.8; B.x += dx / l * 0.8; B.y += dy / l * 0.8;
      }
      if (A.isUser || B.isUser) {
        this.paused = true;
        if (incident.fouler.isUser) this.fouls++; else this.fouledBy++;
        this.emit({ type: 'incident', a: A, b: B, incident, frames: this.rec.slice(-100).concat([snapshot(this.t, this.boats)]), wind: this.wind.from });
      } else incident.fouler.penalty = TWO_TURNS;
    }
  }

  private signals(prevT: number): void {
    const marks: number[] = [];
    for (let m = this.settings.seq; m >= 1; m--) marks.push(-m * 60);
    marks.push(0);
    for (const s of marks) if (prevT < s && this.t >= s && !this.horns[s]) {
      this.horns[s] = true;
      this.emit({ type: 'horn', dur: s === 0 ? 1.1 : 0.8 });
      if (s === 0) {
        if (this.boats.some(b => b.ocs)) this.emit({ type: 'horn', dur: 0.5, delayMs: 900 }); // individual recall
        if (!this.user.ocs) this.emit({ type: 'toast', msg: 'Gun! Go.', ms: 1500 });
      } else if (s === -60) this.emit({ type: 'toast', msg: 'One minute', ms: 1500 });
    }
  }

  /** Start a two-turns penalty for a boat after an incident has been reviewed. */
  assignPenalty(b: Boat): void { b.penalty = TWO_TURNS; }
}
