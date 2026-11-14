import type { Boat } from './boat';
import { maxTurnRate } from './dynamics';
import { thrust } from './motor';
import { beatFor, targetFor } from './seaway';
import { D2R, V, brg, clamp, cross, dot, n360, sub, unit, wrap, type Vec } from '../core/math';
import { landAlong, wharfNearest } from '../geo/shore';
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
  route: Vec[] | null; ri: number; routeT: number; routeTo: Vec | null; routeFrom: Vec | null; wp: Vec | null; straight: boolean;
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
  return { mode: 'off', course: 0, awa: 40, awaSeen: { s: 0, c: 1 }, trim: 0, ram: 0, lastH: 0, lastTackT: -1e9, detour: null, detourT: -1e9, route: null, ri: 0, routeT: -1e9, routeTo: null, routeFrom: null, wp: null, straight: false, plans: 0, navH: 0, goTack: null, lastTack: null, alarm: null, asternT: null };
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
const landDist = (b: Boat, h: number, d: number, side = SIDE) => {
  const u = V(h), n = { x: u.y, y: -u.x };
  // (her track and SIDE either side: a pier lying at a shallow angle to her course is ahead of her too)
  return Math.min(...[0, -side, side].map(k => landAlong({ x: b.x + n.x * k, y: b.y + n.y * k }, { x: b.x + n.x * k + u.x * d, y: b.y + n.y * k + u.y * d })));
};
/** How far either side of her track the shore look-ahead looks (m): the 10 m berth the route keeps, and her half-beam. */
const SIDE = 12;
/** Under this much water ahead on both tacks (m), about two lengths, she's boxed in: the pilot can't tack her out. */
const BOXED = 15;
/** On a beat, tack away from a pier or breakwater that comes this close (m): the route's 10 m berth. */
const BERTH = 10;

/** How far ahead along the direct line land has to be before Nav plans a way round it (m): nearer the destination's
 * own approach, or a pier on the way, not the shore across the Bay. */
const PLAN_AHEAD = 400;
/** Re-plan the way only when it's needed: a new destination, the turn she's steering for out of sight or not clear of
 * the piers by a few metres, or she's been set more than OFF_ROUTE metres off the leg to it. Planning from among the
 * Wharf's docks takes a tenth of a second or more, so not on a timer. A plan that found no way is tried again once
 * she's sailed RETRY_M metres or RETRY_T seconds on. */
const OFF_ROUTE = 40, RETRY_M = 30, RETRY_T = 60;
/** The way to the turn must keep this clear of a pier either side (m), or it's planned again from where she is: the
 * route keeps 10 m off, and a sag to leeward that leaves her steering a chord past a pier head has lost it. */
const LEG_CLEAR = 5;
/** Tack for more room in a channel only onto a tack with this much water ahead (m): a tack that only swaps a short
 * board for another leaves her in irons by the wall. */
const ROOM = 25;
/** The way she needs to tack (m/s), relative to what she can make in this wind: TACK_V_FRAC of her close-hauled speed
 * (a tack from much below it, the sim's tack costing her about 1 m/s in 17-22 kt, the physics review, comes out in
 * irons); not above TACK_V, which in a breeze is way enough; and not below TACK_V_MIN, steerage way through a tack (a
 * Folkboat tacks from 2-3 kt, about 1-1.5 m/s), unless that's more than most of her close-hauled speed in a very light
 * air (TACK_V_LIGHT of it). Short of it, she foots off FOOT degrees to build speed first, unless the land dead ahead is
 * closer than FOOT_ROOM m plus FOOT_S seconds of her way (two boat lengths, and the time a tack takes). */
const TACK_V = 1.6, TACK_V_MIN = 1.0, TACK_V_FRAC = 0.6, TACK_V_LIGHT = 0.85, FOOT_ROOM = 15, FOOT_S = 8, FOOT = 10;
const tackWay = (target: number) => Math.min(TACK_V, Math.max(Math.min(TACK_V_MIN, TACK_V_LIGHT * target), TACK_V_FRAC * target));
/** Pinned: under PINNED_V m/s with land within PINNED_M m of her centre (her half-length and a little), any way round. */
const PINNED_V = 0.5, PINNED_M = 6;
/** Never plan more often than this (s), whatever's asking: a plan that finds no way, or one she's just left, waits. */
const MIN_REPLAN = 5;
/** On to the next turn early only with this much clear water either side of the way to it (m): the route's 10 m berth
 * and a few metres for her leeway, which on a close reach sets her a few metres to leeward of the line she steers. */
const ADVANCE_CLEAR = 15;
/** Down a marina's fairway: a dock or pier within FAIRWAY m on both sides of her (20-30 m between a marina's docks; Aquatic
 * Park's 57 m entrance and the open water aren't), across any axis. */
