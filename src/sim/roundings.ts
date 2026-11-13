import type { Boat } from '../boat/boat';
import { FOLKBOAT } from '../boat/polar';
import { byHand } from '../boat/physics';
import { beatFor } from '../boat/seaway';
import { D2R, KT, LOA, ZONE, dot, markDist, sub, unit, wrap, type Vec } from '../core/math';
import type { Course, CourseMark } from '../courses/course';

/**
 * The mark-rounding drill (a training tool: docs/VISION-ROADMAP.md; the owner's go, 13 Nov 2026): laps of the practice
 * area's course, laid to the day's wind, round its windward mark (W) and the start line's pin as the leeward mark, both
 * left to port; each rounding scored against what the sim's own crew loses in one, measured the same way, with the
 * figures a coach would watch (the layline, the pole, wide in and close out) and one line on what to change.
 *
 * How it measures, as the tack and gybe drill does (sim/drill.ts), against a twin that sails on:
 * - from GATE_IN (100 m) off the mark to GATE_OUT (100 m) down (or up) the next leg past the mark's level, her
 *   progress along the course (W–pin, laid to the wind at the gun): toward the mark's level, then away from it on the
 *   new leg (a boat that overstands above the mark's level has that much to come back);
 * - the twin's, from the same moment: her own share (η) of the polar's best VMG on the leg in (measured over the
 *   steady seconds before the gate), times the polar's best VMG upwind or down in the wind as it is (reached with the
 *   boat's own lag, TWIN_LAG, as in the tack drill), switching leg the moment it reaches the mark's level, with no loss
 *   at the mark; plus the current along its way, so the tide doesn't score her.
 * What she loses against it is the rounding: the approach, the turn, the sails' work through it and getting going on
 * the new leg. A good crew loses some of that too: SIM_CREW is the sim's own crew (ai.ts, with its crew on the pole,
 * crewPoleCall) measured by this tracker, and tests keep it in step.
 * No published figure exists for what a rounding costs in metres, or for how soon a whisker pole should be set after a
 * windward mark (the researcher's search, 13 Nov 2026: none found), so the thresholds the coaching uses are the sim
 * crew's own figures; the advice itself is the standard practice (wide in, close out; the pole down in good time).
 */

export type RoundingKind = 'windward' | 'leeward';
export interface RoundingScore {
  kind: RoundingKind;
  /** False: noted, not scored (`coach` says why). */
  scored: boolean;
  /** The true wind (kt) and the sea (m) it was in. */
  tws: number; hs: number;
  /** Metres of progress along the course lost against the twin; and what a good crew (the sim's own) loses the same way. */
  lostM: number; goodM: number;
  /** Tacks she made inside GATE_IN of the windward mark (on the way in). */
  tacks: number;
  /** Seconds on the last 60 m in to the windward mark sailing free (more than 8° off close-hauled: overstood, reaching
   * in), and pinching (more than 4° above it and slowed: short of the layline, squeezing up to make it). */
  freeS: number; pinchS: number;
  /** Seconds the main was over-trimmed (stalled) as she bore away round the windward mark, when the mainsheet's yours (null: the crew's). */
  stallS: number | null;
  /** Windward: seconds from rounding to the pole set (null: not set by the end of the measure). */
  poleS: number | null;
  /** Leeward: seconds before rounding the pole came off (the crew starting to stow it; negative: after; null: it wasn't out). */
  dropS: number | null;
  /** Leeward: her distance off the mark (m) as the final turn began (wide in), as she came onto the wind (close out), and her closest. */
  entryD: number; exitD: number; closest: number;
  /** The turn's peak rate (°/s) and her lowest speed as a share of her speed in. */
  peakRate: number; minSpeed: number;
  /** Seconds the sheets you trim (main or jib) were luffing in the 15 s after she came onto the wind (null: the crew's). */
  slackS: number | null;
  /** She touched the mark. */
  touched: boolean;
  /** One plain line on what to change (or that it was good, or why it wasn't scored). */
  coach: string;
}

