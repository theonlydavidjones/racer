import type { Boat } from './boat';
import { maxTurnRate } from './turning';
import { thrust } from './motor';
import { beatFor, targetFor } from './seaway';
import { D2R, V, brg, clamp, cross, dot, n360, sub, unit, wrap, type Vec } from '../core/math';
import { landAlong } from '../geo/shore';
import { detour } from '../ai/ai';

/**
 * A tiller pilot, as Folkboat sailors fit one: an electric ram on the tiller, steering to a compass course (Auto), to
 * the apparent wind angle from the masthead unit (Wind), or toward a waypoint (Nav). Modelled on Raymarine's ST2000+,
 * a common tiller pilot on a boat this size (Raymarine: "suitable for boats up to 4,500 kg (10,000 lb) maximum
 * displacement", with AutoTack; raymarine.com, ST1000/ST2000 product page; a Folkboat is about 1.9 t). The ram drives
 * the tiller hard over to hard over in about 4.5 s (secondary sources quoting the handbook, document 81130, which we
 * couldn't reach: unconfirmed), so it can't catch a broach any faster than you could, and in a seaway it works the
 * whole time. It also learns the standing helm the boat needs (weather helm) and holds it (what Raymarine calls
 * AutoTrim is unconfirmed; the behaviour here is the standard integral term of any course-keeping pilot).
 *
 * Not when racing: RRS 52 (2025–2028), "A boat's standing rigging, running rigging, spars and movable hull appendages
 * shall be adjusted and operated only by the power provided by the crew", and the Equipment Rules of Sailing E.1.2(j)
 * define the rudder as "a movable hull appendage primarily used to affect steerage". So a powered autopilot breaks
 * rule 52 unless the notice of race changes it, as World Sailing's Offshore Special Regulations Appendix M suggests
 * for offshore races ("autopilots may be used to adjust and operate moveable hull appendages").
 *
 * Nav goes a step beyond the pilot alone: it's the pilot plus a navigator calling the tacks. When the waypoint is
 * upwind it sails close-hauled and tacks on the layline (allowing for the current), tacks off the shore as it nears
 * it, and steers round land in the way on a reach or a run. It doesn't keep a lookout: other boats, ships and the
 * racing rules are still yours.
 */
export type PilotMode = 'off' | 'auto' | 'wind' | 'nav';

export interface Pilot {
  mode: PilotMode;
  /** Nav under power: on the direct course to the destination (motor.ts), not the sailing navigator's */
  direct?: boolean;
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
  /** Nav: the tack it has decided to go onto, held until she's round. */
  goTack: 'S' | 'P' | null;
  /** The tack she was on last step (AutoTrim's standing helm swaps sides when she tacks). */
  lastTack: 'S' | 'P' | null;
  /** Something the pilot can't handle: it sounds its alarm and goes to standby (the World says so and clears it). */
  alarm: string | null;
}

/** Tiller travel per second: hard over to hard over (2 units) in about 4.5 s (see above: unconfirmed). */
const RAM_RATE = 2 / 4.5;
/** How briskly it asks to turn: deg/s of turn per degree off course. A tuning choice, not a measured figure: it settles a
 * heading error with a time constant of about 2 s, about as quickly as a good helmsman, and well inside what the ram can
 * deliver; much higher and it chases every wave (a real pilot's "response" setting trades the same thing). */
const GAIN = 0.45;
/** Damping on the masthead reading, s (a pilot's "response" setting: low, to save the battery and not chase every wave). */
const AWA_TAU = 2.5;
/** The angle Auto turns through when you press Tack. Raymarine's AutoTack default is commonly given as 100° (unconfirmed
 * against the ST2000+ handbook). */
export const AUTO_TACK = 100;

export function newPilot(): Pilot {
  return { mode: 'off', course: 0, awa: 40, awaSeen: { s: 0, c: 1 }, trim: 0, ram: 0, lastH: 0, lastTackT: -1e9, detour: null, detourT: -1e9, navH: 0, goTack: null, lastTack: null, alarm: null };
}

