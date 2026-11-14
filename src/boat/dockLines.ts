import type { Boat } from './boat';
import { HANDLING, HULL } from './dynamics';
import { ASTERN_DRAG, HOVE } from './physics';
import { FULL_RUDDER, RUDDER } from './balance';
import { displacement } from './crewPhys';
import { condition } from './condition';
import { motorForce } from './motor';
import { clamp, D2R } from '../core/math';
import orc from './data/nordic-folkboat-orc.json';
import type { Vec } from '../core/math';

/**
 * Dock lines (docs/DOCKING-PROPOSAL.md; the owner approved it, 13 Nov 2026): while any line runs from her to the dock, this
 * steps her, a body free to surge, sway and yaw, pushed by the wind on her bare rig, held or not by her lines, and slowed by
 * the water. It's the hove-to model's body (physics.ts heaveTo: the same lateral area, broadside drag, added masses, yaw
 * gyration and windage), at the speeds of a boat at a dock, with the sails down; the boat's own sailing physics
 * (moveBoat) isn't used while a line is ashore.
 *
 * A line is a stiff, damped spring from a cleat on her to a cleat on the dock: slack until it's drawn taut, then pulling
 * her toward the dock cleat with its tension. While a hand holds it round a cleat (`held`), friction lets it hold up to
 * T_hand·e^(μθ) (the capstan equation; Wikipedia, "Capstan equation"); pulled harder, it renders out through their hand.
 * Made fast (`made`), it holds up to its breaking strength.
 *
 * The numbers, with their sources; ESTIMATE marks the ones no source was found for (the likeliest hosts, practicalsailor,
 * goodoldboat and seabreeze, weren't reachable):
 *  - Stretch: 5.5% at its working load, 10% of its breaking strength, for nylon three-strand (Samson's Pro-Set-3 data, as
 *    search summaries give it; its PTS-3 7.8%; Practical Sailor's 2.5% is for rope well worked in, stiffer than a dock
 *    line's first loads); breaking strength 3,700 lb (16.5 kN) for 3/8" nylon three-strand, the minimum (Certex; New
 *    England Ropes lists 4,400 lb as its average). So EA = 0.1·16.5 kN / 0.055 = 30 kN.
 *  - Damping: a fifth of critical for her mass on the line (ESTIMATE: nylon's hysteresis and the water's drag on the boat).
 *  - Friction of rope round a cleat μ = 0.3 (ESTIMATE: bulk nylon on steel is about 0.4, Engineering ToolBox; rope on a
 *    smooth cleat less), one full turn θ = 2π: a factor of e^(0.3·2π) ≈ 6.6.
 *  - A hand's steady pull on a line, 250 N (ESTIMATE: about 25 kg force).
 */

export interface DockLine {
  /** which line: the bow line, the stern line, a spring, or (single-handed) the line from her midships cleat */
  role: 'bow' | 'stern' | 'spring' | 'midships';
  /** her cleat: m forward of her middle, and which side (+1 starboard, −1 port), on her rail */
  at: number; side: 1 | -1;
  /** the dock cleat it's led to (world, m) */
  to: Vec;
  /** the length between her cleat and the dock's, m: shortened as the crew take in slack, lengthened as it renders */
  len: number;
  /** held round a cleat by a hand, or made fast */
  state: 'held' | 'made';
  /** the line's tension now, N (for the drawing and the tests) */
  T?: number;
  /** how long it'll be with her lying in her berth: the hands warp her in to that */
  goal?: number;
}

export const LINE_EA = 0.1 * 16500 / 0.055;
export const LINE_ZETA = 0.2;
export const CLEAT_MU = 0.3;
export const HAND_N = 250;
export const LINE_BREAK = 16500;
/** What a line held round a cleat with one turn holds before it renders out through the hand, N. */
export const HELD_MAX = HAND_N * Math.exp(CLEAT_MU * 2 * Math.PI);
/**
 * A fender (or the rubbing strake on the dock's edge) as a spring and damper on how far her side presses into it: an
 * inflated fender squashes about a tenth of a metre under a boat's push (ESTIMATE: 15 kN/m, damped at half of critical
 * for a third of her mass, the end of her that's touching).
 */