/** The measure's gates: from GATE_IN off the mark to GATE_OUT past its level along the new leg (m). */
export const GATE_IN = 100, GATE_OUT = 100;
/** The longest a rounding's measure runs (s): past it she's scored where she stands. */
const MAX_S = 240;
/** Steady (for η): the 2 s rate of turn under STEADY_RATE (°/s); turning, by the half-second rate (as the tack drill). */
const STEADY_RATE = 1.5, TURNING = 3, SMOOTH_S = 2, QUICK_S = 0.5;
/** How long the twin takes to answer a change of wind (s): as the tack drill's (the sim's Folkboat takes 8–13 s). */
const TWIN_LAG = 10;
/** Her share of the polar's VMG when there were too few steady seconds to measure it (about the sim crew's own). */
const ETA_GUESS = 0.92;

/** The polar's best VMG (m/s) upwind (a beat) or down (a run), in `tws` kt. */
export function legVmg(up: boolean, tws: number): number {
  const a = up ? FOLKBOAT.beatAngle(tws) : FOLKBOAT.runAngle(tws);
  return FOLKBOAT.speedKt(tws, a) * KT * Math.abs(Math.cos(a * D2R));
}

/** The drill's two marks, both left to port: the practice course's windward mark, and the start line's pin as the
 * leeward mark (no new geometry: the pin is where the course has it). Each one's rounding is judged across the ray
 * from it away from the other (the outside of a turn back the way she came). */
export function lapMarks(C: Course): [CourseMark, CourseMark] {
  const W0 = C.marks[0], away = (p: Vec, q: Vec) => unit(sub(p, q));
  const W: CourseMark = { ...W0, side: 'p', beat: true, leg: 'beat', prev: C.pin, next: C.pin, r: away(W0.p, C.pin) };
  const pin: CourseMark = {
    key: 'pin', name: `${C.pinLabel} (the leeward mark)`, p: C.pin, type: 'round', side: 'p', shape: 'cylinder', look: 'O', beat: false, leg: 'run',
    prev: W0.p, next: W0.p, dir: { x: 0, y: 1 }, sv: { x: 0, y: 0 }, r: away(C.pin, W0.p)
  };
  return [W, pin];
}

interface Sample { t: number; x: number; y: number; h: number; v: number; twa: number; tws: number; cx: number; cy: number; vwx: number; vwy: number; rate: number; quick: number; md: number }
const HIST = new WeakMap<RoundingTracker, Sample[]>();

/** The sim crew's own roundings, measured by this tracker (tests/roundings.test.ts keeps them in step): by true wind (kt),
 * metres lost, and the figures the coaching compares with. */
export interface CrewRounding { lostM: number; freeS: number; poleS: number; dropS: number; exitD: number; peakRate: number; minSpeed: number }
// Measured by the test harness (tests/roundings.test.ts drives the sim's own crew round the practice course and reads
// this tracker; the median over several laps and seeds in flat water). No published figure exists for any of it. The
// loss grows with the wind: a fresh-breeze rounding disrupts the same seconds at a higher speed, so more metres go. The
// columns are {lostM, freeS, poleS, dropS, exitD, peakRate, minSpeed}; freeS/poleS matter for the windward mark, dropS/
// exitD for the leeward; exitD at the windward mark is the far gate (not used).
export const SIM_CREW: Record<RoundingKind, [number, CrewRounding][]> = {
  windward: [
    [6, { lostM: 6, freeS: 7, poleS: 0, dropS: 0, exitD: 100, peakRate: 11.4, minSpeed: 0.67 }],
    [8, { lostM: 20, freeS: 5, poleS: 14, dropS: 0, exitD: 100, peakRate: 12.7, minSpeed: 0.69 }],
    [12, { lostM: 35, freeS: 6, poleS: 15, dropS: 0, exitD: 100, peakRate: 14.4, minSpeed: 0.71 }],
    [16, { lostM: 51, freeS: 10, poleS: 15, dropS: 0, exitD: 100, peakRate: 17.6, minSpeed: 0.64 }],
    [20, { lostM: 64, freeS: 12, poleS: 15, dropS: 0, exitD: 100, peakRate: 17.5, minSpeed: 0.55 }],
    [25, { lostM: 77, freeS: 11, poleS: 15, dropS: 0, exitD: 100, peakRate: 17.5, minSpeed: 0.45 }]
  ],
  leeward: [
    [6, { lostM: 9, freeS: 0, poleS: 0, dropS: 12, exitD: 16, peakRate: 9.9, minSpeed: 0.70 }],
    [8, { lostM: 29, freeS: 0, poleS: 0, dropS: 29, exitD: 17, peakRate: 11.7, minSpeed: 0.86 }],
    [12, { lostM: 25, freeS: 0, poleS: 0, dropS: 28, exitD: 18, peakRate: 13.8, minSpeed: 0.83 }],
    [16, { lostM: 48, freeS: 0, poleS: 0, dropS: 23, exitD: 19, peakRate: 17.1, minSpeed: 0.77 }],
    [20, { lostM: 45, freeS: 0, poleS: 0, dropS: 20, exitD: 19, peakRate: 18.7, minSpeed: 0.66 }],
    [25, { lostM: 66, freeS: 0, poleS: 0, dropS: 29, exitD: 19, peakRate: 19.1, minSpeed: 0.56 }]
  ]
};
export function simCrew(kind: RoundingKind, tws: number): CrewRounding {
  const T = SIM_CREW[kind];
  if (tws <= T[0][0]) return T[0][1];
  for (let i = 1; i < T.length; i++) if (tws <= T[i][0]) {
    const [a, A] = T[i - 1], [b, B] = T[i], k = (tws - a) / (b - a);
    const o = {} as CrewRounding; for (const key of Object.keys(A) as (keyof CrewRounding)[]) o[key] = A[key] + (B[key] - A[key]) * k;
    return o;
  }
  return T[T.length - 1][1];
}

