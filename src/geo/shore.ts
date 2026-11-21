import { inPoly, segPt, type Vec } from '../core/math';
import { LAT0, LL, LON0 } from './geo';
import mask from './data/shore-mask.json';
import marinaCoast from './data/marina-coast.json';
import wharf from './data/wharf.json';
import eastPiers from './data/east-piers.json';
import bridgePiers from './data/bridge-piers.json';
import limePoint from './data/lime-point.json';
import { HARBORS, harborIndex, hitsHarbor, inBasin } from './marina';

// Stylized Cityfront shoreline from Fort Point to North Beach (approximate, not for navigation); from the Gate to Pier 27
// it's replaced below by the real one, so only its stretch east of Pier 27 is still used.
// (Fort Point itself, the brick fort at 37.81056 N 122.47722 W (Wikipedia, "Fort Point National Historic Site"), stands
// on the point under the Golden Gate Bridge's south end: OpenStreetMap's coast runs out round it, so the fort and the
// bridge's arch over it are on land.)
const SHORE_LL: [number, number][] = [
  [37.8100, -122.4790], [37.8108, -122.4782], [37.8112, -122.4773], [37.8110, -122.4764], [37.8100, -122.4757],
  [37.8092, -122.4747], [37.8065, -122.4720], [37.8045, -122.4620], [37.8040, -122.4520], [37.8055, -122.4490],
  [37.8078, -122.4475], [37.8082, -122.4462], [37.8079, -122.4450], [37.8088, -122.4441], [37.8093, -122.4434],
  [37.8087, -122.4427], [37.8071, -122.4421], [37.8067, -122.4380], [37.8071, -122.4340], [37.8080, -122.4326],
  [37.8100, -122.4322], [37.8100, -122.4315], [37.8083, -122.4312], [37.8100, -122.4306], [37.8100, -122.4299],
  [37.8083, -122.4296], [37.8100, -122.4291], [37.8100, -122.4284], [37.8078, -122.4280], [37.8074, -122.4240],
  [37.8086, -122.4214], [37.8080, -122.4180], [37.8062, -122.4100], [37.8045, -122.4000]
];

// From the Gate's south shore (37.8015 N, under the Presidio's bluffs) round Fort Point, along Crissy Field and past
// the Marina to Fort Mason, the real shoreline (OpenStreetMap, scripts/make-marina-coast.mjs): the beach, the Marina
// Green seawall, the West Harbor's basin and its jetty out to the entrance beacon, in place of the hand-drawn one
// and round Gashouse Cove (the Marina's East Harbor) and Fort Mason's three piers, to their east (the hand-drawn shore had
// the piers 50–200 m too far east and too long)
// and on from Fort Mason past Aquatic Park, Fisherman's Wharf and Pier 39 to Pier 27 (OpenStreetMap,
// scripts/make-wharf.mjs; the hand-drawn shore ran across Aquatic Park and south of the Wharf, so Pier 39 and the
// Wharf's piers were water). OSM's coastline runs round the big shed piers (45, 39, 35 to 27): built on piles, but their
// sheds and dense pile fields make the pier-head line act as the bank, for the wind and for the current. The open piers,
// breakwaters and floating docks it leaves out are solid below (WHARF), and shelter the water from the current
// (wharfDist, used by the current's shore relief).
type WharfData = { coast: [number, number][]; piers: { name?: string; kind: string; pts: [number, number][] }[]; lines: { name?: string; kind: string; width: number; pts: [number, number][] }[] };
const W = wharf as unknown as WharfData;
const COAST = [...(marinaCoast as unknown as { coast: [number, number][] }).coast, ...W.coast];
const SHORE_ALL: [number, number][] = [...SHORE_LL.filter(p => p[1] < COAST[0][1]), ...COAST, ...SHORE_LL.filter(p => p[1] > COAST[COAST.length - 1][1])];
export const SHORE: Vec[] = SHORE_ALL.map(p => LL(p[0], p[1]));
/** Land polygon: the shoreline closed off to the south. */
// (closed round the far side of the city, out to the edges of the area the Cityfront shore governs (onLand's CF box), so
// the Presidio's edge and the city behind the waterfront are land, not a channel or a lake a boat could sail into)
export const LAND: Vec[] = SHORE.concat([LL(37.7795, -122.3995), LL(37.7795, -122.4805), LL(37.8015, -122.4805)]); // (back to the coast's start on the Gate's south shore at 37.8015 N: north of it, off the Presidio, is water)

/*
 * Inside the Cityfront's land polygon, exactly as inPoly(p, LAND) but fast (it's asked for every boat, every step):
 * the polygon's edges are filed in 10 m bands of y, so the crossing count looks only at edges that span the point's
 * y; and in 20 m cells that no edge crosses, the answer is worked out once and remembered.
 */
