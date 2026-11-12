import chart from '../geo/data/enc-chart.json';
import { LL } from '../geo/geo';

/**
 * NOAA's charted coastline (ENC LNDARE, the chart's land: src/geo/data/enc-chart.json), for fitting the drawn terrain's
 * shore to it (render/terrain.ts). The terrain is a 50 m height grid: left to itself its shore is a staircase of 50 m
 * steps with sheer walls where a hilltop sample sits next to a water one. Fitted, the land samples along the shore are
 * moved onto the charted coast and brought down to the water, and the hills rise from there.
 *
 * The chart's land comes in pieces cut at the chart cells' edges; edges with land on both sides are seams, not coast,
 * and are left out.
 */
export interface Coast { inside(x: number, y: number): boolean; nearest(x: number, y: number, max: number): { x: number; y: number; d: number } | null }

let built: Coast | null = null;
export function chartCoast(): Coast {
  if (built) return built;
  const rings: Float64Array[] = [];
  for (const poly of (chart as unknown as { land: number[][][] }).land) for (const r of poly) {
    const a = new Float64Array(r.length); let lon = 0, lat = 0;
    for (let i = 0; i < r.length; i += 2) { lon += r[i]; lat += r[i + 1]; const p = LL(lat / 1e5, lon / 1e5); a[i] = p.x; a[i + 1] = p.y; }
    rings.push(a);
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
  return built = { inside, nearest };
}