export class RoundingTracker {
  /** Every rounding scored (or noted), oldest first. */
  readonly list: RoundingScore[] = [];
  /** The mark she's sailing for: 0 the windward mark, 1 the pin. */
  leg = 0;
  /** Roundings made (the laps' count, for the page). */
  rounded = 0;
  readonly marks: [CourseMark, CourseMark];
  private prevAng: number | null = null;
  private nearMin = 1e9;
  private get hist(): Sample[] { let h = HIST.get(this); if (!h) HIST.set(this, h = []); return h; }
  private cur: null | {
    kind: RoundingKind; t0: number; dIn: number; uIn: Vec; eta: number; etaGuess: boolean; v0: number; tws0: number; hs: number;
    twin: number; twTws: number; prog: number; roundT: number | null; tacks: number; lastTack: Boat['tack']; lastTackT: number;
    freeS: number; pinchS: number; stallS: number | null; poleT: number | null; poleWas: Boat['pole']; dropT: number | null; poleOutIn: boolean;
    turnFrom: number | null; entryD: number; exitD: number | null; exitT: number | null; slowSince: number | null; closest: number; peakRate: number; minV: number; slackS: number | null; touched: boolean;
  } = null;

  constructor(C: Course) { this.marks = lapMarks(C); }
  get mark(): CourseMark { return this.marks[this.leg]; }

  /** Each sim step (world.ts), for your boat, with the sea's height there (m). */
  step(b: Boat, t: number, dt: number, hs = 0): void {
    if (b.docked || b.pushing || b.motor?.running || b.pilotSteers) { this.cur = null; this.hist.length = 0; return; }
    const H = this.hist, m = this.mark, twa = wrap(b.ww.from - b.h), md = markDist(b, m);
    let k = H.length - 1; while (k > 0 && t - H[k - 1].t <= SMOOTH_S) k--;
    const back = H[k], rate = back && t > back.t ? Math.abs(wrap(b.h - back.h)) / (t - back.t) : 0;
    let q = H.length - 1; while (q > 0 && t - H[q - 1].t <= QUICK_S) q--;
    const qb = H[q], quick = qb && t > qb.t ? Math.abs(wrap(b.h - qb.h)) / (t - qb.t) : 0;
    const s: Sample = { t, x: b.x, y: b.y, h: b.h, v: b.v, twa, tws: b.ww.kt, cx: b.cur.x, cy: b.cur.y, vwx: b.vx - b.cur.x, vwy: b.vy - b.cur.y, rate, quick, md };
    H.push(s); while (H.length && t - H[0].t > 40) H.shift();
    if (!this.cur && md < GATE_IN) this.begin(b, s, hs);
    const rounded = this.roundingCheck(b, m, md);
    if (this.cur) this.account(b, s, dt, rounded);
    if (rounded) { this.leg = 1 - this.leg; this.rounded++; this.prevAng = null; this.nearMin = 1e9; }
  }

