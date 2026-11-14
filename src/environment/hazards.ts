import type { Vec } from '../core/math';
import { LL } from '../geo/geo';
import enc from '../geo/data/enc-chart.json';
import bayTides from './data/bay-tides.json';

/**
 * The charted rocks, wrecks and obstructions a keel can strike (NOAA's ENC: UWTROC, WRECKS, OBSTRN, in
 * geo/data/enc-chart.json): the hard things under the water, as against the mud of the flats (environment/bottom.ts).
 * Each has its top at some depth below MLLW (negative: above it, drying), and she strikes it where the tide leaves less
 * water over it than she draws (boat/ground.ts).
 *
 * The top, from the chart:
 *  - VALSOU, the depth over it, where the chart gives one (141 of the 1,051);
 *  - a rock awash (WATLEV 5): at the datum;
 *  - a rock that covers and uncovers (WATLEV 4, 226 of them, no VALSOU): dry at low water and covered at high, so its
 *    top is between the two. Taken halfway up the tide's range, MHHW / 2 above MLLW (San Francisco's: about 0.9 m), an
 *    ESTIMATE: the chart gives no height.
 * Left out: the ones always under water of unknown depth (WATLEV 3 with no VALSOU: 34 rocks, 549 obstructions, many of
 * them foul ground, CATOBS 6–7), since their top could be anywhere; and the ones always dry (WATLEV 2), which stand above
 * every tide as the shore does. A point hazard is taken as ROCK_R across (the chart marks a point; the rock has some
 * size: an ESTIMATE); an area one (an obstruction's or a wreck's outline) as its outline.
 */
export interface Hazard { id: number; kind: 'rock' | 'wreck' | 'obstn'; top: number; p?: Vec; area?: Vec[]; c: Vec; name: string }
/** A point hazard's radius (m): an ESTIMATE. */
export const ROCK_R = 3;
const MHHW = (bayTides as unknown as { refMhhw: number }).refMhhw;
const NAME = { rock: 'a charted rock', wreck: 'a charted wreck', obstn: 'a charted obstruction' } as const;
type Raw = { k: 'rock' | 'wreck' | 'obstn'; wl: number; d?: number; p?: number[]; f?: number[][][] };
const dec = (a: number[]): Vec[] => { const out: Vec[] = []; let x = 0, y = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; out.push(LL(y / 1e5, x / 1e5)); } return out; };
export const HAZARDS: Hazard[] = ((enc as unknown as { hazards: Raw[] }).hazards).flatMap((h): Hazard[] => {
  const top = h.d != null ? h.d : h.wl === 5 ? 0 : h.wl === 4 && h.k === 'rock' ? -MHHW / 2 : null;
  if (top === null) return [];
  if (h.p) { const p = LL(h.p[1] / 1e5, h.p[0] / 1e5); return [{ id: 0, kind: h.k, top, p, c: p, name: NAME[h.k] }]; }
  if (h.f) return h.f.map(poly => { const area = dec(poly[0]), c = { x: area.reduce((s, q) => s + q.x, 0) / area.length, y: area.reduce((s, q) => s + q.y, 0) / area.length }; return { id: 0, kind: h.k, top, area, c, name: NAME[h.k] }; });
  return [];
});
HAZARDS.forEach((H, i) => { H.id = i + 1; });
/** The hazards by 100 m cell, each filed in every cell its reach touches (a boat's keel asks every step). */
const CELL = 100, GRID = new Map<number, Hazard[]>();
for (const H of HAZARDS) {
  const pts = H.area ?? [H.p!], x0 = Math.min(...pts.map(q => q.x)) - ROCK_R, x1 = Math.max(...pts.map(q => q.x)) + ROCK_R, y0 = Math.min(...pts.map(q => q.y)) - ROCK_R, y1 = Math.max(...pts.map(q => q.y)) + ROCK_R;
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++) { const k = i * 65536 + j; (GRID.get(k) ?? GRID.set(k, []).get(k)!).push(H); }
}
const inside = (p: Vec, P: Vec[]) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
/** The shallowest-topped hazard under p, or null. */
export function hazardAt(p: Vec): Hazard | null {
  const l = GRID.get(Math.floor(p.x / CELL) * 65536 + Math.floor(p.y / CELL)); if (!l) return null;
  let best: Hazard | null = null;
  for (const H of l) {
    if (best && H.top >= best.top) continue;
    if (H.p ? (p.x - H.p.x) ** 2 + (p.y - H.p.y) ** 2 <= ROCK_R * ROCK_R : inside(p, H.area!)) best = H;
  }
  return best;
}
