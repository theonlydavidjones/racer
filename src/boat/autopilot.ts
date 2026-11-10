import type { Boat } from './boat';
import { maxTurnRate } from './dynamics';
import { beatFor, targetFor } from './seaway';
import { V, brg, clamp, cross, dot, n360, sub, unit, wrap, type Vec } from '../core/math';
import { onLand } from '../geo/shore';
import { detour } from '../ai/ai';

/**
 * A tiller pilot, as Folkboat sailors fit one: an electric ram on the tiller, steering to a compass course (Auto), to
 * the apparent wind angle from the masthead unit (Wind), or toward a waypoint (Nav). The ram drives the tiller
 * hard-over to hard-over in about 4 s (Raymarine's ST2000+, a common tiller pilot on a boat this size: "hard-over to
 * hard-over time 4.0 s, no load"), so it can't catch a broach any faster than you could, and in a seaway it works the
 * whole time. Like the real thing, its AutoTrim learns the standing helm the boat needs (weather helm) and holds it.
 *
 * Nav goes a step beyond the pilot alone: it's the pilot plus a navigator calling the tacks. When the waypoint is
 * upwind it sails close-hauled and tacks on the layline (allowing for the current), tacks off the shore as it nears
 * it, and steers round land in the way on a reach or a run. It doesn't keep a lookout: other boats, ships and the
 * racing rules are still yours.
 */
export type PilotMode = 'off' | 'auto' | 'wind' | 'nav';

export interface Pilot {
  mode: PilotMode;
  /** Auto: the compass course it holds, deg. */
  course: number;
  /** Wind: the apparent wind angle it holds, signed (+ from starboard), deg. */
  awa: number;
  /** The apparent wind angle as the pilot sees it: the masthead reading, damped over a couple of seconds. */
  awaSeen: { s: number; c: number };
  /** AutoTrim: the standing helm it has learned to carry (fraction of full rudder). */
  trim: number;
  /** Where the tiller is now (the ram moves it no faster than RAM_RATE). */
  ram: number;
  lastH: number;
  /** Nav: when it last tacked (s), so it doesn't tack and tack again; a detour round land, worked out now and then. */
  lastTackT: number; detour: Vec | null; detourT: number;
  /** Nav: the heading it's steering now, for the display. */
  navH: number;
}

/** Tiller travel per second: hard over to hard over (2 units) in 4 s. */
const RAM_RATE = 0.5;
/** How briskly it asks to turn: deg/s of turn per degree off course. */
const GAIN = 0.45;
/** Damping on the masthead reading, s (a pilot's "response" setting: low, to save the battery and not chase every wave). */
const AWA_TAU = 2.5;
/** The angle Auto turns through when you press Tack (Raymarine's AutoTack in compass mode: 100°). */
export const AUTO_TACK = 100;

export function newPilot(): Pilot {
  return { mode: 'off', course: 0, awa: 40, awaSeen: { s: 0, c: 1 }, trim: 0, ram: 0, lastH: 0, lastTackT: -1e9, detour: null, detourT: -1e9, navH: 0 };
}

/** Engage in a mode, taking up where she is now: Auto holds her heading, Wind her apparent wind angle. */
export function engage(b: Boat, p: Pilot, mode: Exclude<PilotMode, 'off'>): void {
  if (p.mode === 'off') { p.trim = 0; p.ram = b.tiller; p.lastH = b.h; p.awaSeen = { s: Math.sin(b.arel * Math.PI / 180), c: Math.cos(b.arel * Math.PI / 180) }; }
  p.mode = mode; p.course = n360(b.h); p.awa = b.arel; p.navH = b.h;
}

/** Back to standby: the ram lets go and the tiller is yours, where it is. */
export function standby(p: Pilot): void { p.mode = 'off'; }

/** Turn the set course by d degrees (+ to starboard), as the −10/−1/+1/+10 buttons do. */
export function adjust(b: Boat, p: Pilot, d: number): void {
  if (p.mode === 'nav') { p.mode = 'auto'; p.course = p.navH; }
  if (p.mode === 'auto') p.course = n360(p.course + d);
  else if (p.mode === 'wind') p.awa = clamp(p.awa - d, -180, 180); // turning to starboard brings the wind from starboard forward
  void b;
}

