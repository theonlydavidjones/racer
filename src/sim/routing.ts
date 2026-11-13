import { KT, V, brg, cross, dist, dot, sub, unit, wrap, type Vec } from '../core/math';
import { beatAngle, runAngle } from '../boat/polar';
import { beatInChop, speedInChop } from '../boat/seaway';
import { landAlong, onLand, shoreDist, wharfNearest } from '../geo/shore';
import type { Outlook } from './outlook';

/**
 * Sailing a leg on paper, the way a navigator works a plan out before the race: the boat at her polar speeds through
 * the day's wind and current (sim/outlook.ts) as they change along the way and through the time it takes. Upwind and
 * downwind she sails the best VMG angles and tacks or gybes on the layline (allowing for the current, as the laylines
 * on the map do) or off the shore; reaching she steers up-current of the mark to hold a straight line over the ground.
 *
 * A plan is which way to go first: left or right (looking upwind: starboard tack goes left, upwind and downwind), or
 * up the middle, tacking on a line either side of the straight course. Comparing them shows which side of the course
 * the wind and the tide favour, and by how much.
 */

export type Plan = 'left' | 'right' | 'middle';
export type LegKind = 'beat' | 'run' | 'reach';

/** Ways the day might differ from the forecast, for testing a plan: the wind veered (+) or backed (deg), stronger or
 * lighter (factor), early or late (minutes: +20 means what the forecast has at 2 pm comes at 1:40). The tide is
 * astronomical and its predictions hold, so it's left alone. */
export interface Scenario { dFrom: number; kMul: number; early: number }
export const AS_FORECAST: Scenario = { dFrom: 0, kMul: 1, early: 0 };

export interface SailResult {
  ok: boolean;
  minutes: number;
  kind: LegKind;
  /** Track over the ground, one point every 30 s: position and minute (since epoch UTC). */
  path: { p: Vec; t: number }[];
  tacks: number;
  /** Where she tacked or gybed (the points on her track where she turned through the wind), and which. */
  turns: { p: Vec; kind: 'tack' | 'gybe' }[];
  /** Why she didn't get there: she ran ashore (the plan's lanes took her into the land), or ran out of time (`maxMin`). */
  why?: 'land' | 'time';
  /** Average true wind along the way (kt), and the average current along the straight course (kt, + helping). */
  meanKt: number; meanCurAlong: number;
  /** How far she went from the straight course (m): the farthest point left (+) or right (−) of it, looking from start to mark. */
  maxLeft: number; maxRight: number;
  /** Closest she came to land (m, counted up to 600). */
  minShore: number;
}

/**
 * Distance to the nearest land of any kind (m, up to `max`): the Cityfront's hand-drawn shore (geo/shore.ts shoreDist
 * measures only that) and the islands and the Marin shore from the terrain's land mask, searched in rings. Remembered
 * on a 25 m grid.
 */
const landCache = new Map<string, number>();
export function landDist(p: Vec, max = 600): number {
  const i = Math.round(p.x / 25), j = Math.round(p.y / 25), k = `${i},${j}`;
  let v = landCache.get(k);
  if (v == null) {
    const q = { x: i * 25, y: j * 25 };
    v = onLand(q) ? 0 : Math.min(shoreDist(q), 600);
    for (const r of [25, 50, 75, 100, 150, 200, 250, 300, 400, 500, 600]) {
      if (r >= v) break;
      const n = Math.max(12, Math.round(r / 12));
      let hit = false;
      for (let a = 0; a < n && !hit; a++) { const t = 2 * Math.PI * a / n; hit = onLand({ x: q.x + Math.sin(t) * r, y: q.y + Math.cos(t) * r }); }
      if (hit) { v = r; break; }
    }
    if (landCache.size > 300000) landCache.clear();
    landCache.set(k, v);
  }
  return Math.min(v, max);
}

