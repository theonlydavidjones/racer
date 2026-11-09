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
 * Jib-only dead-run speed for each wind speed, derived from the spinnaker run data.
 * On a dead run, sail drive ≈ C·A·AWS² with AWS = TWS − V, and drive equals hull drag R(V).
 * The certificate's (V, TWS − V) pairs therefore trace R(V) up to a constant. With a smaller
 * area A', the new speed solves √(A'/A)·(TWS − V) = AWS_spin(V).
 * Assumes the same drive coefficient for main + poled-out jib as for main + spinnaker.
 */
export function jibOnlyDeadRun(d: OrcPolarData): number[] {
  const aSpin = d.boat.mainArea + d.boat.spinnakerArea, aJib = d.boat.mainArea + d.boat.jibArea;
  const k = Math.sqrt(aJib / aSpin);
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

/** Boat speed for any true wind speed and angle, built from an ORC VPP table. */
export class Polar {
  readonly tws: number[];
  private rows: { beat: number; pts: [number, number][] }[]; // per TWS: beat angle and [twa, kt] points
  private runAngles: number[];

  constructor(d: OrcPolarData, opt: PolarOptions) {
    this.tws = d.tws;
    const jibRun = opt.spinnaker ? null : jibOnlyDeadRun(d);
    this.rows = d.tws.map((_, j) => {
      // jib-only: scale speeds aft of the beam toward the jib-only dead-run ratio
      const f180 = jibRun ? jibRun[j] / d.deadRun[j] : 1;
      const f = (a: number) => 1 - (1 - f180) * smoothstep((a - 90) / 60);
      const pts: [number, number][] = [[d.beat.angle[j], d.beat.speed[j]]];
      d.twa.forEach(a => pts.push([a, d.speed[String(a)][j] * f(a)]));
      if (opt.spinnaker) pts.push([d.run.angle[j], d.run.speed[j]]);
      pts.push([180, d.deadRun[j] * f(180)]);
      pts.sort((a, b) => a[0] - b[0]);
      const clean = pts.filter((p, i) => i === 0 || p[0] - pts[i - 1][0] > 0.5);
      return { beat: d.beat.angle[j], pts: clean };
    });
    this.runAngles = this.rows.map((_, j) => this.bestVmgAngle(j, 120, 180, -1));
  }

  /** Speed in knots at table row j. */
  private rowSpeed(j: number, twa: number): number {
    const { beat, pts } = this.rows[j];
    const a = Math.min(180, Math.abs(twa));
    if (a >= beat) return interp(pts, a);
    if (a <= NO_GO) return 0;
    // Pinching: the slope at the beat angle is set so VMG peaks exactly there (ds/dθ = s·tanθ).
    const s = pts[0][1], p = Math.tan(beat * D2R) * (beat - NO_GO) * D2R;
    return s * Math.pow((a - NO_GO) / (beat - NO_GO), p);
  }

  private bestVmgAngle(j: number, from: number, to: number, sign: 1 | -1): number {
    let best = from, bestV = -Infinity;
    for (let a = from; a <= to; a += 0.25) { const v = sign * this.rowSpeed(j, a) * Math.cos(a * D2R); if (v > bestV) { bestV = v; best = a; } }
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

  speedKt(tws: number, twa: number): number { return this.acrossTws(tws, j => this.rowSpeed(j, twa), true); }
  /** Best upwind VMG angle (true). */
  beatAngle(tws: number): number { return this.acrossTws(tws, j => this.rows[j].beat, false); }
  /** Best downwind VMG angle (true). */
  runAngle(tws: number): number { return this.acrossTws(tws, j => this.runAngles[j], false); }
}

/** The fleet's boat: Nordic Folkboat, jib only. */
export const FOLKBOAT = new Polar(orc as OrcPolarData, { spinnaker: false });

/** Target boatspeed (m/s) for a true wind speed (kt) and true wind angle (deg). */
export const polar = (kt: number, twa: number): number => FOLKBOAT.speedKt(kt, twa) * KT;
/** Optimum close-hauled true wind angle for this wind speed. */
export const beatAngle = (kt: number): number => FOLKBOAT.beatAngle(kt);
