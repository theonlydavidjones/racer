// Room to respond: can a boat still keep clear from here? One model for the rules (16.1: did the right-of-way boat leave
// the other room to keep clear, WS Case 105) and the AI (which way to turn, and when). docs/ROOM-TO-RESPOND.md.
//
// The same motion as physics.ts, stepped forward: her turn rate the rudder's (flowTurnRate, from the turning radius and
// her speed), reached through her yaw lag (yawLag: her yaw inertia against the water's damping), and the speed the turn
// bleeds away (turnBleed). HANDLING and those functions are read live, never copied, so a change to the rudder or the
// hull changes this with them. Left out over the few seconds this looks ahead: the sails' drive (she's assumed to hold
// what speed the turn leaves her, a little pessimistic) and the speed a tack through the wind costs beyond the turn.

import { V, wrap } from '../core/math';
import { hullGap } from '../rules/geometry';
import { flowTurnRate } from './dynamics';
import { turnBleed, yawLag } from './physics';

/** Where a boat is: position (m, x east, y north), heading (deg), speed through the water (m/s). */
export interface Pose { x: number; y: number; h: number; v: number }

/** The boat that is to keep clear, now: her pose, the turn she is already making (deg/s, + to starboard: mid-tack, or
 * answering the helm), and her weather helm (deg; physics' helmNeed, 0 if not known). */
export interface Escaper extends Pose { turnRate?: number; helmNeed?: number }

export interface EscapeOpts {
  /** Reaction time before the helm goes over, s: she carries on as she is until then. */
  delay: number;
  /** How far ahead to look, s. */
  horizon: number;
  /** Time step, s (default 0.1). */
  dt?: number;
  /** Heading changes to try, deg (+ to starboard). Default: 30°, 60° and 90° each way; holding on is always tried. */
  turns?: number[];
}

/** One avoiding manoeuvre: the heading change asked for, the heading she reaches (the AI's `desired`), and her least
 * hull-to-hull gap to any of the other boats over the horizon, m. `turn` 0 is holding on: carrying on her present turn. */
export interface Candidate { turn: number; heading: number; minGap: number; /** her least gap to each track, in order */ gaps: number[] }

const TURNS = [-90, -60, -30, 30, 60, 90];

/**
 * Each candidate manoeuvre's least gap to every one of the other boats' tracks (`tracks[i](t)`: that boat's pose `t`
 * seconds from now). The rules ask whether the best `minGap` reaches their clearance; the AI picks the candidate that
 * keeps every gap above hers, nearest her course.
 */
export function escapes(kc: Escaper, tracks: Array<(t: number) => Pose>, windFrom: number, o: EscapeOpts): Candidate[] {
  const dt = o.dt ?? 0.1, n = Math.max(1, Math.round(o.horizon / dt));
  const out: Candidate[] = [];
  const me = { x: 0, y: 0, h: 0 }; // (reused: hullGap memoises a hull's ends by its numbers)
  for (const turn of [0, ...(o.turns ?? TURNS)]) {
    const gaps = tracks.map(() => Infinity);
    let x = kc.x, y = kc.y, h = kc.h, v = kc.v, r = kc.turnRate ?? 0, minGap = Infinity;
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
      v = Math.max(0, v * (1 - turnBleed(r, v, h, windFrom, kc.helmNeed ?? 0) * dt));
      const u = V(h); x += u.x * v * dt; y += u.y * v * dt;
      me.x = x; me.y = y; me.h = h;
      for (let k = 0; k < tracks.length; k++) { const g = hullGap(me, tracks[k](t)); if (g < gaps[k]) gaps[k] = g; if (g < minGap) minGap = g; }
    }
    out.push({ turn, heading: ((h % 360) + 360) % 360, minGap, gaps });
  }
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
