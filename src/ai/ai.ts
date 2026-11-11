import type { PrepFlag } from '../sim/signals';
import { bow, type Boat } from '../boat/boat';
import type { CourseMark } from '../courses/course';
import { coastDistance, maxTurnRate, timeToCover } from '../boat/dynamics';
import { beatFor, targetFor } from '../boat/seaway';
import { V, brg, clamp, cross, dist, dot, markDist, markReach, n360, segCross, sub, unit, wrap, type Vec } from '../core/math';
import { onLand } from '../geo/shore';
import { HAIL_RESPONSE, cpa } from '../rules';
import type { World } from '../sim/world';

/** Extra seconds of caution at the start under each preparatory flag. */
const FLAG_CAUTION: Record<PrepFlag, number> = { P: 0, I: 1, Z: 2, U: 3, black: 3.5 };

/** A boat owing a penalty first gets this far (m) from other boats before turning. */
const PENALTY_CLEAR = 25;
/** ...and this far from marks. */
const MARK_CLEAR = 20;
/** Pass marks with at least this much room between the mark and her centreline, m (Rule 31). */
const MARK_ROOM = 5;

/** Nudge a heading so she passes a mark she could touch with room to spare, on the side it's already on. */
function avoidMarks(w: World, b: Boat, desired: number): number {
  for (const m of w.touchableMarks(b)) {
    const d = dist(b, m.p);
    if (d > 30 || d < 0.5) continue;
    const rel = wrap(brg(m.p.x - b.x, m.p.y - b.y) - desired); // + = mark to starboard of the course
    const need = Math.asin(Math.min(1, MARK_ROOM / d)) / (Math.PI / 180);
    if (Math.abs(rel) < need && Math.abs(rel) < 90) desired = n360(desired + (rel > 0 ? -(need - rel) : need + rel));
  }
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

/** Close-hauled course on the current tack, or the requested heading if it is sailable. */
export function sailable(b: Boat, desired: number): number {
  const from = b.ww.from, rel = wrap(from - desired), ch = beatFor(b) + 1;
  if (Math.abs(rel) >= ch) return n360(desired);
  if (b.tack === 'S' && rel < -25) return n360(from + ch);
  if (b.tack === 'P' && rel > 25) return n360(from - ch);
  return b.tack === 'S' ? n360(from - ch) : n360(from + ch);
}

function blocked(w: World, b: Boat, h: number, d: number): boolean {
  const u = V(h), q = { x: b.x + u.x * d, y: b.y + u.y * d };
  if (onLand(q)) return true;
  if (w.obstructed(b) && segCross(b, q, w.pin, w.committee)) return true;
  return false;
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
/** Clear water all the way from a to b, with some room either side? With `lee` (the wind direction), out of any island's wind shadow too. */
function clearRun(a: Vec, b: Vec, lee?: number): boolean {
  const L = dist(a, b), ux = (b.x - a.x) / (L || 1), uy = (b.y - a.y) / (L || 1);
  for (let s = 0; s <= L; s += 15) {
    for (const k of [0, -25, 25]) if (onLand({ x: a.x + ux * s - uy * k, y: a.y + uy * s + ux * k })) return false;
    if (lee != null && s > 40 && s % 30 === 0 && inIslandLee({ x: a.x + ux * s, y: a.y + uy * s }, lee)) return false;
  }
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
    // Take the penalty in clear water: first sail away from nearby boats, then spin.
    let near: Vec | null = null, nd = PENALTY_CLEAR;
    for (const o of w.boats) if (o !== b) { const d = dist(o, b); if (d < nd) { nd = d; near = o; } }
    for (const m of w.touchableMarks(b)) { const d = dist(m.p, b); if (d < MARK_CLEAR && d < nd + 10) { nd = d; near = m.p; } } // and away from the marks
    ai.clearing = !!near && b.penalty >= b.penaltyTotal - 1; // not started turning yet
    b.desired = near && ai.clearing ? sailable(b, brg(b.x - near.x, b.y - near.y)) : b.h + 60;
    b.luff = false; return;
  }
  ai.clearing = false;
  if (b.finished) { b.desired = n360(ww.from + 90); b.luff = true; return; }
  const tl = -w.t; // time to the start signal
  const refresh = (w.steps + b.id) % 6 === 0; // heavy predictions 10× a second
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
        ai.plan.leave = turn + timeToCover(-d, b.v, targetFor(b, Math.abs(wrap(ww.from - app.h))), app.along, c.x * N.x + c.y * N.y);
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
        ai.plan.tReach = turn + timeToCover(-d - inTurn, b.v, targetFor(b, twaD), app.along, cN);
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
      // haven't started yet: cross the line between its ends, straight ahead (not back to the spot she'd planned on)
      const half = w.lineLen / 2 - 12, a = clamp(w.lineA(b), -half, half);
      P = { x: w.center.x + N.x * 10 + L.x * a, y: w.center.y + N.y * 10 + L.y * a }; void along;
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
    } else ai.detour = null;
    const bP = brg(P.x - b.x, P.y - b.y);
    if (Math.abs(wrap(ww.from - bP)) < 44 && !b.ocs) {
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
          const dev = wrap(w.wind.from - w.avgFrom), headed = b.tack === 'S' ? dev < -3.5 : dev > 3.5;
          const u = V(w.C.base), sv = { x: u.y, y: -u.x };
          const lat = (b.x - P.x) * sv.x + (b.y - P.y) * sv.y;
          const width = ai.width * Math.min(1, Math.hypot(d.x, d.y) / 500) + 25;
          if (headed && w.rng() < dt * 0.35) doTack = true; // tack on headers
          else if ((ai.dirtyT ?? 0) > 6 && w.t - b.lastTackT > 15) doTack = true; // stuck in another boat's dirty air: tack for clear air
          else if (Math.abs(lat) > width && dot(V(b.h), sv) * lat > 0) doTack = true; // don't sail too far off the rhumb line
        }
        if (doTack) desired = b.tack === 'S' ? csP : csS;
      }
    } else desired = sailable(b, bP);
  }
  // keep off the shore (and off the line mid-race)
  let holdForHail = false;
  if (blocked(w, b, desired, 45)) {
    // Pinned by a boat to windward? Hail for room to tack (Rule 20) and hold on while she responds.
    const blocker = beating ? w.roomBlocker(b) : null;
    if (blocker && w.t - ai.lastHail > 40) { w.hail(b, blocker, 'room'); ai.lastHail = w.t; }
    if (blocker && w.t - ai.lastHail < HAIL_RESPONSE + 1 && !blocked(w, b, desired, 12)) holdForHail = true;
    else if (beating && w.t - b.lastTackT > 4) desired = b.tack === 'S' ? csP : csS;
    else for (const k of [25, -25, 45, -45, 70, -70, 100, -100]) { const cand = sailable(b, desired + k); if (!blocked(w, b, cand, 45)) { desired = cand; break; } }
  }
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
    if (h.by === o.id && h.replyAt == null && b.lastTackT < h.at && !b.tacking) { desired = b.tack === 'S' ? csP : csS; luff = false; }
    // She hailed and the other boat responded (tacked, or replied "You tack"): tack now (Rule 20.2(d)).
    if (h.by === b.id && h.respondedAt != null && b.lastTackT < h.at && !b.tacking) { desired = b.tack === 'S' ? csP : csS; luff = false; holdForHail = false; }
  }
  if (holdForHail) desired = b.tack === 'S' ? csS : csP;
  desired = sailable(b, avoidMarks(w, b, desired));
  b.desired = desired; b.luff = luff;
  // whisker pole: wing-on-wing when running deep, stowed before the next rounding mark
  const nm = w.nextMark(b), nearMark = !!nm && nm.type === 'round' && markDist(b, nm) < 45;
  if (w.t < 0 || nearMark || b.twa < 146) b.poleWant = false;
  else if (b.twa > 156) b.poleWant = true;
}
