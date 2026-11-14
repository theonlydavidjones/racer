import type { Vec } from '../core/math';
import { LL } from '../geo/geo';
import enc from '../geo/data/enc-chart.json';
import bayTides from './data/bay-tides.json';
import bottom from './data/bottom.json';

/**
 * The charted rocks, wrecks and obstructions a keel can strike (NOAA's ENC: UWTROC, WRECKS, OBSTRN, in
 * geo/data/enc-chart.json): the hard things under the water, as against the mud of the flats (environment/bottom.ts).
 * Each has its top at some depth below MLLW (negative: above it, drying), and she strikes it where the tide leaves less
 * water over it than she draws (boat/ground.ts).
 *
 * The top, from the chart (S-57's WATLEV: 1 partly submerged at high water, 2 always dry, 3 always under water, 4 covers
 * and uncovers, 5 awash):
 *  - VALSOU, the depth over it, where the chart gives one (141 of the 1,051);
 *  - awash (5): at the datum;
 *  - covers and uncovers (4), with no VALSOU: dry at low water and covered at high, so its top is between the two. Taken
 *    halfway up the tide's range, MHHW / 2 above MLLW (San Francisco's: about 0.9 m), an ESTIMATE: the chart gives no
 *    height;
 *  - always dry (2) or partly submerged at high water (1): at MHHW, standing out of every tide but the highest;
 *  - always under water (3) with no VALSOU: at the shoal edge of the depth area it lies in (DRVAL1), as a chart display
 *    takes such a danger (S-52's DEPVAL02): baked with the bottom (scripts/make-bottom.mjs, bottom.json hazardTop), and
 *    only where that's shoal water. Not foul ground (CATOBS 7), a danger only to anchoring.
 * A point hazard is taken as ROCK_R across (the chart marks a point; the rock has some size: an ESTIMATE); an area one
 * (an obstruction's or a wreck's outline) as its outline.
 */