export const FENDER_K = 15000;
export const FENDER_ZETA = 0.5;

const RHO = 1025, AIR = 1.225;
/**
 * Her half-beam at her rail, `at` m forward of her middle: 1.1 m amidships, fining to the stem forward and to the transom
 * aft, fuller aft than forward (ESTIMATE from the lines: render/hull.ts draws the shape; 0.15 m at the stem head, 0.55 m
 * at the transom's corners).
 */
export const railAt = (at: number): number => at >= 0 ? 1.1 * Math.max(0.14, 1 - (at / 3.9) ** 2) : 1.1 * Math.max(0.5, 1 - 0.5 * (at / 3.9) ** 2);

/** Where her cleat is, in the world. */
export function cleatOf(b: Pick<Boat, 'x' | 'y' | 'h'>, L: Pick<DockLine, 'at' | 'side'>): Vec {
  const s = Math.sin(b.h * D2R), c = Math.cos(b.h * D2R), r = railAt(L.at) * L.side;
  return { x: b.x + s * L.at + c * r, y: b.y + c * L.at - s * r };
}

export interface DockStepOut {
  /** a made line that parted (gone: the others hold) */
  parted?: DockLine;
  /** she touched the dock or a moored boat: how fast her side or end met it (m/s) */
  bump?: number;
}

/**
 * One step at the dock: the wind (`wind`, from deg, kt over the water: windOnWater), the current (`cur`, m/s), her lines,
 * and `solid(p)`: whether a point is dock, or a boat lying in a slip. Updates her speed through the water (v / astern,
 * sway), her turn and her position. The body is the hove-to model's (physics.ts heaveTo): her displacement with her
 * crew, its added masses and gyration, the keel's strips with their lift and broadside drag, the rudder (the helm still
 * steers her against a line), the motor's push, and the wind on her rig and any sail still up and let fly.
 */
