import type { PrepFlag } from '../sim/signals';
import { bow, type Boat } from '../boat/boat';
import type { CourseMark } from '../courses/course';
import { coastDistance, maxTurnRate, timeToCover } from '../boat/dynamics';
import { driveRatio } from '../boat/driveCurve';
import { beatFor, targetFor } from '../boat/seaway';
import { runAngle } from '../boat/polar';
import { SLOW_TACK } from '../boat/physics';
import { LOA, V, brg, clamp, cross, dist, dot, markDist, markReach, n360, segCross, sub, unit, wrap, type Vec } from '../core/math';
import { landAlong, onLand } from '../geo/shore';
import { HAIL_RESPONSE, cpa } from '../rules';
import { hailRange, obstructionAhead } from '../sim/obstruction';
import { routeAround } from '../sim/routing';
import type { World } from '../sim/world';

/**
 * Her hail "Room to tack" at a boat obstruction (WS Case 11): the boat she hailed, the boat that is the obstruction, and
 * when. While it's being answered she holds close-hauled rather than ducking, so she can tack straight away once the
 * hailed boat responds (Rule 20.2(d)); a duck first leaves her too far off the wind to tack in time.
 */
const boatHails = new WeakMap<Boat, { o: number; c: number; at: number }>();
/**
 * How long (s) she keeps her course for a hail at a boat obstruction, and how soon (s) before she'd meet the boat she
 * must keep clear of she gives up waiting and ducks it (rule 10 comes first: no hail excuses her from it). Five seconds
 * gives a Folkboat at 2–2.5 m/s time to bear away 30° and pass astern without the other boat having to act.
 */
const BOAT_HAIL_HOLD = HAIL_RESPONSE + 4, BOAT_HAIL_MARGIN = 5;
/** She hails at a boat only if they'd meet no sooner than this (s): time for the response and her tack. */
const BOAT_HAIL_LEAD = 9;

/** Extra seconds of caution at the start under each preparatory flag. */

const FLAG_CAUTION: Record<PrepFlag, number> = { P: 0, I: 1, Z: 2, U: 3, black: 3.5 };

/** A boat owing a penalty first gets this far (m) from other boats before turning. */
const PENALTY_CLEAR = 25;
/** ...and this far from marks. */
const MARK_CLEAR = 20;
/** Pass marks with at least this much room between the mark and her centreline, m (Rule 31). */
const MARK_ROOM = 5;

/** Half a Folkboat's beam, m (2.20 m: NFIA class rules, principal dimensions). */
const HALF_BEAM = 1.1;
/** Nudge a heading so she passes a mark she could touch with room to spare, on the side it's already on. */
function avoidMarks(w: World, b: Boat, desired: number): number {
  let near: string | null = null;
  for (const m of w.touchableMarks(b)) {
    // (the nearest point of it: a buoy is a point, the committee boat a hull 12 m long, `p` to `q`)
    let np = m.p;
    if (m.q) { const ax = m.q.x - m.p.x, ay = m.q.y - m.p.y, k = clamp(((b.x - m.p.x) * ax + (b.y - m.p.y) * ay) / (ax * ax + ay * ay || 1), 0, 1); np = { x: m.p.x + ax * k, y: m.p.y + ay * k }; }
    const d = dist(b, np);
    if (d > 30 || d < 0.5) continue;
    const rel = wrap(brg(np.x - b.x, np.y - b.y) - desired); // + = mark to starboard of the course
    // (room between her side and the mark's: MARK_ROOM, plus the mark's own radius and her half beam)
    const need = Math.asin(Math.min(1, (MARK_ROOM + m.r + HALF_BEAM) / d)) / (Math.PI / 180);
    if (Math.abs(rel) < need && Math.abs(rel) < 90) {
      // pass it on the side it's already on; if that means heading up past close-hauled (sailable would undo it, and she'd
      // sail on into it), pass it on the other side, bearing away. Once she's chosen a side she holds to it until she's
      // clear (her course swinging as she turns would swap them back and forth, and she'd hold on into it)
      const keep = n360(desired + (rel > 0 ? -(need - rel) : need + rel)), other = n360(desired + (rel > 0 ? need + rel : -(need - rel)));
      const key = `${m.p.x.toFixed(0)},${m.p.y.toFixed(0)}`, prev = b.ai?.passing?.key === key ? b.ai.passing.side : 0;
      const useKeep = prev ? Math.sign(rel || 1) === prev : Math.abs(wrap(sailable(b, keep) - keep)) < 1;
      desired = useKeep ? keep : other;
      near = key; if (b.ai && !prev) b.ai.passing = { key, side: useKeep ? Math.sign(rel || 1) : -Math.sign(rel || 1) };
    }
  }
  if (b.ai?.passing && b.ai.passing.key !== near && !w.touchableMarks(b).some(m => `${m.p.x.toFixed(0)},${m.p.y.toFixed(0)}` === b.ai!.passing!.key && dist(b, m.p) < 30)) b.ai.passing = null;
  return desired;
}

/**
 * The closest she'd come (m) in the next 12 s to any boat within 40 m (or to `only`) if she steered heading h at her
 * speed and they held their courses.
 */