const LB = (() => {
  const xs = LAND.map(q => q.x), ys = LAND.map(q => q.y), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const BAND = 10, nb = Math.ceil((y1 - y0) / BAND) + 1, bands: number[][] = Array.from({ length: nb }, () => []);
  const C = 20, cx = Math.ceil((x1 - x0) / C) + 1, cy = Math.ceil((y1 - y0) / C) + 1, crossed = new Uint8Array(cx * cy);
  const edges = new Map<number, number[]>(); // the edges in or next to each crossed cell (for landAlong)
  for (let i = 0, j = LAND.length - 1; i < LAND.length; j = i++) {
    const a = LAND[i], b = LAND[j];
    for (let k = Math.floor((Math.min(a.y, b.y) - y0) / BAND); k <= Math.floor((Math.max(a.y, b.y) - y0) / BAND); k++) bands[k].push(i);
    // mark the cells this edge passes through (stepping finely along it)
    const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / (C / 4)));
    for (let t = 0; t <= n; t++) {
      const x = a.x + (b.x - a.x) * t / n, y = a.y + (b.y - a.y) * t / n, ci = Math.floor((x - x0) / C), cj = Math.floor((y - y0) / C);
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const ii = ci + di, jj = cj + dj; if (ii < 0 || jj < 0 || ii >= cx || jj >= cy) continue;
        const k = jj * cx + ii; crossed[k] = 1;
        const l = edges.get(k); if (!l) edges.set(k, [i]); else if (l[l.length - 1] !== i) l.push(i);
      }
    }
  }
  return { x0, x1, y0, y1, BAND, bands, C, cx, cy, crossed, edges, known: new Int8Array(cx * cy).fill(-1) };
})();
function inLandBands(p: Vec): boolean {
  let c = false;
  for (const i of LB.bands[Math.floor((p.y - LB.y0) / LB.BAND)]) {
    const a = LAND[i], b = LAND[(i + LAND.length - 1) % LAND.length];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
export const inCityfront = (p: Vec): boolean => {
  if (!(p.x >= LB.x0 && p.x <= LB.x1 && p.y >= LB.y0 && p.y <= LB.y1)) return false;
  const k = Math.floor((p.y - LB.y0) / LB.C) * LB.cx + Math.floor((p.x - LB.x0) / LB.C);
  if (LB.crossed[k]) return inLandBands(p);
  if (LB.known[k] < 0) LB.known[k] = inLandBands(p) ? 1 : 0; // (no edge in or next to this cell: all of it is the same)
  return LB.known[k] === 1;
};

/*
 * Beyond the Cityfront (Alcatraz, Angel Island, the Marin shore, Treasure Island, the city east of North Beach):
 * the real coastline from the terrain, in 50 m cells. The Cityfront itself is the hand-drawn shore above, which
 * has the marinas and breakwaters in it.
 */
const M = mask as { south: number; north: number; west: number; east: number; nx: number; ny: number; rows: number[][] };
const GRID = (() => {
  const g = new Uint8Array(M.nx * M.ny);
  M.rows.forEach((runs, j) => { let i = 0, v = 0; for (const n of runs) { if (v) g.fill(1, j * M.nx + i, j * M.nx + i + n); i += n; v ^= 1; } });
  return g;
})();
const MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const CF = { x0: LL(0, -122.4800).x, x1: LL(0, -122.4000).x, y0: LL(37.780, 0).y, y1: LL(37.8150, 0).y };
/*
 * The mask's samples are the terrain's, taken at grid nodes (lon = west + i·(east − west)/(nx − 1)), so cell i is the
 * half-cell either side of its node: the same land the terrain mesh draws (render/terrain.ts). In continuous cell
 * coordinates (cell i spans [i, i + 1)):
 */
const CW = (M.east - M.west) / (M.nx - 1), CH = (M.north - M.south) / (M.ny - 1); // degrees per cell
const cellX = (lon: number) => (lon - M.west) / CW + 0.5, cellY = (lat: number) => (M.north - lat) / CH + 0.5;
function inTerrain(p: Vec): boolean {
  const lat = LAT0 + p.y / MLAT, lon = LON0 + p.x / MLON;
  const i = Math.floor(cellX(lon)), j = Math.floor(cellY(lat));
  return i >= 0 && j >= 0 && i < M.nx && j < M.ny && GRID[j * M.nx + i] === 1;
}

/** The terrain land grid, for drawing maps: cells, bounds, and whether a cell is inside the hand-drawn Cityfront area. */
export const landGrid = () => ({ ...M, grid: GRID, cityfront: { south: 37.79, north: 37.815, west: -122.48, east: -122.40 } });

/**
 * Lime Point, the Marin foot of the Golden Gate Bridge: OpenStreetMap's coastline (scripts/make-lime-point.mjs) in
 * place of the terrain's 50 m cells, which put its shore 60–80 m too far north. The north tower's base stands at its
 * edge and the Lime Point light on its spit.
 */
const LP = (() => {
  const d = limePoint as unknown as { box: { south: number; north: number; west: number; east: number }; land: [number, number][] };
  const a = LL(d.box.south, d.box.west), b = LL(d.box.north, d.box.east);
  return { x0: a.x, x1: b.x, y0: a.y, y1: b.y, land: d.land.map(q => LL(q[0], q[1])) };
})();
const inLimePoint = (p: Vec): boolean | null => p.x >= LP.x0 && p.x <= LP.x1 && p.y >= LP.y0 && p.y <= LP.y1 ? inPoly(p, LP.land) : null;

/** The ground: the land itself and the marinas' docks, without the Wharf's piers and docks (for the terrain, which can't show them). */
export const onGround = (p: Vec): boolean =>
  inBasin(p) ? hitsHarbor(p) : hitsHarbor(p) || (p.x > CF.x0 && p.x < CF.x1 && p.y > CF.y0 && p.y < CF.y1 ? inCityfront(p) : (inLimePoint(p) ?? inTerrain(p)) || inCityfront(p));
/** The box OpenStreetMap's Lime Point coastline governs (render/terrain.ts fits the hills to it there). */
/** Lime Point's land outline (the coast, closed inland through the box's north-west corner). */
export const limePointLand = (): Vec[] => LP.land;
export const limePointBox = (): { x0: number; x1: number; y0: number; y1: number } => ({ x0: LP.x0, x1: LP.x1, y0: LP.y0, y1: LP.y1 });

/**
 * The Wharf's piers, breakwaters and floating docks beyond the coastline (OpenStreetMap, scripts/make-wharf.mjs):
 * Municipal Pier, Hyde Street Pier, Pier 47, Pier 41, the Fisherman's Wharf breakwater, Pier 39's breakwaters and its
 * marina's docks and fingers. Solid: a boat runs into them.
 */
export interface WharfPart { name?: string; kind: string; pts: Vec[]; width?: number; box: { x0: number; x1: number; y0: number; y1: number } }
const boxOf = (pts: Vec[], pad: number) => ({ x0: Math.min(...pts.map(q => q.x)) - pad, x1: Math.max(...pts.map(q => q.x)) + pad, y0: Math.min(...pts.map(q => q.y)) - pad, y1: Math.max(...pts.map(q => q.y)) + pad });
export interface PierGroup { areas: WharfPart[]; lines: WharfPart[]; box: WharfPart['box'] }
const group = (D: WharfData): PierGroup => {
  const areas = D.piers.map(a => { const pts = a.pts.map(q => LL(q[0], q[1])); return { name: a.name, kind: a.kind, pts, box: boxOf(pts, 0) }; });
  const lines = D.lines.map(l => { const pts = l.pts.map(q => LL(q[0], q[1])); return { name: l.name, kind: l.kind, width: l.width, pts, box: boxOf(pts, l.width / 2) }; });
  return { areas, lines, box: boxOf([...areas, ...lines].flatMap(a => [{ x: a.box.x0, y: a.box.y0 }, { x: a.box.x1, y: a.box.y1 }]), 0) };
};
export const WHARF: PierGroup = group(W);
/**
 * The piers out in the East Bay and the north reach (OpenStreetMap, scripts/make-east-piers.mjs): the Berkeley Pier, its
 * abandoned outer part, and Chevron's Long Wharf at Richmond. Solid, like the Wharf's; kept as a group of their own, so a
 * question about a point (or a line) far from either group doesn't look at the other's parts.
 */
export const EAST_PIERS: PierGroup = group(eastPiers as unknown as WharfData);
const GROUPS = [WHARF, EAST_PIERS];
const inB = (p: Vec, b: WharfPart['box']) => p.x >= b.x0 && p.x <= b.x1 && p.y >= b.y0 && p.y <= b.y1;

/**
 * The bridges' towers and piers standing in the water (scripts/make-bridge-piers.mjs): the Golden Gate Bridge's
 * two tower bases (OpenStreetMap) and the south tower's fender (NOAA's chart), the Bay Bridge's piers and towers
 * (NOAA's chart: the West Span's Piers A–F, the East Span's tower and the Skyway's piers), the Richmond–San Rafael
 * Bridge's. Solid, as the Wharf's piers are, and in the same places: onLand, landAlong, the nearest structure for
 * Rule 19, the passage planner. They stand alone in open water, so each has its own box and no group box.
 */
export interface Pier extends WharfPart { name: string; top: number; depth: number }
/**
 * How high each stands out of the water (m): the Golden Gate's tower bases 13 (OpenStreetMap's height), the south
 * tower's fender 6, the Bay Bridge's piers 10, the others 6 (estimates from photographs: the chart gives only
 * footprints). The West Span's Pier C is its concrete central anchorage (W4), 450 ft tall from bedrock about 220 ft below
 * the water (Caltrans, via ketchum.org/papers/sfobbeq.pdf; calisphere.org): about 70 m standing out of the water.
 */
const topOf = (n: string) => /tower$/.test(n) ? 13 : /fender/.test(n) ? 6 : n === 'Bay Bridge, Pier C' ? 70 : /^Bay Bridge/.test(n) ? 10 : 6;
export const PIERS: Pier[] = (bridgePiers as unknown as { piers: { name: string; pts: [number, number][]; depth?: { m: number } }[] }).piers
  .map(a => { const pts = a.pts.map(q => LL(q[0], q[1])); return { name: a.name, kind: 'bridge', pts, box: boxOf(pts, 0), top: topOf(a.name), depth: Math.max(2, a.depth?.m ?? 10) }; });
/** The piers bridge by bridge, each bridge's in one box: most of the water is nowhere near any of them. */
const PIER_GROUPS: { box: WharfPart['box']; piers: Pier[] }[] = (() => {
  const by = new Map<string, Pier[]>();
  for (const P of PIERS) { const k = P.name.split(',')[0]; by.set(k, [...(by.get(k) ?? []), P]); }
  return [...by.values()].map(piers => ({ piers, box: boxOf(piers.flatMap(P => [{ x: P.box.x0, y: P.box.y0 }, { x: P.box.x1, y: P.box.y1 }]), 0) }));
})();
/** The bridge pier or tower at p, if she's hit one (for the message: what she hit). */
export const pierAt = (p: Vec): Pier | null => {
  for (const G of PIER_GROUPS) if (inB(p, G.box)) for (const a of G.piers) if (inB(p, a.box) && inPoly(p, a.pts)) return a;
  return null;
};
export const hitsPier = (p: Vec): boolean => pierAt(p) !== null;
/** The bridge pier or tower within r metres of p (the north tower's base is part of Lime Point's coastline: what she hits there is the tower). */
export const pierNear = (p: Vec, r: number): Pier | null => {
  for (const G of PIER_GROUPS) if (p.x >= G.box.x0 - r && p.x <= G.box.x1 + r && p.y >= G.box.y0 - r && p.y <= G.box.y1 + r)
    for (const a of G.piers) if (inPoly(p, a.pts) || a.pts.some((v, k) => segPt(p, v, a.pts[(k + 1) % a.pts.length]) < r)) return a;
  return null;
};

/*
 * The terrain's 50 m land grid (from elevation data) has some of the bigger piers in it as blocks of land: the Bay
 * Bridge's Pier A and centre anchorage stand well above the water. Where a pier is drawn exactly above, those blocks
 * would make a boat run aground 20–30 m short of it, so a patch of grid land that stands on its own in the water,
 * everywhere within 80 m of a pier, is water: the pier's outline is what's solid. (Land joined to real shore, such as
 * Yerba Buena Island's beside the Bay Bridge's Pier F, stays.)
 */
{
  // (each cell centred on its sample, at a grid node: see inTerrain)
  const cellC = (i: number, j: number): Vec => ({ x: (M.west + i * CW - LON0) * MLON, y: (M.north - j * CH - LAT0) * MLAT });
  const nearPier = (q: Vec, r: number) => PIERS.some(P => q.x > P.box.x0 - r && q.x < P.box.x1 + r && q.y > P.box.y0 - r && q.y < P.box.y1 + r && P.pts.some((v, k) => segPt(q, v, P.pts[(k + 1) % P.pts.length]) < r || inPoly(q, P.pts)));
  const done = new Uint8Array(M.nx * M.ny);
  for (const P of PIERS) {
    const toCell = (v: Vec) => [Math.floor(cellX(LON0 + v.x / MLON)), Math.floor(cellY(LAT0 + v.y / MLAT))];
    const [i0, j0] = toCell({ x: P.box.x0 - 80, y: P.box.y1 + 80 }), [i1, j1] = toCell({ x: P.box.x1 + 80, y: P.box.y0 - 80 });
    for (let j = Math.max(0, j0); j <= Math.min(M.ny - 1, j1); j++) for (let i = Math.max(0, i0); i <= Math.min(M.nx - 1, i1); i++) {
      const k = j * M.nx + i; if (!GRID[k] || done[k]) continue;
      // the patch of land this cell belongs to: is all of it close round a pier?
      const blob: number[] = [], stack = [k]; let alone = true; done[k] = 1;
      while (stack.length && blob.length < 64) {
        const c = stack.pop()!, ci = c % M.nx, cj = (c - ci) / M.nx; blob.push(c);
        if (!nearPier(cellC(ci, cj), 80)) { alone = false; break; }
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const ni = ci + di, nj = cj + dj, n = nj * M.nx + ni;
          if (ni >= 0 && nj >= 0 && ni < M.nx && nj < M.ny && GRID[n] && !done[n]) { done[n] = 1; stack.push(n); }
        }
      }
      if (alone && !stack.length) for (const c of blob) GRID[c] = 0;
    }
  }
}

export function hitsWharf(p: Vec): boolean {
  if (hitsPier(p)) return true;
  for (const G of GROUPS) {
    if (!inB(p, G.box)) continue;
    for (const a of G.areas) if (inB(p, a.box) && inPoly(p, a.pts)) return true;
    for (const l of G.lines) if (inB(p, l.box)) for (let i = 1; i < l.pts.length; i++) if (segPt(p, l.pts[i - 1], l.pts[i]) <= l.width! / 2) return true;
  }
  return false;
}

/**
 * How far a boat at p passes alongside an outline (m), from its nearest segment k (from pts[k − 1] to pts[k]): the
 * stretch of the outline on either side that stays within a few metres of the line she'd sail along it (square to n,
 * the way out from it to her), measured along that line. RRS 2025–2028, Definitions, Obstruction: it's a continuing
 * obstruction if she'd pass alongside it for at least three of her hull lengths.
 */
export function alongside(pts: Vec[], closed: boolean, k: number, q: Vec, n: Vec, flat = 4): number {
  const t = { x: -n.y, y: n.x }, N = pts.length;
  let lo = 0, hi = 0;
  const take = (v: Vec) => { const along = (v.x - q.x) * t.x + (v.y - q.y) * t.y, depth = Math.abs((v.x - q.x) * n.x + (v.y - q.y) * n.y); if (depth > flat) return false; lo = Math.min(lo, along); hi = Math.max(hi, along); return true; };
  // walk back from the segment's start, and on from its end, while the outline stays on her side's face
  for (let s = 0, i = k - 1; s < N; s++, i--) { if (i < 0) { if (!closed) break; i += N; } if (!take(pts[i])) break; }
  for (let s = 0, i = k; s < N; s++, i++) { if (i >= N) { if (!closed) break; i -= N; } if (!take(pts[i])) break; }
  return hi - lo;
}

/**
 * The nearest of the Wharf's piers, breakwaters and docks (m; 0 inside one; null beyond `max`), the direction away
 * from it, and how far a boat there passes alongside it (see alongside).
 */
/**
 * The nearest of the Wharf's piers, breakwaters and docks, and (with `piers`) the bridges' piers: for Rule 19, the
 * passage planner. The current's shore relief leaves the bridges' piers out: one standing alone in the stream isn't a
 * harbour wall, and the water round it isn't slack (environment/pierWakes.ts does its wake).
 */
export function wharfNearest(p: Vec, max = 60, piers = true): { d: number; n: Vec; along: number } | null {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  type Best = { d: number; q: Vec; part: WharfPart; closed: boolean; k: number };
  let best: Best | null = null;
  const near = (b: WharfPart['box']) => p.x >= b.x0 - max && p.x <= b.x1 + max && p.y >= b.y0 - max && p.y <= b.y1 + max;
  const seg = (part: WharfPart, closed: boolean, k: number, a: Vec, b: Vec, half: number) => {
    const abx = b.x - a.x, aby = b.y - a.y, L2 = abx * abx + aby * aby || 1, t = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / L2));
    const q = { x: a.x + abx * t, y: a.y + aby * t }, d = Math.hypot(p.x - q.x, p.y - q.y) - half;
    if (!best || d < best.d) best = { d, q, part, closed, k };
  };
  let inside = false;
  if (piers) for (const G of PIER_GROUPS) if (near(G.box)) for (const a of G.piers) if (near(a.box)) { const n = a.pts.length; for (let i = 0; i < n; i++) seg(a, true, i + 1, a.pts[i], a.pts[(i + 1) % n], 0); if (inPoly(p, a.pts)) inside = true; }
  for (const G of GROUPS) {
    if (!near(G.box)) continue;
    for (const a of G.areas) if (near(a.box)) { const n = a.pts.length; for (let i = 0; i < n; i++) seg(a, true, i + 1, a.pts[i], a.pts[(i + 1) % n], 0); if (inPoly(p, a.pts)) inside = true; }
    for (const l of G.lines) if (near(l.box)) for (let i = 1; i < l.pts.length; i++) seg(l, false, i, l.pts[i - 1], l.pts[i], l.width! / 2);
  }
  const b = best as Best | null;
  if (!b || b.d > max) return null;
  const dx = p.x - b.q.x, dy = p.y - b.q.y, L = Math.hypot(dx, dy) || 1, n = { x: dx / L, y: dy / L };
  return { d: inside ? 0 : Math.max(0, b.d), n, along: alongside(b.part.pts, b.closed, b.k, b.q, n) };
}
/** How far to the nearest of the Wharf's piers, breakwaters and docks (not the bridges'): for the current's shore relief. */
export const wharfDist = (p: Vec, max = 400): number => wharfNearest(p, max, false)?.d ?? Infinity;

