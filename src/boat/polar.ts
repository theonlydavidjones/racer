import { D2R, KT } from '../core/math';
import orc from './data/nordic-folkboat-orc.json';

/** ORC polar data as written by scripts/fetch-orc-polar.mjs. Speeds in knots, angles in degrees. */
export interface OrcPolarData {
  boat: { imsL: number; mainArea: number; jibArea: number; spinnakerArea: number };
  tws: number[];
  twa: number[];
  speed: Record<string, number[]>;
  beat: { angle: number[]; speed: number[] };
  run: { angle: number[]; speed: number[] };
  deadRun: number[];
}

export interface PolarOptions {
  /** Folkboat class racing (and the SF Bay fleet) is jib-only; ORC certificates assume a spinnaker. */
  spinnaker: boolean;
}

/** Below this true wind angle the sails can't drive the boat at all. */
export const NO_GO = 25;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (x: number) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

/** Piecewise-linear lookup in sorted [x, y] points, clamped at the ends. */
function interp(pts: [number, number][], x: number): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i]; return lerp(y0, y1, (x - x0) / (x1 - x0)); }
  }
  return pts[pts.length - 1][1];
}

/**
 * Dead-run speed for each wind speed with `area` m² of sail drawing, derived from the
 * certificate's spinnaker run data. On a dead run, sail drive ≈ C·A·AWS² with AWS = TWS − V,
 * and drive equals hull drag R(V). The certificate's (V, TWS − V) pairs therefore trace R(V)
 * up to a constant. With area A', the new speed solves √(A'/A)·(TWS − V) = AWS_spin(V).
 * Assumes the same drive coefficient per m² for main and jib as for main + spinnaker.
 */
export function deadRunForArea(d: OrcPolarData, area: number): number[] {
  const k = Math.sqrt(area / (d.boat.mainArea + d.boat.spinnakerArea));
  const awsAt: [number, number][] = [[0, 0], ...d.tws.map((w, j): [number, number] => [d.deadRun[j], w - d.deadRun[j]])];
  const aws = (v: number) => {
    const last = awsAt[awsAt.length - 1], prev = awsAt[awsAt.length - 2];
    if (v > last[0]) return last[1] + (v - last[0]) * (last[1] - prev[1]) / (last[0] - prev[0]);
    return interp(awsAt, v);
  };
  return d.tws.map(w => {
    let lo = 0, hi = w;
    for (let i = 0; i < 60; i++) { const v = (lo + hi) / 2; if (k * (w - v) > aws(v)) lo = v; else hi = v; }
    return (lo + hi) / 2;
  });
}

/** Main plus jib, both drawing (the jib poled out wing-on-wing on a run). */
export const jibOnlyDeadRun = (d: OrcPolarData): number[] => deadRunForArea(d, d.boat.mainArea + d.boat.jibArea);

/**
 * How the jib is set:
 * - 'jib':  sheeted normally, on the same side as the main. Deep downwind the main blankets it.
 * - 'wing': poled out on the windward side with the whisker pole (wing-on-wing). Only fills when
 *           sailing deep; on a reach a poled-out jib is aback and useless.
 * - 'main': jib not drawing at all (crew setting or stowing the pole).
 */
export type SailPlan = 'jib' | 'wing' | 'main';
export const SAIL_PLANS: SailPlan[] = ['jib', 'wing', 'main'];

/** Fraction of the jib's area that is doing useful work, by sail plan and true wind angle. */
export function jibEfficiency(plan: SailPlan, twa: number): number {
  const a = Math.abs(twa);
  if (plan === 'main') return 0;
  if (plan === 'jib') return a <= 140 ? 1 : a >= 170 ? 0.15 : 1 - 0.85 * (a - 140) / 30; // blanketed behind the main
  return a <= 145 ? 0 : a >= 160 ? 1 : (a - 145) / 15; // poled out: fills from ~15° either side of a dead run
}

/** Boat speed for any true wind speed, angle and sail plan, built from an ORC VPP table. */
export class Polar {
  readonly tws: number[];
  /** per TWS row: beat angle, and speed (kt) by angle and plan */
  private rows: { beat: number; speed: (a: number, plan: SailPlan) => number }[];
  private runAngles: number[];
  private runAnglesByPlan: Record<SailPlan, number[]>;