export interface Hazard { id: number; kind: 'rock' | 'wreck' | 'obstn'; top: number; p?: Vec; area?: Vec[]; /** a line under the water (a ruined pier's), struck within ROCK_R of it */ line?: Vec[]; c: Vec; name: string }
/** A point hazard's radius (m): an ESTIMATE. */
export const ROCK_R = 3;
const MHHW = (bayTides as unknown as { refMhhw: number }).refMhhw;
const NAME = { rock: 'a charted rock', wreck: 'a charted wreck', obstn: 'a charted obstruction' } as const;
type Raw = { k: 'rock' | 'wreck' | 'obstn'; wl: number; d?: number; p?: number[]; f?: number[][][]; o?: number[][] };
const BJ = bottom as unknown as { hazards: number; hazardTop: Record<string, number>; shoreKinds: number; ruinTop: Record<string, number> };
type RawShore = { wl?: number; o?: number[][]; f?: number[][][] };
const dec = (a: number[]): Vec[] => { const out: Vec[] = []; let x = 0, y = 0; for (let i = 0; i < a.length; i += 2) { x += a[i]; y += a[i + 1]; out.push(LL(y / 1e5, x / 1e5)); } return out; };
const RAW = (enc as unknown as { hazards: Raw[] }).hazards;
if (BJ.hazards !== RAW.length) throw new Error('bottom.json was made from another chart: node scripts/make-bottom.mjs');
export const HAZARDS: Hazard[] = RAW.flatMap((h, k): Hazard[] => {
  const top = h.d != null ? h.d : h.wl === 5 ? 0 : h.wl === 4 ? -MHHW / 2 : h.wl === 1 || h.wl === 2 ? -MHHW : BJ.hazardTop[k] ?? null;
  if (top === null) return [];
  if (h.p) { const p = LL(h.p[1] / 1e5, h.p[0] / 1e5); return [{ id: 0, kind: h.k, top, p, c: p, name: NAME[h.k] }]; }
  const rings = h.f ? h.f.map(poly => poly[0]) : h.o ?? []; // (an area's outline; a line's, for those given only as one)
  if (rings.length) return rings.map(ring => { const area = dec(ring), c = { x: area.reduce((s, q) => s + q.x, 0) / area.length, y: area.reduce((s, q) => s + q.y, 0) / area.length }; return { id: 0, kind: h.k, top, area, c, name: NAME[h.k] }; });
  return [];
});
// the constructions always under water (SLCONS, WATLEV 3: ruined piers, mostly): lines, at the top make-bottom.mjs gives them
const SHORE = (enc as unknown as { shoreKinds?: RawShore[] }).shoreKinds ?? [];
if (BJ.shoreKinds !== SHORE.length) throw new Error('bottom.json was made from another chart: node scripts/make-bottom.mjs');
SHORE.forEach((s, k) => {
  const top = BJ.ruinTop[k]; if (top == null) return;
  for (const L of s.o ?? (s.f ?? []).map(poly => poly[0])) { const line = dec(L); if (line.length < 2) continue; const c = line[Math.floor(line.length / 2)]; HAZARDS.push({ id: 0, kind: 'obstn', top, line, c, name: 'a submerged ruin' }); }
});
HAZARDS.forEach((H, i) => { H.id = i + 1; });
/** The hazards by 100 m cell, each filed in every cell its reach touches (a boat's keel asks every step). */
const CELL = 100, GRID = new Map<number, Hazard[]>();
for (const H of HAZARDS) {
  const pts = H.area ?? H.line ?? [H.p!], x0 = Math.min(...pts.map(q => q.x)) - ROCK_R, x1 = Math.max(...pts.map(q => q.x)) + ROCK_R, y0 = Math.min(...pts.map(q => q.y)) - ROCK_R, y1 = Math.max(...pts.map(q => q.y)) + ROCK_R;
  for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++) for (let j = Math.floor(y0 / CELL); j <= Math.floor(y1 / CELL); j++) { const k = i * 65536 + j; (GRID.get(k) ?? GRID.set(k, []).get(k)!).push(H); }
}
const inside = (p: Vec, P: Vec[]) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
/** How far p is from an outline's nearest edge (m); `open`: a line, not closed back to its start. */
const edgeDist = (p: Vec, P: Vec[], open = false) => { let m = Infinity; for (let i = 0; i < P.length - (open ? 1 : 0); i++) { const a = P[i], b = P[(i + 1) % P.length], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy, t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0; m = Math.min(m, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy)); } return m; };
/** The shallowest-topped hazard within `r` m of p (0: under it), or null. */
export function hazardNear(p: Vec, r: number): Hazard | null {
  const R = r + ROCK_R; let best: Hazard | null = null;
  for (let i = Math.floor((p.x - r) / CELL); i <= Math.floor((p.x + r) / CELL); i++) for (let j = Math.floor((p.y - r) / CELL); j <= Math.floor((p.y + r) / CELL); j++) for (const H of GRID.get(i * 65536 + j) ?? []) {
    if (best && H.top >= best.top) continue;
    const near = H.p ? (p.x - H.p.x) ** 2 + (p.y - H.p.y) ** 2 <= R * R : H.line ? edgeDist(p, H.line, true) <= R : inside(p, H.area!) || edgeDist(p, H.area!) <= r;
    if (near) best = H;
  }
  return best;
}
/** The shallowest-topped hazard under p, or null. */
export function hazardAt(p: Vec): Hazard | null {
  const l = GRID.get(Math.floor(p.x / CELL) * 65536 + Math.floor(p.y / CELL)); if (!l) return null;
  let best: Hazard | null = null;
  for (const H of l) {
    if (best && H.top >= best.top) continue;
    if (H.p ? (p.x - H.p.x) ** 2 + (p.y - H.p.y) ** 2 <= ROCK_R * ROCK_R : H.line ? edgeDist(p, H.line, true) <= ROCK_R : inside(p, H.area!)) best = H;
  }
  return best;
}

/**
 * The chart's bottom samples (SBDARE, NATSUR) that say rock: rock, stone, cobbles, boulders, lava, coral (S-57 NATSUR
 * 9, 5, 8, 18, 11, 14). Where one is within ROCKY_R m of a grounding, it's on rock, not mud: graded as rock
 * (boat/damage.ts). Most of the Bay's samples say mud or sand (84 mud, 56 sand of 256); the rocky ones lie off the
 * points and islands, Angel Island's and the Headlands' shores among them, whose coastline the chart doesn't
 * characterize (Marinas' review).
 */
const ROCKY = new Set([5, 8, 9, 11, 14, 18]);
/** How near a rocky bottom sample (m) for a grounding to be on rock: an ESTIMATE, the samples lie a few hundred meters apart. */
export const ROCKY_R = 100;
const ROCKS_AT: Vec[] = ((enc as unknown as { bottom?: { n: number[]; p?: number[]; f?: number[][][] }[] }).bottom ?? []).flatMap(b => {
  if (!b.n.some(n => ROCKY.has(n))) return [];
  if (b.p) return [LL(b.p[1] / 1e5, b.p[0] / 1e5)];
  return (b.f ?? []).flatMap(poly => dec(poly[0])); // (an area's: its outline's points)
});
/** Whether the bottom at p is rock, by the chart's bottom samples within ROCKY_R. */
export function rockyBottom(p: Vec): boolean {
  for (const q of ROCKS_AT) if ((q.x - p.x) ** 2 + (q.y - p.y) ** 2 <= ROCKY_R * ROCKY_R) return true;
  return false;
}