/**
 * How enclosed the water here is by the Wharf's piers and breakwaters and the shore (0 open … 1 enclosed): of 16
 * lines 400 m out from this 20 m cell, how many meet a pier, a breakwater or the land, past half of them. Inside
 * Aquatic Park and the Pier 39 marina the water is enclosed; off a pier head it isn't. Worked out once per cell.
 */
const shelterCache = new Map<number, number>();
export function wharfShelter(p: Vec): number {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !wharfNearest(p, 350, false)) return 0;
  const i = Math.floor(p.x / 20), j = Math.floor(p.y / 20), key = i * 100003 + j;
  let v = shelterCache.get(key);
  if (v == null) {
    const c = { x: (i + 0.5) * 20, y: (j + 0.5) * 20 };
    let hit = 0;
    for (let k = 0; k < 16; k++) {
      const a = k * Math.PI / 8, e = { x: c.x + Math.sin(a) * 400, y: c.y + Math.cos(a) * 400 };
      let h = wharfCrossed(c, e, false);
      for (let r = 20; !h && r <= 400; r += 20) h = onGround({ x: c.x + Math.sin(a) * r, y: c.y + Math.cos(a) * r });
      if (h) hit++;
    }
    v = Math.max(0, Math.min(1, (hit / 16 - 0.5) / 0.3));
    shelterCache.set(key, v);
  }
  return v;
}