  /** Has she just rounded the mark (crossed the ray out from it on the side it's left to)? As world.ts markProgress; a miss is told. */
  private roundingCheck(b: Boat, m: CourseMark, md: number): boolean {
    let ok = false;
    if (md < 75) {
      const ang = wrap((Math.atan2(b.y - m.p.y, b.x - m.p.x) - Math.atan2(m.r.y, m.r.x)) / D2R);
      if (this.prevAng != null && Math.abs(ang) < 75 && Math.abs(this.prevAng) < 75) ok = m.side === 's' ? this.prevAng > 0 && ang <= 0 : this.prevAng < 0 && ang >= 0;
      this.prevAng = ang;
    } else this.prevAng = null;
    this.nearMin = Math.min(this.nearMin, md);
    if (!ok && this.nearMin < 40 && md > 170) {
      // past it without rounding it: not scored; she goes back for it
      this.nearMin = 1e9;
      if (this.cur) { const c = this.cur; this.cur = null; this.note(c.kind, b.ww.kt, c.hs, `Missed the mark: leave it to port. Go back and round it.`); }
    }
    return ok;
  }

  private begin(b: Boat, s: Sample, hs: number): void {
    const kind: RoundingKind = this.leg === 0 ? 'windward' : 'leeward', m = this.mark, other = this.marks[1 - this.leg];
    const uIn = unit(sub(m.p, other.p)); // (along the course toward this mark: upwind to W, down to the pin)
    // her share of the polar's VMG on the leg in: over the steady seconds of the last 30 on that point of sail
    const up = kind === 'windward', H = this.hist;
    const pre = H.filter(q => s.t - q.t <= 30 && q.rate < STEADY_RATE && (up ? Math.abs(q.twa) < 60 : Math.abs(q.twa) > 130));
    const secs = pre.length * (H.length > 1 ? (H[H.length - 1].t - H[0].t) / (H.length - 1) : 0);
    const mean = (f: (q: Sample) => number) => pre.reduce((a, q) => a + f(q), 0) / Math.max(1, pre.length);
    const tws0 = pre.length ? mean(q => q.tws) : b.ww.kt;
    const etaGuess = secs < 6;
    const eta = etaGuess ? ETA_GUESS : Math.min(1.0, Math.max(0.6, mean(q => q.vwx * uIn.x + q.vwy * uIn.y) / Math.max(0.05, legVmg(up, tws0))));
    const dIn = dot(sub(m.p, s), uIn);
    this.cur = {
      kind, t0: s.t, dIn, uIn, eta, etaGuess, v0: pre.length ? mean(q => q.v) : b.v, tws0, hs,
      twin: 0, twTws: tws0, prog: 0, roundT: null, tacks: 0, lastTack: b.tack, lastTackT: -1e9,
      freeS: 0, pinchS: 0, stallS: byHand(b, 'mainsheet') ? 0 : null, poleT: null, poleWas: b.pole, dropT: null, poleOutIn: b.pole === 'set' || b.pole === 'setting',
      turnFrom: null, entryD: s.md, exitD: null, exitT: null, slowSince: null, closest: s.md, peakRate: 0, minV: Infinity,
      slackS: byHand(b, 'mainsheet') || byHand(b, 'jibsheet') || byHand(b, 'jibsheetW') ? 0 : null, touched: false
    };
  }

