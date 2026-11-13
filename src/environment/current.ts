import { KT, V, brg, clamp, type Vec } from '../core/math';
import { anyShoreDist, anyShoreDistNear, onLand, wharfDist, wharfShelter } from '../geo/shore';
import { BREAKWATER_W, HARBORS, SHORE_W, hitsWall, inBasin, type Harbor } from '../geo/marina';
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
export const shoreRelief = (p: Vec, lattice = false): number => {
  const k = clamp(0.25 + 0.75 * (lattice ? anyShoreDistNear(p) : anyShoreDist(p)) / 350, 0.25, 1), w = wharfShelter(p); // (`lattice`: off the 10 m lattice, geo/shore.ts, for a boat's own current each step)
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
 * water is any 30 m clear of every wall and outside every basin (BASIN_CLEAR), and the stream is whole within that
 * distance of it, so it runs on along a breakwater's outside and in through a mouth. Past that it fades over
 * BASIN_MOUTH meters to BASIN_EDDY of itself in a harbor with breakwaters, or BASIN_OPEN among docks that lie open to
 * an estuary with no breakwater (more of the stream gets in among their piles and hulls). All four are estimates: no
 * measured figure was found for these harbors, or in general.
 */
export const BASIN_EDDY = 0.1, BASIN_OPEN = 0.3, BASIN_MOUTH = 30, BASIN_CLEAR = 30;
/** The raster each harbor's calm is worked out on: cell size and margin round its works (m). */
const CELL = 4, PAD = 120;
interface Calm { x0: number; y0: number; nx: number; ny: number; d: Float32Array; floor: number }
const CALMS = new Map<string, Calm>();
/** The distance through the water from open water (m; Infinity where it's solid or cut off), on a grid round harbor `h`. */
function calmOf(h: Harbor): Calm {
  let c = CALMS.get(h.id); if (c) return c;
  const x0 = h.reach.x0 - PAD, y0 = h.reach.y0 - PAD, nx = Math.ceil((h.reach.x1 - h.reach.x0 + 2 * PAD) / CELL) + 1, ny = Math.ceil((h.reach.y1 - h.reach.y0 + 2 * PAD) / CELL) + 1, N = nx * ny;
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
    for (const b of H.breakwaters) if (!b.area) line(b.pts, BREAKWATER_W / 2);
    for (const l of H.shore) line(l, SHORE_W / 2);
  }
  const basin = new Uint8Array(N);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const k = j * nx + i; if (solid[k]) continue; const p = at(i, j);
    if (onLand(p) || hitsWall(p)) solid[k] = 1; else if (inBasin(p)) basin[k] = 1; }
  // distances on the grid (8 neighbours, never cutting a solid corner), from `src` cells, through water
  const SQ = Math.SQRT2 * CELL, NB: [number, number, number][] = [[1, 0, CELL], [-1, 0, CELL], [0, 1, CELL], [0, -1, CELL], [1, 1, SQ], [1, -1, SQ], [-1, 1, SQ], [-1, -1, SQ]];
  const spread = (d: Float32Array, through: (k: number) => boolean) => { // (a Dijkstra on a small binary heap)
    const heap: number[] = []; const push = (k: number) => { heap.push(k); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (d[heap[p]] <= d[heap[i]]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && d[heap[l]] < d[heap[m]]) m = l; if (r < heap.length && d[heap[r]] < d[heap[m]]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const done = new Uint8Array(N); for (let k = 0; k < N; k++) if (d[k] === 0) push(k);
    while (heap.length) { const k = pop(); if (done[k]) continue; done[k] = 1; const i = k % nx, j = (k - i) / nx;
      for (const [di, dj, w] of NB) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= nx || b >= ny) continue; const q = b * nx + a;
        if (!through(q) || (di && dj && (!through(j * nx + a) || !through(b * nx + i)))) continue;
        if (d[k] + w < d[q]) { d[q] = d[k] + w; push(q); } } } };
  // open water: 30 m clear of every wall (its clearance spread over everything, walls the sources), outside every basin
  const clear = new Float32Array(N).fill(Infinity); for (let k = 0; k < N; k++) if (solid[k]) clear[k] = 0;
  spread(clear, () => true);
  const d = new Float32Array(N).fill(Infinity); for (let k = 0; k < N; k++) if (!solid[k] && !basin[k] && clear[k] >= BASIN_CLEAR) d[k] = 0;
  spread(d, q => !solid[q]);
  c = { x0, y0, nx, ny, d, floor: h.breakwaters.length ? BASIN_EDDY : BASIN_OPEN }; CALMS.set(h.id, c); return c;
}
/** The calm one harbor's grid gives at p (1 off its grid, and in open water). */
function calmIn(c: Calm, p: Vec): number {
  const fx = (p.x - c.x0) / CELL, fy = (p.y - c.y0) / CELL, i = Math.floor(fx), j = Math.floor(fy);
  if (i < 0 || j < 0 || i >= c.nx - 1 || j >= c.ny - 1) return 1;
  // (bilinear between the four nodes, over those in water: a wall's own nodes don't pull it either way)
  const u = fx - i, v = fy - j; let s = 0, w = 0;
  for (const [a, b, ww] of [[0, 0, (1 - u) * (1 - v)], [1, 0, u * (1 - v)], [0, 1, (1 - u) * v], [1, 1, u * v]] as const) {
    const d = c.d[(j + b) * c.nx + i + a]; if (!Number.isFinite(d) || ww <= 0) continue;
    s += ww * (c.floor + (1 - c.floor) * Math.exp(-Math.max(0, d - BASIN_CLEAR) / BASIN_MOUTH)); w += ww;
  }
  if (w > 0) return s / w;
  // (right against a wall, all four nodes solid: the nearest water nodes, two cells round, weighed by nearness)
  for (let b = -2; b <= 3; b++) for (let a = -2; a <= 3; a++) {
    const I = i + a, J = j + b; if (I < 0 || J < 0 || I >= c.nx || J >= c.ny) continue;
    const d = c.d[J * c.nx + I]; if (!Number.isFinite(d)) continue;
    const ww = 1 / (0.01 + (I - fx) ** 2 + (J - fy) ** 2); s += ww * (c.floor + (1 - c.floor) * Math.exp(-Math.max(0, d - BASIN_CLEAR) / BASIN_MOUTH)); w += ww;
  }
  return w > 0 ? s / w : 1;
}
/** How much of the stream reaches p (1 in open water): the most open of the harbor grids it's on. */
export function basinCalm(p: Vec): number {
  let k = 1, on = false;
  for (const h of HARBORS) {
    if (p.x < h.reach.x0 - PAD || p.x > h.reach.x1 + PAD || p.y < h.reach.y0 - PAD || p.y > h.reach.y1 + PAD) continue;
    const c = calmIn(calmOf(h), p); k = on ? Math.max(k, c) : c; on = true;
  }
  return k;
}
/** (for the tests) The fraction of the stream left deep inside harbor h. */
export const basinFloor = (h: Harbor) => calmOf(h).floor;

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