  constructor(d: OrcPolarData, opt: PolarOptions) {
    this.tws = d.tws;
    const main = d.boat.mainArea, full = main + d.boat.jibArea;
    // dead-run speed vs drawing area, sampled from main only to main + jib, per TWS row
    const areas = Array.from({ length: 11 }, (_, i) => main + (full - main) * i / 10);
    const runByArea = areas.map(a => deadRunForArea(d, a));
    this.rows = d.tws.map((_, j) => {
      const fullRun = runByArea[runByArea.length - 1][j];
      // full sail area polar: scale speeds aft of the beam toward the jib-and-main dead-run speed
      const f180 = opt.spinnaker ? 1 : fullRun / d.deadRun[j];
      const f = (a: number) => 1 - (1 - f180) * smoothstep((a - 90) / 60);
      const pts: [number, number][] = [[d.beat.angle[j], d.beat.speed[j]]];
      d.twa.forEach(a => pts.push([a, d.speed[String(a)][j] * f(a)]));
      if (opt.spinnaker) pts.push([d.run.angle[j], d.run.speed[j]]);
      pts.push([180, d.deadRun[j] * f(180)]);
      pts.sort((a, b) => a[0] - b[0]);
      const clean = pts.filter((p, i) => i === 0 || p[0] - pts[i - 1][0] > 0.5);
      const beat = d.beat.angle[j];
      const base = (a: number) => {
        if (a >= beat) return interp(clean, a);
        if (a <= NO_GO) return 0;
        // Pinching: the slope at the beat angle is set so VMG peaks exactly there (ds/dθ = s·tanθ).
        const s0 = clean[0][1], p = Math.tan(beat * D2R) * (beat - NO_GO) * D2R;
        return s0 * Math.pow((a - NO_GO) / (beat - NO_GO), p);
      };
      // Ratio of speed with less sail drawing. Downwind (≥150°) from the dead-run drag model;
      // upwind and reaching (≤90°) speed ~ area^0.4; blended in between.
      const ratio = (area: number, a: number) => {
        if (area >= full - 1e-9) return 1;
        const t = (area - main) / (full - main) * 10, i = Math.min(9, Math.floor(t));
        const run = lerp(runByArea[i][j], runByArea[i + 1][j], t - i) / fullRun;
        const reach = Math.pow(area / full, 0.4);
        return lerp(reach, run, smoothstep((a - 90) / 60));
      };
      const speed = (a: number, plan: SailPlan) => {
        if (opt.spinnaker) return base(a);
        return base(a) * ratio(main + d.boat.jibArea * jibEfficiency(plan, a), a);
      };
      return { beat, speed };
    });
    this.runAnglesByPlan = { jib: [], wing: [], main: [] };
    for (const plan of SAIL_PLANS) this.runAnglesByPlan[plan] = this.rows.map((_, j) => this.bestVmgAngle(j, 120, 180, plan));
    this.runAngles = this.rows.map((_, j) => {
      const a = this.runAnglesByPlan.jib[j], b = this.runAnglesByPlan.wing[j];
      return this.rowSpeed(j, a, 'jib') * -Math.cos(a * D2R) >= this.rowSpeed(j, b, 'wing') * -Math.cos(b * D2R) ? a : b;
    });
  }

  /** Speed in knots at table row j. 'best' = whichever of jib and wing-on-wing is faster. */
  private rowSpeed(j: number, twa: number, plan: SailPlan | 'best'): number {
    const a = Math.min(180, Math.abs(twa)), row = this.rows[j];
    return plan === 'best' ? Math.max(row.speed(a, 'jib'), row.speed(a, 'wing')) : row.speed(a, plan);
  }

  private bestVmgAngle(j: number, from: number, to: number, plan: SailPlan): number {
    let best = from, bestV = -Infinity;
    for (let a = from; a <= to; a += 0.25) { const v = -this.rowSpeed(j, a, plan) * Math.cos(a * D2R); if (v > bestV) { bestV = v; best = a; } }
    return best;
  }

  /** Interpolate a per-row value across wind speed. Light air below the table fades to zero speed. */
  private acrossTws(tws: number, f: (j: number) => number, fadeToZero: boolean): number {
    const T = this.tws;
    if (tws <= T[0]) return fadeToZero ? f(0) * Math.max(0, tws) / T[0] : f(0);
    if (tws >= T[T.length - 1]) return f(T.length - 1); // TODO: depowering above 24 kt
    let j = 1; while (tws > T[j]) j++;
    return lerp(f(j - 1), f(j), (tws - T[j - 1]) / (T[j] - T[j - 1]));
  }

  /** Target speed (kt). Without a plan: the faster of normal jib and wing-on-wing (what a good crew would set). */
  speedKt(tws: number, twa: number, plan: SailPlan | 'best' = 'best'): number { return this.acrossTws(tws, j => this.rowSpeed(j, twa, plan), true); }
  /** Best upwind VMG angle (true). */
  beatAngle(tws: number): number { return this.acrossTws(tws, j => this.rows[j].beat, false); }
  /** Best downwind VMG angle (true), with the best sail plan, or with a given plan. */
  runAngle(tws: number, plan?: SailPlan): number { return this.acrossTws(tws, j => (plan ? this.runAnglesByPlan[plan] : this.runAngles)[j], false); }
  /** Faster plan at this angle: 'wing' when poling out the jib pays. */
  bestPlan(tws: number, twa: number): 'jib' | 'wing' { return this.speedKt(tws, twa, 'wing') > this.speedKt(tws, twa, 'jib') ? 'wing' : 'jib'; }
}

/** The fleet's boat: Nordic Folkboat, jib only (no spinnaker). */
export const FOLKBOAT = new Polar(orc as OrcPolarData, { spinnaker: false });

/** Target boatspeed (m/s) for a true wind speed (kt), true wind angle (deg) and sail plan (default: best). */
export const polar = (kt: number, twa: number, plan: SailPlan | 'best' = 'best'): number => FOLKBOAT.speedKt(kt, twa, plan) * KT;
/** Optimum close-hauled true wind angle for this wind speed. */
export const beatAngle = (kt: number): number => FOLKBOAT.beatAngle(kt);
/** Optimum downwind true wind angle for this wind speed (best sail plan). */
export const runAngle = (kt: number): number => FOLKBOAT.runAngle(kt);