  private account(b: Boat, s: Sample, dt: number, rounded: boolean): void {
    const c = this.cur!, m = this.marks[c.kind === 'windward' ? 0 : 1], up = c.kind === 'windward';
    if (rounded) c.roundT = s.t;
    const after = c.roundT != null;
    // distance to the rounding mark itself (s.md follows the current target, which flips once she's rounded)
    const md = markDist(s, m);
    // her progress along the course: toward the mark's level, then past it along the new leg
    const y = dot(sub(s, m.p), c.uIn);
    c.prog = after ? c.dIn - y : c.dIn - Math.abs(y);
    // the twin: her share of the best VMG on the leg it's on, in the wind as it is (with the boat's lag), plus the current along it
    c.twTws += (s.tws - c.twTws) * Math.min(1, dt / TWIN_LAG);
    const twinUp = c.twin < c.dIn ? up : !up, uTw = c.twin < c.dIn ? 1 : -1;
    c.twin += (c.eta * legVmg(twinUp, c.twTws) + uTw * (s.cx * c.uIn.x + s.cy * c.uIn.y)) * dt;
    c.closest = Math.min(c.closest, md);
    c.minV = Math.min(c.minV, s.v);
    if (b.markTouch) c.touched = true;
    const beat = beatFor(b), a = Math.abs(s.twa);
    if (!after) {
      // the way in
      if (b.tack !== c.lastTack && a < 90) { c.tacks++; c.lastTackT = s.t; }
      c.lastTack = b.tack;
      if (up && md < 60 && md > LOA && s.t - c.lastTackT > 4) {
        if (a > beat + 8) c.freeS += dt;
        else if (a < beat - 4 && s.v < 0.9 * c.v0) c.pinchS += dt;
      }
      // the final turn's start: the last moment she wasn't turning, near the mark
      if (md < 3 * ZONE) { if (s.quick < TURNING) c.turnFrom = null; else if (c.turnFrom == null) { c.turnFrom = s.t; c.entryD = md; } }
      if (!up && c.poleWas === 'set' && b.pole !== 'set' && c.dropT == null) c.dropT = s.t;
      if (!up && (b.pole === 'set' || b.pole === 'setting')) c.poleOutIn = true;
    } else {
      if (up && c.poleT == null && b.pole === 'set') c.poleT = s.t;
      if (!up && c.exitT == null) {
        // onto the wind: within 10° of close-hauled and steady for a second
        if (a <= beat + 10 && s.rate < STEADY_RATE) { c.slowSince ??= s.t; if (s.t - c.slowSince >= 1) { c.exitT = s.t; c.exitD = md; } } else c.slowSince = null;
      }
      if (!up && c.exitT != null && c.slackS != null && s.t - c.exitT < 15 && (b.trim.main.flow === 'luffing' && byHand(b, 'mainsheet') || b.trim.jib?.flow === 'luffing' && (byHand(b, 'jibsheet') || byHand(b, 'jibsheetW')))) c.slackS += dt;
    }
    if (c.turnFrom != null || (after && s.t - c.roundT! < 15)) c.peakRate = Math.max(c.peakRate, s.quick);
    // bearing away round the windward mark: the main over-trimmed while she turns down to the run
    if (up && c.stallS != null && a > beat + 10 && a < 140 && s.t > c.t0 && (after || md < ZONE) && b.trim.main.flow === 'stalled') c.stallS += dt;
    c.poleWas = b.pole;
    if ((after && c.prog >= c.dIn + GATE_OUT) || s.t - c.t0 > MAX_S) this.finish(b, s);
  }

  private note(kind: RoundingKind, tws: number, hs: number, why: string): void {
    this.list.push({ kind, scored: false, tws, hs, lostM: 0, goodM: 0, tacks: 0, freeS: 0, pinchS: 0, stallS: null, poleS: null, dropS: null, entryD: 0, exitD: 0, closest: 0, peakRate: 0, minSpeed: 1, slackS: null, touched: false, coach: why });
  }

