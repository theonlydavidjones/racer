// Two hulls touching: what the blow does to each one's motion. Pure: no World, no DOM.
//
// A contact impulse between two rigid bodies in the plane (surge, sway and yaw each), at the points where they touch:
// equal and opposite on the two, along the line the blow runs (rules/geometry.ts contactNormal, the same points and line
// the damage is read from: boat/damage.ts) and, by friction, along the hulls. Momentum is kept; what's lost is the
// energy of their closing. Each boat answers by her own inertia, with the water she carries with her: the sim's own
// figures, as she sails by (dynamics.ts HANDLING.mass for surge; physics.ts HOVE.swayAdded, yawAdded and gyration for
// sway and yaw). A blow on her bow or quarter swings her as well as shoving her: off her center it meets less of her.
//
// The method is the usual one for ships (Pedersen & Zhang 1998, "On impact mechanics in ship collisions", Marine
// Structures 11:429–449: an impulse at the contact point with the water as added mass, with friction and sliding).
// Their paper could not be reached to quote (14 Nov 2026), so the algebra here is the textbook's: the 2×2 system of
// the contact point's relative velocity against the impulse (Stronge, Impact Mechanics, Cambridge 2000: planar impact
// with friction). It is the simple form: Newton's restitution (the points part at a share of their closing speed) and
// friction in one direction for the whole blow. Stronge shows that form can, for some shapes and frictions, give back
// more energy than went in; at these values it never did in 400 000 random blows with way, sway and spin on
// (tests/contact.test.ts scans it).
//
// The blow is taken at ONE point, midway between the two hulls' nearest points, for both: equal and opposite impulses
// at one point keep their angular momentum together as well as their momentum. Where the hulls lie alongside (the
// nearest points a stretch, not a point), it is the middle of the stretch: two boats pressed side to side shove each
// other bodily, with no turn.
//
// What it can't see: the hulls are their centerlines with half a beam round them (rules/pairs.ts CONTACT_GAP, the
// rules' measure of touching), so bow to stern in line they "touch" with a beam's width of water between. Their real
// outlines would put that right; the impulse would be the same.
//
// ESTIMATES, both: no measurement for small wooden or GRP hulls was found (the researcher, 14 Nov 2026).
// - RESTITUTION 0.2: how much of their closing speed they part with. Ship-collision analysis is said to take the blow
//   as plastic (none; unverified, the papers unreachable; damage.ts reads it so); two sound yacht hulls at a walking
//   pace give and spring back a little.
// - FRICTION 0.3: hull sliding on hull, wet paint or gelcoat. (Steel on steel in ship collisions is said to be taken
//   near 0.6; unverified.)
import type { Boat } from './boat';
import { HANDLING, HULL } from './dynamics';
import { HOVE } from './physics';
import { DEFAULT_CREW, displacement } from './crewPhys';
import orc from './data/nordic-folkboat-orc.json';
import { HALF, type Vec } from '../core/math';

export const RESTITUTION = 0.2, FRICTION = 0.3;
const D2R = Math.PI / 180;

/** Her inertia, with the water she carries: along her, across her (kg) and in yaw (kg·m²). */
function inertia(b: Boat): { mx: number; my: number; I: number } {
  const disp = displacement(b.crew?.spec ?? DEFAULT_CREW) + (b.cond?.extraKg ?? 0);
  return { mx: HANDLING.mass * disp / HULL.displacement, my: disp * (1 + HOVE.swayAdded), I: disp * (HOVE.gyration * orc.boat.loa) ** 2 * (1 + HOVE.yawAdded) };
}

/** What the touch did. */
export interface Blow {
  /** How fast the two points were closing along the line of the blow before it, m/s (0: not closing, nothing done). */
  closing: number;
  /** The impulse along the line and along the hulls, N·s. */
  normal: number; friction: number;
  /** The energy it took out of their motion, J. */
  loss: number;
}
const NONE: Blow = { closing: 0, normal: 0, friction: 0, loss: 0 };

/** The energy of her motion over the ground, J (with the water she carries). */
function energy(b: Boat, m: { mx: number; my: number; I: number }): number {
  const u = b.v - (b.astern ?? 0), sw = b.sway ?? 0, r = (b.turnRate ?? 0) * D2R;
  return 0.5 * (m.mx * u * u + m.my * sw * sw + m.I * r * r);
}

/**
 * Where two hulls touch: midway between the nearest points of their centerlines; where they lie alongside, so that
 * the nearest is a stretch (every pairing within 5 cm of the least), the middle of it.
 */
export function touchPoint(A: { x: number; y: number; h: number }, B: { x: number; y: number; h: number }): Vec {
  const sA = Math.sin(A.h * D2R) * HALF, cA = Math.cos(A.h * D2R) * HALF, sB = Math.sin(B.h * D2R) * HALF, cB = Math.cos(B.h * D2R) * HALF;
  const p1x = A.x + sA, p1y = A.y + cA, p2x = A.x - sA, p2y = A.y - cA, q1x = B.x + sB, q1y = B.y + cB, q2x = B.x - sB, q2y = B.y - cB;
  // (each end against the other hull's line: the point on it nearest, and how far)
  const on = (px: number, py: number, ax: number, ay: number, bx: number, by: number, k: number) => {
    const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1)));
    NX[k] = ax + dx * t; NY[k] = ay + dy * t; PX[k] = px; PY[k] = py; ND[k] = Math.hypot(NX[k] - px, NY[k] - py);
  };
  on(p1x, p1y, q1x, q1y, q2x, q2y, 0); on(p2x, p2y, q1x, q1y, q2x, q2y, 1); on(q1x, q1y, p1x, p1y, p2x, p2y, 2); on(q2x, q2y, p1x, p1y, p2x, p2y, 3);
  const least = Math.min(ND[0], ND[1], ND[2], ND[3]);
  let x = 0, y = 0, k = 0;
  for (let i = 0; i < 4; i++) if (ND[i] <= least + 0.05) { x += (NX[i] + PX[i]) / 2; y += (NY[i] + PY[i]) / 2; k++; }
  return { x: x / k, y: y / k };
}
const NX = new Float64Array(4), NY = new Float64Array(4), PX = new Float64Array(4), PY = new Float64Array(4), ND = new Float64Array(4);