export function dockStep(b: Boat, lines: DockLine[], wind: { from: number; kt: number }, cur: Vec, dt: number, solid: (p: Vec) => boolean): DockStepOut {
  const out: DockStepOut = {};
  const cs = b.crew, cond = b.spec ? (b.cond ??= condition(b.spec)) : null;
  const disp = (cs ? displacement(cs.spec) : HULL.displacement) + (cond?.extraKg ?? 0);
  const mx = HANDLING.mass * disp / HULL.displacement, my = disp * (1 + HOVE.swayAdded), I = disp * (HOVE.gyration * orc.boat.loa) ** 2 * (1 + HOVE.yawAdded);
  const s = Math.sin(b.h * D2R), c = Math.cos(b.h * D2R), fwd = { x: s, y: c }, stb = { x: c, y: -s };
  let u = b.v - (b.astern ?? 0), sw = b.sway ?? 0, r = (b.turnRate ?? 0) * D2R; // (surge and sway through the water, m/s; yaw rate, rad/s, + to starboard)
  const vg = { x: fwd.x * u + stb.x * sw + cur.x, y: fwd.y * u + stb.y * sw + cur.y }; // (over the ground)
  let X = 0, Y = 0, M = 0;
  // the water: ahead and astern at a walk, the coast's law (ASTERN_DRAG, as an acceleration); sideways and turning, the
  // hull and keel strip by strip as hove to: the keel's lift with way on and the broadside drag (its centre HOVE.dragAft
  // abaft the keel's)
  X -= Math.sign(u) * (ASTERN_DRAG.c0 + ASTERN_DRAG.c1 * Math.abs(u)) * mx;
  const Lw = orc.boat.imsL, N = 8, A = HOVE.latArea, aL = Math.PI * HOVE.aspect / 2, uEff = u >= 0 ? u : 0.5 * Math.abs(u);
  const x2 = (Lw * Lw / 12) * (1 - 1 / (N * N)), kD = -HOVE.dragAft / x2;
  for (let i = 0; i < N; i++) {
    const x = -Lw / 2 + (i + 0.5) * Lw / N, vy = sw + r * x;
    const f = -0.5 * RHO * (A / N) * (aL * uEff * vy + HOVE.crossCd * (1 + kD * x) * vy * Math.abs(vy));
    Y += f; M += f * x;
  }
  // the rudder, behind the keel (RUDDER): the blade's angle from the helm (+ turning her to starboard) and the sideways flow
  // past it; going astern the water meets it from aft and it works backwards, and less well (0.7, as hove to)
  {
    const helm = clamp((b.steer ?? 0) - (b.tiller ?? 0), -1, 1), back = u < 0, vyR = HOVE.rudderFlow * (sw - r * RUDDER.arm);
    const aoa = (back ? -1 : 1) * helm * FULL_RUDDER * D2R + Math.atan2(vyR, Math.max(0.01, Math.abs(u)));
    const yR = -0.5 * RHO * (u * u + vyR * vyR) * RUDDER.area * clamp(RUDDER.slope * aoa, -1.05, 1.05) * (back ? 0.7 : 1);
    Y += yR; M -= yR * RUDDER.arm;
  }
  // the motor, if it's driving (boat/motor.ts: its push along her heading, or its leg's drag)
  X += motorForce(b);
  // the wind on her, relative to her motion through the water (the wind's over the water: windOnWater): her bare hull and
  // rig, and any sail still hoisted, let fly and flogging (HANDLING.flogCdA, as dynamics.ts airDrag); its broadside push a
  // little ahead of the keel's centre, the mast being forward (HOVE.windLever)
  const wTo = (wind.from + 180) * D2R, wv = wind.kt * 0.5144, vw = { x: vg.x - cur.x, y: vg.y - cur.y };
  const ax = Math.sin(wTo) * wv - vw.x, ay = Math.cos(wTo) * wv - vw.y, aws = Math.hypot(ax, ay);
  if (aws > 0.01) {
    const q = 0.5 * AIR * aws * aws, along = (ax * fwd.x + ay * fwd.y) / aws, across = (ax * stb.x + ay * stb.y) / aws;
    const cloth = Math.min(1, ((b.rig?.main ?? 0) + (b.rig?.jib ?? 0)) / 2);
    const wy = q * HOVE.windSide * across * Math.abs(across);
    X += q * (HANDLING.windageCdA + HANDLING.flogCdA * cloth) * along; Y += wy; M += wy * HOVE.windLever;
  }
  // the lines
  for (const L of [...lines]) {
    const p = cleatOf(b, L), dx = L.to.x - p.x, dy = L.to.y - p.y, d = Math.hypot(dx, dy) || 1e-6;
    const k = LINE_EA / Math.max(0.5, L.len), cDamp = 2 * LINE_ZETA * Math.sqrt(k * mx);
    // her cleat's speed over the ground (a turn to starboard, clockwise from above, moves a point ahead of her middle to
    // starboard), and how fast it's opening from the dock cleat
    const lx = { x: dx / d, y: dy / d }, arm = { x: p.x - b.x, y: p.y - b.y };
    const pvx = vg.x + r * arm.y, pvy = vg.y - r * arm.x;
    const stretch = d - L.len, rate = -(pvx * lx.x + pvy * lx.y);
    let T = stretch > 0 ? Math.max(0, k * stretch + cDamp * rate) : 0;
    if (L.state === 'held' && T > HELD_MAX) { L.len += (T - HELD_MAX) / k; T = HELD_MAX; } // (renders out through the hand)
    if (L.state === 'made' && T > LINE_BREAK) { out.parted = L; lines.splice(lines.indexOf(L), 1); continue; } // (it parts)
    L.T = T;
    const fx = lx.x * T, fy = lx.y * T;
    X += fx * fwd.x + fy * fwd.y; Y += fx * stb.x + fy * stb.y;
    M += arm.y * fx - arm.x * fy; // (its moment about her middle, + turning her to starboard: clockwise from above)
  }
  // the dock (and the boats in the slips): wherever her rail presses into one, a fender's spring and damper along the way
  // out of it (the shortest way: the dock's own face), acting there, so a bow that touches first swings her stern in
  for (const at of [3.6, 2.4, 1.2, 0, -1.2, -2.4, -3.6]) for (const side of [1, -1] as const) {
    const q = cleatOf(b, { at, side });
    if (!solid(q)) continue;
    let depth = Infinity, n = { x: 0, y: 0 };
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8, dir = { x: Math.sin(a), y: Math.cos(a) };
      for (let e = 0.02; e < Math.min(depth, 0.6); e += 0.02) if (!solid({ x: q.x + dir.x * e, y: q.y + dir.y * e })) { depth = e; n = dir; break; }
    }
    if (!Number.isFinite(depth)) continue; // (deeper than a fender: nothing sensible to push on)
    const arm = { x: q.x - b.x, y: q.y - b.y }, vq = { x: vg.x + r * arm.y, y: vg.y - r * arm.x }, into = -(vq.x * n.x + vq.y * n.y);
    if (into > 0.02) out.bump = Math.max(out.bump ?? 0, into);
    const mEnd = disp / 3, F = Math.max(0, FENDER_K * depth + 2 * FENDER_ZETA * Math.sqrt(FENDER_K * mEnd) * into);
    const fx = n.x * F, fy = n.y * F;
    X += fx * fwd.x + fy * fwd.y; Y += fx * stb.x + fy * stb.y; M += arm.y * fx - arm.x * fy;
  }
  // integrate, semi-implicitly: the speeds first, then the position with them (a line's stiffness against the end of her
  // it pulls, about 750 kg, rings at 13 rad/s on 0.6 m of line, a period of half a second: well inside a 60th)
  u += X / mx * dt; sw += Y / my * dt; r += M / I * dt;
  b.v = Math.max(0, u); b.astern = Math.max(0, -u); b.sway = sw; b.turnRate = r / D2R;
  b.h = ((b.h + r / D2R * dt) % 360 + 360) % 360;
  const s2 = Math.sin(b.h * D2R), c2 = Math.cos(b.h * D2R);
  b.vx = s2 * u + c2 * sw + cur.x; b.vy = c2 * u - s2 * sw + cur.y;
  b.x += b.vx * dt; b.y += b.vy * dt;
  return out;
}

