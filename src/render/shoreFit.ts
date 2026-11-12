import chart from '../geo/data/enc-chart.json';
import marinPiers from '../geo/data/marin-piers.json';
import { LL } from '../geo/geo';

/**
 * NOAA's charted coastline (ENC LNDARE, the chart's land: src/geo/data/enc-chart.json), for fitting the drawn terrain's
 * shore to it (render/terrain.ts). The terrain is a 50 m height grid: left to itself its shore is a staircase of 50 m
 * steps with sheer walls where a hilltop sample sits next to a water one. Fitted, the land samples along the shore are
 * moved onto the charted coast and brought down to the water, and the hills rise from there.
 *
 * The chart's land comes in pieces cut at the chart cells' edges; edges with land on both sides are seams, not coast,
 * and are left out. Piers on piles that the chart draws as land (the Moore Road Pier at Fort Baker:
 * scripts/make-marin-piers.mjs) are water here, and drawn as piers (render/terrain.ts).
 */
/** The piers the chart draws as land (OpenStreetMap's outlines, in the sim's metres). */
export const CHART_PIERS: { name: string; pts: { x: number; y: number }[] }[] = (marinPiers as unknown as { piers: { name: string; pts: [number, number][] }[] }).piers
  .map(p => ({ name: p.name, pts: p.pts.map(q => LL(q[0], q[1])) }));
const inRing = (x: number, y: number, r: { x: number; y: number }[]) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i].y > y) !== (r[j].y > y) && x < (r[j].x - r[i].x) * (y - r[i].y) / (r[j].y - r[i].y) + r[i].x) c = !c; return c; };
const segD = (x: number, y: number, a: { x: number; y: number }, b: { x: number; y: number }) => { const vx = b.x - a.x, vy = b.y - a.y, t = Math.max(0, Math.min(1, ((x - a.x) * vx + (y - a.y) * vy) / (vx * vx + vy * vy || 1))); return Math.hypot(x - a.x - vx * t, y - a.y - vy * t); };
/** On (or within `m` metres of) one of those piers. */
const onPier = (x: number, y: number, m: number) => CHART_PIERS.some(P => inRing(x, y, P.pts) || P.pts.some((a, i) => segD(x, y, a, P.pts[(i + 1) % P.pts.length]) < m));
export interface Coast {
  inside(x: number, y: number): boolean; nearest(x: number, y: number, max: number): { x: number; y: number; d: number } | null;
  /** the charted rocks and islets too small for the 50 m mesh (under ROCK m across), drawn as rocks of their own */
  rocks: { x: number; y: number }[][];
}
/** A piece of the chart's land smaller than this across (m) is a rock: the mesh leaves it out. */
export const ROCK = 100; // (the 50 m mesh can't draw anything this small: at best a sliver)

let built: Coast | null = null;
export function chartCoast(): Coast {
  if (built) return built;
  const rings: Float64Array[] = [], rocks: { x: number; y: number }[][] = [];
  for (const poly of (chart as unknown as { land: number[][][] }).land) {
    const rs = poly.map(r => {
      const a = new Float64Array(r.length); let lon = 0, lat = 0;
      for (let i = 0; i < r.length; i += 2) { lon += r[i]; lat += r[i + 1]; const p = LL(lat / 1e5, lon / 1e5); a[i] = p.x; a[i + 1] = p.y; }
      return a;
    });
    const o = rs[0]; let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < o.length; i += 2) { x0 = Math.min(x0, o[i]); x1 = Math.max(x1, o[i]); y0 = Math.min(y0, o[i + 1]); y1 = Math.max(y1, o[i + 1]); }
    if (Math.max(x1 - x0, y1 - y0) < ROCK) { rocks.push(Array.from({ length: o.length / 2 }, (_, i) => ({ x: o[i * 2], y: o[i * 2 + 1] }))); continue; }
    rings.push(...rs);
  }
  // every edge, filed by the 50 m bands of y it spans (for the inside test) …
  let y0 = Infinity, y1 = -Infinity;
  for (const a of rings) for (let i = 1; i < a.length; i += 2) { y0 = Math.min(y0, a[i]); y1 = Math.max(y1, a[i]); }
  const B = 50, nb = Math.ceil((y1 - y0) / B) + 1, bands: number[][] = Array.from({ length: nb }, () => []);
  const ex: number[] = []; // edges: x1, y1, x2, y2
  for (const a of rings) {
    const n = a.length / 2;
    for (let k = 0; k < n; k++) {
      const i = k * 2, j = ((k + 1) % n) * 2, e = ex.length / 4;
      ex.push(a[i], a[i + 1], a[j], a[j + 1]);
      const b0 = Math.floor((Math.min(a[i + 1], a[j + 1]) - y0) / B), b1 = Math.floor((Math.max(a[i + 1], a[j + 1]) - y0) / B);
      for (let b = b0; b <= b1; b++) bands[b].push(e);
    }
  }
  const inside = (x: number, y: number): boolean => {
    const b = Math.floor((y - y0) / B); if (b < 0 || b >= nb) return false;
    if (onPier(x, y, 4)) return false; // (a pier on piles: water under it)
    let c = false;
    for (const e of bands[b]) {
      const ax = ex[e * 4], ay = ex[e * 4 + 1], bx = ex[e * 4 + 2], by = ex[e * 4 + 3];
      if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) c = !c;
    }
    return c;
  };
  // … and the coast's edges (land on one side only) in 100 m cells, for the nearest point on the coast
  const C = 100, cells = new Map<number, number[]>(), key = (i: number, j: number) => i * 100003 + j;
  for (let e = 0; e < ex.length / 4; e++) {
    const ax = ex[e * 4], ay = ex[e * 4 + 1], bx = ex[e * 4 + 2], by = ex[e * 4 + 3], L = Math.hypot(bx - ax, by - ay);
    if (L < 0.01) continue;
    const mx = (ax + bx) / 2, my = (ay + by) / 2, nx = -(by - ay) / L * 1.5, ny = (bx - ax) / L * 1.5;
    if (inside(mx + nx, my + ny) === inside(mx - nx, my - ny)) continue; // a seam between two pieces of the chart's land
    if (onPier(mx, my, 6)) continue; // (the outline of a pier the chart draws as land)
    for (let i = Math.floor(Math.min(ax, bx) / C); i <= Math.floor(Math.max(ax, bx) / C); i++)
      for (let j = Math.floor(Math.min(ay, by) / C); j <= Math.floor(Math.max(ay, by) / C); j++) {
        const k = key(i, j), l = cells.get(k); if (l) l.push(e); else cells.set(k, [e]);
      }
  }
  const nearest = (x: number, y: number, max: number) => {
    let best: { x: number; y: number; d: number } | null = null;
    const r = Math.ceil(max / C);
    for (let i = Math.floor(x / C) - r; i <= Math.floor(x / C) + r; i++) for (let j = Math.floor(y / C) - r; j <= Math.floor(y / C) + r; j++) {
      for (const e of cells.get(key(i, j)) ?? []) {
        const ax = ex[e * 4], ay = ex[e * 4 + 1], bx = ex[e * 4 + 2], by = ex[e * 4 + 3];
        const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
        const qx = ax + vx * t, qy = ay + vy * t, d = Math.hypot(x - qx, y - qy);
        if (d <= max && (!best || d < best.d)) best = { x: qx, y: qy, d };
      }
    }
    return best;
  };
  return built = { inside, nearest, rocks };
}