/** Does the straight line from a to b touch any of the Wharf's piers, breakwaters or docks, or (with `piers`) the bridges' piers? (Exact.) */
export function wharfCrossed(a: Vec, b: Vec, piers = true): boolean {
  const bx0 = Math.min(a.x, b.x), bx1 = Math.max(a.x, b.x), by0 = Math.min(a.y, b.y), by1 = Math.max(a.y, b.y);
  const hit = (bb: WharfPart['box']) => !(bx1 < bb.x0 || bx0 > bb.x1 || by1 < bb.y0 || by0 > bb.y1);
  const cr = (o: Vec, p: Vec, q: Vec) => (p.x - o.x) * (q.y - o.y) - (p.y - o.y) * (q.x - o.x);
  const crosses = (p: Vec, q: Vec, r: Vec, s: Vec) => (cr(p, q, r) > 0) !== (cr(p, q, s) > 0) && (cr(r, s, p) > 0) !== (cr(r, s, q) > 0);
  const segSeg = (p: Vec, q: Vec, r: Vec, s: Vec) => crosses(p, q, r, s) ? 0 : Math.min(segPt(p, r, s), segPt(q, r, s), segPt(r, p, q), segPt(s, p, q));
  if (piers) for (const G of PIER_GROUPS) if (hit(G.box)) for (const A of G.piers) if (hit(A.box)) {
    if (inPoly(a, A.pts) || inPoly(b, A.pts)) return true;
    for (let i = 0; i < A.pts.length; i++) if (crosses(a, b, A.pts[i], A.pts[(i + 1) % A.pts.length])) return true;
  }
  for (const G of GROUPS) {
    if (!hit(G.box)) continue;
    for (const A of G.areas) if (hit(A.box)) {
      if (inPoly(a, A.pts) || inPoly(b, A.pts)) return true;
      for (let i = 0; i < A.pts.length; i++) if (crosses(a, b, A.pts[i], A.pts[(i + 1) % A.pts.length])) return true;
    }
    for (const L of G.lines) if (hit(L.box)) for (let i = 1; i < L.pts.length; i++) if (segSeg(a, b, L.pts[i - 1], L.pts[i]) <= L.width! / 2) return true;
  }
  return false;
}

/** Is this point land a boat would run aground on? (In a marina's basin: only its docks and breakwaters; and those are solid just outside it too.) */
export const onLand = (p: Vec): boolean => onGround(p) || hitsWharf(p);

/*
 * Land along a line, exactly: for the look-ahead of the AI, the tiller pilot and the Rule 20 hail, which used to sample
 * points every 15–45 m and so could step over a 1–10 m pier, breakwater or dock finger. Every place the line could
 * pass from water onto land is found from the geometry itself (each pier, breakwater, dock and finger as it's drawn;
 * the Cityfront shore's edges, filed in its 20 m cells; the terrain's 50 m land cells; the edges of the marinas' basins
 * and of the box where the Cityfront shore takes over from the terrain), and the first of them that onLand agrees is
 * land is the answer. So it says what onLand would for every point on the line, for a few cells' work.
 */
