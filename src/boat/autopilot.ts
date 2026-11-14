import type { Boat } from './boat';
import { maxTurnRate } from './dynamics';
import { thrust } from './motor';
import { beatFor, targetFor } from './seaway';
import { D2R, V, brg, clamp, cross, dot, n360, sub, unit, wrap, type Vec } from '../core/math';
import { landAlong } from '../geo/shore';
import { detour } from '../ai/ai';
import { routeAround } from '../sim/routing';

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
  /** Nav: the way by water when land's in the direct way (sim/routing.ts routeAround: the planner's route round piers,
   * breakwaters and the shore), the turn she's steering for in it, when it was worked out (s), and for where; the turn
   * she's steering for (null: the way's clear). */
  route: Vec[] | null; ri: number; routeT: number; routeTo: Vec | null; routeFrom: Vec | null; wp: Vec | null;
  /** How many times Nav has worked the way out (for the tests: it's a tenth of a second among the docks). */
  plans: number;
  /** Nav: the heading it's steering now, for the display. */
  navH: number;
  /** Nav: the tack it has decided to go onto, held until she's round. */
  goTack: 'S' | 'P' | null;
  /** The tack she was on last step (AutoTrim's standing helm swaps sides when she tacks). */
  lastTack: 'S' | 'P' | null;
  /** Something the pilot can't handle: it sounds its alarm and goes to standby (the World says so and clears it). */
  alarm: string | null;
  /** When she began drifting astern (s), or null: a stopped boat (head to wind, or stopped by a wall) is pushed back a
   * little before her sails fill again, and the pilot rides that out, swinging her bow off the wind. */
  asternT: number | null;
}

/** Sternway the pilot rides out (m/s), swinging her bow off the wind: a stopped boat's drift back as her sails refill. More is
 * real sternway, which it can't steer. And how long it waits for her to gather way ahead again before it gives up, s. */
const ASTERN_MAX = 0.6, ASTERN_WAIT = 30;
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
  return { mode: 'off', course: 0, awa: 40, awaSeen: { s: 0, c: 1 }, trim: 0, ram: 0, lastH: 0, lastTackT: -1e9, detour: null, detourT: -1e9, route: null, ri: 0, routeT: -1e9, routeTo: null, routeFrom: null, wp: null, plans: 0, navH: 0, goTack: null, lastTack: null, alarm: null, asternT: null };
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

/** How far ahead on heading h the land is (m), up to d, the whole way, exactly (geo/shore.ts landAlong: a pier or a dock
 * a metre or two wide is in the way, however far ahead it is); Infinity when there's none that near. */
const landDist = (b: Boat, h: number, d: number) => {
  const u = V(h), n = { x: u.y, y: -u.x };
  // (her track and 8 m either side: a pier lying at a shallow angle to her course is ahead of her too)
  return Math.min(...[0, -SIDE, SIDE].map(k => landAlong({ x: b.x + n.x * k, y: b.y + n.y * k }, { x: b.x + n.x * k + u.x * d, y: b.y + n.y * k + u.y * d })));
};
/** How far either side of her track the shore look-ahead looks (m): her half-beam and a berth. */
const SIDE = 8;
/** Under this much water ahead on both tacks (m), about two lengths, she's boxed in: the pilot can't tack her out. */
const BOXED = 15;

/** How far ahead along the direct line land has to be before Nav plans a way round it (m): nearer the destination's
 * own approach, or a pier on the way, not the shore across the Bay. */
const PLAN_AHEAD = 400;
/** Re-plan the way at least this often (s), and at once when the turn she's steering for goes out of sight or she's
 * been set more than OFF_ROUTE metres off the leg to it: planning from among the Wharf's docks takes a tenth of a second
 * or more, so not every few seconds. */