/** Target speed in chop (boat/seaway.ts), remembered: it's solved by iteration and asked for thousands of times. */
const speeds = new Map<string, number>();
function chopSpeed(kt: number, twa: number, hs: number, tp: number): number {
  const k = `${Math.round(kt * 10)},${Math.round(twa * 2)},${Math.round(hs * 50)},${Math.round(tp * 5)}`;
  let v = speeds.get(k);
  if (v == null) { v = speedInChop(Math.round(kt * 10) / 10, Math.round(twa * 2) / 2, Math.round(hs * 50) / 50, Math.round(tp * 5) / 5); if (speeds.size > 100000) speeds.clear(); speeds.set(k, v); }
  return v;
}

/** Seconds lost in a tack or gybe (the committee's course table uses the same: courses/committee.ts). */
export const MANOEUVRE_S = 8;
const DT = 10;

/** The wind on the water under a scenario. */
function windFor(o: Outlook, p: Vec, t: number, sc: Scenario): { kt: number; from: number } {
  const w = o.wind(p, t + sc.early), c = o.current(p, t);
  // wind felt on the water: the air's motion minus the water's (environment/current.ts windOnWater)
  const a = V(w.from + sc.dFrom), kt = w.kt * sc.kMul;
  const wx = -a.x * kt - c.x / KT, wy = -a.y * kt - c.y / KT;
  return { kt: Math.hypot(wx, wy), from: brg(-wx, -wy) };
}

/** Heading that makes good a straight line toward `to` across the current, at speed v (m/s). */
function crabTo(u: Vec, c: Vec, v: number): number {
  const s = Math.max(-0.95, Math.min(0.95, cross(u, c) / Math.max(0.2, v)));
  return brg(u.x, u.y) + Math.asin(s) * 180 / Math.PI;
}

/**
 * Sail from a to b starting at minute t0, by a plan. `arrive`: how close counts as there (m; an island mark's
 * rounding distance). Gives up after `maxMin` minutes (a leg she can't sail: becalmed against the tide).
 */
