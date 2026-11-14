import { KT, V, brg, clamp, type Vec } from '../core/math';
import { PILE_PIERS, anyShoreDist, anyShoreDistNear, offPiles, flowShoreDist, flowShoreDistNear, inPilePier, pilePierDist, onLand, wharfDist, wharfShelter } from '../geo/shore';
import { BREAKWATER_W, HARBORS, SHORE_W, harborAt, hitsWall, inBasin, type Harbor } from '../geo/marina';
import type { Wind } from './wind';

export interface CurrentPreset { id: string; set: number; kt: number; label: string; button: string }

/** Uniform current presets (for practice), and 'real' for NOAA predictions (tide.ts). `set` is the direction the water flows toward. */
export const CURRENTS: Record<string, CurrentPreset> = {
  real: { id: 'real', set: 0, kt: 0, label: 'Real tide', button: 'Real tide' },
  slack: { id: 'slack', set: 0, kt: 0, label: 'Slack', button: 'Slack' },
  flood: { id: 'flood', set: 95, kt: 1.0, label: 'Flood 1.0 kt', button: 'Flood 1.0' },
  ebb: { id: 'ebb', set: 280, kt: 1.5, label: 'Ebb 1.5 kt', button: 'Ebb 1.5' },
  bigebb: { id: 'bigebb', set: 280, kt: 2.5, label: 'Ebb 2.5 kt', button: 'Ebb 2.5' }
};

/** Open-water current vector in m/s. */
export function currentVector(c: CurrentPreset): Vec {
  const v = V(c.set);
  return { x: v.x * c.kt * KT, y: v.y * c.kt * KT };
}

/**
 * Current relief near the shore: 25% of the open-water current at the beach, full strength 350 m out. In water the
 * Wharf's piers and breakwaters enclose (Aquatic Park, inside Municipal Pier and the Wharf's breakwater; the Pier 39
 * marina) they count as shore too; off a pier head, where the stream runs past, they don't.
 * The 25% and the 350 m are unsourced; no published profile of speed against distance from the shore along the
 * Cityfront was found (constants audit, docs/CONSTANTS.md). The nearest check is NOAA's Fort Point 0.5 nmi E (PCT0286,
 * off Crissy Field, 16.8 m deep): its factors against Golden Gate Bridge 0.88 nmi NE (SFB1202) are 0.2 on the flood
 * and 0.8 on the ebb (the 2027 mean peaks against PCT0281 in the Gate channel: 0.22 and 0.57). So the flood's relief
 * here fits, and the ebb's is stronger than the water does. Near a station the station's own prediction wins
 * (tide.ts atShore fades this out within 600 m of one), so PCT0286 already carries that asymmetry off Crissy Field.
 */
/**
 * Under a pier on open piles (Fort Mason's: geo/shore.ts PILE_PIERS) the stream runs on, slowed by the piles: concrete
 * columns about 1–1.5 m across with flared caps, some 4 m apart, row behind row (the owner's photo, Pier 1's south
 * side): a quarter or so of the way blocked at each row. The 0.6 is an estimate (the review's 0.4–0.7): no measurement
 * of the flow under these piers was found. No boat sails under them; it's the water beside them it shapes.
 */
export const PILE_FLOW = 0.6;
/** The pier deck's overhang past its shed's walls (m): about a meter or two in the owner's photo. */
const DECK = 2;
/** Across the piles, the stream under the pier and the still water beside it mix over this (m): an estimate. */
const PILE_MIX = 12;
export const shoreRelief = (p: Vec, lattice = false): number => {
  // (the distance to the real bank: the coastline's run round a pile pier isn't shore to the water, which runs under it)
  // (more than 380 m from the piers, the only ones it changes, it's the shore's own distance: one quick test, every boat, every step)
  const far = offPiles(p, 380), dist = far ? (lattice ? anyShoreDistNear(p) : anyShoreDist(p)) : lattice ? flowShoreDistNear(p) : flowShoreDist(p);
  const k = clamp(0.25 + 0.75 * dist / 350, 0.25, 1) * (!far && inPilePier(p) ? PILE_FLOW : 1), w = wharfShelter(p); // (`lattice`: off the 10 m lattice, geo/shore.ts, for a boat's own current each step)
  return w > 0 ? Math.min(k, 1 - w * (1 - clamp(0.25 + 0.75 * wharfDist(p, 350) / 350, 0.25, 1))) : k;
};