const REPLAN = 60, OFF_ROUTE = 40;
/** Never plan more often than this (s), whatever's asking: a plan that finds no way, or one she's just left, waits. */
const MIN_REPLAN = 5;
/** How far she is off the leg from a to b (m): her distance from the segment. */
function offLeg(q: Vec, a: Vec, b: Vec): number {
  const vx = b.x - a.x, vy = b.y - a.y, L2 = vx * vx + vy * vy || 1, t = Math.max(0, Math.min(1, ((q.x - a.x) * vx + (q.y - a.y) * vy) / L2));
  return Math.hypot(q.x - a.x - vx * t, q.y - a.y - vy * t);
}
/** Clear of land this far either side of a straight line (m)? */
function clearLine(a: Vec, b: Vec, side: number): boolean {
  const L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 1) return true;
  const ux = (b.x - a.x) / L, uy = (b.y - a.y) / L;
  return [0, -side, side].every(k => landAlong({ x: a.x - uy * k, y: a.y + ux * k }, { x: b.x - uy * k, y: b.y + ux * k }) === Infinity);
}
/**
 * The turn Nav steers for: the direct way while it's clear (20 m either side) as far as PLAN_AHEAD; otherwise the
 * passage planner's route (sim/routing.ts routeAround, which threads the Wharf's piers keeping 10 m off them), kept and
 * followed turn by turn: on to the next turn once she can see it clear (or she's at this one), worked out again
 * every REPLAN seconds, for a new destination, or when the turn she's on goes out of sight or she's set off the leg. 'clear': steer for `dest`;
 * 'none': land's in the way and there's no route round it.
 */