export function sailLeg(o: Outlook, a: Vec, b: Vec, t0: number, plan: Plan, sc: Scenario = AS_FORECAST, arrive = 30, maxMin = 240): SailResult {
  const legU = unit(sub(b, a)), legLen = dist(a, b), lim = Math.max(120, 0.12 * legLen);
  let p = { ...a }, t = t0, tacks = 0, steps = 0;
  const turns: SailResult['turns'] = [];
  let turnedNow = false, lastTurnT = -Infinity, forced: LegKind | null = null;
  /** A tack or a gybe here: where, on the drawn track, and the time it costs (she's stopped in it, drifting). */
  const turn = (kind: 'tack' | 'gybe', c: Vec) => {
    tacks++; turns.push({ p: { ...p }, kind }); turnedNow = true; lastTurnT = t;
    const lp = path[path.length - 1]; if (lp.p.x !== p.x || lp.p.y !== p.y) path.push({ p: { ...p }, t });
    t += MANOEUVRE_S / 60; p = { x: p.x + c.x * MANOEUVRE_S, y: p.y + c.y * MANOEUVRE_S };
  };
  const path = [{ p: { ...p }, t }];
  let sumKt = 0, sumCur = 0, n = 0, maxLeft = 0, maxRight = 0, minShore = Infinity;
  const w0 = windFor(o, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, t0, sc), off0 = Math.abs(wrap(brg(legU.x, legU.y) - w0.from));
  const kind: LegKind = off0 < beatAngle(w0.kt) + 3 ? 'beat' : off0 > runAngle(w0.kt) - 3 ? 'run' : 'reach';
  // starboard tack goes left looking upwind, upwind and down; the middle starts on the tack nearer the straight course
  let tack: 'S' | 'P' = plan === 'left' ? 'S' : plan === 'right' ? 'P' : 'S';
  if (plan === 'middle') {
    const ang = kind === 'run' ? runAngle(w0.kt) : beatAngle(w0.kt), bb = brg(legU.x, legU.y);
    tack = Math.abs(wrap(bb - (w0.from - ang))) <= Math.abs(wrap(bb - (w0.from + ang))) ? 'S' : 'P';
  }
  let mode: LegKind | null = null, side = 0; // (side: which side of the wind her heading is on, + starboard)
  const maxSteps = maxMin * 60 / DT;
  while (dist(p, b) > arrive && steps < maxSteps) {
    steps++;
    const sd = landDist(p);
    const w = windFor(o, p, t, sc), c = o.current(p, t), toB = sub(b, p), u = unit(toB), bb = brg(u.x, u.y);
    // upwind in chop she sails a little wider and slower, as the boat and the laylines do (boat/seaway.ts)
    const ch = o.chop(p, t), sp = (twa: number) => chopSpeed(w.kt, twa, ch.hs, ch.tp);
    const off = Math.abs(wrap(bb - w.from)), beat = ch.hs < 0.02 ? beatAngle(w.kt) : beatInChop(w.kt, ch.hs, ch.tp), run = runAngle(w.kt);
    // what kind of sailing it is now (with a little hysteresis, so she doesn't flicker between beating and reaching)
    mode = off < beat - (mode === 'beat' ? -4 : 0) ? 'beat' : off > run + (mode === 'run' ? -4 : 0) ? 'run' : 'reach';
    // a reach she can't hold: crabbing into the current to make the line good over the ground would put her above
    // close-hauled (a cross-tide setting her to leeward on a fetch), or deeper than her run: then it's a beat (or a run),
    // tacked (or gybed) on the layline the current makes
    // (with a band, as above: once made a beat, it stays one until the crab heading's 4° freer than the beat angle)
    if (mode === 'reach') {
      const hc = crabTo(u, c, sp(off)), tc = Math.abs(wrap(hc - w.from));
      const next: LegKind | null = tc < beat + (forced === 'beat' ? 4 : 0) ? 'beat' : tc > run - (forced === 'run' ? 4 : 0) ? 'run' : null;
      if (next) {
        // coming to it from the reach, she's on the tack she was reaching on (starboard: the wind on her starboard side)
        if (forced !== next) tack = wrap(hc - w.from) < 0 ? 'S' : 'P';
        mode = next;
      }
      forced = next;
    } else forced = null;
    let h: number, v: number;
    if (mode === 'reach') {
      v = sp(off); h = crabTo(u, c, v);
      const twa = Math.abs(wrap(h - w.from)); v = sp(Math.max(beat, Math.min(run, twa)));
    } else {
      const ang = mode === 'beat' ? beat : run, vb = sp(ang), sgn = mode === 'beat' ? -1 : 1;
      const hd = (T: 'S' | 'P') => w.from + (T === 'S' ? -ang : ang);
      const gnd = (T: 'S' | 'P') => { const d = V(hd(T)); return { x: d.x * vb + c.x, y: d.y * vb + c.y }; };
      // can she lay the mark on this tack (her track over the ground, current and all, reaches it)?
      /** how far the mark is inside tack T's track over the ground, seen from q (deg: 0 on the layline, + she lays it) */
      const inside = (T: 'S' | 'P', q: Vec) => { const g = gnd(T), d = sub(b, q); return wrap(brg(d.x, d.y) - brg(g.x, g.y)) * (T === 'S' ? sgn : -sgn); };
      const lays = (T: 'S' | 'P') => { const r = inside(T, p); return r >= 0 && r < 90; };
      /** if she'll cross the other tack's layline within this step, sail on just to it (so she tacks on it, not up to a
       * step past it and overstanding the mark) and say so */
      const onTo = () => {
        const o2 = tack === 'S' ? 'P' : 'S', g = gnd(tack), q = { x: p.x + g.x * DT, y: p.y + g.y * DT }, r0 = inside(o2, p), r1 = inside(o2, q);
        if (!(r0 < 0 && r1 >= 0 && r1 < 90)) return false;
        const f = -r0 / (r1 - r0); p = { x: p.x + g.x * DT * f, y: p.y + g.y * DT * f }; t += DT * f / 60; return true;
      };
      const near = dist(p, b) < 400;
      // the room ahead on a tack: how close to the land she'd be in a minute and a half (m, up to 600)
      const room = (T: 'S' | 'P') => { const g = gnd(T); return landDist({ x: p.x + g.x * 90, y: p.y + g.y * 90 }); };
      const other = tack === 'S' ? 'P' : 'S';
      let flip = false;
      if (lays(tack)) { /* hold on and steer for the mark */ }
      else if (lays(other)) flip = true;
      else if (onTo()) flip = true; // (she'd cross the other tack's layline in this step: on to it, and tack there)
      // closing the shore: tack (or gybe) off it toward the side with more room, as a skipper does before the shallows
      else if (!near && sd < 400 && room(tack) < 80 && room(other) > room(tack) + 40 && t - lastTurnT > 1) flip = true; // (a minute on a board at least)
      else if (plan === 'middle') {
        const xt = cross(legU, sub(p, a)); // + left of the straight course
        if (((tack === 'S' && xt > lim) || (tack === 'P' && xt < -lim)) && t - lastTurnT > 0.5) flip = true; // (half a minute on a board at least)
      }
      if (flip) { tack = tack === 'S' ? 'P' : 'S'; turn(mode === 'run' ? 'gybe' : 'tack', c); }
      h = hd(tack); v = vb;
      if (lays(tack)) { // steering for the mark: no closer to the wind than the beat angle, no deeper than the run angle
        const hm = crabTo(u, c, vb), twa = Math.abs(wrap(hm - w.from));
        if (mode === 'beat' ? twa >= beat : twa <= run) { h = hm; v = sp(twa); }
      }
    }
    // her heading across the wind from the last step's however she came to it (a reach turned beat, a beat's last board
    // laid for the mark): that's a tack or a gybe too, and costs the same
    // (within 15° of dead downwind she sails a little by the lee rather than gybe: a crossing there isn't counted, and her
    // own gybes, on the layline or the lane's edge, are counted where she makes them)
    { const r = wrap(h - w.from), sd2 = Math.abs(r) < 165 ? Math.sign(r) : 0; if (side && sd2 && sd2 !== side && !turnedNow) turn(Math.abs(r) < 90 ? 'tack' : 'gybe', c); if (sd2) side = sd2; turnedNow = false; }
    const d = V(h);
    p = { x: p.x + (d.x * v + c.x) * DT, y: p.y + (d.y * v + c.y) * DT };
    t += DT / 60;
    if (onLand(p) && dist(p, b) > 400) return result(false, 'land');
    const xt = cross(legU, sub(p, a));
    maxLeft = Math.max(maxLeft, xt); maxRight = Math.max(maxRight, -xt);
    minShore = Math.min(minShore, sd);
    sumKt += o.wind(p, t + sc.early).kt * sc.kMul; sumCur += dot(c, legU) / KT; n++;
    if (steps % 3 === 0) path.push({ p: { ...p }, t });
  }
  path.push({ p: { ...p }, t });
  const there = dist(p, b) <= arrive;
  return result(there, there ? undefined : 'time');

  function result(ok: boolean, why?: 'land' | 'time'): SailResult {
    return { ok, why, minutes: t - t0, kind, path, tacks, turns, meanKt: n ? sumKt / n : 0, meanCurAlong: n ? sumCur / n : 0, maxLeft, maxRight, minShore };
  }
}