const EPS = 0.05; // m: how far past a crossing onLand is asked
/** The first t in [0, 1] at which a + t(b − a) comes within `half` of the segment pq (Infinity if it never does). */
function lineHit(a: Vec, b: Vec, p: Vec, q: Vec, half: number): number {
  const dx = b.x - a.x, dy = b.y - a.y, ex = q.x - p.x, ey = q.y - p.y, den = dx * ey - dy * ex;
  // where the two lines cross, if they do within both segments; else the nearest approach (at an end of one of them)
  let tc = -1;
  if (den !== 0) {
    const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den, u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) tc = t;
  }
  if (tc < 0) {
    const L2 = dx * dx + dy * dy || 1, proj = (v: Vec) => Math.max(0, Math.min(1, ((v.x - a.x) * dx + (v.y - a.y) * dy) / L2));
    const c: [number, number][] = [[segPt(a, p, q), 0], [segPt(b, p, q), 1], [segPt(p, a, b), proj(p)], [segPt(q, a, b), proj(q)]];
    let m = c[0]; for (const x of c) if (x[0] < m[0]) m = x;
    if (m[0] > half) return Infinity;
    tc = m[1];
  }
  // the distance to pq is convex along the line, so it falls all the way to tc: find where it first reaches `half`
  const d = (t: number) => segPt({ x: a.x + dx * t, y: a.y + dy * t }, p, q);
  if (d(0) <= half) return 0;
  let lo = 0, hi = tc;
  for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (d(m) <= half) hi = m; else lo = m; }
  return hi;
}
/** The first t at which a + t(b − a) is within `r` of the point c (Infinity if never). */
function circleHit(a: Vec, b: Vec, c: Vec, r: number): number {
  const dx = b.x - a.x, dy = b.y - a.y, fx = a.x - c.x, fy = a.y - c.y, A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), C = fx * fx + fy * fy - r * r;
  if (C < 0) return 0;
  const disc = B * B - 4 * A * C; if (disc < 0 || A === 0) return Infinity;
  const t = (-B - Math.sqrt(disc)) / (2 * A);
  return t >= 0 && t <= 1 ? t : Infinity;
}
/** As marina.ts draws a dock: within `half` of its centre line, square at its ends and round only at its bends. The first t on it. */
function dockHit(a: Vec, b: Vec, pts: Vec[], half: number): number {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i], L = Math.hypot(q.x - p.x, q.y - p.y); if (L < 1e-4) continue;
    const n = { x: -(q.y - p.y) / L * half, y: (q.x - p.x) / L * half };
    const R = [{ x: p.x + n.x, y: p.y + n.y }, { x: q.x + n.x, y: q.y + n.y }, { x: q.x - n.x, y: q.y - n.y }, { x: p.x - n.x, y: p.y - n.y }];
    if (inPoly(a, R)) return 0;
    for (let k = 0; k < 4; k++) best = Math.min(best, edgeCross(a, b, R[k], R[(k + 1) % 4]));
    if (i > 1) best = Math.min(best, circleHit(a, b, p, half));
  }
  return best;
}
/** Where a + t(b − a) crosses the segment pq (t), or Infinity. */
function edgeCross(a: Vec, b: Vec, p: Vec, q: Vec): number {
  const dx = b.x - a.x, dy = b.y - a.y, ex = q.x - p.x, ey = q.y - p.y, den = dx * ey - dy * ex;
  if (den === 0) return Infinity;
  const t = ((p.x - a.x) * ey - (p.y - a.y) * ex) / den, u = ((p.x - a.x) * dy - (p.y - a.y) * dx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : Infinity;
}
/** Walk the cells of a grid that the line from (x0, y0) to (x1, y1) (in cells) passes through, in order; `visit` gets
 * the cell and the t at which the line enters it, and returns true to stop. */
function gridWalk(x0: number, y0: number, x1: number, y1: number, nx: number, ny: number, visit: (i: number, j: number, t: number) => boolean): void {
  const dx = x1 - x0, dy = y1 - y0;
  let ta = 0, tb = 1; // clip to the grid (Liang–Barsky)
  for (const [p, q] of [[-dx, x0], [dx, nx - x0], [-dy, y0], [dy, ny - y0]]) {
    if (p === 0) { if (q < 0) return; continue; }
    const r = q / p; if (p < 0) { if (r > tb) return; if (r > ta) ta = r; } else { if (r < ta) return; if (r < tb) tb = r; }
  }
  let i = Math.min(nx - 1, Math.max(0, Math.floor(x0 + dx * ta))), j = Math.min(ny - 1, Math.max(0, Math.floor(y0 + dy * ta)));
  const si = Math.sign(dx), sj = Math.sign(dy), tdx = dx ? 1 / Math.abs(dx) : Infinity, tdy = dy ? 1 / Math.abs(dy) : Infinity;
  let tx = dx > 0 ? (i + 1 - x0) / dx : dx < 0 ? (i - x0) / dx : Infinity, ty = dy > 0 ? (j + 1 - y0) / dy : dy < 0 ? (j - y0) / dy : Infinity, t = ta;
  for (;;) {
    if (visit(i, j, t)) return;
    if (tx < ty) { t = tx; i += si; tx += tdx; } else { t = ty; j += sj; ty += tdy; }
    if (t > tb || i < 0 || j < 0 || i >= nx || j >= ny) return;
  }
}
type Box = { x0: number; x1: number; y0: number; y1: number };
const overlaps = (A: Box, B: Box) => !(A.x1 < B.x0 || A.x0 > B.x1 || A.y1 < B.y0 || A.y0 > B.y1);
const HARBOR_BASINS = HARBORS.map(H => ({ H, basinBox: boxOf(H.basin, 0) }));
let harborStamp = 0;
/**
 * How far along the straight line from a to b (m) she'd first be on land a boat runs aground on (onLand), or Infinity
 * if the whole line is water. Exact: nothing, however narrow, slips between samples.
 */
export function landAlong(a: Vec, b: Vec): number {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (!Number.isFinite(L)) return Infinity;
  if (onLand(a)) return 0;
  if (L === 0) return Infinity;
  const bb: Box = { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) };
  const at = (t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  let best = Infinity; // t of the first land found
  const solid = (t: number) => { if (t < best) best = t; };
  // a place the line may pass onto land: land if onLand says so just past it
  const maybe = (t: number) => { if (t < best && onLand(at(Math.min(1, t + EPS / L)))) best = t; };
  const poly = (pts: Vec[], f: (t: number) => void) => { for (let i = 0; i < pts.length; i++) { const t = edgeCross(a, b, pts[i], pts[(i + 1) % pts.length]); if (t < best) f(t); } };
  const line = (pts: Vec[], half: number) => { for (let i = 1; i < pts.length; i++) { const t = lineHit(a, b, pts[i - 1], pts[i], half); if (t < best) solid(t); } };
  const dock = (pts: Vec[], half: number) => { const t = dockHit(a, b, pts, half); if (t < best) solid(t); };
  // the bridges' towers and piers
  for (const G of PIER_GROUPS) if (overlaps(bb, G.box)) for (const A of G.piers) if (overlaps(bb, A.box)) poly(A.pts, solid);
  // the Wharf's piers, breakwaters and docks, and the marinas' (always solid, in a basin or out of it)
  for (const G of GROUPS) if (overlaps(bb, G.box)) {
    for (const A of G.areas) if (overlaps(bb, A.box)) poly(A.pts, solid);
    for (const W of G.lines) if (overlaps(bb, W.box)) line(W.pts, W.width! / 2);
  }
  for (const { H, basinBox } of HARBOR_BASINS) {
    if (!overlaps(bb, H.reach)) continue;
    // the docks and breakwaters filed in the cells the line passes through (each looked at once)
    const ix = harborIndex(H), stamp = ++harborStamp;
    gridWalk((a.x - ix.x0) / ix.C, (a.y - ix.y0) / ix.C, (b.x - ix.x0) / ix.C, (b.y - ix.y0) / ix.C, ix.nx, ix.ny, (i, j, t) => {
      if (t > best) return true;
      for (const S of ix.cells[j * ix.nx + i]) { if (S.seen === stamp) continue; S.seen = stamp; if (S.poly) poly(S.pts, solid); else dock(S.pts, S.half); }
      return false;
    });
    if (overlaps(bb, basinBox)) poly(H.basin, maybe); // out of the basin, onto whatever's there
  }
  // the Cityfront shore: its edges in the cells the line passes through
  gridWalk((a.x - LB.x0) / LB.C, (a.y - LB.y0) / LB.C, (b.x - LB.x0) / LB.C, (b.y - LB.y0) / LB.C, LB.cx, LB.cy, (i, j, t) => {
    if (t > best) return true;
    const es = LB.crossed[j * LB.cx + i] ? LB.edges.get(j * LB.cx + i) : undefined;
    if (es) {
      const ts: number[] = [];
      for (const k of es) { const tt = edgeCross(a, b, LAND[k], LAND[(k + LAND.length - 1) % LAND.length]); if (tt < best) ts.push(tt); }
      ts.sort((x, y) => x - y); for (const tt of ts) { maybe(tt); if (best <= tt) break; }
    }
    return false;
  });
  // where the terrain takes over from the Cityfront shore (onGround's box)
  for (const [p, q] of [[{ x: CF.x0, y: CF.y0 }, { x: CF.x1, y: CF.y0 }], [{ x: CF.x1, y: CF.y0 }, { x: CF.x1, y: CF.y1 }], [{ x: CF.x1, y: CF.y1 }, { x: CF.x0, y: CF.y1 }], [{ x: CF.x0, y: CF.y1 }, { x: CF.x0, y: CF.y0 }]] as const) {
    const t = edgeCross(a, b, p, q); if (t < best) maybe(t);
  }
  // Lime Point's coastline, and the edges of its box, where the terrain takes over again
  if (overlaps(bb, LP)) {
    poly(LP.land, maybe);
    for (const [p, q] of [[{ x: LP.x0, y: LP.y0 }, { x: LP.x1, y: LP.y0 }], [{ x: LP.x1, y: LP.y0 }, { x: LP.x1, y: LP.y1 }], [{ x: LP.x1, y: LP.y1 }, { x: LP.x0, y: LP.y1 }], [{ x: LP.x0, y: LP.y1 }, { x: LP.x0, y: LP.y0 }]] as const) {
      const t = edgeCross(a, b, p, q); if (t < best) maybe(t);
    }
  }
  // the terrain's land cells (lat and lon are linear in x and y, so the line is straight on the grid too)
  const gx = (p: Vec) => cellX(LON0 + p.x / MLON), gy = (p: Vec) => cellY(LAT0 + p.y / MLAT);
  gridWalk(gx(a), gy(a), gx(b), gy(b), M.nx, M.ny, (i, j, t) => {
    if (t > best) return true;
    if (GRID[j * M.nx + i] === 1) maybe(t);
    return false;
  });
  if (best > 1 && onLand(b)) best = 1; // (a crossing too fine to find: the far end, at least, is land)
  return best <= 1 ? best * L : Infinity;
}

/**
 * The nearest of the terrain's land beyond the Cityfront (Alcatraz, Angel Island, the Marin shore, Treasure Island, the
 * city east of North Beach), within `max` m: how far, and the way out from it. Exact for the 50 m land cells.
 */
export function terrainNearest(p: Vec, max = 30): { d: number; n: Vec } | null {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  const lat = LAT0 + p.y / MLAT, lon = LON0 + p.x / MLON, cw = CW, ch = CH;
  const i0 = Math.floor(cellX(lon)), j0 = Math.floor(cellY(lat));
  const ri = Math.ceil(max / (cw * MLON)) + 1, rj = Math.ceil(max / (ch * MLAT)) + 1;
  let best: { d: number; q: Vec; c: Vec } | null = null;
  for (let j = j0 - rj; j <= j0 + rj; j++) for (let i = i0 - ri; i <= i0 + ri; i++) {
    if (i < 0 || j < 0 || i >= M.nx || j >= M.ny || GRID[j * M.nx + i] !== 1) continue;
    // the cell, in course metres; inside onGround's Cityfront box the terrain doesn't count (the Cityfront shore does)
    const x0 = (M.west + (i - 0.5) * cw - LON0) * MLON, x1 = x0 + cw * MLON, y1 = (M.north - (j - 0.5) * ch - LAT0) * MLAT, y0 = y1 - ch * MLAT;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (cx > CF.x0 && cx < CF.x1 && cy > CF.y0 && cy < CF.y1) continue;
    const q = { x: Math.max(x0, Math.min(x1, p.x)), y: Math.max(y0, Math.min(y1, p.y)) }, d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d <= max && (!best || d < best.d)) best = { d, q, c: { x: cx, y: cy } };
  }
  if (!best) return null;
  const b = best as { d: number; q: Vec; c: Vec }, dx = p.x - b.q.x, dy = p.y - b.q.y, l = Math.hypot(dx, dy);
  if (l > 1e-9) return { d: b.d, n: { x: dx / l, y: dy / l } };
  // (inside a land cell: out roughly the way the nearest water lies, away from the cell's middle)
  const ex = p.x - b.c.x, ey = p.y - b.c.y, el = Math.hypot(ex, ey);
  return { d: 0, n: el > 1e-9 ? { x: ex / el, y: ey / el } : { x: 0, y: 1 } };
}