function followRoute(b: Vec, p: Pilot, dest: Vec, t: number): Vec | 'clear' | 'none' {
  const L = Math.hypot(dest.x - b.x, dest.y - b.y), k = Math.min(1, PLAN_AHEAD / Math.max(L, 1));
  const ahead = { x: b.x + (dest.x - b.x) * k, y: b.y + (dest.y - b.y) * k };
  // (with a route in hand, it's kept to the end: the direct line flickering clear and not at a gap's mouth would drop it
  // and plan it again every step)
  if (!p.route && clearLine(b, ahead, 20)) { p.routeTo = null; return 'clear'; }
  const moved = !p.routeTo || Math.hypot(p.routeTo.x - dest.x, p.routeTo.y - dest.y) > 1;
  // (lost: the turn's out of sight, though not because she's touched the land herself, or she's been set off the leg she's
  // on, measured from where she was when it was planned for the first leg)
  const sight = p.route ? landAlong(b, p.route[p.ri]) : Infinity;
  const lost = !!p.route && ((sight > 0 && sight < Infinity) || offLeg(b, p.ri > 1 ? p.route[p.ri - 1] : p.routeFrom ?? b, p.route[p.ri]) > OFF_ROUTE);
  if ((!p.route || moved || lost || t - p.routeT > REPLAN) && (moved || t - p.routeT >= MIN_REPLAN)) {
    const r = routeAround(b, dest, 30); p.plans++;
    p.route = r.length > 2 ? r : null; p.ri = 1; p.routeT = t; p.routeTo = { ...dest }; p.routeFrom = { x: b.x, y: b.y };
  }
  if (!p.route) return clearLine(b, ahead, 20) || landAlong(b, dest) === Infinity ? 'clear' : 'none';
  const r = p.route;
  // on to the next turn when the way to it is clear of land 12 m either side, so she never cuts the corner of a pier
  // head turning into a gap; or at the turn itself (8 m), so she can't circle it
  while (p.ri < r.length - 1 && (clearLine(b, r[p.ri + 1], 12) || Math.hypot(r[p.ri].x - b.x, r[p.ri].y - b.y) < 8)) p.ri++;
  if (p.ri >= r.length - 1) { p.route = null; return 'clear'; } // (on the last leg: straight for it)
  return r[p.ri];
}
/** What Nav steers for: the course to the waypoint allowing for the current, close-hauled on the right tack when it's upwind, round land in the way. */
function navHeading(b: Boat, p: Pilot, dest: Vec, t: number): number {
  // (the headings: her course is the polar's angle, so she steers her leeway higher than it, physics.ts b.leeway)
  const from = b.ww.from, beat = beatFor(b) + 1, lw = b.leeway ?? 0, csS = n360(from - beat + lw), csP = n360(from + beat - lw), c = b.cur;
  const close = (tk: 'S' | 'P') => tk === 'S' ? csS : csP;
  // a tack it has decided on: steer for the new tack's close-hauled course until she's round
  if (p.goTack) { if (b.tack === p.goTack && !b.tacking) p.goTack = null; else return close(p.goTack); }
  // the way by water, as the navigator plans it: with land in the direct way (a curved pier, a breakwater, a basin's
  // entrance), steer for the route's next turn, upwind or down, not just the nearest clear heading: a heading search
  // runs her down onto the outside of Aquatic Park's Municipal Pier and holds her there (the owner: "auto nav failed
  // to navigate around the seawall"). The route is kept and followed turn by turn (followRoute).
  const way = followRoute(b, p, dest, t); p.wp = way === 'clear' || way === 'none' ? null : way;
  let P = p.wp ?? dest;
  const bP0 = brg(P.x - b.x, P.y - b.y);
  // (the old heading search only where land's in the way and the planner found no way round: where the planner says the
  // way's clear, it is, and the search's wider berth would turn her off it, into the wind at a basin's entrance)
  if (way === 'none' && Math.abs(wrap(from - bP0)) > 50) { // reaching or running with no route: round any land in the way
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
    const look = 40 + b.v * 15, dCur = landDist(b, cur, look), dOther = landDist(b, close(other), look), shore = dCur < look;
    // land ahead on both tacks: in a basin or a narrow channel, short tacks, onto the one with more room; only boxed in
    // (under BOXED m of water either way) is beyond it
    if (shore && dOther < look) {
      if (Math.max(dCur, dOther) < BOXED) { p.alarm = 'Pilot alarm: land ahead on both tacks. Pilot on standby: you have the tiller.'; return cur; }
      if (dOther > dCur) { p.lastTackT = t; p.goTack = other; return close(other); }
      return cur;
    }
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
  // going astern. A pilot can't steer backwards for long (its sense of the helm is the wrong way round with sternway),
  // but a boat stopped head to wind, or by a wall she's touched, is pushed back a little before her sails fill again: the
  // pilot puts the helm over to swing her bow off toward her course, then steers again once she's moving ahead. Only real sternway, or
  // drifting back for more than ASTERN_WAIT seconds, is beyond it (the owner: "hit the wall and just kinda sat there",
  // the pilot having let go with the tiller hard over).
  const ast = b.astern ?? 0;
  if (ast > 0.1) {
    p.asternT ??= t;
    // (under her motor going astern, it's yours at once, as it always was: only a drift back with no thrust astern, the
    // wind on a stopped boat, is the navigator's to ride out; and before it lets go, the tiller's back amidships)
    const motorAstern = !!b.motor && thrust(b.motor, -ast) < -40;
    if (motorAstern || ast > ASTERN_MAX || t - p.asternT > ASTERN_WAIT) {
      p.alarm = 'Pilot alarm: she\'s going astern, and a pilot can\'t steer backwards. Pilot on standby: you have the tiller.';
      p.ram = 0; b.tiller = 0; return;
    }
    // with sternway the rudder works backwards (the bow goes the way the tiller's pushed: physics.ts): the helm over to
    // swing her bow away from the wind, as a sailor gets out of irons, so her sails fill; once she's moving ahead it
    // steers for its course again, tacking with way on if that's through the wind
    const off = -Math.sign(wrap(b.ww.from - b.h)) || 1, target = off; // (+1: pushed to starboard, which astern turns her bow to starboard)
    p.ram += clamp(target - p.ram, -RAM_RATE * dt, RAM_RATE * dt); b.tiller = p.ram; b.steer = 0; b.turnTarget = null;
    return;
  }
  if (b.v > 0.3) p.asternT = null;
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
  const mr = Math.max(1, maxTurnRate(b.v));
  // the turn it asks for, and the helm that should give it, plus what AutoTrim has learned she needs to go straight
  const ask = clamp(err * GAIN, -mr, mr), helm = clamp(ask / mr + p.trim, -1, 1);
  // AutoTrim: slowly learn the standing helm from the turn it gets against the turn it asked for (not while turning hard)
  if (Math.abs(err) < 15) p.trim = clamp(p.trim + (ask - rate) / mr * dt * 0.15, -0.6, 0.6);
  const target = -helm; // + helm (turn to starboard) is the tiller pushed to port
  p.ram += clamp(target - p.ram, -RAM_RATE * dt, RAM_RATE * dt);
  b.tiller = p.ram; b.steer = 0; b.turnTarget = null;
}