/**
 * The laylines to a mark at minute t over the ground, as sailLeg sails them: the beat's (or the run's) angle and speed
 * in the wind on the water and the chop there, with the current there added, each tack's track over the ground as a
 * unit vector (starboard first). A boat on one of these tracks lays the mark; a foul or fair current makes them
 * lopsided about the wind.
 */
export function groundLaylines(o: Outlook, b: Vec, t: number, kind: 'beat' | 'run', sc: Scenario = AS_FORECAST): [Vec, Vec] {
  const w = windFor(o, b, t, sc), c = o.current(b, t), ch = o.chop(b, t);
  const ang = kind === 'beat' ? (ch.hs < 0.02 ? beatAngle(w.kt) : beatInChop(w.kt, ch.hs, ch.tp)) : runAngle(w.kt), vb = chopSpeed(w.kt, ang, ch.hs, ch.tp);
  const g = (h: number) => { const d = V(h); return unit({ x: d.x * vb + c.x, y: d.y * vb + c.y }); };
  return [g(w.from - ang), g(w.from + ang)];
}

/** All three plans for a leg (a reach has just the one way: straight there). */
export function comparePlans(o: Outlook, a: Vec, b: Vec, t0: number, sc: Scenario = AS_FORECAST, arrive = 30): Record<Plan, SailResult> {
  const mid = sailLeg(o, a, b, t0, 'middle', sc, arrive);
  if (mid.kind === 'reach') return { left: mid, right: mid, middle: mid };
  return { left: sailLeg(o, a, b, t0, 'left', sc, arrive), right: sailLeg(o, a, b, t0, 'right', sc, arrive), middle: mid };
}