function clearanceOn(w: World, b: Boat, h: number, only?: Boat): number {
  const u = V(h), v = Math.max(b.v, 1.2), hu = V(b.h);
  const me = { x: b.x, y: b.y, vx: b.vx - hu.x * b.v + u.x * v, vy: b.vy - hu.y * b.v + u.y * v }; // (keeping her drift with the current)
  let m = Infinity;
  for (const o of only ? [only] : w.boats) {
    if (o === b || (!only && dist(o, b) > 40)) continue;
    m = Math.min(m, cpa(me, o).d);
  }
  return m;
}
/** Of the sailable headings near `want`, the one that keeps her furthest from other boats (the nearest to `want` among near-equals). */
function clearestHeading(w: World, b: Boat, want: number): number {
  let best = want, bestS = -Infinity;
  for (const k of [0, 20, -20, 40, -40, 60, -60, 90, -90]) {
    const h = sailable(b, want + k), sc = Math.min(15, clearanceOn(w, b, h)) - Math.abs(k) * 0.02;
    if (sc > bestS) { bestS = sc; best = h; }
  }
  return best;
}

/** The heading (deg) that makes good the bearing `brgT` over the ground at `v` m/s through the water, in current `cur`
 * (m/s): up-current by as much as the current across the track sets her down. Too strong to stem: as far up-current
 * as makes sense (64°), losing the least ground. */
export function crabFor(brgT: number, v: number, cur: Vec): number {
  const n = V(brgT + 90), k = clamp((cur.x * n.x + cur.y * n.y) / Math.max(v, 0.5), -0.9, 0.9);
  return n360(brgT - Math.asin(k) / (Math.PI / 180));
}

/** Close-hauled course on the current tack, or the requested heading if it is sailable. */
export function sailable(b: Boat, desired: number): number {
  const from = b.ww.from, rel = wrap(from - desired), ch = beatFor(b) + 1;
  if (Math.abs(rel) >= ch) return n360(desired);
  if (b.tack === 'S' && rel < -25) return n360(from + ch);
  if (b.tack === 'P' && rel > 25) return n360(from - ch);
  return b.tack === 'S' ? n360(from - ch) : n360(from + ch);
}

/** Land (or, mid-race, the start/finish line) within d m on heading h? The whole way, exactly: a pier or a breakwater
 * a few metres wide is in the way even if the water beyond it is clear. */
function blocked(w: World, b: Boat, h: number, d: number): boolean {
  const u = V(h), q = { x: b.x + u.x * d, y: b.y + u.y * d };
  if (landAlong(b, q) <= d) return true;
  if (w.obstructed(b) && segCross(b, q, w.pin, w.committee)) return true;
  return false;
}

/** Close-hauled with a boat to windward she'd hit tacking, and the obstruction soon ahead: a Rule 20 hail, not a detour. */
function pinnedAt(w: World, b: Boat): boolean {
  return b.twa <= beatFor(b) + 8 && !b.tacking && !!w.tackBlocker(b) && obstructionAhead(b, b.h, b.tack, hailRange(b.v)) !== null;
}
/** The first turn on the way by water from b to P (sim/routing.ts routeAround), or a clear heading toward it. */
function escape(b: Vec, P: Vec): Vec | null {
  const r = routeAround(b, P, 30);
  return r.length > 2 ? r[1] : detour(b, P);
}
/** Where the AI steers for its next mark: a little wide of rounding marks, well clear of pass marks. */
export function aimPoint(w: World, b: Boat): Vec {
  const m = w.nextMark(b);
  if (!m) {
    const f = b.ai ? b.ai.f : 0.5;
    return { x: w.center.x + w.L.x * (f - 0.5) * w.lineLen * 0.6, y: w.center.y + w.L.y * (f - 0.5) * w.lineLen * 0.6 };
  }
  const M = m.p;
  if (m.type === 'pass') return { x: M.x + m.sv.x * 24, y: M.y + m.sv.y * 24 };
  // an island: aim off its shore, with a good berth for the rocks
  const off = (u: Vec, k: number) => { const r = m.reach ? markReach(m, { x: M.x + u.x, y: M.y + u.y }) + islandBerth(u, w.wind.from) : k; return { x: M.x + u.x * r, y: M.y + u.y * r }; };
  const d = markDist(b, m);
  let P: Vec;
  if (d > 35) {
    const e = dist(b, M), dx = (M.x - b.x) / e, dy = (M.y - b.y) / e;
    P = off(m.side === 's' ? { x: -dy, y: dx } : { x: dy, y: -dx }, 10);
  } else P = off(m.r, 12);
  return m.reach ? aroundIsland(m, b, P, w.wind.from) : P;
}

const ISLAND_BERTH = 70;
/**
 * How far off an island's shore to pass (m), in direction u from it: a good berth for the rocks all round, and
 * more on its downwind side, out of the worst of its wind shadow (the near-calm reaches about four island heights
 * downwind; Alcatraz is ~40 m high).
 */
const islandBerth = (u: Vec, windFrom: number): number => ISLAND_BERTH + 230 * Math.max(0, dot(u, V(windFrom + 180)));
/**
 * If land lies within the next 700 m toward P, the nearest heading either side of it with clear water (the side
 * that comes back toward P sooner wins a tie); null when the way is clear. Upwind, the beat logic tacks along it.
 */
export function detour(b: Vec, P: Vec): Vec | null {
  const D = dist(b, P), L = Math.min(D, 700), bP = brg(P.x - b.x, P.y - b.y);
  const ray = (h: number, l: number) => { const u = V(h); return { x: b.x + u.x * l, y: b.y + u.y * l }; };
  if (clearRun(b, ray(bP, L))) return null;
  for (let dev = 10; dev <= 150; dev += 10) {
    const c = [1, -1].map(s => ray(bP + s * dev, Math.min(L, 500))).filter(q => clearRun(b, q));
    if (c.length) return c.sort((a, z) => dist(a, P) - dist(z, P))[0];
  }
  return null;
}
/** Clear water all the way from a to b, with some room either side (her track, and 25 m to each side of it, exactly,
 * so no pier slips between samples)? With `lee` (the wind direction), out of any island's wind shadow too. */