  private finish(_b: Boat, s: Sample): void {
    const c = this.cur!; this.cur = null;
    if (c.roundT == null) { this.note(c.kind, c.tws0, c.hs, 'Not scored: she never rounded the mark in the time.'); return; }
    const up = c.kind === 'windward', g = simCrew(c.kind, c.tws0);
    const sc: RoundingScore = {
      kind: c.kind, scored: true, tws: c.tws0, hs: c.hs, lostM: c.twin - c.prog, goodM: g.lostM, tacks: c.tacks, freeS: c.freeS, pinchS: c.pinchS, stallS: c.stallS,
      poleS: up && c.poleT != null ? c.poleT - c.roundT : null, dropS: !up && c.poleOutIn ? (c.dropT == null ? null : c.roundT - c.dropT) : null,
      entryD: c.entryD, exitD: c.exitD ?? markDist(s, this.marks[c.kind === 'windward' ? 0 : 1]), closest: c.closest, peakRate: c.peakRate, minSpeed: c.minV / Math.max(0.1, c.v0), slackS: c.slackS, touched: c.touched, coach: ''
    };
    sc.coach = roundingCoach(sc, g, c.poleOutIn);
    this.list.push(sc);
  }
}

/** The one thing to change (or that it was good): the commonest costly mistakes first. */
export function roundingCoach(s: RoundingScore, g: CrewRounding, poleWasOut = true): string {
  const lost = Math.max(0, Math.round(s.lostM)), good = Math.round(s.goodM), n = (v: number) => Math.round(v);
  const ok = s.lostM <= Math.max(3, 1.2 * s.goodM);
  if (s.touched) return `You touched the mark: in a race that's a one-turn penalty (rule 31). Give it a little more room.`;
  if (s.kind === 'windward') {
    if (s.pinchS > 4 || s.tacks >= 3) return `Short of the layline: you had to ${s.tacks >= 3 ? 'tack again' : `pinch for ${n(s.pinchS)} s`} to make the mark. Lost ${lost} m (a good crew ${good}). Go a little past the layline before you tack for it: a touch over is cheaper than short.`;
    if (s.freeS > g.freeS + 8) return `Overstood: you reached in to the mark for ${n(s.freeS)} s. Lost ${lost} m (a good crew ${good}). Tack for it closer to the layline.`;
    if (s.stallS != null && s.stallS > 3) return `Ease the main as you bear away: it was over-trimmed for ${n(s.stallS)} s, which fights the turn and heels her.`;
    // the pole only when it pays (the crew set it: g.poleS > 5; in light air they leave the jib to leeward)
    if (g.poleS > 5 && (s.poleS == null || s.poleS > g.poleS + 8)) return `${s.poleS == null ? 'No pole on the run' : `Pole set ${n(s.poleS)} s after the mark (a good crew: about ${n(g.poleS)} s)`}. Bear away to a run (160° or so) and call for it as soon as she's settled: wing-on-wing is the faster way down.`;
    return ok ? `A good rounding: ${lost} m lost (a good crew ${good}).` : `Lost ${lost} m (a good crew ${good}): the bear-away and getting the pole out are where it goes.`;
  }
  if (poleWasOut && (s.dropS == null || s.dropS < Math.min(g.dropS, 8) / 2)) return `Pole down late: ${s.dropS == null ? 'it was still out as you rounded' : `it came off ${n(Math.max(0, s.dropS))} s before the mark`} (a good crew: about ${n(g.dropS)} s). Take it in early, so the jib's trimmed for the beat as you round.`;
  if (s.exitD > g.exitD + 1.5 * LOA) return `Wide out: ${n(s.exitD)} m off the mark as you came onto the wind (a good crew ${n(g.exitD)}). Start the turn wide and finish it close, with the mark right by you to windward: wide in, close out.`;
  if (s.peakRate > 1.6 * g.peakRate && s.minSpeed < g.minSpeed - 0.08) return `Turned too hard: she slowed to ${n(100 * s.minSpeed)}% of her speed. Turn smoothly, trimming in as you come up.`;
  if (s.slackS != null && s.slackS > 4) return `Trim in as you turn up: your sheets were luffing for ${n(s.slackS)} s after she came onto the wind.`;
  return ok ? `A good rounding: ${lost} m lost (a good crew ${good}).` : `Lost ${lost} m (a good crew ${good}): wide in, close out, and the sheets in as you come up.`;
}

/** The wind band a best is kept for (as the tack drill's). */
export const roundingKey = (s: { kind: RoundingKind; tws: number }) => `${s.kind === 'windward' ? 'wmark' : 'lmark'}-${s.tws < 8 ? 'light' : s.tws <= 14 ? 'medium' : 'fresh'}`;