/** The fastest of the plans that get there. */
export function bestPlan(r: Record<Plan, SailResult>): Plan {
  const ok = (['left', 'middle', 'right'] as Plan[]).filter(k => r[k].ok);
  return ok.length ? ok.reduce((a, k) => (r[k].minutes < r[a].minutes ? k : a)) : 'middle';
}

/**
 * A way round the land from a to b for a cruise, as you'd draw it on the chart: the straight line if it keeps `clear`
 * metres off the land, or else the shortest way through the water on a 50 m grid (10 m by the Wharf; A*), pulled straight between the
 * turns. Near either end (a slip, a cove) it may come closer, as it has to.
 */
export function routeAround(a: Vec, b: Vec, clear = 120): Vec[] {
  const nearEnd = (q: Vec) => dist(q, a) < 400 || dist(q, b) < 400;
  const blocked = (q: Vec) => {
    if (onLand(q)) return true;
    if (nearEnd(q)) return false;
    for (let k = 0; k < 8; k++) { const t = k * Math.PI / 4; if (onLand({ x: q.x + Math.sin(t) * clear, y: q.y + Math.cos(t) * clear })) return true; }
    return false;
  };
  // (the Wharf's piers, breakwaters and docks are 1–10 m wide, the Marina's jetty 17 m: sampling would step over them, so
  // the line itself is tested exactly)
  const visible = (p: Vec, q: Vec) => { if (landAlong(p, q) < Infinity) return false; const n = Math.max(2, Math.ceil(dist(p, q) / 40)); for (let k = 1; k < n; k++) if (blocked({ x: p.x + (q.x - p.x) * k / n, y: p.y + (q.y - p.y) * k / n })) return false; return true; };
  if (visible(a, b)) return [a, b];
  // Near the Wharf the fairways between piers and docks are 20–30 m wide: first find the way out on a 10 m grid (the
  // nearest water clear of them), then the rest of the way on the usual 50 m grid.
  const ea = wharfNearest(a, 150) ? escapeWharf(a) : [a];
  const eb = wharfNearest(b, 150) ? escapeWharf(b).reverse() : [b];
  const A = ea[ea.length - 1], B = eb[0];
  const near2 = (q: Vec) => dist(q, A) < 400 || dist(q, B) < 400 || nearEnd(q);
  const blocked2 = (q: Vec) => {
    if (onLand(q)) return true;
    if (near2(q)) return false;
    for (let k = 0; k < 8; k++) { const t = k * Math.PI / 4; if (onLand({ x: q.x + Math.sin(t) * clear, y: q.y + Math.cos(t) * clear })) return true; }
    return false;
  };
  // (each step between cells tested exactly too: a 50 m step can cross the Marina's 17 m jetty, or a pier)
  const mid = gridPath(A, B, 50, 2500, blocked2, (p, q) => landAlong(p, q) === Infinity);
  if (!mid) return [a, b]; // (nowhere to go by water: the land closes it off)
  const pts = [...ea, ...mid.slice(1, -1), ...eb];
  // pull it straight: from each turn, on to the farthest point in clear sight
  const out = [a];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !visible(pts[i], pts[j])) j--;
    out.push(pts[j]); i = j;
  }
  return out;
}