/**
 * How much of the open stream reaches a point in or by a harbor (1 in open water). A basin behind a breakwater doesn't
 * carry the tidal stream: water enters and leaves only through its mouth, at the rate the tide fills and empties it
 * (its tidal prism). A 300 × 300 m basin 3 m deep, with the tide's 0.9 m amplitude over 12.42 h, takes in at most about
 * 11 m³/s: about 1 cm/s across the basin, a few tenths of a knot in a 30 m mouth. The stream running past the mouth also
 * stirs a slow eddy (gyre) inside, driven by the shear across the mouth (USACE Coastal Engineering Manual,
 * EM 1110-2-1100, Part II ch. 7; Nece, Falconer & Tsutsumi 1976 on the exchange; Booij 1986 and Langendoen, Booij &
 * Kranenburg 1994 on harbors beside a stream).
 * So the stream here fades with how far the water is from the open stream, measured through the water, round the
 * breakwaters, piers and shore (not through them; the floating docks don't count, the water runs under them): open
 * water is any 30 m clear of every wall and outside every basin (BASIN_CLEAR) that joins the open Bay through such water,
 * and the stream is whole within that distance of it, so it runs on along a breakwater's outside and in through a mouth. Past that it fades over
 * BASIN_MOUTH meters to BASIN_EDDY of itself in a harbor with breakwaters, or BASIN_OPEN among docks that lie open to
 * an estuary with no breakwater (more of the stream gets in among their piles and hulls). All four are estimates: no
 * measured figure was found for these harbors, or in general.
 * Known limits of the 4 m grid it's worked out on: land thinner than about 2 m on a slant can be slipped through (one
 * strip by Fortmann Marina); water is open or not by a sharp 30 m cutoff, so a dead-end slip just over 60 m wide (Fort
 * Mason's) would carry the stream at 1 m resolution and doesn't here; slots under ~10 m between solid piers read closed.
 */
export const BASIN_EDDY = 0.1, BASIN_OPEN = 0.3, BASIN_MOUTH = 30, BASIN_CLEAR = 30;
/** The raster each harbor's calm is worked out on: cell size and margin round its works (m). */
const CELL = 4, PAD = 120;
interface Calm { x0: number; y0: number; nx: number; ny: number; d: Float32Array; floor: Float32Array; box: { x0: number; x1: number; y0: number; y1: number } }
/** The harbors in groups whose margins overlap (the Alameda marinas lie within 120 m of one another), each group on one
 * grid, so a grid's edge is always out in the open stream, 120 m from every harbor's works, never through a neighbor. */