/*
 * The distance to the shore, exactly (the nearest of SHORE's segments), but fast: the segments are filed in a 100 m grid
 * and the search spreads out ring by ring from the point's cell, stopping once nothing further out can be nearer.
 * (The wind and the current ask this for every boat, every step.)
 */
const SC = 100;
const SG = (() => {
  const xs = SHORE.map(q => q.x), ys = SHORE.map(q => q.y), x0 = Math.min(...xs), y0 = Math.min(...ys);
  const nx = Math.ceil((Math.max(...xs) - x0) / SC) + 1, ny = Math.ceil((Math.max(...ys) - y0) / SC) + 1;
  const cells: number[][] = Array.from({ length: nx * ny }, () => []);
  for (let i = 1; i < SHORE.length; i++) {
    const a = SHORE[i - 1], b = SHORE[i];
    const i0 = Math.floor((Math.min(a.x, b.x) - x0) / SC), i1 = Math.floor((Math.max(a.x, b.x) - x0) / SC);
    const j0 = Math.floor((Math.min(a.y, b.y) - y0) / SC), j1 = Math.floor((Math.max(a.y, b.y) - y0) / SC);
    for (let j = j0; j <= j1; j++) for (let k = i0; k <= i1; k++) cells[j * nx + k].push(i);
  }
  return { x0, y0, nx, ny, cells };
})();
export const shoreDist = (p: Vec): number => shoreNearest(p).d;

/*
 * The distance to any shore, not just the Cityfront's: the nearer of the Cityfront shore (shoreDist, exact) and the
 * terrain's land beyond it (the 50 m cells, from NOAA's chart: Marin, the islands, the East Bay, Richmond), for the
 * wind's slowing near the shore and the current's easing there. The terrain's part is an exact Euclidean distance
 * transform of the cells (Felzenszwalb & Huttenlocher 2012), worked out once, between cell centres, then interpolated
 * and taken back half a cell to the cell's edge: within about 15 m of the true distance to the cells.
 */
