import { KT, V, brg, cross, dist, dot, sub, unit, wrap, type Vec } from '../core/math';
import { beatAngle, runAngle } from '../boat/polar';
import { beatInChop, speedInChop } from '../boat/seaway';
import { onLand, shoreDist, wharfCrossed, wharfNearest } from '../geo/shore';
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
  let mode: LegKind | null = null;
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
    let h: number, v: number;
    if (mode === 'reach') {
      v = sp(off); h = crabTo(u, c, v);
      const twa = Math.abs(wrap(h - w.from)); v = sp(Math.max(beat, Math.min(run, twa)));
    } else {
      const ang = mode === 'beat' ? beat : run, vb = sp(ang), sgn = mode === 'beat' ? -1 : 1;
      const hd = (T: 'S' | 'P') => w.from + (T === 'S' ? -ang : ang);
      const gnd = (T: 'S' | 'P') => { const d = V(hd(T)); return { x: d.x * vb + c.x, y: d.y * vb + c.y }; };
      // can she lay the mark on this tack (her track over the ground, current and all, reaches it)?
      const lays = (T: 'S' | 'P') => { const g = gnd(T), r = wrap(bb - brg(g.x, g.y)) * (T === 'S' ? sgn : -sgn); return r >= 0 && r < 90; };
      const near = dist(p, b) < 400;
      const ahead = (T: 'S' | 'P') => { if (near || sd > 300) return false; const g = gnd(T), q = { x: p.x + g.x * 45, y: p.y + g.y * 45 }; return landDist(q) < 50; };
      let flip = false;
      if (lays(tack)) { /* hold on and steer for the mark */ }
      else if (lays(tack === 'S' ? 'P' : 'S')) flip = true;
      else if (ahead(tack) && !ahead(tack === 'S' ? 'P' : 'S')) flip = true;
      else if (plan === 'middle') {
        const xt = cross(legU, sub(p, a)); // + left of the straight course
        if ((tack === 'S' && xt > lim) || (tack === 'P' && xt < -lim)) flip = true;
      }
      if (flip) { tack = tack === 'S' ? 'P' : 'S'; tacks++; t += MANOEUVRE_S / 60; p = { x: p.x + c.x * MANOEUVRE_S, y: p.y + c.y * MANOEUVRE_S }; }
      h = hd(tack); v = vb;
      if (lays(tack)) { // steering for the mark: no closer to the wind than the beat angle, no deeper than the run angle
        const hm = crabTo(u, c, vb), twa = Math.abs(wrap(hm - w.from));
        if (mode === 'beat' ? twa >= beat : twa <= run) { h = hm; v = sp(twa); }
      }
    }
    const d = V(h);
    p = { x: p.x + (d.x * v + c.x) * DT, y: p.y + (d.y * v + c.y) * DT };
    t += DT / 60;
    if (onLand(p) && dist(p, b) > 400) return result(false);
    const xt = cross(legU, sub(p, a));
    maxLeft = Math.max(maxLeft, xt); maxRight = Math.max(maxRight, -xt);
    minShore = Math.min(minShore, sd);
    sumKt += o.wind(p, t + sc.early).kt * sc.kMul; sumCur += dot(c, legU) / KT; n++;
    if (steps % 3 === 0) path.push({ p: { ...p }, t });
  }
  path.push({ p: { ...p }, t });
  return result(dist(p, b) <= arrive);

  function result(ok: boolean): SailResult {
    return { ok, minutes: t - t0, kind, path, tacks, meanKt: n ? sumKt / n : 0, meanCurAlong: n ? sumCur / n : 0, maxLeft, maxRight, minShore };
  }
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
  // (the Wharf's piers, breakwaters and docks are 1–10 m wide: sampling would step over them, so they're tested exactly)
  const visible = (p: Vec, q: Vec) => { if (wharfCrossed(p, q)) return false; const n = Math.max(2, Math.ceil(dist(p, q) / 40)); for (let k = 1; k < n; k++) if (blocked({ x: p.x + (q.x - p.x) * k / n, y: p.y + (q.y - p.y) * k / n })) return false; return true; };
  if (visible(a, b)) return [a, b];
  // among the Wharf's piers and docks the fairways are 20–30 m wide: a finer grid there, so the way out of a marina is found
  const fine = wharfNearest(a, 150) !== null || wharfNearest(b, 150) !== null;
  const cell = fine ? 10 : 50, pad = fine ? 800 : 2500;
  const x0 = Math.min(a.x, b.x) - pad, y0 = Math.min(a.y, b.y) - pad;
  const nx = Math.ceil((Math.abs(a.x - b.x) + 2 * pad) / cell) + 1, ny = Math.ceil((Math.abs(a.y - b.y) + 2 * pad) / cell) + 1;
  const at = (i: number, j: number): Vec => ({ x: x0 + i * cell, y: y0 + j * cell });
  const idx = (q: Vec) => Math.round((q.y - y0) / cell) * nx + Math.round((q.x - x0) / cell);
  const block = new Int8Array(nx * ny).fill(-1); // -1 not yet worked out
  const isBlocked = (k: number) => { if (block[k] < 0) block[k] = blocked(at(k % nx, Math.floor(k / nx))) ? 1 : 0; return block[k] === 1; };
  const start = idx(a), goal = idx(b), gs = new Float64Array(nx * ny).fill(Infinity), from = new Int32Array(nx * ny).fill(-1);
  const h = (k: number) => dist(at(k % nx, Math.floor(k / nx)), b);
  // a binary heap of [f, k]
  const heap: [number, number][] = [];
  const push = (e: [number, number]) => { heap.push(e); let c = heap.length - 1; while (c > 0) { const pa = (c - 1) >> 1; if (heap[pa][0] <= heap[c][0]) break; [heap[pa], heap[c]] = [heap[c], heap[pa]]; c = pa; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = 2 * c + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
  gs[start] = 0; push([h(start), start]);
  let found = false;
  while (heap.length) {
    const [, k] = pop();
    if (k === goal) { found = true; break; }
    const i = k % nx, j = Math.floor(k / nx);
    for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
      if (!di && !dj) continue;
      const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const kk = jj * nx + ii; if (kk !== goal && isBlocked(kk)) continue;
      if (di && dj && (isBlocked(j * nx + ii) || isBlocked(jj * nx + i))) continue; // no cutting a corner of the land
      if (wharfCrossed(at(i, j), at(ii, jj))) continue; // nor through a pier or a dock
      const g = gs[k] + cell * Math.hypot(di, dj);
      if (g < gs[kk]) { gs[kk] = g; from[kk] = k; push([g + h(kk), kk]); }
    }
  }
  if (!found) return [a, b];
  const cells: Vec[] = [];
  for (let k = goal; k >= 0 && k !== start; k = from[k]) cells.push(at(k % nx, Math.floor(k / nx)));
  const pts = [a, ...cells.reverse().slice(0, -1), b];
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