type Group = { box: { x0: number; x1: number; y0: number; y1: number }; harbors: Harbor[]; calm?: Calm; job?: Generator<void, Calm> };
const GROUPS: Group[] = (() => {
  let gs = HARBORS.map(h => ({ box: { x0: h.reach.x0 - PAD, x1: h.reach.x1 + PAD, y0: h.reach.y0 - PAD, y1: h.reach.y1 + PAD }, harbors: [h] }));
  for (let merged = true; merged;) {
    merged = false;
    for (let a = 0; a < gs.length && !merged; a++) for (let b = a + 1; b < gs.length && !merged; b++) {
      const A = gs[a].box, B = gs[b].box; if (A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0) continue;
      gs[a] = { box: { x0: Math.min(A.x0, B.x0), x1: Math.max(A.x1, B.x1), y0: Math.min(A.y0, B.y0), y1: Math.max(A.y1, B.y1) }, harbors: [...gs[a].harbors, ...gs[b].harbors] };
      gs = gs.filter((_, i) => i !== b); merged = true;
    }
  }
  return gs;
})();
/** The distance through the water from open water (m; Infinity where the water's cut off, −1 where it's solid), on a group of harbors' grid. */
function* buildCalm(g: Group): Generator<void, Calm> {
  const x0 = g.box.x0, y0 = g.box.y0, nx = Math.ceil((g.box.x1 - g.box.x0) / CELL) + 1, ny = Math.ceil((g.box.y1 - g.box.y0) / CELL) + 1, N = nx * ny;
  const solid = new Uint8Array(N), at = (i: number, j: number) => ({ x: x0 + i * CELL, y: y0 + j * CELL });
  // the walls, every harbor's within reach: a breakwater's or shore line's cells out to its half-width plus a cell's
  // half-diagonal (so a wall a cell thick can't be slipped through), its solid areas, and the land
  const line = (pts: Vec[], half: number) => { const r = half + CELL * 0.71;
    for (let k = 1; k < pts.length; k++) { const a = pts[k - 1], b = pts[k], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy;
      const i0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - r - x0) / CELL)), i1 = Math.min(nx - 1, Math.ceil((Math.max(a.x, b.x) + r - x0) / CELL));
      const j0 = Math.max(0, Math.floor((Math.min(a.y, b.y) - r - y0) / CELL)), j1 = Math.min(ny - 1, Math.ceil((Math.max(a.y, b.y) + r - y0) / CELL));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const p = at(i, j), u = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
        if (Math.hypot(p.x - a.x - u * dx, p.y - a.y - u * dy) < r) solid[j * nx + i] = 1; } } };
  for (const H of HARBORS) {
    if (H.reach.x1 < x0 || H.reach.x0 > x0 + nx * CELL || H.reach.y1 < y0 || H.reach.y0 > y0 + ny * CELL) continue;
    for (const b of H.breakwaters) line(b.area ? [...b.pts, b.pts[0]] : b.pts, b.area ? 0 : BREAKWATER_W / 2); // (an area's outline, so a thin one can't be slipped through either)
    for (const a of H.areas) line([...a, a[0]], 0);
    for (const l of H.shore) line(l, SHORE_W / 2);
  }
  // ... and the land and walls at the cell's middle and its four corners (a strip of land a couple of meters wide on a
  // slant would otherwise fall between the middles)
  const basin = new Uint8Array(N), h2 = CELL / 2, corner = new Uint8Array((nx + 1) * (ny + 1)); // (the corners, shared between cells: each looked up once)
  for (let j = 0; j <= ny; j++, yield) for (let i = 0; i <= nx; i++) corner[j * (nx + 1) + i] = onLand({ x: x0 + i * CELL - h2, y: y0 + j * CELL - h2 }) ? 1 : 0;
  for (let j = 0; j < ny; j++, yield) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (solid[k]) continue; const p = at(i, j), K = j * (nx + 1) + i;
    if (corner[K] || corner[K + 1] || corner[K + nx + 1] || corner[K + nx + 2] || hitsWall(p) || onLand(p)) solid[k] = 1; else if (inBasin(p)) basin[k] = 1; }
  // distances on the grid (8 neighbours, never cutting a solid corner), from `src` cells, through water
  const SQ = Math.SQRT2 * CELL, NB: [number, number, number][] = [[1, 0, CELL], [-1, 0, CELL], [0, 1, CELL], [0, -1, CELL], [1, 1, SQ], [1, -1, SQ], [-1, 1, SQ], [-1, -1, SQ]];
  const spread = function* (d: Float32Array, through: (k: number) => boolean) { // (a Dijkstra on a small binary heap)
    const heap: number[] = []; const push = (k: number) => { heap.push(k); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (d[heap[p]] <= d[heap[i]]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && d[heap[l]] < d[heap[m]]) m = l; if (r < heap.length && d[heap[r]] < d[heap[m]]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const done = new Uint8Array(N); for (let k = 0; k < N; k++) { if (d[k] === 0) push(k); if ((k & 4095) === 4095) yield; }
    let n = 0; while (heap.length) { if ((++n & 1023) === 0) yield; const k = pop(); if (done[k]) continue; done[k] = 1; const i = k % nx, j = (k - i) / nx;
      for (const [di, dj, w] of NB) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const q = b * nx + a;
        if (!through(q) || (di && dj && (!through(j * nx + a) || !through(b * nx + i)))) continue;
        if (d[k] + w < d[q]) { d[q] = d[k] + w; push(q); } } } };
  // open water: 30 m clear of every wall (its clearance spread over everything, walls the sources), outside every basin
  // (a two-pass chamfer distance from the walls: the same 4 m and 5.66 m steps as the Dijkstra below, in two sweeps)
  const clear = new Float32Array(N).fill(Infinity); for (let k = 0; k < N; k++) if (solid[k]) clear[k] = 0;
  for (let j = 0; j < ny; j++, yield) for (let i = 0; i < nx; i++) { const k = j * nx + i; let v = clear[k];
    if (i > 0) v = Math.min(v, clear[k - 1] + CELL); if (j > 0) { v = Math.min(v, clear[k - nx] + CELL); if (i > 0) v = Math.min(v, clear[k - nx - 1] + SQ); if (i < nx - 1) v = Math.min(v, clear[k - nx + 1] + SQ); } clear[k] = v; }
  for (let j = ny - 1; j >= 0; j--, yield) for (let i = nx - 1; i >= 0; i--) { const k = j * nx + i; let v = clear[k];
    if (i < nx - 1) v = Math.min(v, clear[k + 1] + CELL); if (j < ny - 1) { v = Math.min(v, clear[k + nx] + CELL); if (i < nx - 1) v = Math.min(v, clear[k + nx + 1] + SQ); if (i > 0) v = Math.min(v, clear[k + nx - 1] + SQ); } clear[k] = v; }
  // the open stream: the water round the grid's edge (120 m out from the harbor's works), and water 30 m clear of every
  // wall and outside every basin that joins it through such water (not a pond walled in but for a narrow way out)
  const d = new Float32Array(N).fill(Infinity), edge = (k: number) => { const i = k % nx, j = (k - i) / nx; return i === 0 || j === 0 || i === nx - 1 || j === ny - 1; };
  const wide = new Float32Array(N).fill(Infinity), isWide = (k: number) => !solid[k] && !basin[k] && clear[k] >= BASIN_CLEAR;
  for (let k = 0; k < N; k++) if (edge(k) && isWide(k)) wide[k] = 0;
  yield* spread(wide, isWide);
  for (let k = 0; k < N; k++) if (!solid[k] && !basin[k] && (edge(k) || Number.isFinite(wide[k]))) d[k] = 0;
  yield* spread(d, q => !solid[q]);
  for (let k = 0; k < N; k++) if (solid[k]) d[k] = -1; // (solid: no water to ask about; water cut off from the stream keeps Infinity, its calm the floor)
  // the floor: the harbor's whose basin it is; outside the basins, the harbor whose works it lies among
  const floor = new Float32Array(N), fl = (h: Harbor) => h.breakwaters.length ? BASIN_EDDY : BASIN_OPEN;
  for (let j = 0; j < ny; j++, yield) for (let i = 0; i < nx; i++) { const p = at(i, j), H = basin[j * nx + i] ? harborAt(p) : null;
    let f = H && g.harbors.includes(H) ? fl(H) : -1;
    if (f < 0) { let best = Infinity; for (const h of g.harbors) { const r = h.reach, dx = Math.max(r.x0 - p.x, 0, p.x - r.x1), dy = Math.max(r.y0 - p.y, 0, p.y - r.y1), dd = dx * dx + dy * dy; if (dd < best) { best = dd; f = fl(h); } } }
    floor[j * nx + i] = f; }
  return { x0, y0, nx, ny, d, floor, box: g.box };
}
/** A group's grid, built now if it isn't yet (finishing what warmBasins began). */
function calmOf(g: Group): Calm {
  if (g.calm) return g.calm;
  const job = g.job ??= buildCalm(g); let r = job.next(); while (!r.done) r = job.next();
  g.job = undefined; return g.calm = r.value;
}
const nearBox = (g: Group, p: Vec, r: number) => p.x > g.box.x0 - r && p.x < g.box.x1 + r && p.y > g.box.y0 - r && p.y < g.box.y1 + r;
/**
 * Build, before the start, the grids of the harbors within `r` of these places (the course, her start, her slip, where
 * she's bound), so nothing is built mid-race there.
 */
