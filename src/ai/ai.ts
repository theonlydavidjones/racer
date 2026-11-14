import type { PrepFlag } from '../sim/signals';
import { bow, stern, type Boat } from '../boat/boat';
import type { CourseMark } from '../courses/course';
import { coastDistance, maxTurnRate, timeToCover } from '../boat/dynamics';
import { driveCurveFor } from '../boat/driveCurve';
import { beatFor, targetFor } from '../boat/seaway';
import { runAngle } from '../boat/polar';
import { SLOW_TACK, yawLag } from '../boat/physics';
import { attrOf } from '../boat/crewPhys';
import { LOA, V, brg, clamp, cross, dist, dot, markDist, markReach, n360, segCross, sub, unit, wrap, type Vec } from '../core/math';
import { anyShoreDist, landAlong, landAlongNear, onLand } from '../geo/shore';
import { HAIL_RESPONSE, cpa, hullGap } from '../rules';
import { hailRange, obstructionAhead } from '../sim/obstruction';
import { routeAround } from '../sim/routing';
import { HARBORS, inBasin } from '../geo/marina';
import { AI_EVERY, type World } from '../sim/world';

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

/** Room to turn at her aim point clear of the shore beyond it, m: two lengths. */
const SHORE_TURN = 15;
/** Half a Folkboat's beam, m (2.20 m: NFIA class rules, principal dimensions). */
const HALF_BEAM = 1.1;
/** Overlapped and already parting, with at least 3 m of water between the hulls (about a beam and a half), a boat that
 * must keep clear is doing so: she holds on rather than ease and head up further. Measured between the centrelines
 * (rules hullGap), so the two half-beams are added. */
const OPEN_GAP = 3 + 2 * HALF_BEAM;
/** Out of another boat's wind shadow on a run, she heads up this far (deg) onto a broad reach: it brings the apparent
 * wind forward and sends her sideways at about 0.4 of her speed, clear of a shadow a few metres wide (sim/world.ts
 * shadowAt, the wake model) in a few seconds; it costs her 1 − cos 25° ≈ 9% of her speed toward a mark downwind,
 * against the quarter or more of the wind the shadow takes (DIRTY_RUN_K). Poled out, no higher than the pole stays
 * set (crewPoleCall stows it below 150°, and each stowing and setting leaves the jib dead for 5–8 s). */
const DIRTY_RUN_UP = 25, DIRTY_RUN_POLED_TWA = 152;
/** In a shadow, running: less than this share of the wind she'd have without the other boats (land's lee apart). */
const DIRTY_RUN_K = 0.75;
/** Once she's headed up out of a shadow, she holds the higher course this long (s), to get clear of it rather than
 * bear away back into it the moment the wind comes back; and she gybes away if she's still in it after three times her
 * dirtyAirS, but not within 20 s of her last gybe (a gybe costs her speed: back and forth, she'd lose more than the shadow). */