function clearRun(a: Vec, b: Vec, lee?: number): boolean {
  const L = dist(a, b), ux = (b.x - a.x) / (L || 1), uy = (b.y - a.y) / (L || 1);
  for (const k of [0, -25, 25]) {
    const o = { x: -uy * k, y: ux * k };
    if (landAlong({ x: a.x + o.x, y: a.y + o.y }, { x: b.x + o.x, y: b.y + o.y }) < Infinity) return false;
  }
  if (lee != null) for (let s = 60; s <= L; s += 30) if (inIslandLee({ x: a.x + ux * s, y: a.y + uy * s }, lee)) return false;
  return true;
}
/** In an island's near-calm: land within ~220 m straight upwind (about five Alcatraz heights; shadows.ts has the full model). */
function inIslandLee(q: Vec, from: number): boolean {
  const u = V(from);
  for (let d = 40; d <= 220; d += 45) if (onLand({ x: q.x + u.x * d, y: q.y + u.y * d })) return true;
  return false;
}
/**
 * Round an island the way a sailor would: if the island is in the way of where she's heading, work round its shore
 * in the rounding direction (clockwise leaving it to starboard), steering for the furthest point off its shore she
 * can see with clear water between.
 */
function aroundIsland(m: CourseMark, b: Vec, P: Vec, windFrom: number): Vec {
  if (clearRun(b, P, windFrom)) return P;
  const M = m.p, dir = m.side === 's' ? 1 : -1, b0 = brg(b.x - M.x, b.y - M.y), bP = brg(P.x - M.x, P.y - M.y);
  const span = ((dir * (bP - b0)) % 360 + 360) % 360; // how far round to the aim point
  let best: Vec | null = null;
  for (let a = 10; a <= Math.max(10, span); a += 10) {
    const u = V(b0 + dir * a), r = markReach(m, { x: M.x + u.x, y: M.y + u.y }) + islandBerth(u, windFrom), q = { x: M.x + u.x * r, y: M.y + u.y * r };
    if (clearRun(b, q, windFrom)) best = q; else if (best) break;
  }
  if (best) return best;
  // nothing in sight round the island: stand off it first
  const u = V(b0), r = markReach(m, b) + islandBerth(u, windFrom) * 1.5;
  return { x: M.x + u.x * r, y: M.y + u.y * r };
}

/**
 * The fastest way to the start line from here: of close-hauled, a reach or a run on either tack (a start to
 * leeward, like the Seaweed Soup courses starting east in a westerly, comes in on a run), the heading that gets to the line soonest, crossing it between its ends, counting a tack as lost time.
 * Returns the heading and its component toward the line.
 */
export function bestApproach(w: World, b: Boat): { h: number; along: number } {
  const ww = b.ww, N = w.N, beat = beatFor(b), d = w.lineD(bow(b)), a = w.lineA(b), half = w.lineLen / 2 - 8;
  let best = { h: b.h, along: 0 }, bestT = Infinity;
  for (const tack of ['S', 'P'] as const) for (const twa of [beat + 1, 55, 70, 95, 120, 145, 165]) {
    const h = n360(tack === 'S' ? ww.from - twa : ww.from + twa), u = V(h), uN = u.x * N.x + u.y * N.y;
    if (uN < 0.2) continue;
    const vmg = targetFor(b, twa) * uN + (b.cur.x * N.x + b.cur.y * N.y);
    if (vmg <= 0.1) continue;
    const cross = a + (u.x * w.L.x + u.y * w.L.y) / uN * Math.max(0, -d); // where along the line we'd cross
    let t = Math.max(0, -d) / vmg + (tack !== b.tack ? 8 : 0);
    // coming in on a run or broad reach, take the starboard gybe if it's anywhere near as quick: she has right of
    // way over port-gybe boats converging on the line (Rule 10), and nobody can come in under her and shut her out
    if (tack === 'P' && twa > 100) t += 4;
    if (Math.abs(cross) > half) t += 30 + (Math.abs(cross) - half) / 2; // would miss the line: strongly discouraged
    if (t < bestT) { bestT = t; best = { h, along: uN }; }
  }
  return best;
}