export function prepareBasins(near: readonly Vec[], r: number): void { for (const g of GROUPS) if (!g.calm && near.some(p => nearBox(g, p, r))) calmOf(g); }
/**
 * Work on the nearest unbuilt grid within `r` of any of these places (the boats) for up to `ms` milliseconds, a slice at a
 * time, so a harbor a boat is sailing toward is ready long before she's there. The grid comes out the same however its
 * building is sliced. True while there's more to do.
 */
export function warmBasins(near: readonly Vec[], r: number, ms: number): boolean {
  let best: Group | null = null, bd = Infinity;
  for (const g of GROUPS) { if (g.calm) continue; for (const p of near) { if (!nearBox(g, p, r)) continue; const dx = Math.max(g.box.x0 - p.x, 0, p.x - g.box.x1), dy = Math.max(g.box.y0 - p.y, 0, p.y - g.box.y1), d = dx * dx + dy * dy; if (d < bd) { bd = d; best = g; } } }
  if (!best) return false;
  const job = best.job ??= buildCalm(best), t0 = performance.now();
  for (;;) { const r = job.next(); if (r.done) { best.calm = r.value; best.job = undefined; return true; } if (performance.now() - t0 >= ms) return true; }
}

/**
 * calmIn's answers by a wall, for the last few points asked, per grid: by a wall each answer traces lines of sight to
 * as many as 36 nodes, a sample every half meter, and a boat lying against the wall (pinned by the wind, or docking) is
 * asked about at the same point every step, by every look at her current. The same point on the same finished grid
 * gives the same answer, so it's kept: exactly the answer worked out. (Capacity's profile, 14 Nov 2026: 1.5 ms of a
 * 2.9 ms step, as long as she lay there.)
 */