const DIRTY_RUN_HOLD = 15;
/** Nudge a heading so she passes a mark she could touch with room to spare, on the side it's already on. */
function avoidMarks(w: World, b: Boat, desired: number): number {
  let near: string | null = null;
  for (const m of w.touchableMarks(b)) {
    // (the nearest point of it: a buoy is a point, the committee boat a hull 12 m long, `p` to `q`)
    let np = m.p;
    if (m.q) { const ax = m.q.x - m.p.x, ay = m.q.y - m.p.y, k = clamp(((b.x - m.p.x) * ax + (b.y - m.p.y) * ay) / (ax * ax + ay * ay || 1), 0, 1); np = { x: m.p.x + ax * k, y: m.p.y + ay * k }; }
    const d = dist(b, np);
    if (d > 30 || d < 0.5) continue;
    const bm = brg(np.x - b.x, np.y - b.y);
    // (room between her side and the mark's: MARK_ROOM, plus the mark's own radius and her half beam)
    const need = Math.asin(Math.min(1, (MARK_ROOM + m.r + HALF_BEAM) / d)) / (Math.PI / 180);
    // close to it, a turn from her heading to the course she wants mustn't swing her across it on the way: if it lies
    // inside that turn, she turns only as far as passes it on the side it's on now (then on round once she's past).
    // At the start, round the committee boat and the pin while she's getting to the line: a mark she's rounding she
    // means to sail round, close, and the rounding has its own course (aimPoint)
    const key = `${m.p.x.toFixed(0)},${m.p.y.toFixed(0)}`;
    if (d < 20 && !b.started) {
      const relH = wrap(bm - b.h), turn = wrap(desired - b.h), side = Math.sign(relH || 1);
      if (Math.sign(relH) === Math.sign(turn) && Math.abs(relH) < Math.abs(turn) + need) {
        // (and that's the side she passes it on, until she's clear: the rule below would otherwise pick the other)
        // (and if passing it there would take her above close-hauled, she can't: pinned there, her leeway carries her on
        // to it. She turns away from it instead, through the wind if need be, the way that doesn't swing her across it)
        // (the turn away committed to that side, through the wind, even slow: steered the short way round by the helm's
        // own rule, a slow boat would gybe instead, the long way, and swing her bow across the mark: physics review)
        const keepH = n360(bm - side * need), away = Math.abs(wrap(sailable(b, keepH) - keepH)) > 1;
        desired = away ? n360(bm + 180) : keepH; near = key;
        if (away && b.ai && b.ai.turnCommit !== -side) { b.ai.turnCommit = -side; b.ai.commitFor = desired; }
        if (b.ai) b.ai.passing = { key, side };
        continue;
      }
    }
    const rel = wrap(bm - desired); // + = mark to starboard of the course
    if (Math.abs(rel) < need && Math.abs(rel) < 90) {
      // pass it on the side it's already on; if that means heading up past close-hauled (sailable would undo it, and she'd
      // sail on into it), pass it on the other side, bearing away. Once she's chosen a side she holds to it until she's
      // clear (her course swinging as she turns would swap them back and forth, and she'd hold on into it)
      const keep = n360(desired + (rel > 0 ? -(need - rel) : need + rel)), other = n360(desired + (rel > 0 ? need + rel : -(need - rel)));
      const prev = b.ai?.passing?.key === key ? b.ai.passing.side : 0;
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

/**
 * Racing called off for the day (N over A, or AP over A: "no more racing today", RRS Race Signals), as it is in a breeze
 * over the fleet's limit (sim/signals.ts): she sails home, to the racing harbour nearest the course (geo/marina.ts), by
 * the way round the land a skipper would draw (sim/routing.ts), allowing for the current as she does racing (crabFor).
 * Off the harbour she stands off and lies to (going in to her berth is the harbour's work, not drawn yet): at a spot of
 * her own (the fleet spread along the wind, not all on one point), with open water a long way to leeward for the drift
 * while she lies there, on the tack she came in on; drifted well off it, or with the land coming up to leeward, she
 * sails back. The rest is her ordinary sailing (aiThink): the shore, the marks, and the right-of-way rules, which still
 * apply between boats that have been racing (Part 2 preamble), though a boat not racing takes no penalty for breaking one.
 */
function homeCourse(w: World, b: Boat): { desired: number; luff: boolean; beating: boolean } {
  const ai = b.ai!, from = b.ww.from, beat = beatFor(b);
  if (!ai.home) {
    let at = w.C.center, best = Infinity;
    for (const H of HARBORS) for (const e of H.exits) { const d = dist(e, w.C.center); if (d < best) { best = d; at = e; } }
    // (the fleet's places worked out once, when racing's called off, with the course's wind then, and kept: every boat
    // reads hers from the same list)
    const places = w.cancelled ? (w.cancelled.places ??= standOffPlaces(w, at, w.wind.from)) : standOffPlaces(w, at, w.wind.from);
    const stand = places[w.boats.filter(o => !o.isUser).indexOf(b)] ?? at;
    ai.home = { route: routeAround(b, stand, 120), i: 0, at: stand, lying: false };
  }
  const h = ai.home, toLee = (p: Vec, d: number) => { const u = V(from + 180); return landAlong(p, { x: p.x + u.x * d, y: p.y + u.y * d }) < Infinity; };
  // lying to at her spot: from coming within 60 m of it until she's drifted 300 m off, or the land's 150 m to leeward
  // (lying to she sags off to leeward at about 0.8 kt: some ten minutes, then a beat back)
  if (h.lying && (dist(b, h.at) > 300 || toLee(b, 150))) h.lying = false;
  else if (!h.lying && dist(b, h.at) < 60 && !toLee(b, 300)) { h.lying = true; h.tack = b.tack; }
  if (h.lying) {
    // (another boat lying to, or stopped, within a couple of lengths: they'd drift down together side by side, stopped,
    // for as long as they lay there. The one further from her own spot sails off clear before lying to again)
    // (sailing off until 25 m clear, so she doesn't lie to again on the edge and drift back in)
    const was = h.parting != null ? w.boats.find(o => o.id === h.parting) : undefined;
    if (was && dist(was, b) < 25) return { desired: sailable(b, brg(b.x - was.x, b.y - was.y)), luff: false, beating: false };
    h.parting = undefined;
    for (const o of w.boats) {
      if (o === b || dist(o, b) > 15) continue;
      const mine = dist(b, h.at), theirs = o.ai?.home ? dist(o, o.ai.home.at) : -1;
      if (mine > theirs || (mine === theirs && b.id > o.id)) { h.parting = o.id; return { desired: sailable(b, brg(b.x - o.x, b.y - o.y)), luff: false, beating: false }; }
    }
    return { desired: n360(from + (h.tack === 'S' ? -90 : 90)), luff: true, beating: false }; // (beam-on, on the tack she came in on)
  }
  // her way: each turn of it passed within 60 m, or the next in sight with clear water to it
  while (h.i < h.route.length - 1 && (dist(b, h.route[h.i]) < 60 || landAlong(b, h.route[h.i + 1]) === Infinity)) h.i++;
  const q = h.i < h.route.length - 1 ? h.route[h.i] : h.at, bq = brg(q.x - b.x, q.y - b.y), rel = Math.abs(wrap(from - bq));
  let desired = sailable(b, crabFor(bq, targetFor(b, rel) * 0.9, b.cur));
  const beating = Math.abs(wrap(from - desired)) < beat + 5;
  // the land within 100 m along her track over the ground (her heading through the water and the current's set): off it.
  // Beating, she tacks, with way enough to (below about 1.5 m/s a tack becomes a gybe right round: physics.ts
  // SLOW_TACK), and not onto land; else, or slow, she bears away to build speed and clear it
  const track = (hd: number, d: number) => { const u = V(hd), s = Math.max(1, b.v); return { x: b.x + (u.x * s + b.cur.x) * d / s, y: b.y + (u.y * s + b.cur.y) * d / s }; };
  // (her whole width, not just her centreline: a line 4 m either side too, so she doesn't brush a breakwater's end)
  const landOn = (hd: number, d: number) => {
    const q = track(hd, d), dx = q.x - b.x, dy = q.y - b.y, L = Math.hypot(dx, dy) || 1, sx = -dy / L * 4, sy = dx / L * 4;
    return landAlong(b, q) < Infinity || landAlong({ x: b.x + sx, y: b.y + sy }, { x: q.x + sx, y: q.y + sy }) < Infinity || landAlong({ x: b.x - sx, y: b.y - sy }, { x: q.x - sx, y: q.y - sy }) < Infinity;
  };
  if (landOn(desired, 100)) {
    const other = n360(from + (b.tack === 'S' ? 1 : -1) * (beat + 1));
    if (beating && b.v > SLOW_TACK * 1.15 && w.t - b.lastTackT > 4 && !landOn(other, 60)) desired = other;
    else for (const k of [20, 40, 60, 90]) { const cand = sailable(b, desired + (b.tack === 'S' ? -k : k)); if (!landOn(cand, 100)) { desired = cand; break; } }
  }
  return { desired, luff: false, beating };
}
/** No land, pier, dock or breakwater within r m of p, looking out eight ways (anyShoreDist doesn't see what's built). */
function clearRound(p: Vec, r: number): boolean {
  for (let a = 0; a < 360; a += 45) { const u = V(a); if (landAlong(p, { x: p.x + u.x * r, y: p.y + u.y * r }) < Infinity) return false; }
  return true;
}
/**
 * Where she stands off the harbour (h: its entrance): open water within 800 m of it, 100 m from any shore, pier or breakwater, reached from
 * it straight, with no land for 500 m to leeward (she sails back once she's drifted 300 m, or has the land 150 m to leeward); the nearest
 * such, a little upwind of it the better (on a lee shore, well out): the fleet's spot; each boat her own place 80 m apart along the wind's line
 * across, so the fleet isn't all on one point. All the fleet's places (non-user boats, in order).
 */
function standOffPlaces(w: World, h: Vec, from: number): Vec[] {
  const lee = V(from + 180), clearLee = (p: Vec) => !onLand(p) && anyShoreDist(p) > 100 && clearRound(p, 100) && landAlong(p, { x: p.x + lee.x * 500, y: p.y + lee.y * 500 }) === Infinity;
  // The fleet's one spot first (open water, the nearer and the more upwind of the entrance the better); then each boat
  // her own place 80 m apart across the wind from it, alternately either side. (Each choosing her own best spot with
  // the spread added, they all chose points round the same corner of open water, 11–32 m apart, and those sailing back
  // to theirs passed close to those lying to.)
  const open: Vec[] = []; // (open water she can reach straight from the entrance)
  let base: Vec | null = null, cost = Infinity;
  for (let r = 150; r <= 800; r += 50) for (let a = 0; a < 360; a += 15) {
    const u = V(a), p = { x: h.x + u.x * r, y: h.y + u.y * r };
    if (!clearLee(p) || landAlong(h, p) < Infinity) continue;
    open.push(p);
    const q = r + 100 * (1 - Math.cos((a - from) * Math.PI / 180)) / 2;
    if (q < cost) { cost = q; base = p; }
  }
  const fleet = w.boats.filter(o => !o.isUser);
  if (!base) return fleet.map(() => h);
  // Apart across the wind is what counts: lying to, a boat sags straight to leeward until she's drifted 300 m, so two
  // places one dead to leeward of the other share a lane, the one drifting down through the other's spot and that one
  // beating back up through hers. Clear: 60 m apart across the wind, or more than her drift along it.
  const across = V(from + 90), taken: Vec[] = [];
  const clearOf = (p: Vec) => taken.every(q => { const dx = p.x - q.x, dy = p.y - q.y; return Math.abs(dx * across.x + dy * across.y) >= 60 || Math.abs(dx * lee.x + dy * lee.y) > 300; });
  const ok = (p: Vec) => clearLee(p) && landAlong(base!, p) === Infinity && clearOf(p);
  for (let k = 0; k < fleet.length; k++) {
    const side = k % 2 ? 1 : -1, spread = side * Math.ceil(k / 2) * 80;
    let spot: Vec | null = null;
    // her place, or further out along the same line across the wind; then the other side; then the nearest open
    // water clear of the others; failing that, the open water furthest across the wind from them
    for (const s of [1, -1]) for (let m = Math.abs(spread); m <= 800 && !spot; m += 20) {
      const p = { x: base.x + across.x * side * s * m, y: base.y + across.y * side * s * m };
      if (ok(p)) spot = p;
    }
    const want = { x: base.x + across.x * spread, y: base.y + across.y * spread };
    if (!spot) { let bd = Infinity; for (const p of open) if (clearOf(p) && dist(p, want) < bd) { bd = dist(p, want); spot = p; } }
    if (!spot) {
      let bg = -1;
      for (const p of open) { const g = taken.reduce((m, q) => Math.min(m, Math.abs((p.x - q.x) * across.x + (p.y - q.y) * across.y)), Infinity); if (g > bg) { bg = g; spot = p; } }
    }
    taken.push(spot ?? base);
  }
  return taken;
}

/** Land (or, mid-race, the start/finish line) within d m on heading h? The whole way, exactly: a pier or a breakwater
 * a few metres wide is in the way even if the water beyond it is clear. */
function blocked(w: World, b: Boat, h: number, d: number): boolean {
  const u = V(h), q = { x: b.x + u.x * d, y: b.y + u.y * d };
  if (landAlongNear(b, q) <= d) return true; // (the same answer as landAlong, cheaply when the shore's well off)
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
export function aroundIsland(m: CourseMark, b: Vec, P: Vec, windFrom: number, rounded = false): Vec {
  // in the island's lee already, she gets out of it first, whatever the way round,
  // across the wind (out of a wind shadow the quick way is sideways to the wind, not on away from the island, which is
  // downwind and deeper into it, where an ebb would hold her), on the side nearer where she's going. (Standing off from
  // the island's centre there, the fleet lost over half an hour in Alcatraz's lee on the real 1 November 2025 race:
  // Charts' real past races, #192)
  // (once she has rounded it: before that, the rounding's own way round)
  // (in its lee by the wind she has, the shadows' own model, sim/world.ts leeK: a single ray upwind misses the lee off
  // an island's corner)
  // (tested before the clear run below, whose single ray upwind passes her as clear in the lee's tail, 220–500 m off
  // the shore at 30–65% of the wind, and off a corner: she'd run on down through it)
  // (the side chosen as she enters the lee and kept until she's out of it: chosen afresh each moment, with her mark
  // nearly dead downwind, the side would swap as she crossed the line down through it, and she'd swing from one beam
  // reach to the other in the lee's calm core)
  const bb = b as Boat, ai = bb.ai, lee = bb.leeK != null ? bb.leeK : inIslandLee(b, windFrom) ? 0 : 1;
  if (ai && lee >= LEE_OUT + 0.1) ai.leeSide = null;
  if (rounded && lee < LEE_OUT) {
    const a = V(windFrom + 90), side = ai?.leeSide ?? (dot(a, sub(P, b)) >= 0 ? 1 : -1);
    if (ai) ai.leeSide = side;
    return { x: b.x + a.x * side * ISLAND_EXIT, y: b.y + a.y * side * ISLAND_EXIT };
  }
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
/** How far across the wind she steers to get out of an island's lee (m): beyond the shadow's width off Alcatraz. */
const ISLAND_EXIT = 300;
/** In an island's lee: less than this share of the wind there, by the land's wind shadow alone. (The model's lee off
 * Alcatraz has sharp sides, 0.2 to 0.8–0.9 of the wind within 50 m, and 0.7 lies 300–350 m beyond its downwind shore:
 * past the calm core, where what's left of the shadow costs less than the way out of it. She's out of it, and free to
 * choose her side afresh, once she has a tenth more than that.) */
const LEE_OUT = 0.7;

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
  let aim: Vec | null = null; // (the point she's steering for, racing)
  ai.tackNow = false; ai.urgent = false; // (set below while she answers a hail; or she's about to touch a boat)
  // (her crew's pole call first, whatever she does next: it reads only where she is and how she's sailing, and it has to
  // run through penalty turns and after she's finished too, or a pole left out on the run stays out on the reach home)
  crewPoleCall(w, b);
  if (b.penalty > 0) {
    ai.goTack = null; ai.headedT = 0;
    // Take the penalty in clear water: first sail away from nearby boats, then spin.
    let near: Vec | null = null, nd = PENALTY_CLEAR;
    for (const o of w.boats) if (o !== b) { const d = dist(o, b); if (d < nd) { nd = d; near = o; } }
    for (const m of w.touchableMarks(b)) { const d = dist(m.p, b); if (d < MARK_CLEAR && d < nd + 10) { nd = d; near = m.p; } } // and away from the marks
    // not started turning yet; or a new penalty came while she was turning (in a jam): rule 44.2, she takes it "after
    // getting well clear of other boats", so she gets clear again before she carries on turning
    if (ai.penSeen != null && b.penaltyTotal > ai.penSeen + 1) ai.reclear = true;
    // (and while turning, a boat drifting in close: she must keep clear of everyone while she takes it, rule 21.2, so she
    // stops spinning and sails clear again, rather than turn into her; a mark that close, likewise: no touching it either)
    if (b.penaltyDir && near && nd < PENALTY_CLEAR * 0.6) ai.reclear = true;
    ai.penSeen = b.penaltyTotal;
    if (!near) ai.reclear = false;
    ai.clearing = !!near && (b.penalty >= b.penaltyTotal - 1 || !!ai.reclear);
    b.desired = near && ai.clearing ? sailable(b, brg(b.x - near.x, b.y - near.y)) : b.h + 60;
    b.luff = false; return;
  }
  ai.clearing = false; ai.penSeen = undefined; ai.reclear = false;
  const home = w.cancelled && !b.finished ? homeCourse(w, b) : null; // (no more racing today: she sails home)
  if (b.finished && !home) { b.desired = n360(ww.from + 90); b.luff = true; return; }
  const tl = -w.t; // time to the start signal
  const refresh = (w.steps + b.id) % (2 * AI_EVERY) === 0; // heavy predictions 10× a second (every other think outside close quarters, as before the speed pass)
  // her compass: about a minute's mean of the wind where she is, against which a shift is a lift or a header (she can only
  // see the wind she's in, not the course-wide wind); kept from the pre-start on, as crews take readings to learn it
  ai.avgFrom = ai.avgFrom == null ? ww.from : n360(ai.avgFrom + wrap(ww.from - ai.avgFrom) * Math.min(1, dt / 60));
  if (home) { desired = home.desired; luff = home.luff; beating = home.beating; }
  else if (w.t < 0) {
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
        { const ta = Math.abs(wrap(ww.from - app.h)), vt = targetFor(b, ta); ai.plan.leave = turn + timeToCover(-d, b.v, vt, app.along, c.x * N.x + c.y * N.y, 240, driveCurveFor(ww.kt, ta, vt)); }
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
        { const vt = targetFor(b, twaD); ai.plan.tReach = turn + timeToCover(-d - inTurn, b.v, vt, app.along, cN, 240, driveCurveFor(ww.kt, twaD, vt)); }
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
        const drift = (c.x * N.x + c.y * N.y) * tl * ai.kn.currentShare, atGun = d + drift + Math.max(0, ai.plan.coast); // coasting away from the line is no safety margin
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
      // haven't started yet: cross the line between its ends, straight ahead (not back to the spot she'd planned on).
      // But on the course side of it without having started (come round outside an end, above an extension of the line,
      // or drifted over doing her turns at the gun), she isn't started until she has crossed it from the pre-start side
      // (Definitions, Start): back below it first, her whole hull, bow and stern, then up across it. Latched until then,
      // so she doesn't turn back up the moment her middle is below with her stern still over; and set again whenever
      // she's over (round outside an end a second time). (Aiming above the line from above, she wandered there for
      // minutes.) Crew Controls' whole-hull latch and Crew Figures' re-arming, together.
      const half = w.lineLen / 2 - 12, a = clamp(w.lineA(b), -half, half);
      if (w.lineD(bow(b)) > 0) ai.below = true; else if (Math.max(w.lineD(bow(b)), w.lineD(stern(b))) < -2) ai.below = false;
      const off = ai.below ? -18 : 10;
      P = { x: w.center.x + N.x * off + L.x * a, y: w.center.y + N.y * off + L.y * a }; void along;
    }
    else {
      P = aimPoint(w, b);
      // just rounded an island: carry on round it the same way, with the same berth, until she's clear of it and its lee
      const prev = b.leg > 0 && b.leg <= w.C.marks.length ? w.C.marks[b.leg - 1] : null;
      if (prev?.reach && dist(b, prev.p) < 900) P = aroundIsland(prev, b, P, w.wind.from, true);
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
    aim = P;
    const bP = brg(P.x - b.x, P.y - b.y);
    // a tack (or gybe) she's decided on she carries out, as a sailor does: round onto the new tack's close-hauled (or
    // running) course, deciding nothing else until she's there (re-deciding each moment, mid-tack, she'd stall head to
    // wind or wheel round and run off). Dropped once she's round, if it hasn't happened in 20 s (something stopped her),
    // or if she's on another leg or point of sail than the one she decided it for.
    // (upwind or not, with some hysteresis as for running below: decided afresh each time she thought, her aim point on
    // the 44° line flipped her between beating and reaching every half second, 10 to 16 times a race, the wind's own
    // short swing of 2–3° carrying it back and forth. The 4° between in and out is a little more than that swing. Each
    // leg decides afresh: carried over a rounding, a close reach at 44–48° would have been sailed as a beat)
    if (ai.upwindLeg !== b.leg) { ai.upwind = undefined; ai.upwindLeg = b.leg; }
    const rel = Math.abs(wrap(ww.from - bP)), ra = runAngle(ww.kt);
    const upwind = (ai.upwind = ai.upwind ? rel < 48 : rel < 44) && !b.ocs;
    // the course she'd steer to make good the straight line to it, up-current of it by as much as the current across
    // her track would set her down (a crew that reckons with the current allows for all of it, the others for some)
    const crab = crabFor(bP, targetFor(b, rel) * 0.9, { x: c.x * ai.kn.currentShare, y: c.y * ai.kn.currentShare });
    // (running for a mark deeper than her best downwind angle, with some hysteresis so she doesn't flip between sailing
    // the angle and steering at the mark as the wind swings about it. By the course she'd steer, not the bearing: a
    // current across a broad reach can put that course past dead downwind, and the run's held gybe then decides the
    // gybe, once; steered as a reach she gybed back and forth across it every few seconds: physics review)
    const relC = Math.abs(wrap(ww.from - crab));
    ai.running = b.started && !b.ocs && (ai.running ? relC > ra - 8 : relC > ra - 2);
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
          headedNow = b.tack === 'S' ? dev < -ai.kn.headerDeg : dev > ai.kn.headerDeg;
          ai.headedT = headedNow ? (ai.headedT ?? 0) + dt : 0;
          const headed = ai.headedT > ai.kn.headerHoldS;
          const u = V(w.C.base), sv = { x: u.y, y: -u.x };
          const lat = (b.x - P.x) * sv.x + (b.y - P.y) * sv.y;
          const width = ai.width * Math.min(1, Math.hypot(d.x, d.y) / 500) + 25;
          if (headed && w.rng() < dt * ai.kn.headerTackRate) doTack = true; // tack on headers
          else if ((ai.dirtyT ?? 0) > ai.kn.dirtyAirS && w.t - b.lastTackT > 15) doTack = true; // stuck in another boat's dirty air: tack for clear air
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
      // Clear air downwind: with the wind astern a boat's sails throw a long, deep shadow downwind, and boats running
      // together sat in each other's for many minutes at a third of the wind (the AI looked for clear air only on a
      // beat). A sailor heads up out of it, onto a broad reach, and if that doesn't clear her, gybes away.
      // (Not by heading up while a boat on the same tack is to windward of her within two lengths: that boat is very
      // likely the one blanketing her, and heading up luffs it, above her proper course (the course she'd sail without
      // it) where rule 17 forbids that to a boat that came up from clear astern. Then she gybes away instead.)
      const dirtyRun = (b.shadowK ?? 1) / (b.leeK ?? 1) < DIRTY_RUN_K;
      ai.dirtyRunT = dirtyRun ? (ai.dirtyRunT ?? 0) + dt : Math.max(0, (ai.dirtyRunT ?? 0) - dt * 2);
      const other = b.tack === 'S' ? 'P' : 'S', otherH = other === 'S' ? rS : rP;
      const gybeAway = () => { if (w.t - b.lastTackT > 20 && !blocked(w, b, otherH, 60)) { ai.goTack = { to: other, at: w.t, mode, leg: b.leg }; desired = otherH; ai.dirtyRunT = 0; ai.dirtyRunUntil = undefined; } };
      if (!ai.goTack && (ai.dirtyRunT ?? 0) > ai.kn.dirtyAirS) {
        const windward = w.boats.some(o => o !== b && !o.finished && o.tack === b.tack && dist(o, b) < 2 * LOA && w.rights(b, o).rule === '11' && w.rights(b, o).kc === o);
        if (windward) gybeAway();
        else if ((ai.dirtyRunT ?? 0) > ai.kn.dirtyAirS * 3) gybeAway();
        else ai.dirtyRunUntil = w.t + DIRTY_RUN_HOLD;
      }
      if (!ai.goTack && ai.dirtyRunUntil != null) {
        if (w.t > ai.dirtyRunUntil) ai.dirtyRunUntil = undefined;
        else {
          const twa = b.poleWant ? Math.max(DIRTY_RUN_POLED_TWA, ra - DIRTY_RUN_UP) : ra - DIRTY_RUN_UP;
          desired = b.tack === 'S' ? n360(ww.from - twa) : n360(ww.from + twa); // (heading up: on starboard, to starboard)
        }
      }
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
      // others for some); but never deeper than her best running angle. With the mark across on the other gybe's side
      // (just short of a run, where the run's held gybe has let go of her as the mark's angle dipped under it), she
      // gybes for it: held on this gybe at its running angle she sailed on away from the mark, a minute and a half and
      // 30° of overstand in a 12 kt race (physics review)
      desired = sailable(b, crab);
      const sd = wrap(ww.from - desired);
      if (Math.abs(sd) > ra) desired = n360(ww.from - Math.sign(sd || 1) * ra);
    }
    if (!headedNow) ai.headedT = 0;
  }
  // keep off the shore (and off the line mid-race)
  let holdForHail = false; let tackNow = false;
  // (steering for a point close ahead, a rounding mark's, the shore only matters as far as that point and room to turn
  // there: rounding the Fort Mason mark off the pier's end, land 30 m beyond her aim point turned her back upwind every
  // other moment, and she sailed on into the mark between turns. Off her aim, on a beat, she looks the full 45 m)
  const look = aim && Math.abs(wrap(desired - brg(aim.x - b.x, aim.y - b.y))) < 30 ? Math.min(45, dist(b, aim) + SHORE_TURN) : 45;
  if (blocked(w, b, desired, look)) {
    // Pinned by a boat to windward that she'd hit if she tacked? Hail for room to tack (Rule 20) as soon as she may
    // (close enough to the obstruction that she'll soon have to change course substantially: rule 20.1(a)), and hold on
    // while the other boat responds. If the island-mark rule forbids the hail (the other boat is fetching it), she bears
    // away round it rather than tack into that boat. (Close-hauled is how she's sailing now, whatever she's aiming for.)
    const closeHauled = b.twa <= beatFor(b) + 8 && !b.tacking;
    const pinned = closeHauled ? w.tackBlocker(b) : null, may = pinned ? w.roomBlocker(b) : null;
    if (may && w.t - ai.lastHail > 40) { w.hail(b, may, 'room'); ai.lastHail = w.t; }
    // (her hail passed on to a boat beyond (Rule 20.3): that one has 5 s to respond and the boat she hailed then has 5 s
    // more, so she holds on while the chain answers; if it never does, the boat she hailed can't tack, nor can she)
    const chain = pinned ? w.pairRecord(b, pinned)?.hail : null, relay = chain?.kind === 'room' && chain.by === b.id && chain.passedOn && chain.clearAt == null ? chain.passedOn : null; // (until the boat she hailed is through the wind: respondedAt is only her starting to tack)
    const waiting = pinned && (relay ? !relay.failed : may ? w.t - ai.lastHail < HAIL_RESPONSE + 1 : obstructionAhead(b, b.h, b.tack, 45) !== null && !w.roomBlockedByMark(b));
    // pinned, but bearing away about SUBSTANTIAL_TURN clears it (so she may not hail: rule 20.1(a)): she bears away round
    // it, rather than tack into the boat to windward (rule 13)
    const bearAway = pinned && !may && !relay && obstructionAhead(b, b.h, b.tack, 45) === null
      ? [8, 12, 16, 22, 30].map(k => n360(b.h + (b.tack === 'S' ? -k : k))).find(h => !blocked(w, b, h, 45)) : undefined;
    if (waiting && !blocked(w, b, desired, 12)) holdForHail = true;
    else if (bearAway != null) desired = bearAway;
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
  const boatHailOn = !!bh && !!bhC && w.t - bh.at < BOAT_HAIL_HOLD && (b.headToWindT ?? -Infinity) < bh.at && bhHail?.kind === 'room' && bhHail.by === b.id
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
  // mustn't close it further.) Anywhere on the course, not just at the start, and Rule 15 with it: a boat that has
  // just got right of way by her own action must at first give the other boat room to keep clear. (She needn't sail
  // away: holding her course gives the room. Two boats running side by side zigzagged together and touched: the one
  // keeping clear gybed away, became the leeward boat on the same tack, and at once steered back toward the boat that
  // now had to keep clear of her.) Not while she sails within the mark-room she's entitled to: rounding is her room
  // (Rule 21: exonerated for 15 and 16 there).
  for (const { o, dx, dy, r, cp } of near) {
    if (r.mr && !r.mr.ended && (r.mr.inside === b.id || r.mr.ahead === b.id)) continue;
    if (r.kc !== o || Math.abs(wrap(desired - b.h)) <= 8 || dx * dx + dy * dy > 900 || cp.t >= 10) continue;
    const ROOM = 8, need = Math.min(ROOM, clearanceOn(w, b, b.h, o));
    if (clearanceOn(w, b, desired, o) >= need) continue;
    const sweep = wrap(desired - b.h), n = Math.ceil(Math.abs(sweep) / 5);
    let ok = b.h;
    for (let i = 1; i <= n; i++) { const h = sailable(b, b.h + sweep * i / n); if (clearanceOn(w, b, h, o) < need) break; ok = h; }
    desired = ok;
  }
  // Then what she must keep clear of, which comes before any right of way she holds over a third boat (Rule 14 too).
  let avoiding = false;
  const course = desired; // (where she'd steer with no boat to keep clear of)
  // (her turn answers the helm over a moment, physics.ts yawLag, in which she covers the same ground at any speed, the
  // time growing as the speed falls: v·τ = 1.46 m. She starts her keep-clear moves that much further off; and her Rule
  // 14 move that much sooner, up to a second and a half more, not seconds at a crawl, where she'd be swerving for a boat
  // she needn't)
  const lagT = Math.min(1.5, yawLag(b.v + (b.astern ?? 0))), lagM = (b.v + (b.astern ?? 0)) * yawLag(b.v + (b.astern ?? 0));
  ai.urgent = false;
  for (const { o, dx, dy, r, cp } of near) {
    // keep clear early: slow, heavy boats need time to respond
    // hailed "Starboard!" by this boat: duck early and generously
    const ducking = r.rule === '10' && r.kc === b && w.t < ai.duckUntil;
    if (ducking && cp.t < 16 && cp.d < 22 + lagM) { desired = sailable(b, b.h + (b.tack === 'P' ? 45 : -45)); if (o.id !== ai.hailTack?.with) avoiding = true; continue; }
    // (the boat she has hailed about, while that hail is answered and there's still time: she holds on, to tack)
    if (boatHailOn && o.id === bh!.c && cp.t > BOAT_HAIL_MARGIN) continue;
    // (and, overlapped to windward, closing on her with less than that room already, however slowly: converging side
    // by side at a few cm a second, the closest approach lies beyond the 12 s she looks ahead, and she'd drift on into
    // her. Not end to end, where two boats a length apart have little water between bow and stern but plenty of time)
    const inside = r.rule === '11' && dx * (o.vx - b.vx) + dy * (o.vy - b.vy) < 0 && hullGap(b, o) < OPEN_GAP;
    if (r.kc === b && (cp.t < ai.kn.keepClearS && cp.d < ai.kn.keepClearM + lagM || inside)) {
      // Already opening, with room between the hulls: she is keeping clear (Definitions, Keep Clear: the other boat can
      // sail her course with no need to act), so she sails on at full speed: on her course if that keeps the room, on
      // her heading if her course would close it again. (Easing and heading up on regardless, a windward boat slowed
      // beside a faster leeward one stayed overlapped, close-hauled at 1.7 kt, for half a minute after the gap had
      // begun to open: the closest approach of boats already parting is the distance between them now, inside the
      // keep-clear distance as long as they're overlapped. No helm sails that way.)
      // (parting, or closing slower than 0.15 m/s, about a quarter of a knot: judged by the rate the gap changes, which is
      // steady for boats sailing side by side, where the time to their closest approach swings about from moment to
      // moment and she'd swap between holding on and turning away)
      const rangeRate = (dx * (o.vx - b.vx) + dy * (o.vy - b.vy)) / Math.max(0.1, Math.hypot(dx, dy));
      if (rangeRate > -0.15 && hullGap(b, o) >= OPEN_GAP) {
        if (clearanceOn(w, b, desired, o) < Math.hypot(dx, dy) - 0.5) desired = sailable(b, b.h);
        if (o.id !== ai.hailTack?.with) avoiding = true;
        continue;
      }
      const away = sailable(b, brg(-dx, -dy)), running = b.twa > 110;
      // (racing called off, the boat she must keep clear of lying to, stopped: she sails round her with way on, as a
      // sailor would, not luffs and eases alongside, where she'd stop and drift down onto her)
      if (w.cancelled && o.v + (o.astern ?? 0) < 0.5) { desired = away; luff = false; }
      else if (r.rule === '10') { desired = sailable(b, b.tack === 'P' ? b.h + 32 : b.h - 32); luff = false; } // keep way on to steer
      else if (r.rule === '11') {
        // head up from her heading, but no more than 35° above her course: turned up afresh from wherever she'd got to
        // each time she thought, she ratcheted on up to close-hauled with her sails eased, and stalled
        const up = b.tack === 'P' ? -1 : 1, cap = n360(course + up * 35), h = n360(b.h + up * 20);
        desired = sailable(b, wrap(h - cap) * up > 0 ? cap : h); luff = !running;
      }
      else if (running) { desired = startArea ? clearestHeading(w, b, b.h) : away; luff = false; } // easing barely slows her on a run: steer round instead
      else { luff = true; desired = away; }
      if (o.id !== ai.hailTack?.with) avoiding = true; // (the boat of the hail: rule 20.2 has their room in hand)
      // and if that still leaves her too close (she keeps clear of every boat she must, not just this one), the
      // heading that opens the most room, nearest what she wanted
      if (startArea && clearanceOn(w, b, desired) < 9) desired = clearestHeading(w, b, desired);
    } else if (r.kc === o && cp.t < 2.4 + lagT && cp.d < 4.5 + 0.5 * lagM) {
      // Rule 14: even a right-of-way boat must avoid contact if she reasonably can
      desired = sailable(b, brg(-dx, -dy)); luff = true; if (o.id !== ai.hailTack?.with) avoiding = true;
      if (cp.t < lagT + 1) ai.urgent = true; // (about to touch: before even finishing a tack, physics.ts midTack)
      if (o.isUser && Math.hypot(dx, dy) < 10) b.forced14 = o.id; // the user made her swerve: that's a foul
    }
  }
  for (const o of w.boats) {
    const h = o !== b ? w.pairRecord(b, o)?.hail : null;
    if (!h || h.kind !== 'room') continue;
    // Hailed for room to tack: respond by tacking as soon as possible (Rule 20.2(c)), unless she replied "You tack".
    // With a boat on the same tack to windward stopping her, she first passes the hail on to it (Rule 20.3; WS Case 113)
    // and holds her course until it responds; then she tacks.
    if (h.by === o.id && h.replyAt == null && (b.headToWindT ?? -Infinity) < h.at && !b.tacking) { // (rule 20.2(c): she answers by tacking; a gybe isn't an answer)
      if (!h.passedOn) w.passOnHail(b, o);
      const po = h.passedOn, waiting = !!po && po.respondedAt == null && !po.failed;
      if (po?.failed) continue; // the boat she hailed never responded: she still can't tack into her
      if (!waiting) { desired = b.tack === 'S' ? csP : csS; luff = false; tackNow = true; ai.hailTack ??= { to: b.tack === 'S' ? 'P' : 'S', at: w.t, with: o.id }; }
      else holdForHail = true;
    }
    // She hailed and the other boat responded (is through the wind, or replied "You tack"): tack now (Rule 20.2(d)).
    if (h.by === b.id && h.clearAt != null && (b.headToWindT ?? -Infinity) < h.at && !b.tacking) { desired = b.tack === 'S' ? csP : csS; luff = false; holdForHail = false; tackNow = true; ai.hailTack ??= { to: b.tack === 'S' ? 'P' : 'S', at: w.t, with: o.id }; }
  }
  // a tack begun for a hail is finished: past head to wind (where the hail no longer asks it of her) she carries on
  // until she's close-hauled on the new tack (unless she has a boat to keep clear of: rule 13 makes her the keep-clear
  // boat from head to wind until she's close-hauled)
  const ht = ai.hailTack;
  if (ht && ((b.tack === ht.to && !b.tacking) || w.t - ht.at > 30)) ai.hailTack = null;
  else if (ht && !tackNow && !holdForHail && !avoiding) { desired = ht.to === 'P' ? csP : csS; luff = false; tackNow = true; }
  if (holdForHail) desired = b.tack === 'S' ? csS : csP;
  ai.tackNow = tackNow && !holdForHail;
  desired = sailable(b, avoidMarks(w, b, desired));
  // the courses above are her track's through the water (the beat angle, the laylines, the crab): her heading is above
  // each by the leeway she makes there (physics.ts b.leeway), as a sailor steers a little higher to make good her course
  const lw = b.leeway ?? 0, r = wrap(ww.from - desired);
  if (lw > 0 && Math.abs(r) > lw + 1 && Math.abs(r) < 150) desired = n360(desired + Math.sign(r) * lw);
  b.desired = desired; b.luff = luff;
}

/**
 * The crew's call on the whisker pole: out for wing-on-wing when running deep, in before the next rounding mark, for
 * penalty turns, or once she comes up toward a reach. Poled out beats the jib to leeward from 154.5° true at every wind
 * speed (polar.ts); set at 157°, stowed at 150°: each set or stow leaves the jib dead for 10–25 s, by the crew, plus the
 * trip forward (physics.ts POLE, the owner's timings), so the gap keeps them
 * from doing it over and over as she wanders about a deep run. The AI boats' crews only: never inside a harbor's basin.
 * Yours never sets it on their own (the owner: "pole-out should only ever be on my command"): poleMustCome.
 */
export function crewPoleCall(w: World, b: Boat): void {
  const nm = w.nextMark(b), nearMark = !!nm && nm.type === 'round' && markDist(b, nm) < 45;
  // a seasoned forward hand goes up to the mast before the bear-away at a mark when the next leg is a run, so the pole
  // goes on as soon as she's down (the owner: from the foredeck, "already pre-positioned (which a seasoned crew member
  // knows to do)", 10 s against 20 from the cockpit). Only in the last seconds before the bear-away (about 8 s out at
  // her speed: off the rail any sooner costs her on the beat, and a tack with someone at the mast is slow), and not while
  // she needs their weight hiking; not alone, not through a tack, and not where you've put them. Renewed while it holds,
  // and held 10 s past (the leg moves on mid-rounding; she's still bearing away), then it lapses by itself. (An estimate
  // of practice; the 0.7: "seasoned", above a club crew.)
  const c = b.crew, fwd = c && c.spec.crew.length ? c.spec.crew[c.spec.crew.length - 1] : null;
  const nextDeep = !!nm && nm.type === 'round' && Math.abs(wrap(b.ww.from - brg(nm.next.x - nm.p.x, nm.next.y - nm.p.y) - 180)) < 30;
  // (once a prep has lapsed unused, she wasn't bearing away yet: short of the mark she needs them on the rail again, and
  // they don't turn back for the mast the moment they've left it; not again for 15 s, an estimate)
  const lapsed = b.polePrepUntil != null && (c?.clock ?? 0) > b.polePrepUntil && (c?.clock ?? 0) - b.polePrepUntil < 15;
  if (!!fwd && c!.place?.across == null && attrOf(fwd, 'handling') >= 0.7 && nextDeep && markDist(b, nm!) < Math.max(12, 8 * b.v)
    && (c!.hike ?? 0) < 0.3 && !lapsed && !b.tacking && w.t >= 0 && !b.docked && b.penalty <= 0) b.polePrepUntil = (c!.clock ?? 0) + 10;
  const twa = b.twa, jibDown = !!b.rig && (b.rig.jib < 1 || !b.rig.jibUp); // (the pole goes out on the jib)
  // (and a crew commits: they call it once she's settled deep, a few seconds past 157°, not on every wander of the course;
  // once it's called they see it through unless she comes up toward a reach (140°), and stow it after a few seconds
  // above 150°: the set costs them 20–40 s of the jib, the trip forward included, so a false start is dear. Estimates.)
  const busy = b.poleWant || b.pole !== 'down';
  b.poleDeepT = twa > 157 ? (b.poleDeepT ?? w.t) : undefined;
  b.poleHighT = twa < 150 ? (b.poleHighT ?? w.t) : undefined;
  const high = twa < 140 || (b.poleHighT != null && w.t - b.poleHighT >= 3);
  if (w.t < 0 || nearMark || jibDown || b.docked || b.penalty > 0 || (busy ? high : twa < 150) || inBasin(b)) b.poleWant = false;
  else if (b.poleDeepT != null && w.t - b.poleDeepT >= 4) b.poleWant = true;
}
/**
 * Your boat's pole goes out only on your call (the O key, the band's Pole tab); your crew stows it only when it must come
 * in, and says why: she's come up to where the poled-out jib does nothing at all (145 true and higher: polar.ts
 * jibEfficiency; between there and 154.5 it does less than the jib would to leeward, and that's your call, with the
 * coach's cue), the jib is down, penalty turns, a harbor's basin, or the dock. Null when it may stay out. (Gybing it end
 * for end with her, as she gybes, is still your pole going across.)
 */
export function poleMustCome(b: Boat): string | null {
  if (b.docked) return 'at the dock';
  if (inBasin(b)) return 'not in the harbor: no room to pole out in a marina';
  if (b.penalty > 0) return 'in for the penalty turns';
  if (!!b.rig && (b.rig.jib < 1 || !b.rig.jibUp)) return 'the jib is down';
  if (b.twa <= 145) return 'she\'s too high for it: the poled-out jib is aback';
  return null;
}