let DT: Float32Array | null = null;
function landDistGrid(): Float32Array {
  if (DT) return DT;
  const nx = M.nx, ny = M.ny, BIG = 1e12, f = new Float64Array(nx * ny), sx = CW * MLON, sy = CH * MLAT; // (cell size, m)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const k = j * nx + i, lat = M.north - j * CH, lon = M.west + i * CW, x = (lon - LON0) * MLON, y = (lat - LAT0) * MLAT;
    f[k] = GRID[k] === 1 && !(x > CF.x0 && x < CF.x1 && y > CF.y0 && y < CF.y1) ? 0 : BIG; // (inside the Cityfront box, the Cityfront shore counts instead)
  }
  // squared distance along one line of samples, spacing h (the lower envelope of parabolas)
  const line = (get: (q: number) => number, set: (q: number, v: number) => void, n: number, h: number) => {
    const v = new Int32Array(n), z = new Float64Array(n + 1), g = new Float64Array(n); for (let q = 0; q < n; q++) g[q] = get(q);
    let k = 0; v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
    for (let q = 1; q < n; q++) {
      if (g[q] >= BIG) continue;
      if (g[v[0]] >= BIG) { v[0] = q; continue; }
      let sP: number;
      for (;;) { const r = v[k]; sP = ((g[q] + (q * h) ** 2) - (g[r] + (r * h) ** 2)) / (2 * h * (q - r)); if (sP <= z[k] && k > 0) k--; else break; }
      k++; v[k] = q; z[k] = sP; z[k + 1] = Infinity;
    }
    if (g[v[0]] >= BIG) return; // (no land on this line)
    k = 0;
    for (let q = 0; q < n; q++) { while (z[k + 1] < q * h) k++; set(q, (q * h - v[k] * h) ** 2 + g[v[k]]); }
  };
  for (let j = 0; j < ny; j++) line(q => f[j * nx + q], (q, v) => { f[j * nx + q] = v; }, nx, sx);
  for (let i = 0; i < nx; i++) line(q => f[q * nx + i], (q, v) => { f[q * nx + i] = v; }, ny, sy);
  DT = Float32Array.from(f, v => Math.sqrt(v));
  return DT;
}
/** The distance to the terrain's land beyond the Cityfront (m; Infinity off the map's edge where there's none). */
export function landDist(p: Vec): number {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return NaN;
  const g = landDistGrid(), fx = cellX(LON0 + p.x / MLON) - 0.5, fy = cellY(LAT0 + p.y / MLAT) - 0.5; // (in samples)
  const i = Math.max(0, Math.min(M.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(M.ny - 2, Math.floor(fy))), u = fx - i, v = fy - j;
  const at = (a: number, b: number) => g[b * M.nx + a];
  const d = (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
  const off = Math.max(0, -fx, fx - (M.nx - 1)) * CW * MLON + Math.max(0, -fy, fy - (M.ny - 1)) * CH * MLAT; // (beyond the map: at least this much more)
  return Math.max(0, d - 25) + off;
}
/**
 * Does the straight line from a to b cross land? By the 50 m land cells alone (the Cityfront's city included, as the
 * terrain has it; no piers or docks): a quick test of whether two places see each other over the water, for the current
 * field. (For where a boat runs aground, landAlong.)
 */
export function landBetween(a: Vec, b: Vec): boolean {
  let hit = false;
  const ax = cellX(LON0 + a.x / MLON), ay = cellY(LAT0 + a.y / MLAT), bx = cellX(LON0 + b.x / MLON), by = cellY(LAT0 + b.y / MLAT);
  const ends = [Math.floor(ay) * M.nx + Math.floor(ax), Math.floor(by) * M.nx + Math.floor(bx)]; // (the ends' own cells don't count: a place on the water just off a shore can share its cell)
  gridWalk(ax, ay, bx, by, M.nx, M.ny, (i, j) => { const k = j * M.nx + i; return (hit = GRID[k] === 1 && k !== ends[0] && k !== ends[1]); });
  return hit;
}
/** The distance to the nearest shore anywhere (the Cityfront's exactly, elsewhere the chart's land to about 15 m). */
export const anyShoreDist = (p: Vec): number => Math.min(shoreDist(p), landDist(p));
/**
 * landAlong for a boat's own short look ahead (the AI's "is the shore in the way" on every think, ai.ts blocked): when
 * the shore is further off than the look by a good margin, and no pier, dock, breakwater or harbour lies within its box,
 * there's nothing it could meet, and the walk along it is skipped. Otherwise landAlong itself, so the answer is the same
 * (the margin, 30 m, is twice the terrain's distance error and the lattice's few metres: tests/landAlongNear.test.ts).
 */
/** A box within 60 m of any edge of the Cityfront box (CF), across the edge's whole length. */
function nearCfEdge(bb: Box): boolean {
  const m = 60;
  return overlaps(bb, { x0: CF.x0 - m, x1: CF.x0 + m, y0: CF.y0 - m, y1: CF.y1 + m }) || overlaps(bb, { x0: CF.x1 - m, x1: CF.x1 + m, y0: CF.y0 - m, y1: CF.y1 + m })
    || overlaps(bb, { x0: CF.x0 - m, x1: CF.x1 + m, y0: CF.y0 - m, y1: CF.y0 + m }) || overlaps(bb, { x0: CF.x0 - m, x1: CF.x1 + m, y0: CF.y1 - m, y1: CF.y1 + m });
}
export function landAlongNear(a: Vec, b: Vec): number {
  const L = Math.hypot(b.x - a.x, b.y - a.y);
  if (Number.isFinite(L) && L <= 300 && anyShoreDistNear(a) > L + 30) {
    const bb: Box = { x0: Math.min(a.x, b.x), x1: Math.max(a.x, b.x), y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y) };
    // (and not where the land onGround finds isn't in anyShoreDist: Lime Point's coastline, which replaces the terrain
    // there; the strips along the Cityfront box's edges, where the terrain's cells are left out of the distance; and
    // the Cityfront land's closing edges just past them)
    let built = overlaps(bb, { x0: LP.x0, x1: LP.x1, y0: LP.y0, y1: LP.y1 }) || nearCfEdge(bb);
    if (!built) for (const G of PIER_GROUPS) if (overlaps(bb, G.box)) { built = true; break; }
    if (!built) for (const G of GROUPS) if (overlaps(bb, G.box)) { built = true; break; }
    if (!built) for (const { H } of HARBOR_BASINS) if (overlaps(bb, H.reach)) { built = true; break; }
    if (!built) return Infinity;
  }
  return landAlong(a, b);
}
/**
 * The same, read off a 10 m lattice of the exact values, bilinearly: for what asks near the same places again and again
 * (a boat's own current, eased near the shore: environment/current.ts shoreRelief, every boat every step), where the exact one
 * searches the shore's segments each time. (Not for what samples the whole Bay once in a while, as the wind's field
 * does: each such look would fill a tile for one use.) The
 * distance to a shore changes by no more than the distance moved, so between lattice points it is off by a few metres
 * at most, where two shores are equally near (tests/approx.test.ts measures it). Filled in tiles of 32 × 32
 * spaces (320 m) as boats first come near them, each in a few milliseconds. setShoreGrid(false): the exact one.
 */
export function anyShoreDistNear(p: Vec): number {
  if (!shoreGridOn || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return anyShoreDist(p);
  const fx = p.x / SG_STEP, fy = p.y / SG_STEP, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const ti = Math.floor(i / SG_TILE), tj = Math.floor(j / SG_TILE), key = ti * 65536 + tj;
  let t = sgTiles.get(key);
  if (!t) { t = shoreTile(ti, tj); sgTiles.set(key, t); }
  const a = i - ti * SG_TILE, b = j - tj * SG_TILE, k = b * (SG_TILE + 1) + a, n = SG_TILE + 1;
  return (t[k] * (1 - u) + t[k + 1] * u) * (1 - v) + (t[k + n] * (1 - u) + t[k + n + 1] * u) * v;
}
const SG_STEP = 10, SG_TILE = 32, sgTiles = new Map<number, Float64Array>();
let shoreGridOn = true;
/** Read the shore distance off the lattice (the default) or work it out exactly every time (for the tests). */
export function setShoreGrid(on: boolean): void { shoreGridOn = on; }
function shoreTile(ti: number, tj: number): Float64Array {
  const n = SG_TILE + 1, t = new Float64Array(n * n);
  for (let b = 0; b < n; b++) for (let a = 0; a < n; a++) t[b * n + a] = anyShoreDist({ x: (ti * SG_TILE + a) * SG_STEP, y: (tj * SG_TILE + b) * SG_STEP });
  return t;
}
/*
 * Which segments can be nearest anywhere in a 25 m cell, worked out the first time a point in the cell is asked about.
 * Exact: the distance to the shore changes by at most the distance moved, so nowhere in the cell is the shore further
 * than U = (its distance from the cell's centre) + (the cell's half-diagonal), and a segment further than U from the
 * whole cell can't be the nearest (nor tie with it) for any point in it. So scanning the cell's list gives the same
 * answer as scanning every segment, for a handful of them (the ring search below finds the centre's distance). A cell
 * gets its list once it's been asked about a few times (a boat crossing it asks hundreds of times): points asked about
 * here and there (the landscape's, building the city at load) are quicker by the ring search alone.
 */
const NC = 25, NR = NC * Math.SQRT1_2, LIST_AFTER = 8, nearCells = new Map<number, Int32Array | number>();
const shoreSeen = new Int32Array(SHORE.length); let shoreStamp = 0;
function boxSegDist(bx0: number, by0: number, bx1: number, by1: number, a: Vec, b: Vec): number {
  // (0 if the segment enters the box: clipped to it, Liang–Barsky)
  const dx = b.x - a.x, dy = b.y - a.y; let t0 = 0, t1 = 1, inside = true;
  const clip = (pp: number, qq: number) => {
    if (pp === 0) { if (qq < 0) inside = false; return; }
    const r = qq / pp; if (pp < 0) { if (r > t1) inside = false; else if (r > t0) t0 = r; } else { if (r < t0) inside = false; else if (r < t1) t1 = r; }
  };
  clip(-dx, a.x - bx0); if (inside) clip(dx, bx1 - a.x); if (inside) clip(-dy, a.y - by0); if (inside) clip(dy, by1 - a.y);
  if (inside && t0 <= t1) return 0;
  const toBox = (x: number, y: number) => Math.hypot(Math.max(bx0 - x, 0, x - bx1), Math.max(by0 - y, 0, y - by1));
  // the corners to the segment
  const L2 = dx * dx + dy * dy || 1, corner = (x: number, y: number) => {
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy) / L2));
    return Math.hypot(x - a.x - dx * t, y - a.y - dy * t);
  };
  return Math.min(toBox(a.x, a.y), toBox(b.x, b.y), corner(bx0, by0), corner(bx1, by0), corner(bx0, by1), corner(bx1, by1));
}
function nearCell(ci: number, cj: number): Int32Array | null {
  if (Math.abs(ci) >= 32768 || Math.abs(cj) >= 32768) return null; // (over 800 km off: beyond the keys, the ring search)
  const key = (ci + 32768) * 65536 + (cj + 32768);
  let list = nearCells.get(key) ?? 0;
  if (typeof list !== 'number') return list;
  if (list < LIST_AFTER) { nearCells.set(key, list + 1); return null; } // (not yet: the ring search)
  const bx0 = ci * NC, by0 = cj * NC, bx1 = bx0 + NC, by1 = by0 + NC;
  const U = ringNearest({ x: bx0 + NC / 2, y: by0 + NC / 2 }).d + NR + 1e-6;
  // every segment filed in the search grid's cells within U of the cell
  const { x0, y0, nx, ny, cells } = SG, stamp = ++shoreStamp, out: number[] = [];
  const ia = Math.max(0, Math.floor((bx0 - U - x0) / SC)), ib = Math.min(nx - 1, Math.floor((bx1 + U - x0) / SC));
  const ja = Math.max(0, Math.floor((by0 - U - y0) / SC)), jb = Math.min(ny - 1, Math.floor((by1 + U - y0) / SC));
  for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) for (const k of cells[j * nx + i]) {
    if (shoreSeen[k] === stamp) continue; shoreSeen[k] = stamp;
    if (boxSegDist(bx0, by0, bx1, by1, SHORE[k - 1], SHORE[k]) <= U) out.push(k);
  }
  out.sort((a, b) => a - b);
  list = Int32Array.from(out); nearCells.set(key, list);
  return list;
}
/** The distance to the shore, and which of SHORE's segments (k: from SHORE[k − 1] to SHORE[k]) is nearest (the lowest k on a tie). */
export function shoreNearest(p: Vec): { d: number; k: number } {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return { d: NaN, k: -1 };
  const list = nearCell(Math.floor(p.x / NC), Math.floor(p.y / NC));
  if (!list) return ringNearest(p);
  let m = Infinity, mk = -1;
  for (let i = 0; i < list.length; i++) { const k = list[i], d = segPt(p, SHORE[k - 1], SHORE[k]); if (d < m) { m = d; mk = k; } }
  return { d: m, k: mk };
}
/** The same, by a search spreading out ring by ring through the 100 m grid from the point's cell (used once per 25 m cell above). */
function ringNearest(p: Vec): { d: number; k: number } {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return { d: NaN, k: -1 }; // (the ring search would never end)
  const { x0, y0, nx, ny, cells } = SG;
  const ci = Math.floor((p.x - x0) / SC), cj = Math.floor((p.y - y0) / SC);
  // start from the ring that first reaches the grid, if the point is outside it
  const r0 = Math.max(0, -ci, ci - (nx - 1), -cj, cj - (ny - 1));
  let m = Infinity, mk = -1;
  for (let r = r0; ; r++) {
    const ja = Math.max(0, cj - r), jb = Math.min(ny - 1, cj + r), ia = Math.max(0, ci - r), ib = Math.min(nx - 1, ci + r);
    for (let j = ja; j <= jb; j++) {
      const edgeRow = j === cj - r || j === cj + r;
      for (let i = ia; i <= ib; i++) {
        if (!edgeRow && i !== ci - r && i !== ci + r) continue; // only the ring itself
        for (const k of cells[j * nx + i]) { const d = segPt(p, SHORE[k - 1], SHORE[k]); if (d < m || (d === m && k < mk)) { m = d; mk = k; } }
      }
    }
    // everything not yet searched lies outside the square of cells round the point's cell
    const lb = Math.min(p.x - (x0 + (ci - r) * SC), x0 + (ci + r + 1) * SC - p.x, p.y - (y0 + (cj - r) * SC), y0 + (cj + r + 1) * SC - p.y);
    if (m <= lb || (ci - r <= 0 && ci + r >= nx - 1 && cj - r <= 0 && cj + r >= ny - 1)) return { d: m, k: mk };
  }
}