const CALM_MEMO = new WeakMap<Calm, { x: Float64Array; y: Float64Array; v: Float64Array; next: number }>();
const MEMO_N = 16;
/** The calm one harbor's grid gives at p (1 off its grid, and in open water). */
function calmIn(c: Calm, p: Vec): number {
  const fx = (p.x - c.x0) / CELL, fy = (p.y - c.y0) / CELL, i = Math.floor(fx), j = Math.floor(fy);
  if (i < 0 || j < 0 || i >= c.nx - 1 || j >= c.ny - 1) return 1;
  // (bilinear between the four nodes, over those in water: a wall's own nodes don't pull it either way)
  // (only nodes in sight of p: by a thin wall the nodes on it are solid, and the water beyond it, a node away, mustn't
  // be blended in. Checked only there, next to a solid node)
  const nearWall = c.d[j * c.nx + i] < 0 || c.d[j * c.nx + i + 1] < 0 || c.d[(j + 1) * c.nx + i] < 0 || c.d[(j + 1) * c.nx + i + 1] < 0;
  if (!nearWall) return calmAt(c, p, fx, fy, i, j, false);
  let m = CALM_MEMO.get(c);
  if (!m) { m = { x: new Float64Array(MEMO_N).fill(NaN), y: new Float64Array(MEMO_N).fill(NaN), v: new Float64Array(MEMO_N), next: 0 }; CALM_MEMO.set(c, m); }
  for (let k = 0; k < MEMO_N; k++) if (m.x[k] === p.x && m.y[k] === p.y) return m.v[k];
  const r = calmAt(c, p, fx, fy, i, j, true);
  m.x[m.next] = p.x; m.y[m.next] = p.y; m.v[m.next] = r; m.next = (m.next + 1) % MEMO_N;
  return r;
}
function calmAt(c: Calm, p: Vec, fx: number, fy: number, i: number, j: number, nearWall: boolean): number {
  const u = fx - i, v = fy - j; let s = 0, w = 0;
  const seen = (I: number, J: number) => { if (!nearWall) return true; const q = { x: c.x0 + I * CELL, y: c.y0 + J * CELL };
    const L = Math.hypot(q.x - p.x, q.y - p.y), n = Math.max(1, Math.ceil(L / 0.5)); // (every half meter: a thin wall a meter off is still seen)
    for (let m = 1; m < n; m++) { const r = { x: p.x + (q.x - p.x) * m / n, y: p.y + (q.y - p.y) * m / n }; if (hitsWall(r) || onLand(r)) return false; } return true; };
  for (const [a, b, ww] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]] as const) {
    const d = c.d[(j + b) * c.nx + i + a]; if (d < 0 || ww <= 0 || !seen(i + a, j + b)) continue;
    const f = c.floor[(j + b) * c.nx + i + a]; s += ww * (f + (1 - f) * Math.exp(-Math.max(0, d - BASIN_CLEAR) / BASIN_MOUTH)); w += ww;
  }
  if (w > 0) return s / w;
  // (right against a wall, all four nodes solid: the nearest water nodes, two cells round, weighed by nearness)
  for (let b = -2; b <= 3; b++) for (let a = -2; a <= 3; a++) {
    const I = i + a, J = j + b; if (I < 0 || J < 0 || I >= c.nx || J >= c.ny) continue;
    const d = c.d[J * c.nx + I]; if (d < 0 || !seen(I, J)) continue;
    const ww = 1 / (0.01 + (I - fx) ** 2 + (J - fy) ** 2), f = c.floor[J * c.nx + I]; s += ww * (f + (1 - f) * Math.exp(-Math.max(0, d - BASIN_CLEAR) / BASIN_MOUTH)); w += ww;
  }
  // (nothing in sight: a sliver of water walled in on the grid, so calm)
  return w > 0 ? s / w : c.floor[Math.max(0, Math.min(c.ny - 1, j)) * c.nx + Math.max(0, Math.min(c.nx - 1, i))];
}
/** How much of the stream reaches p (1 in open water): the most open of the harbor grids it's on. */
/**
 * The slots between Fort Mason's piers: open to the Bay at their north ends, piles down both sides, so the stream that
 * runs under the piers crosses them too (no harbor's still water: they aren't a basin, and they aren't walled off).
 */
