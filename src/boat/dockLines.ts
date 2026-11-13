import type { Boat } from './boat';
import { HANDLING } from './dynamics';
import { ASTERN_DRAG, HOVE } from './physics';
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
 *  - Stretch: about 2.5% at its working load, 10% of its breaking strength, for nylon (Practical Sailor, "Used nylon
 *    three-strand rope faces the ultimate endurance test"); breaking strength 4,400 lb (19.6 kN) for 3/8" nylon three-strand
 *    (New England Ropes, as listed by West Marine). So EA = 0.1·19.6 kN / 0.025 = 78 kN.
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
}

export const LINE_EA = 0.1 * 19600 / 0.025;
export const LINE_ZETA = 0.2;
export const CLEAT_MU = 0.3;
export const HAND_N = 250;
export const LINE_BREAK = 19600;
/** What a line held round a cleat with one turn holds before it renders out through the hand, N. */
export const HELD_MAX = HAND_N * Math.exp(CLEAT_MU * 2 * Math.PI);

const RHO = 1025, AIR = 1.225, D2R = Math.PI / 180;
/** Her half-beam at a station `at` m forward of her middle: 1.1 m amidships, narrowing to her stem and transom. */
export const railAt = (at: number): number => 1.1 * Math.max(0.15, 1 - (at / 3.9) ** 2);

/** Where her cleat is, in the world. */
export function cleatOf(b: Pick<Boat, 'x' | 'y' | 'h'>, L: Pick<DockLine, 'at' | 'side'>): Vec {
  const s = Math.sin(b.h * D2R), c = Math.cos(b.h * D2R), r = railAt(L.at) * L.side;
  return { x: b.x + s * L.at + c * r, y: b.y + c * L.at - s * r };
}

export interface DockStepOut {
  /** a line that rendered out past its end, or parted: let go */
  lost?: DockLine;
  /** she touched the dock: how fast her side or end met it (m/s) */
  bump?: number;
}

/**
 * One step at the dock: the wind (`wind`, from deg, kt over the water), the current (`cur`, m/s, the water's own drift), her
 * lines, and `solid(p)`: whether a point is dock (or land). Updates her speed through the water (v / astern, sway), her
 * turn and her position.
 */