/**
 * The shortest way through the water from a to b on a grid of `cell` metres reaching `pad` metres beyond them (A*,
 * eight neighbours, no cutting a corner of the land), with a and b themselves as its ends; null if there's none.
 * With `isGoal`, it stops at the first cell that passes (b then only steers the search).
 */
function gridPath(a: Vec, b: Vec, cell: number, pad: number, blocked: (q: Vec) => boolean, edgeOk: (p: Vec, q: Vec) => boolean,
  isGoal?: (q: Vec) => boolean, lean = 1): Vec[] | null {
  const x0 = Math.min(a.x, b.x) - pad, y0 = Math.min(a.y, b.y) - pad;
  const nx = Math.ceil((Math.abs(a.x - b.x) + 2 * pad) / cell) + 1, ny = Math.ceil((Math.abs(a.y - b.y) + 2 * pad) / cell) + 1;
  const at = (i: number, j: number): Vec => ({ x: x0 + i * cell, y: y0 + j * cell });
  const idx = (q: Vec) => Math.round((q.y - y0) / cell) * nx + Math.round((q.x - x0) / cell);
  const block = new Int8Array(nx * ny).fill(-1); // -1 not yet worked out
  const isBlocked = (k: number) => { if (block[k] < 0) block[k] = blocked(at(k % nx, Math.floor(k / nx))) ? 1 : 0; return block[k] === 1; };
  const start = idx(a), goal = isGoal ? -1 : idx(b), gs = new Float64Array(nx * ny).fill(Infinity), from = new Int32Array(nx * ny).fill(-1);
  const h = (k: number) => lean * dist(at(k % nx, Math.floor(k / nx)), b);
  // a binary heap of [f, k]
  const heap: [number, number][] = [];
  const push = (e: [number, number]) => { heap.push(e); let c = heap.length - 1; while (c > 0) { const pa = (c - 1) >> 1; if (heap[pa][0] <= heap[c][0]) break; [heap[pa], heap[c]] = [heap[c], heap[pa]]; c = pa; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  gs[start] = 0; push([h(start), start]);
  let end = -1;
  while (heap.length) {
    const [f, k] = pop();
    if (f > gs[k] + h(k) + 1e-6) continue; // (a stale entry)
    const i = k % nx, j = Math.floor(k / nx);
    if (k === goal || (isGoal && k !== start && isGoal(at(i, j)))) { end = k; break; }
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const kk = jj * nx + ii; if (kk !== goal && isBlocked(kk)) continue;
      if (di && dj && (isBlocked(j * nx + ii) || isBlocked(jj * nx + i))) continue; // no cutting a corner of the land
      const g = gs[k] + cell * Math.hypot(di, dj);
      if (g >= gs[kk]) continue;
      if (!edgeOk(k === start ? a : at(i, j), kk === goal ? b : at(ii, jj))) continue; // nor through a pier or a dock
      gs[kk] = g; from[kk] = k; push([g + h(kk), kk]);
    }
  }
  if (end < 0) return null;
  const cells: Vec[] = [];
  for (let k = end; k >= 0 && k !== start; k = from[k]) cells.push(at(k % nx, Math.floor(k / nx)));
  const path = [a, ...cells.reverse()];
  if (!isGoal) path[path.length - 1] = b;
  return path;
}

/** From among the Wharf's piers and docks out to the nearest water clear of them (150 m), on a 10 m grid. */
function escapeWharf(p: Vec): Vec[] {
  return gridPath(p, p, 10, 700, onLand, (u, v) => landAlong(u, v) === Infinity, q => wharfNearest(q, 150) === null, 0) ?? [p];
}