/** One decision step for an AI boat: sets b.desired and b.luff. */
export function aiThink(w: World, b: Boat, dt: number): void {
  const ai = b.ai!, ww = b.ww, L = w.L, N = w.N, c = b.cur;
  const beat = beatFor(b), csS = n360(ww.from - beat), csP = n360(ww.from + beat);
  let desired = b.h, luff = false, beating = false;
  if (b.penalty > 0) {
    ai.goTack = null; ai.headedT = 0;
    // Take the penalty in clear water: first sail away from nearby boats, then spin.
    let near: Vec | null = null, nd = PENALTY_CLEAR;
    for (const o of w.boats) if (o !== b) { const d = dist(o, b); if (d < nd) { nd = d; near = o; } }
    for (const m of w.touchableMarks(b)) { const d = dist(m.p, b); if (d < MARK_CLEAR && d < nd + 10) { nd = d; near = m.p; } } // and away from the marks
    ai.clearing = !!near && b.penalty >= b.penaltyTotal - 1; // not started turning yet
    b.desired = near && ai.clearing ? sailable(b, brg(b.x - near.x, b.y - near.y)) : b.h + 60;
    b.luff = false; return;
  }
  ai.clearing = false;
  if (b.finished || w.cancelled) { b.desired = n360(ww.from + 90); b.luff = true; return; } // (racing called off for the wind: she stops racing too)
  const tl = -w.t; // time to the start signal
  const refresh = (w.steps + b.id) % 6 === 0; // heavy predictions 10× a second
  // her compass: about a minute's mean of the wind where she is, against which a shift is a lift or a header (she can only
  // see the wind she's in, not the course-wide wind); kept from the pre-start on, as crews take readings to learn it
  ai.avgFrom = ai.avgFrom == null ? ww.from : n360(ai.avgFrom + wrap(ww.from - ai.avgFrom) * Math.min(1, dt / 60));
  if (w.t < 0) {
    if (ai.mode === 'hold') {
      // reach back and forth below the line, each boat below her own part of it
      const off = (ai.f - 0.5) * w.lineLen * 0.7;
      const H = { x: w.center.x - N.x * ai.depth + L.x * off, y: w.center.y - N.y * ai.depth + L.y * off }, s = ai.wp ? 1 : -1;
      const reach = Math.min(40, w.lineLen * 0.25);
      const wp = { x: H.x + L.x * reach * s, y: H.y + L.y * reach * s };
      // turn for the other end of her beat when she gets there, but not across another boat's bows: after a tack she
      // must keep clear until close-hauled (Rule 13), and a gybe onto starboard close to a port boat gives her no
      // time to keep clear (Rule 15). So while the turn would put her on a collision course she carries on along
      // the line (up to 30 m past her mark) until there's room.
      const past = ((b.x - H.x) * L.x + (b.y - H.y) * L.y) * s;
      let carryOn = false;
      if (dist(b, wp) < 12 || past > reach - 12) {
        const next = { x: H.x - L.x * reach * s, y: H.y - L.y * reach * s }, hNext = sailable(b, brg(next.x - b.x, next.y - b.y));
        const crowded = Math.abs(wrap(hNext - b.h)) > 30 && clearanceOn(w, b, hNext) < 10;
        if (!crowded || past > reach + 30) ai.wp = ai.wp ? 0 : 1; else carryOn = true;
      }
      desired = carryOn ? sailable(b, brg(L.x * s, L.y * s)) : sailable(b, brg(wp.x - b.x, wp.y - b.y));
      // dawdle, but keep enough way on to steer (about 2 kt)
      // (but not when the current has set her down below her spot: then she works back up to it)
      luff = tl > 35 && Math.sin(w.t * 0.25 + b.id * 2) > 0.3 && b.v > 1.0 && w.lineD(b) > -ai.depth - 20;
      // Time to get to the line from here: turn onto the approach (slowly, if we're slow), then sail
      // there accelerating, with the current. Leave when that plus a margin is all the time left.
      if (refresh || Number.isNaN(ai.plan.leave)) { // NaN: not worked out yet
        const app = bestApproach(w, b), d = w.lineD(bow(b));
        const turn = Math.abs(wrap(app.h - b.h)) / Math.max(4, maxTurnRate(Math.max(b.v, 1.2)) * 0.7);
        { const ta = Math.abs(wrap(ww.from - app.h)), vt = targetFor(b, ta); ai.plan.leave = turn + timeToCover(-d, b.v, vt, app.along, c.x * N.x + c.y * N.y, 240, v => driveRatio(ww.kt, ta, v, vt)); }
      }
      if (tl < ai.plan.leave + 8 + ai.aggr) ai.mode = 'approach';
    }
    if (ai.mode === 'approach') {
      const app = bestApproach(w, b), goH = app.h;
      const d = w.lineD(bow(b)), twaD = Math.abs(wrap(ww.from - goH));
      if (refresh) {
        // Time to the line if we go now: turn onto the approach, then accelerate there, with the current. She keeps
        // moving through the turn, on headings between this one and the approach, so count that ground too.
        const turn = Math.abs(wrap(goH - b.h)) / Math.max(4, maxTurnRate(Math.max(b.v, 1)) * 0.7), cN = c.x * N.x + c.y * N.y;
        const inTurn = turn * (b.v * (V(b.h).x * N.x + V(b.h).y * N.y + app.along) / 2 + cN);
        { const vt = targetFor(b, twaD); ai.plan.tReach = turn + timeToCover(-d - inTurn, b.v, vt, app.along, cN, 240, v => driveRatio(ww.kt, twaD, v, vt)); }
        // how far toward the line we'd coast if we eased the sails now
        ai.plan.coast = coastDistance(b.v, tl, ww.kt, b.twa, targetFor(b, b.twa)) * (V(b.h).x * N.x + V(b.h).y * N.y);
      }
      desired = goH;
      // in another boat's dirty air on the way in: bear away a little, out of her wake to leeward, and build speed
      if ((b.shadowK ?? 1) / (b.leeK ?? 1) < 0.94) desired = sailable(b, goH + (b.tack === 'S' ? -12 : 12));
      // aim to hit the line 1–3 s after the gun at full speed (the bolder the boat, the closer)
      // (later still under the I, Z, U and black flags: being over in the last minute costs more)
      if (ai.plan.tReach < tl + 3 - ai.aggr * 0.33 + FLAG_CAUTION[w.prepFlag]) {
        // Early: burn time. Where would we be at the gun if we eased the sails now? Coasting plus drift
        // with the current (current-aware boats allow for all of it; the others underestimate it).
        const drift = (c.x * N.x + c.y * N.y) * tl * (ai.aware ? 1 : 0.6), atGun = d + drift + Math.max(0, ai.plan.coast); // coasting away from the line is no safety margin
        // with hysteresis, so she commits to a plan instead of dithering between two
        if (atGun > -3 && drift > 2) ai.plan.back = true;
        else if (atGun < -12 || drift <= 2) ai.plan.back = false;
        if (ai.plan.back) desired = sailable(b, brg(-N.x, -N.y)); // being set onto the line: sail away with way on, come back later
        else if (twaD > 100) {
          // Coming in on a run, easing the sails barely slows her: they fill against the shrouds. So she does what
          // sailors do at a start to leeward: heads up onto a reach along the line, eases there until the sails
          // flog, and bears away for the line when it's time (the plan above counts the turn back down).
          luff = true;
          const half = w.lineLen / 2, a = w.lineA(b), sgn = Math.abs(a) > half * 0.7 ? -Math.sign(a) : dot(V(b.h), L) >= 0 ? 1 : -1; // along the line, back toward its middle near the ends
          desired = d + ai.plan.coast > -6 ? sailable(b, brg(-N.x, -N.y)) : sailable(b, brg(L.x * sgn - N.x * 0.15, L.y * sgn - N.y * 0.15));
        } else { luff = true; if (d + ai.plan.coast > 0) desired = sailable(b, brg(-N.x, -N.y)); }
      } else ai.plan.back = false;
    }
  } else {
    if (ai.mode === 'hold' || ai.mode === 'approach') ai.mode = 'race';
    let P: Vec;
    const along = (clamp(ai.f, 0.15, 0.85) - 0.5) * w.lineLen;
    if (b.ocs && b.roundEnd) {
      // I flag: back round the nearer end of the line, then up again
      const s = w.lineA(b) >= 0 ? 1 : -1, half = w.lineLen / 2, out = Math.abs(w.lineA(b)) > half + 8;
      P = { x: w.center.x + L.x * s * (half + 20) + N.x * (out ? -20 : 8), y: w.center.y + L.y * s * (half + 20) + N.y * (out ? -20 : 8) };
    } else if (b.ocs) P = { x: w.center.x - N.x * 18 + L.x * along, y: w.center.y - N.y * 18 + L.y * along };
    else if (!b.started) {
      // haven't started yet: cross the line between its ends, straight ahead (not back to the spot she'd planned on). On
      // the course side already (she crossed an extension of the line, or drifted over doing her turns at the gun), she
      // isn't started: back below the line first, then up across it between the ends (RRS Definitions, Start)
      const half = w.lineLen / 2 - 12, a = clamp(w.lineA(b), -half, half), above = w.lineD(b) > 0;
      P = { x: w.center.x + N.x * (above ? -18 : 10) + L.x * a, y: w.center.y + N.y * (above ? -18 : 10) + L.y * a }; void along;
    }
    else {
      P = aimPoint(w, b);
      // just rounded an island: carry on round it the same way, with the same berth, until she's clear of it and its lee
      const prev = b.leg > 0 && b.leg <= w.C.marks.length ? w.C.marks[b.leg - 1] : null;
      if (prev?.reach && dist(b, prev.p) < 900) P = aroundIsland(prev, b, P, w.wind.from);
    }
    if (b.started && Math.abs(wrap(ww.from - brg(P.x - b.x, P.y - b.y))) > 50) {
      // reaching or running with land in the way (an island, a headland): steer for clear water round it. (Beating,
      // she tacks off the shore as she reaches it, as boats do working up the Cityfront beach.)
      if (refresh || ai.detour === undefined) ai.detour = detour(b, P);
      if (ai.detour) P = ai.detour;
    } else if (b.started && !ai.detour && refresh && landAlong(b, P) < 500 && !pinnedAt(w, b)) { // (pinned at it with a boat to windward: she hails instead, below)
      // beating toward a point with land close ahead on the straight line to it (a jetty, a point, the harbor's mouth
      // she's in): tacking off the shore would only take her back and forth into the corner it makes, so she lays the
      // end of it first, as a sailor does: the first turn of the way round by water (the navigator's route)
      ai.detour = escape(b, P);
      if (ai.detour) P = ai.detour;
    } else if (ai.detour && b.started && landAlong(b, P) < Infinity && dist(b, ai.detour) > 25) P = ai.detour; // (on her way out of it)
    else ai.detour = null;
    const bP = brg(P.x - b.x, P.y - b.y);
    // a tack (or gybe) she's decided on she carries out, as a sailor does: round onto the new tack's close-hauled (or
    // running) course, deciding nothing else until she's there (re-deciding each moment, mid-tack, she'd stall head to
    // wind or wheel round and run off). Dropped once she's round, if it hasn't happened in 20 s (something stopped her),
    // or if she's on another leg or point of sail than the one she decided it for.
    const rel = Math.abs(wrap(ww.from - bP)), ra = runAngle(ww.kt), upwind = rel < 44 && !b.ocs;
    // (running for a mark deeper than her best downwind angle, with some hysteresis so she doesn't flip between sailing
    // the angle and steering at the mark as the wind swings about it)
    ai.running = b.started && !b.ocs && (ai.running ? rel > ra - 8 : rel > ra - 2);
    const mode = upwind ? 'beat' : ai.running ? 'run' : 'reach';
    if (ai.goTack && (b.tack === ai.goTack.to && !b.tacking || w.t - ai.goTack.at > 20 || ai.goTack.mode !== mode || ai.goTack.leg !== b.leg)) ai.goTack = null;
    let headedNow = false;
    if (mode === 'beat' && ai.goTack) { beating = true; desired = ai.goTack.to === 'S' ? csS : csP; }
    else if (mode === 'beat') {
      beating = true;
      desired = b.tack === 'S' ? csS : csP;
      const dirty = (b.shadowK ?? 1) / (b.leeK ?? 1) < 0.9; // in another boat's (or a ship's) wind shadow
      ai.dirtyT = dirty ? (ai.dirtyT ?? 0) + dt : 0;
      if (w.t - b.lastTackT > 9) {
        const d = sub(P, b), vs = targetFor(b, beat);
        // can we fetch P on tack tk, allowing for current?
        const fetch = (tk: 'S' | 'P') => {
          const uu = V(tk === 'S' ? csS : csP), g = unit({ x: uu.x * vs + c.x, y: uu.y * vs + c.y });
          if (dot(g, d) <= 0) return false;
          const lat = cross(g, d);
          return tk === 'S' ? lat > 3 : lat < -3;
        };
        const other = b.tack === 'S' ? 'P' : 'S', fCur = fetch(b.tack), fOther = fetch(other);
        let doTack = false;
        if (fOther && !fCur) doTack = true; // on the layline
        else if (!fCur) {
          // headed: her compass a header of more than 4° held for more than 15 s, as the debrief judges a header worth
          // tacking on (sim/debrief.ts), not a puff's passing veer
          const dev = wrap(ww.from - ai.avgFrom!);
          headedNow = b.tack === 'S' ? dev < -4 : dev > 4;
          ai.headedT = headedNow ? (ai.headedT ?? 0) + dt : 0;
          const headed = ai.headedT > 15;
          const u = V(w.C.base), sv = { x: u.y, y: -u.x };
          const lat = (b.x - P.x) * sv.x + (b.y - P.y) * sv.y;
          const width = ai.width * Math.min(1, Math.hypot(d.x, d.y) / 500) + 25;
          if (headed && w.rng() < dt * 0.35) doTack = true; // tack on headers
          else if ((ai.dirtyT ?? 0) > 6 && w.t - b.lastTackT > 15) doTack = true; // stuck in another boat's dirty air: tack for clear air
          // don't sail too far off the rhumb line (by where this tack takes her, her close-hauled course: not her heading,
          // which swings across the course's axis as she tacks)
          else if (Math.abs(lat) > width && dot(V(b.tack === 'S' ? csS : csP), sv) * lat > 0) doTack = true;
        }
        // (too slow to tack, she'd stall head to wind or the turn would become a gybe right round (physics.ts SLOW_TACK):
        // a sailor bears away a little and builds speed first)
        // (nor does she tack onto a course the shore blocks close ahead: the shore check would only tack her straight back)
        if (doTack && blocked(w, b, other === 'S' ? csS : csP, 60)) doTack = false;
        if (doTack && b.v < SLOW_TACK * 1.15) desired = b.tack === 'S' ? n360(csS - 10) : n360(csP + 10);
        else if (doTack) { ai.goTack = { to: other, at: w.t, mode, leg: b.leg }; desired = other === 'S' ? csS : csP; }
      }
    } else if (mode === 'run') {
      // running for a mark deeper than her best downwind angle (polar.ts runAngle: wing-on-wing, VMG best at 160–174°):
      // sail that angle on this gybe and gybe when the other gybe lays the mark, allowing for the current: the laylines
      // downwind (sim/laylines.ts), as she tacks on them upwind. A gybe she's decided on is held as a tack is.
      const rS = n360(ww.from - ra), rP = n360(ww.from + ra);
      desired = (ai.goTack ? ai.goTack.to : b.tack) === 'S' ? rS : rP;
      if (!ai.goTack && w.t - b.lastTackT > 12) {
        const d = sub(P, b), vr = targetFor(b, ra);
        // (the other gybe lays the mark when its track over the ground passes no more than 3° to leeward of it: on
        // starboard downwind she heads up by turning to starboard, so she lays a mark to the right of her track)
        const lays = (tk: 'S' | 'P') => {
          const uu = V(tk === 'S' ? rS : rP), g = unit({ x: uu.x * vr + c.x, y: uu.y * vr + c.y });
          if (dot(g, d) <= 0) return false;
          const sinA = cross(g, d) / Math.max(1, Math.hypot(d.x, d.y));
          return tk === 'S' ? sinA < 0.05 : sinA > -0.05;
        };
        const other = b.tack === 'S' ? 'P' : 'S';
        if (lays(other)) { ai.goTack = { to: other, at: w.t, mode, leg: b.leg }; desired = other === 'S' ? rS : rP; }
      }
    } else {
      // reaching for the mark: steer up-current of it by as much as the current across her track would set her down, so
      // she makes good the straight line (as the tiller pilot and the planner do: autopilot.ts, routing.ts), not a curve
      // that ends with her beating or running to it (a crew that reckons with the current allows for all of it, the
      // others for some); but never deeper than her best running angle on the gybe she's on (only the run's held gybe
      // gybes her)
      const vs = Math.max(b.v, targetFor(b, rel) * 0.8);
      desired = sailable(b, crabFor(bP, vs, { x: c.x * (ai.aware ? 1 : 0.6), y: c.y * (ai.aware ? 1 : 0.6) }));
      if (Math.abs(wrap(ww.from - desired)) > ra || Math.sign(wrap(ww.from - desired)) !== (b.tack === 'S' ? 1 : -1) && Math.abs(wrap(ww.from - desired)) > 150) desired = b.tack === 'S' ? n360(ww.from - ra) : n360(ww.from + ra);
    }
    if (!headedNow) ai.headedT = 0;
  }
  // keep off the shore (and off the line mid-race)
  let holdForHail = false;
  if (blocked(w, b, desired, 45)) {
    // Pinned by a boat to windward that she'd hit if she tacked? Hail for room to tack (Rule 20) as soon as she may
    // (close enough to the obstruction that she'll soon have to change course substantially: rule 20.1(a)), and hold on
    // while the other boat responds. If the island-mark rule forbids the hail (the other boat is fetching it), she bears
    // away round it rather than tack into that boat. (Close-hauled is how she's sailing now, whatever she's aiming for.)
    const closeHauled = b.twa <= beatFor(b) + 8 && !b.tacking;
    const pinned = closeHauled ? w.tackBlocker(b) : null, may = pinned ? w.roomBlocker(b) : null;
    if (may && w.t - ai.lastHail > 40) { w.hail(b, may, 'room'); ai.lastHail = w.t; }
    // (her hail passed on to a boat beyond (Rule 20.3): that one has 5 s to respond and the boat she hailed then has 5 s
    // more, so she holds on while the chain answers; if it never does, the boat she hailed can't tack, nor can she)
    const chain = pinned ? w.pairRecord(b, pinned)?.hail : null, relay = chain?.kind === 'room' && chain.by === b.id && chain.passedOn && chain.respondedAt == null ? chain.passedOn : null;
    const waiting = pinned && (relay ? !relay.failed : may ? w.t - ai.lastHail < HAIL_RESPONSE + 1 : obstructionAhead(b, b.h, b.tack, 45) !== null && !w.roomBlockedByMark(b));
    if (waiting && !blocked(w, b, desired, 12)) holdForHail = true;
    else if (beating && w.t - b.lastTackT > 4 && !(pinned && w.roomBlockedByMark(b)) && !relay) desired = b.tack === 'S' ? csP : csS;
    else for (const k of [25, -25, 45, -45, 70, -70, 100, -100]) { const cand = sailable(b, desired + k); if (!blocked(w, b, cand, 45)) { desired = cand; break; } }
  } else if (beating && b.started && b.twa <= beatFor(b) + 8 && !b.tacking && w.t - ai.lastHail > 40) {
    // A boat as the obstruction (WS Case 11): close-hauled, closing on a boat she must keep clear of (a starboard-tack
    // boat crossing, say) that bearing away 10° wouldn't clear, with a boat on her own tack to windward stopping her
    // tacking. She may hail that boat "Room to tack" (Rule 20.1), and does, rather than drag both of them off to duck;
    // until it responds she keeps clear as she must (below), then tacks (Rule 20.2(d), the hail loop below).
    // (not in the crush just after the start, nor at a boat doing penalty turns, nor with another boat close by either of them that the tacks would bring them onto: there
    // she ducks with the boat to windward, the simpler way to keep clear)
    const o = w.tackBlocker(b), c = o && o.penalty <= 0 && w.t > 60 && w.roomBlocker(b) === o ? w.boatObstructionAhead(b, o) : null;
    // (and only with time for the whole of it: the hailed boat's response, a few seconds, and then her own tack, about
    // four from close-hauled through head to wind; later than that she ducks)
    if (o && c && cpa(b, c).t >= BOAT_HAIL_LEAD && !w.boats.some(x => x !== b && x !== o && x !== c && !x.finished && (dist(x, b) < 2.5 * LOA || dist(x, o) < 2.5 * LOA))) { w.hail(b, o, 'room'); ai.lastHail = w.t; boatHails.set(b, { o: o.id, c: c.id, at: w.t }); }
  }
  // her hail at a boat, still being answered (the hailed boat hasn't tacked or replied yet, or has and she hasn't yet
  // tacked herself): hold close-hauled, keeping the boat she must avoid in view
  const bh = boatHails.get(b), bhRec = bh ? w.boats.find(x => x.id === bh.o) : undefined, bhHail = bhRec ? w.pairRecord(b, bhRec)?.hail : null;
  const bhC = bh ? w.boats.find(x => x.id === bh.c) : undefined;
  // (released when time runs short to the meeting, or when a hail passed on beyond the boat she hailed failed: then the
  // hold ends and her ordinary keep-clear below ducks the other boat)
  const boatHailOn = !!bh && !!bhC && w.t - bh.at < BOAT_HAIL_HOLD && b.lastTackT < bh.at && bhHail?.kind === 'room' && bhHail.by === b.id
    && !bhHail.passedOn?.failed && cpa(b, bhC).t > BOAT_HAIL_MARGIN;
  if (bh && !boatHailOn) boatHails.delete(b);
  if (boatHailOn) holdForHail = true;
  // collision avoidance under the rules
  // (around the start, in the pre-start and the first minute after the gun, when the fleet is bunched up, she also
  // looks at each heading's room to other boats: out on the course the simple moves below are enough, and cheaper)
  const startArea = w.t < 60;
  const near: { o: Boat; dx: number; dy: number; r: ReturnType<World['rights']>; cp: { t: number; d: number } }[] = [];
  for (const o of w.boats) {
    if (o === b) continue;
    const dx = o.x - b.x, dy = o.y - b.y;
    if (dx * dx + dy * dy > 3600) continue;
    near.push({ o, dx, dy, r: w.rights(b, o), cp: cpa(b, o) });
  }
  // First, her right of way. Rule 16.1: a right-of-way boat changing course must give the other boat room to keep
  // clear, so if the turn she wants would close on a boat close by she turns only as far as still leaves it that room.
  // (Room: 8 m between centres, a little more than a Folkboat's length (7.6 m); with less than that already, she
  // mustn't close it further.)
  if (startArea) for (const { o, dx, dy, r, cp } of near) {
    if (r.kc !== o || Math.abs(wrap(desired - b.h)) <= 8 || dx * dx + dy * dy > 900 || cp.t >= 10) continue;
    const ROOM = 8, need = Math.min(ROOM, clearanceOn(w, b, b.h, o));
    if (clearanceOn(w, b, desired, o) >= need) continue;
    const sweep = wrap(desired - b.h), n = Math.ceil(Math.abs(sweep) / 5);
    let ok = b.h;
    for (let i = 1; i <= n; i++) { const h = sailable(b, b.h + sweep * i / n); if (clearanceOn(w, b, h, o) < need) break; ok = h; }
    desired = ok;
  }
  // Then what she must keep clear of, which comes before any right of way she holds over a third boat (Rule 14 too).
  for (const { o, dx, dy, r, cp } of near) {
    // keep clear early: slow, heavy boats need time to respond
    // hailed "Starboard!" by this boat: duck early and generously
    const ducking = r.rule === '10' && r.kc === b && w.t < ai.duckUntil;
    if (ducking && cp.t < 16 && cp.d < 22) { desired = sailable(b, b.h + (b.tack === 'P' ? 45 : -45)); continue; }
    // (the boat she has hailed about, while that hail is answered and there's still time: she holds on, to tack)
    if (boatHailOn && o.id === bh!.c && cp.t > BOAT_HAIL_MARGIN) continue;
    if (r.kc === b && cp.t < 12 && cp.d < 14) {
      const away = sailable(b, brg(-dx, -dy)), running = b.twa > 110;
      if (r.rule === '10') { desired = sailable(b, b.tack === 'P' ? b.h + 32 : b.h - 32); luff = false; } // keep way on to steer
      else if (r.rule === '11') { desired = sailable(b, b.tack === 'P' ? b.h - 20 : b.h + 20); luff = !running; }
      else if (running) { desired = startArea ? clearestHeading(w, b, b.h) : away; luff = false; } // easing barely slows her on a run: steer round instead
      else { luff = true; desired = away; }
      // and if that still leaves her too close (she keeps clear of every boat she must, not just this one), the
      // heading that opens the most room, nearest what she wanted
      if (startArea && clearanceOn(w, b, desired) < 9) desired = clearestHeading(w, b, desired);
    } else if (r.kc === o && cp.t < 2.4 && cp.d < 4.5) {
      // Rule 14: even a right-of-way boat must avoid contact if she reasonably can
      desired = sailable(b, brg(-dx, -dy)); luff = true;
      if (o.isUser && Math.hypot(dx, dy) < 10) b.forced14 = o.id; // the user made her swerve: that's a foul
    }
  }
  for (const o of w.boats) {
    const h = o !== b ? w.pairRecord(b, o)?.hail : null;
    if (!h || h.kind !== 'room') continue;
    // Hailed for room to tack: respond by tacking as soon as possible (Rule 20.2(c)), unless she replied "You tack".
    // With a boat on the same tack to windward stopping her, she first passes the hail on to it (Rule 20.3; WS Case 113)
    // and holds her course until it responds; then she tacks.
    if (h.by === o.id && h.replyAt == null && b.lastTackT < h.at && !b.tacking) {
      if (!h.passedOn) w.passOnHail(b, o);
      const po = h.passedOn, waiting = !!po && po.respondedAt == null && !po.failed;
      if (po?.failed) continue; // the boat she hailed never responded: she still can't tack into her
      if (!waiting) { desired = b.tack === 'S' ? csP : csS; luff = false; }
      else holdForHail = true;
    }
    // She hailed and the other boat responded (tacked, or replied "You tack"): tack now (Rule 20.2(d)).
    if (h.by === b.id && h.respondedAt != null && b.lastTackT < h.at && !b.tacking) { desired = b.tack === 'S' ? csP : csS; luff = false; holdForHail = false; }
  }
  if (holdForHail) desired = b.tack === 'S' ? csS : csP;
  desired = sailable(b, avoidMarks(w, b, desired));
  // the courses above are her track's through the water (the beat angle, the laylines, the crab): her heading is above
  // each by the leeway she makes there (physics.ts b.leeway), as a sailor steers a little higher to make good her course
  const lw = b.leeway ?? 0, r = wrap(ww.from - desired);
  if (lw > 0 && Math.abs(r) > lw + 1 && Math.abs(r) < 150) desired = n360(desired + Math.sign(r) * lw);
  b.desired = desired; b.luff = luff;
  crewPoleCall(w, b);
}

/**
 * The crew's call on the whisker pole: out for wing-on-wing when running deep, in before the next rounding mark, for
 * penalty turns, or once she comes up toward a reach. Poled out beats the jib to leeward from 154.5° true at every wind
 * speed (polar.ts); set at 157°, stowed at 150°: each set or stow leaves the jib dead for 5–8 s, so the gap keeps them
 * from doing it over and over as she wanders about a deep run. The AI boats' crews, and yours while the pole is theirs
 * (the band's Auto-trim).
 */
export function crewPoleCall(w: World, b: Boat): void {
  const nm = w.nextMark(b), nearMark = !!nm && nm.type === 'round' && markDist(b, nm) < 45;
  const twa = b.twa, jibDown = !!b.rig && (b.rig.jib < 1 || !b.rig.jibUp); // (the pole goes out on the jib)
  if (w.t < 0 || nearMark || twa < 150 || jibDown || b.docked || b.penalty > 0) b.poleWant = false;
  else if (twa > 157) b.poleWant = true;
}