/** Engage in a mode, taking up where she is now: Auto holds her heading, Wind her apparent wind angle. */
export function engage(b: Boat, p: Pilot, mode: Exclude<PilotMode, 'off'>): void {
  if (p.mode === 'off') { p.trim = 0; p.ram = b.tiller; p.lastH = b.h; p.awaSeen = { s: Math.sin(b.arel * Math.PI / 180), c: Math.cos(b.arel * Math.PI / 180) }; }
  p.mode = mode; p.course = n360(b.h); p.awa = b.arel; p.navH = b.h; p.goTack = null; p.lastTack = b.tack; p.alarm = null;
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

/**
 * The heading that makes good a track along bearing `brgT` through the current: the course to steer, as a navigator
 * works it (the boat's water speed `v` crossed with the current's set across the track). Null when the current across
 * the track is more than she can stem.
 */
function courseToSteer(brgT: number, v: number, cur: Vec): number | null {
  const n = V(brgT + 90), across = cur.x * n.x + cur.y * n.y, k = across / Math.max(v, 0.5);
  return Math.abs(k) > 0.9 ? null : n360(brgT - Math.asin(k) / D2R);
}

/** Land within `d` m ahead on heading h? The whole way, exactly (geo/shore.ts landAlong): a pier or a dock a metre
 * or two wide is in the way, however far ahead it is. */
const landAhead = (b: Boat, h: number, d: number) => { const u = V(h); return landAlong(b, { x: b.x + u.x * d, y: b.y + u.y * d }) <= d; };

/** What Nav steers for: the course to the waypoint allowing for the current, close-hauled on the right tack when it's upwind, round land in the way. */
function navHeading(b: Boat, p: Pilot, dest: Vec, t: number): number {
  // (the headings: her course is the polar's angle, so she steers her leeway higher than it, physics.ts b.leeway)
  const from = b.ww.from, beat = beatFor(b) + 1, lw = b.leeway ?? 0, csS = n360(from - beat + lw), csP = n360(from + beat - lw), c = b.cur;
  const close = (tk: 'S' | 'P') => tk === 'S' ? csS : csP;
  // a tack it has decided on: steer for the new tack's close-hauled course until she's round
  if (p.goTack) { if (b.tack === p.goTack && !b.tacking) p.goTack = null; else return close(p.goTack); }
  let P = dest;
  const bP0 = brg(P.x - b.x, P.y - b.y);
  if (Math.abs(wrap(from - bP0)) > 50) { // reaching or running: round any land in the way
    if (t - p.detourT > 2) { p.detour = detour(b, P); p.detourT = t; }
    if (p.detour) P = p.detour;
  } else p.detour = null;
  const bP = brg(P.x - b.x, P.y - b.y), vs = Math.max(b.v, targetFor(b, Math.abs(wrap(from - bP))) * 0.8);
  const cts = courseToSteer(bP, vs, c);
  // she can lay it: steer the course that makes good the bearing (her leeway higher, toward the wind)
  if (cts != null && Math.abs(wrap(from - cts)) >= beat + 2) { const r = wrap(from - cts); return Math.abs(r) < 150 ? n360(cts + Math.sign(r) * lw) : cts; }
  // upwind: close-hauled; tack when the other tack fetches (made good through the current), or when the shore's close ahead
  const onS = b.tack === 'S', other = onS ? 'P' : 'S', cur = close(b.tack);
  if (t - p.lastTackT > 12 && !b.tacking) {
    const d = sub(P, b), vb = targetFor(b, beat);
    const fetch = (tk: 'S' | 'P') => {
      const u = V(close(tk)), g = unit({ x: u.x * vb + c.x, y: u.y * vb + c.y });
      if (dot(g, d) <= 0) return false;
      const lat = cross(g, d);
      return tk === 'S' ? lat > 3 : lat < -3;
    };
    const look = 40 + b.v * 15, shore = landAhead(b, cur, look);
    if (shore && landAhead(b, close(other), look)) { p.alarm = 'Pilot alarm: land ahead on both tacks. Pilot on standby: you have the tiller.'; return cur; }
    if ((fetch(other) && !fetch(b.tack)) || shore) { p.lastTackT = t; p.goTack = other; return close(other); }
  }
  return cur;
}

/**
 * One step of the pilot: it reads the compass and the masthead unit, works out the helm, and the ram moves the tiller
 * toward it. Sets b.tiller (−1 pushed to port … +1 pushed to starboard; pushing it to starboard turns her to port).
 */
export function pilotStep(b: Boat, p: Pilot, dest: Vec | null, t: number, dt: number): void {
  if (p.mode === 'off') return;
  if ((b.astern ?? 0) > 0.1) { p.alarm = 'Pilot alarm: she\'s going astern, and a pilot can\'t steer backwards. Pilot on standby: you have the tiller.'; return; }
  if (p.lastTack && b.tack !== p.lastTack && !b.tacking) { p.trim = -p.trim; p.lastTack = b.tack; } // weather helm is now on the other side
  else if (!p.lastTack) p.lastTack = b.tack;
  const k = Math.min(1, dt / AWA_TAU), ar = b.arel * Math.PI / 180;
  p.awaSeen.s += (Math.sin(ar) - p.awaSeen.s) * k; p.awaSeen.c += (Math.cos(ar) - p.awaSeen.c) * k;
  const seen = Math.atan2(p.awaSeen.s, p.awaSeen.c) * 180 / Math.PI;
  let want: number;
  if (p.mode === 'auto') want = p.course;
  else if (p.mode === 'wind') want = n360(b.h + wrap(seen - p.awa)); // wind too far aft: come up toward it
  else {
    // under power (her motor driving her ahead), she needn't tack: the navigator points her straight at it, unless there's
    // land in the way
    const motoring = !!b.motor && thrust(b.motor, b.v) > 40; // (driving her ahead, more than at tick-over)
    // (the direct line probed ahead to 150 m to take it, 100 m to keep it, so it doesn't flip between the two at the edge of
    // the probe; and only as far as the destination: her slip's docks behind it don't count)
    const dd = dest ? Math.hypot(dest.x - b.x, dest.y - b.y) : 0, direct = dest ? n360(brg(dest.x - b.x, dest.y - b.y)) : b.h, u = V(direct);
    const reach = Math.min(p.direct ? 100 : 150, Math.max(0, dd - 12));
    const clear = !!dest && landAlong(b, { x: b.x + u.x * reach, y: b.y + u.y * reach }) === Infinity;
    p.direct = motoring && clear;
    want = dest ? (motoring && clear ? direct : navHeading(b, p, dest, t)) : b.h; p.navH = want; // (land within 150 m on the direct line: the navigator's way round)
  }
  const err = wrap(want - b.h), rate = wrap(b.h - p.lastH) / Math.max(dt, 1e-6); p.lastH = b.h;
  // (turning her onto a new course is a turn called: if her stern passes the wind in it, her crew jibe the main, as for a
  // called jibe; held steady by the lee, they leave it, as with a helmsman: physics.ts gybeMeant)
  if (Math.abs(err) > 5) b.turnCalledT = t;
  const mr = Math.max(1, maxTurnRate(b.v));
  // the turn it asks for, and the helm that should give it, plus what AutoTrim has learned she needs to go straight
  const ask = clamp(err * GAIN, -mr, mr), helm = clamp(ask / mr + p.trim, -1, 1);
  // AutoTrim: slowly learn the standing helm from the turn it gets against the turn it asked for (not while turning hard)
  if (Math.abs(err) < 15) p.trim = clamp(p.trim + (ask - rate) / mr * dt * 0.15, -0.6, 0.6);
  const target = -helm; // + helm (turn to starboard) is the tiller pushed to port
  p.ram += clamp(target - p.ram, -RAM_RATE * dt, RAM_RATE * dt);
  b.tiller = p.ram; b.steer = 0; b.turnTarget = null;
}