const FAIRWAY = 15;
function inFairway(b: Vec): boolean {
  // (whichever way she's heading, or turning: across any of four axes)
  const hit = (a: number) => { const n = V(a); return landAlong(b, { x: b.x + n.x * FAIRWAY, y: b.y + n.y * FAIRWAY }) < Infinity; };
  return [0, 45, 90, 135].some(a => hit(a) && hit(a + 180));
}
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
 * for a new destination, or when the turn she's on goes out of sight or she's set off the leg. 'clear': steer for `dest`;
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
  const lost = !!p.route && ((sight > 0 && sight < Infinity) || offLeg(b, p.ri > 1 ? p.route[p.ri - 1] : p.routeFrom ?? b, p.route[p.ri]) > OFF_ROUTE
    || (sight === Infinity && !inFairway(b) && !clearLine(b, p.route[p.ri], LEG_CLEAR)
      // (only when the leg as planned was clear by that much: near its ends, by a slip or a gap, the planner's own legs
      // come closer, and planning again would only draw the same one, every few seconds)
      && clearLine(p.ri > 1 ? p.route[p.ri - 1] : p.routeFrom ?? b, p.route[p.ri], LEG_CLEAR)));
  // (no route in hand: plan, unless the last plan, from near here and not long ago, found none)
  // (a plan that said "straight there" is an answer, not a failure: asked again only on the timer, not every RETRY_M)
  const retry = !p.route && (!p.routeFrom || (!p.straight && Math.hypot(b.x - p.routeFrom.x, b.y - p.routeFrom.y) > RETRY_M) || t - p.routeT > RETRY_T);
  if ((moved || lost || retry) && (moved || t - p.routeT >= MIN_REPLAN)) {
    const r = routeAround(b, dest, 30); p.plans++;
    p.route = r.length > 2 ? r : null; p.straight = r.length === 2; p.ri = 1; p.routeT = t; p.routeTo = { ...dest }; p.routeFrom = { x: b.x, y: b.y };
  }
  if (!p.route) return clearLine(b, ahead, 20) || landAlong(b, dest) === Infinity ? 'clear' : 'none';
  const r = p.route;
  // on to the next turn when the way to it is clear of land ADVANCE_CLEAR either side, so she never cuts the corner of a
  // pier head or a breakwater's end; or at the turn itself (8 m), so she can't circle it
  // (down a marina's fairway, 20-30 m wide, 15 m either side never fits: there, the fairway's half-width)
  const adv = inFairway(b) ? 6 : ADVANCE_CLEAR;
  while (p.ri < r.length - 1 && (clearLine(b, r[p.ri + 1], adv) || Math.hypot(r[p.ri].x - b.x, r[p.ri].y - b.y) < 8)) p.ri++;
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
  const onS = b.tack === 'S', other = onS ? 'P' : 'S', cur = close(b.tack);
  const canTack = b.v > tackWay(targetFor(b, beat)) && t - p.lastTackT > 12 && !b.tacking, footRoom = FOOT_ROOM + FOOT_S * b.v;
  if (cts != null && Math.abs(wrap(from - cts)) >= beat + 2) {
    const r = wrap(from - cts);
    // (a course on the other tack that turns her through the wind is a tack, and waits for the way and the time to make
    // one, close-hauled on this tack till then; a jibe is the rudder's business, not a tack's)
    // (through the wind only if the short way round crosses it: from 100° off on one side to 100° off on the other, the
    // rudder takes her round by the stern, a jibe)
    const rNow = wrap(from - b.h), through = (r > 0) !== (rNow > 0) && Math.abs(r) + Math.abs(rNow) < 180;
    if (!through) return Math.abs(r) < 150 ? n360(cts + Math.sign(r) * lw) : cts;
    // (once begun, she goes through with it: the new tack's close-hauled course till she's round, as for any tack)
    if (canTack) { p.lastTackT = t; p.goTack = other; return close(other); }
    // (short of the way, with land close ahead on this tack, or stopped against the land, aground or on a pier, where
    // holding a course builds no way at all: turn for the course now, as she's worked off)
    const pinned = b.v < PINNED_V && [0, 45, 90, 135, 180, 225, 270, 315].some(a => { const n = V(a); return landAlong(b, { x: b.x + n.x * PINNED_M, y: b.y + n.y * PINNED_M }) < Infinity; });
    if (pinned || landDist(b, cur, footRoom, 0) < footRoom) return n360(cts + Math.sign(r) * lw);
    return cur;
  }
  // upwind: close-hauled; tack when the other tack fetches (made good through the current), or when the shore's close ahead
  // (bearing off FOOT degrees on this tack builds the way to tack)
  const foot = n360(cur + (onS ? -FOOT : FOOT));
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
      // (boxed in by what's dead ahead on each tack, not the look-ahead's berth either side, which in a 57 m gap sees
      // the piers on both)
      if (Math.max(landDist(b, cur, look, 0), landDist(b, close(other), look, 0)) < BOXED) { p.alarm = 'Pilot alarm: land ahead on both tacks. Pilot on standby: you have the tiller.'; return cur; }
      if (dOther > dCur && dOther > ROOM && canTack) { p.lastTackT = t; p.goTack = other; return close(other); }
      return cur;
    }
    // a pier or a breakwater come within a berth of her, to leeward as she sags down on it or abeam: tack away from it,
    // as a sailor does, not just for land dead ahead
    // (not down a marina's fairway, where a dock is always that close: there the route's line is the guide)
    const wn = inFairway(b) ? null : wharfNearest(b, BERTH);
    const away = !!wn && wn.d > 0 && dot(V(close(other)), wn.n) > dot(V(cur), wn.n) + 0.2;
    if ((fetch(other) && !fetch(b.tack)) || shore || away) {
      if (canTack || landDist(b, cur, look, 0) < footRoom) { p.lastTackT = t; p.goTack = other; return close(other); }
      if (shore || away) return foot; // (no way to tack yet: foot off and build it, with the land not yet close ahead)
    }
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
    const motorAstern = !!b.motor && thrust(b.motor, -ast) < 0;
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
