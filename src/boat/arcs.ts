// Room to respond: can a boat still keep clear from here? One model for the rules (16.1: did the right-of-way boat leave
// the other room to keep clear, WS Case 105) and the AI (which way to turn, and when). docs/ROOM-TO-RESPOND.md.
//
// The same motion as physics.ts, stepped forward: her turn rate the rudder's (flowTurnRate, from the turning radius and
// her speed), reached through her yaw lag (yawLag: her yaw inertia against the water's damping), and the speed the turn
// changes as she turns (turnSpeed: the same surge law as the boat's own step, cut to what a prediction can know: the
// sails' drive toward the polar's speed on the heading she's on, so bearing away she holds or gains, above her beat
// angle she slows on the polar's pinching curve, and in the no-go zone there's none; the flogging sails' and rig's
// windage; the turn's own drag). Those functions are read live, never copied, so a change to the rudder, the hull or
// the polar changes this with them. Left out: trim, crew and sea.

import { V, wrap } from '../core/math';
import { hullEndsInto, hullGapEnds } from '../rules/geometry';
import { flowTurnRate } from './turning';
import { turnSpeed, yawLag } from './physics';

/** Where a boat is: position (m, x east, y north), heading (deg), speed through the water (m/s). */
export interface Pose { x: number; y: number; h: number; v: number }

/** The boat that is to keep clear, now: her pose, the turn she is already making (deg/s, + to starboard: mid-tack, or
 * answering the helm), and her weather helm (deg; physics' helmNeed, 0 if not known). */
export interface Escaper extends Pose { turnRate?: number; helmNeed?: number; /** her leeway, deg (turnSpeed's course angle; default 4) */ leeway?: number; /** she lets her sheets fly as she turns (b.luff) */ luff?: boolean }

export interface EscapeOpts {
  /** Reaction time before the helm goes over, s: she carries on as she is until then. */
  delay: number;
  /** How far ahead to look, s. */
  horizon: number;
  /** Time step, s (default 0.1). */
  dt?: number;
  /** Heading changes to try, deg (+ to starboard). Default: 30°, 60° and 90° each way; holding on is always tried. */
  turns?: number[];
  /** The true wind's speed, kt: the polar's speed on each heading she passes through, and her beat angle. Default 12 kt. */
  windKt?: number;
}

/** One avoiding manoeuvre: the heading change asked for, the heading she reaches (the AI's `desired`), and her least
 * hull-to-hull gap to any of the other boats over the horizon, m. `turn` 0 is holding on: carrying on her present turn. */
export interface Candidate { turn: number; heading: number; minGap: number; /** her least gap to each track, in order */ gaps: number[]; /** her speed at the end, m/s */ v: number }

const TURNS = [-90, -60, -30, 30, 60, 90];

/**
 * Each candidate manoeuvre's least gap to every one of the other boats' tracks (`tracks[i](t)`: that boat's pose `t`
 * seconds from now). The rules ask whether the best `minGap` reaches their clearance; the AI picks the candidate that
 * keeps every gap above hers, nearest her course.
 */
/** Her own path for each candidate turn, stepped forward (escapes' first half): it doesn't depend on the other boats, so
 * one set of paths serves every set of tracks judged against it (ai.ts keepClear: the threats, then the boats beside them). */
export interface EscapePaths { turns: number[]; n: number; dt: number; /** her hull's bow and stern at each step (rules/geometry.ts hullEndsInto), 4 numbers a step */ ends: Float64Array[]; heading: number[]; v: number[] }
export function escapePaths(kc: Escaper, windFrom: number, o: EscapeOpts): EscapePaths {
  const dt = o.dt ?? 0.1, n = Math.max(1, Math.round(o.horizon / dt)), wKt = o.windKt ?? 12, turns = [0, ...(o.turns ?? TURNS)];
  const P: EscapePaths = { turns, n, dt, ends: [], heading: [], v: [] };
  for (const turn of turns) {
    const E = new Float64Array(4 * (n + 1));
    let x = kc.x, y = kc.y, h = kc.h, v = kc.v, r = kc.turnRate ?? 0;
    const target = h + turn;
    for (let i = 1; i <= n; i++) {
      const t = i * dt;
      // the rate she's steering for: until she reacts, whatever she was doing; then the helm hard over toward the new
      // heading, eased (as a helmsman does) once what she'll still turn with the helm amidships, rate × lag, gets her there
      let want = kc.turnRate ?? 0;
      if (turn !== 0 && t > o.delay) {
        const err = wrap(target - h), max = flowTurnRate(v), tau = yawLag(v);
        want = Math.abs(err) <= Math.abs(r) * tau && Math.sign(err) === Math.sign(r) ? 0 : Math.sign(err) * max;
        if (Math.abs(err) < 1) want = 0;
      }
      r += (want - r) * (1 - Math.exp(-dt / yawLag(v)));
      h += r * dt;
      // (Deep Physics checked the prediction against the AI's real steered turn: the heading within 3-6°, the position
      // 1.3-5 m out at 8 s, nearly all of it the speed; turnSpeed is their answer, Skipper Model's request)
      v = turnSpeed(v, r, h, windFrom, wKt, dt, kc.helmNeed ?? 0, kc.leeway ?? 4, turn !== 0 && t > o.delay && !!kc.luff);
      const u = V(h); x += u.x * v * dt; y += u.y * v * dt;
      hullEndsInto(x, y, h, E, 4 * i);
    }
    P.ends.push(E); P.heading.push(((h % 360) + 360) % 360); P.v.push(v);
  }
  return P;
}

export function escapes(kc: Escaper, tracks: Array<(t: number) => Pose>, windFrom: number, o: EscapeOpts, paths = escapePaths(kc, windFrom, o)): Candidate[] {
  const { n, dt } = paths, out: Candidate[] = [];
  // (each track's poses, once: the same for every turn, and the same objects, so geometry.ts's memo of their ends holds)
  const at = tracks.map(tr => { const a: Pose[] = new Array(n + 1); for (let i = 1; i <= n; i++) a[i] = tr(i * dt); return a; });
  paths.turns.forEach((turn, j) => {
    const gaps = tracks.map(() => Infinity), E = paths.ends[j];
    let minGap = Infinity;
    for (let i = 1; i <= n; i++) {
      for (let k = 0; k < at.length; k++) { const g = hullGapEnds(E, 4 * i, at[k][i]); if (g < gaps[k]) gaps[k] = g; if (g < minGap) minGap = g; }
    }
    out.push({ turn, heading: paths.heading[j], minGap, gaps, v: paths.v[j] });
  });
  return out;
}

/** A boat sailing on as she is: straight, or carrying on her present turn at `turnRate` deg/s, at a steady speed. */
export function straightOn(p: Pose, turnRate = 0): (t: number) => Pose {
  return (t: number) => {
    if (Math.abs(turnRate) < 1e-6) { const u = V(p.h); return { x: p.x + u.x * p.v * t, y: p.y + u.y * p.v * t, h: p.h, v: p.v }; }
    // on a circle: radius v/ω
    const w = turnRate * Math.PI / 180, R = p.v / w, h0 = p.h * Math.PI / 180, h1 = h0 + w * t;
    return { x: p.x + R * (Math.cos(h0) - Math.cos(h1)), y: p.y + R * (Math.sin(h1) - Math.sin(h0)), h: p.h + turnRate * t, v: p.v };
  };
}