/**
 * Coming in to a berth (sim/world.ts mooringStep): the crew (or you, sailing alone) ready the lines, step off at the shrouds
 * when she's close and slow enough, snub the line round a dock cleat, and make her fast with the rest.
 */
export interface Mooring {
  /** ready: the lines coiled, the hand at the shrouds; ashore: the first line held round a cleat; stern, springs: the rest
   * going on; fast: made fast where she lies */
  phase: 'ready' | 'ashore' | 'stern' | 'springs' | 'fast';
  /** the berth she's coming in to (a slip's id: geo/marina.ts), and the side the dock's on (+1 starboard, −1 port) */
  berth: string; side: 1 | -1;
  /** seconds in this phase */
  t: number;
  lines: DockLine[];
  /** sailing alone: you step off with the midships line, and nobody's on the tiller */
  solo: boolean;
  /** the one-word cue by the boat: Closer, Too fast, Step, Made fast, Lost her, Bump */
  cue?: string; cueT?: number;
}

/**
 * How far a hand steps from her rail to the dock, and how fast she may be going: ESTIMATES (no source gives a number: the
 * seamanship advice is to step, never jump, and from the shrouds, the widest and steadiest point; Spinsheet's crew briefing,
 * PBO): a long stride, 0.6 m, a little more for a skilled hand (to 0.9 m); and no faster than a slow walk, 0.5 m/s (1 kn).
 */
export const stepGap = (skill: number): number => 0.6 + 0.3 * Math.max(0, Math.min(1, skill));
export const STEP_SPEED = 0.5;
/** A bump against the dock harder than a walk's pace (ESTIMATE, as above: no hull-damage speed was found). */
export const HARD_BUMP = 0.5;