/** Tack (or gybe): Auto turns 100° toward the wind; Wind puts the same apparent wind angle on the other side. */
export function tack(b: Boat, p: Pilot): void {
  if (p.mode === 'auto') p.course = n360(p.course + (b.arel >= 0 ? AUTO_TACK : -AUTO_TACK));
  else if (p.mode === 'wind') p.awa = -p.awa;
}

/** What Nav steers for: the course to the waypoint, close-hauled on the right tack when it's upwind, round land in the way. */
function navHeading(b: Boat, p: Pilot, dest: Vec, t: number): number {
  const from = b.ww.from, beat = beatFor(b) + 1, csS = n360(from - beat), csP = n360(from + beat), c = b.cur;
  let P = dest;
  const bP0 = brg(P.x - b.x, P.y - b.y);
  if (Math.abs(wrap(from - bP0)) > 50) { // reaching or running: round any land in the way
    if (t - p.detourT > 2) { p.detour = detour(b, P); p.detourT = t; }
    if (p.detour) P = p.detour;
  } else p.detour = null;
  const bP = brg(P.x - b.x, P.y - b.y);
  if (Math.abs(wrap(from - bP)) >= beat + 2) return bP; // she can lay it: straight there
  // upwind: close-hauled; tack when the other tack fetches (made good through the current), or when the shore's close ahead
  const onS = b.tack === 'S', cur = onS ? csS : csP;
  if (t - p.lastTackT > 12 && !b.tacking) {
    const d = sub(P, b), vs = targetFor(b, beat);
    const fetch = (tk: 'S' | 'P') => {
      const u = V(tk === 'S' ? csS : csP), g = unit({ x: u.x * vs + c.x, y: u.y * vs + c.y });
      if (dot(g, d) <= 0) return false;
      const lat = cross(g, d);
      return tk === 'S' ? lat > 3 : lat < -3;
    };
    const u = V(cur), look = 40 + b.v * 15, shore = onLand({ x: b.x + u.x * look, y: b.y + u.y * look });
    if ((fetch(onS ? 'P' : 'S') && !fetch(b.tack)) || shore) { p.lastTackT = t; return onS ? csP : csS; }
  }
  return b.tacking ? (onS ? csS : csP) : cur;
}

/**
 * One step of the pilot: it reads the compass and the masthead unit, works out the helm, and the ram moves the tiller
 * toward it. Sets b.tiller (−1 pushed to port … +1 pushed to starboard; pushing it to starboard turns her to port).
 */
export function pilotStep(b: Boat, p: Pilot, dest: Vec | null, t: number, dt: number): void {
  if (p.mode === 'off') return;
  const k = Math.min(1, dt / AWA_TAU), ar = b.arel * Math.PI / 180;
  p.awaSeen.s += (Math.sin(ar) - p.awaSeen.s) * k; p.awaSeen.c += (Math.cos(ar) - p.awaSeen.c) * k;
  const seen = Math.atan2(p.awaSeen.s, p.awaSeen.c) * 180 / Math.PI;
  let want: number;
  if (p.mode === 'auto') want = p.course;
  else if (p.mode === 'wind') want = n360(b.h + wrap(seen - p.awa)); // wind too far aft: come up toward it
  else { want = dest ? navHeading(b, p, dest, t) : b.h; p.navH = want; }
  const err = wrap(want - b.h), rate = wrap(b.h - p.lastH) / Math.max(dt, 1e-6); p.lastH = b.h;
  const mr = Math.max(1, maxTurnRate(b.v));
  // the turn it asks for, and the helm that should give it, plus what AutoTrim has learned she needs to go straight
  const ask = clamp(err * GAIN, -mr, mr), helm = clamp(ask / mr + p.trim, -1, 1);
  // AutoTrim: slowly learn the standing helm from the turn it gets against the turn it asked for (not while turning hard)
  if (Math.abs(err) < 15) p.trim = clamp(p.trim + (ask - rate) / mr * dt * 0.15, -0.6, 0.6);
  const target = -helm; // + helm (turn to starboard) is the tiller pushed to port
  p.ram += clamp(target - p.ram, -RAM_RATE * dt, RAM_RATE * dt);
  b.tiller = p.ram; b.steer = 0; b.turnTarget = null;
}