/**
 * The blow between A and B touching at `at`, along the unit line `n` from A toward B: changes each one's headway or
 * sternway, her sway and her turn, if they are closing there. Their motion is through the water (the stream carries
 * both alike).
 */
export function collide(A: Boat, B: Boat, at: Vec, n: Vec): Blow {
  const tx = -n.y, ty = n.x; // (along the hulls)
  // each one's axes, and her point's velocity: her own, and her turn's swinging it (+ turnRate is to starboard, clockwise)
  const sA = Math.sin(A.h * D2R), cA = Math.cos(A.h * D2R), sB = Math.sin(B.h * D2R), cB = Math.cos(B.h * D2R);
  const uA = A.v - (A.astern ?? 0), wA = A.sway ?? 0, oA = -(A.turnRate ?? 0) * D2R, rAx = at.x - A.x, rAy = at.y - A.y;
  const uB = B.v - (B.astern ?? 0), wB = B.sway ?? 0, oB = -(B.turnRate ?? 0) * D2R, rBx = at.x - B.x, rBy = at.y - B.y;
  const vAx = sA * uA + cA * wA - oA * rAy, vAy = cA * uA - sA * wA + oA * rAx;
  const vBx = sB * uB + cB * wB - oB * rBy, vBy = cB * uB - sB * wB + oB * rBx;
  const un = (vAx - vBx) * n.x + (vAy - vBy) * n.y, ut = (vAx - vBx) * tx + (vAy - vBy) * ty;
  if (!(un > 0)) return NONE; // (parting, or lying together: no blow)
  const mA = inertia(A), mB = inertia(B), e0 = energy(A, mA) + energy(B, mB);
  // how readily each point gives to a push along n and along t: 1/m along her and across her, and her turn's share by
  // the push's lever about her center
  const give = (s: number, c: number, m: { mx: number; my: number; I: number }, rx: number, ry: number, px: number, py: number, qx: number, qy: number) =>
    (s * px + c * py) * (s * qx + c * qy) / m.mx + (c * px - s * py) * (c * qx - s * qy) / m.my + (rx * py - ry * px) * (rx * qy - ry * qx) / m.I;
  const Knn = give(sA, cA, mA, rAx, rAy, n.x, n.y, n.x, n.y) + give(sB, cB, mB, rBx, rBy, n.x, n.y, n.x, n.y);
  const Ktt = give(sA, cA, mA, rAx, rAy, tx, ty, tx, ty) + give(sB, cB, mB, rBx, rBy, tx, ty, tx, ty);
  const Knt = give(sA, cA, mA, rAx, rAy, n.x, n.y, tx, ty) + give(sB, cB, mB, rBx, rBy, n.x, n.y, tx, ty);
  // sticking: the points part at RESTITUTION of their closing, and stop sliding
  const want = un * (1 + RESTITUTION), det = Knn * Ktt - Knt * Knt;
  let Pn = (want * Ktt - ut * Knt) / det, Pt = (ut * Knn - want * Knt) / det;
  if (!(Pn > 0) || Math.abs(Pt) > FRICTION * Pn) {
    // sliding: friction at its limit, against the slide
    const s = ut >= 0 ? 1 : -1, den = Knn + s * FRICTION * Knt;
    Pn = den > 1e-9 ? want / den : want / Knn; Pt = s * FRICTION * Pn;
    if (den <= 1e-9) Pt = 0;
  }
  // the impulse on B is P = Pn·n + Pt·t; on A, its opposite
  const Px = Pn * n.x + Pt * tx, Py = Pn * n.y + Pt * ty;
  push(A, sA, cA, mA, rAx, rAy, -Px, -Py); push(B, sB, cB, mB, rBx, rBy, Px, Py);
  return { closing: un, normal: Pn, friction: Pt, loss: e0 - energy(A, mA) - energy(B, mB) };
}

/** An impulse (Jx, Jy) N·s on her at the lever (rx, ry) from her center: her way, her sway and her turn changed by it. */
function push(b: Boat, s: number, c: number, m: { mx: number; my: number; I: number }, rx: number, ry: number, Jx: number, Jy: number): void {
  const u0 = b.v - (b.astern ?? 0), sw0 = b.sway ?? 0;
  const u = u0 + (s * Jx + c * Jy) / m.mx, sw = sw0 + (c * Jx - s * Jy) / m.my;
  b.v = Math.max(0, u); b.astern = Math.max(0, -u); b.sway = sw;
  b.turnRate = (b.turnRate ?? 0) - (rx * Jy - ry * Jx) / m.I / D2R; b.yawRate = b.turnRate;
  // (over the ground: what the rules and the damage read)
  b.vx += s * (u - u0) + c * (sw - sw0); b.vy += c * (u - u0) - s * (sw - sw0);
}