const SLOTS = (() => { const xs = PILE_PIERS.flatMap(P => P.pts.map(q => q.x)), ys = PILE_PIERS.flatMap(P => P.pts.map(q => q.y));
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; })();
/**
 * Between two of the piers (one to each side of p, west and east, each reaching p's latitude): how far in from the
 * slot's open end (the nearer of the two piers' heads), m; −1 if not in a slot.
 */
/** Each pier's southmost and northmost y. */
const PIER_Y = PILE_PIERS.map(P => [Math.min(...P.pts.map(q => q.y)), Math.max(...P.pts.map(q => q.y))]);
const pileSlotDepth = (p: Vec): number => {
  if (!(p.x > SLOTS.x0 && p.x < SLOTS.x1 && p.y > SLOTS.y0 && p.y < SLOTS.y1) || inBasin(p)) return -1;
  let west = -Infinity, east = -Infinity;
  // (a pier to the west or east where its outline crosses p's latitude, not by its box: a slanted pier's widest corner
  // would leave a strip beside its wall out of the slot, a step in the stream there)
  for (let n = 0; n < PILE_PIERS.length; n++) {
    const P = PILE_PIERS[n], [bot, top] = PIER_Y[n]; if (p.y < bot || p.y > top) continue;
    let xMin = Infinity, xMax = -Infinity;
    for (let i = 0; i < P.pts.length; i++) { const a = P.pts[i], b = P.pts[(i + 1) % P.pts.length];
      if ((a.y - p.y) * (b.y - p.y) > 0 || a.y === b.y) continue; const x = a.x + (b.x - a.x) * (p.y - a.y) / (b.y - a.y); xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); }
    if (xMax === -Infinity) continue;
    if (xMax <= p.x) west = Math.max(west, top); if (xMin >= p.x) east = Math.max(east, top); }
  return west > -Infinity && east > -Infinity ? Math.min(west, east) - p.y : -1;
};
/** In a slot the stream is the piles' (PILE_FLOW), from the open Bay's at its mouth over its first SLOT_IN meters. */
const SLOT_IN = 20;
/** Still water k beside a pile pier (pd m from its shed) brought up toward PILE_FLOW within its deck and the mixing zone past it. */
const pierMix = (k: number, pd: number, p: Vec) => k >= PILE_FLOW || pd >= DECK + PILE_MIX ? k : pd <= DECK ? PILE_FLOW : inBasin(p) ? k : k + (PILE_FLOW - k) * (1 - (pd - DECK) / PILE_MIX);
// (not inside a harbor's basin: a closed basin beside the pier has nowhere for the water to go, so none comes through the
// piles into it, only the slack under the deck's edge; Deep Physics' review of the cove's mouth)
const slotFlow = (depth: number) => PILE_FLOW + (1 - PILE_FLOW) * Math.max(0, 1 - depth / SLOT_IN);
/** As basinCalm, for drawing only: undefined where the grid isn't built yet (it never builds one). */
export function basinCalmIfBuilt(p: Vec): number | undefined {
  const pd = pilePierDist(p); if (pd <= 0) return 1;
  const sd = pileSlotDepth(p); if (sd >= 0) return pd <= DECK ? Math.min(PILE_FLOW, slotFlow(sd)) : slotFlow(sd);
  for (const g of GROUPS) if (p.x > g.box.x0 && p.x < g.box.x1 && p.y > g.box.y0 && p.y < g.box.y1) { if (!g.calm) return undefined; return pierMix(calmIn(g.calm, p), pd, p); }
  if (pd < DECK + PILE_MIX) return pierMix(1, pd, p);
  return 1;
}
export function basinCalm(p: Vec): number {
  // (under a pier on open piles the stream runs on, as the shore relief has it: the harbor beside it keeps its still water,
  // the pier's piles and its shed between them: geo/shore.ts PILE_PIERS. Across the piles the two mix, over a few meters)
  // (the water in the slots between the piers, and beside them, has just come through a pile field: no faster than
  // the piles let it, PILE_FLOW; under a shed itself shoreRelief already takes that, so here it's 1)
  if (offPiles(p, DECK + PILE_MIX)) return basinCalmGrid(p); // (beyond the piers' deck and the mix past it, as everywhere else on the Bay: one quick test, every boat, every step. The slots lie inside the piers' box, and past DECK + PILE_MIX pierMix gives the grid's own)
  const pd = pilePierDist(p); if (pd <= 0) return 1;
  const sd = pileSlotDepth(p); if (sd >= 0) return pd <= DECK ? Math.min(PILE_FLOW, slotFlow(sd)) : slotFlow(sd);
  // (beside a pier: still water there comes up toward what the piles pass, as it mixes with what came through them;
  // the open stream running past a pier's head isn't slowed)
  const k = basinCalmGrid(p);
  return pierMix(k, pd, p);
}
/** The harbors' grids' own calm at p (basinCalm, without the piers). */
function basinCalmGrid(p: Vec): number {
  for (const g of GROUPS) if (p.x > g.box.x0 && p.x < g.box.x1 && p.y > g.box.y0 && p.y < g.box.y1) return calmIn(calmOf(g), p);
  return 1;
}
/** (tests) Advance the build of harbor h's grid by n slices; true once it's built. */
export function _advanceBasin(h: Harbor, n: number): boolean {
  const g = GROUPS.find(g => g.harbors.includes(h))!; if (g.calm) return true;
  const job = g.job ??= buildCalm(g);
  for (let i = 0; i < n; i++) { const r = job.next(); if (r.done) { g.calm = r.value; g.job = undefined; return true; } }
  return false;
}
export const _calmGrid = (h: Harbor) => calmOf(GROUPS.find(g => g.harbors.includes(h))!);
/** (for the tests) The grids' boxes, and the harbors on each. */
export const basinGrids = () => GROUPS.map(g => ({ box: g.box, ids: g.harbors.map(h => h.id) }));
export const basinFloor = (h: Harbor) => h.breakwaters.length ? BASIN_EDDY : BASIN_OPEN;

/** Current at a point, in m/s, from the open-water current, eased near the shore. */
export function currentAt(p: Vec, open: Vec, lattice = false): Vec {
  const k = shoreRelief(p, lattice);
  return { x: open.x * k, y: open.y * k };
}

/** Wind felt on the water = air motion minus water motion. `c` is the current in m/s. */
export function windOnWater(w: Wind, c: Vec): Wind {
  const a = V(w.from);
  const wx = -a.x * w.kt - c.x / KT, wy = -a.y * w.kt - c.y / KT;
  return { from: brg(-wx, -wy), kt: Math.hypot(wx, wy) };
}