export function dockStep(b: Boat, lines: DockLine[], wind: { from: number; kt: number }, cur: Vec, dt: number, solid: (p: Vec) => boolean): DockStepOut {
  const out: DockStepOut = {};
  const m = HANDLING.mass, my = m * (1 + HOVE.swayAdded), I = m * (HOVE.gyration * orc.boat.loa) ** 2 * (1 + HOVE.yawAdded);
  const s = Math.sin(b.h * D2R), c = Math.cos(b.h * D2R), fwd = { x: s, y: c }, stb = { x: c, y: -s };
  let u = b.v - (b.astern ?? 0), sw = b.sway ?? 0, r = (b.turnRate ?? 0) * D2R; // (surge and sway through the water, m/s; yaw rate, rad/s, + to starboard)
  // over the ground: through the water, plus the current
  const vg = { x: fwd.x * u + stb.x * sw + cur.x, y: fwd.y * u + stb.y * sw + cur.y };
  let X = 0, Y = 0, M = 0;
  // the water: at a walk, the coast's law ahead and astern (ASTERN_DRAG); sideways and turning, the hull and keel's
  // broadside drag (HOVE.crossCd on its lateral area), strip by strip so it damps her turning too
  X -= Math.sign(u) * (ASTERN_DRAG.c0 + ASTERN_DRAG.c1 * Math.abs(u)) * m;
  const Lw = orc.boat.imsL, N = 8, A = HOVE.latArea;
  for (let i = 0; i < N; i++) {
    const x = -Lw / 2 + (i + 0.5) * Lw / N, vy = sw + r * x, f = -0.5 * RHO * (A / N) * HOVE.crossCd * vy * Math.abs(vy);
    Y += f; M += f * x;
  }
  // the wind on her bare hull and rig, relative to her motion over the ground: drag along it, and the broadside push
  const wTo = (wind.from + 180) * D2R, wv = wind.kt * 0.5144;
  const ax = Math.sin(wTo) * wv - vg.x, ay = Math.cos(wTo) * wv - vg.y, aws = Math.hypot(ax, ay);
  if (aws > 0.01) {
    const q = 0.5 * AIR * aws * aws, along = (ax * fwd.x + ay * fwd.y) / aws, across = (ax * stb.x + ay * stb.y) / aws;
    const wy = q * HOVE.windSide * across * Math.abs(across);
    X += q * HANDLING.windageCdA * along * Math.abs(along); Y += wy; M += wy * HOVE.windLever; // (the windage acts a little ahead of the keel's centre: the mast's forward, so it blows her bow off)
  }
  // the lines
  for (const L of lines) {
    const p = cleatOf(b, L), dx = L.to.x - p.x, dy = L.to.y - p.y, d = Math.hypot(dx, dy) || 1e-6;
    const k = LINE_EA / Math.max(0.5, L.len), cDamp = 2 * LINE_ZETA * Math.sqrt(k * m);
    // her cleat's speed over the ground (a turn to starboard, clockwise from above, moves a point ahead of her middle to
    // starboard), and how fast it's opening from the dock cleat
    const lx = { x: dx / d, y: dy / d }, arm = { x: p.x - b.x, y: p.y - b.y };
    const pvx = vg.x + r * arm.y, pvy = vg.y - r * arm.x;
    const stretch = d - L.len, rate = -(pvx * lx.x + pvy * lx.y);
    let T = stretch > 0 ? Math.max(0, k * stretch + cDamp * rate) : 0;
    const cap = L.state === 'held' ? HELD_MAX : LINE_BREAK;
    if (T > cap) { L.len += (T - cap) / k; T = cap; if (L.state === 'made') { out.lost = L; T = 0; } } // (renders out through the hand; a made line parts)
    L.T = T;
    const fx = lx.x * T, fy = lx.y * T;
    X += fx * fwd.x + fy * fwd.y; const fy2 = fx * stb.x + fy * stb.y; Y += fy2;
    M += arm.y * fx - arm.x * fy; // (its moment about her middle, + turning her to starboard: clockwise from above)
  }
  // integrate (semi-implicit: the line's stiffness against her mass, a period of a second or two, is well within a 60th of a second)
  u += X / (m * 1.05) * dt; sw += Y / my * dt; r += M / I * dt;
  b.v = Math.max(0, u); b.astern = Math.max(0, -u); b.sway = sw; b.turnRate = r / D2R;
  b.h = ((b.h + r / D2R * dt) % 360 + 360) % 360;
  const s2 = Math.sin(b.h * D2R), c2 = Math.cos(b.h * D2R);
  b.vx = s2 * u + c2 * sw + cur.x; b.vy = c2 * u - s2 * sw + cur.y;
  b.x += b.vx * dt; b.y += b.vy * dt;
  // the dock: her rail at the bow, the shrouds, amidships, the quarters and the transom, both sides; where one's inside the
  // dock she's backed off it and her speed toward it taken away, as a fender takes it
  for (const at of [3.6, 1.5, 0, -1.8, -3.6]) for (const side of [1, -1] as const) {
    const q = cleatOf(b, { at, side });
    if (!solid(q)) continue;
    const n = { x: b.x - q.x, y: b.y - q.y }, nl = Math.hypot(n.x, n.y) || 1; n.x /= nl; n.y /= nl; // (back toward her middle)
    const arm = { x: q.x - b.x, y: q.y - b.y }, vq = { x: b.vx + (b.turnRate * D2R) * arm.y, y: b.vy - (b.turnRate * D2R) * arm.x };
    const into = -(vq.x * n.x + vq.y * n.y);
    if (into > 0.02) out.bump = Math.max(out.bump ?? 0, into);
    b.x += n.x * 0.04; b.y += n.y * 0.04;
    // her speed into the dock, at her middle, taken out (sway and surge by their share along the normal)
    const vn = b.vx * n.x + b.vy * n.y;
    if (vn < 0) { const ux = n.x * -vn, uy = n.y * -vn; const du = ux * s2 + uy * c2, ds = ux * c2 - uy * s2; const u2 = (b.v - (b.astern ?? 0)) + du; b.v = Math.max(0, u2); b.astern = Math.max(0, -u2); b.sway = (b.sway ?? 0) + ds; b.vx += ux; b.vy += uy; }
    b.turnRate *= 0.7;
  }
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
