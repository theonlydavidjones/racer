import { KT, V, clamp, n360, type Vec } from '../core/math';
import type { Rng } from '../core/rng';
import { LL } from '../geo/geo';
import { anyShoreDist, anyShoreDistNear } from '../geo/shore';
import { terrainLee } from './shadows';
import clim from './data/sf-wind-climate.json';

/** True wind over the ground. `from` is a compass direction, `kt` is speed in knots. */
export interface Wind { from: number; kt: number }

/**
 * The course-wide wind: a mean direction and speed. With the sea breeze, `base` and `kt` follow the time of day. Its
 * shifts come from the shift field (shifts.ts, from Fort Point's record) or, on a past day, from the record itself
 * (`shifted`); without either (a bare model, as in tests) a 120 s and a 41 s direction oscillation and a 63 s pressure
 * pulse stand in for them.
 */
export interface WindModel { base: number; kt: number; phase: [number, number, number]; steady?: number; shifted?: boolean }

export function windAt(m: WindModel, t: number): Wind {
  if (m.shifted) return { from: n360(m.base), kt: m.kt };
  const p = m.phase;
  // an unsteady wind (light and variable: steady ~0.3) swings further, and wanders over ten minutes or so
  const swing = clamp(0.75 / (m.steady ?? 1), 1, 2.5), wander = (swing - 1) * 22 * Math.sin(2 * Math.PI * t / 640 + p[0] * 1.7);
  const from = m.base + wander + swing * (6 * Math.sin(2 * Math.PI * t / 120 + p[0]) + 2.5 * Math.sin(2 * Math.PI * t / 41 + p[1]));
  return { from: n360(from), kt: m.kt * (1 + 0.08 * Math.sin(2 * Math.PI * t / 63 + p[2])) };
}

/* ---------- the day's wind, from five years of NOAA records ---------- */

/**
 * The kind of day: the westerly sea breeze; a northerly (behind a cold front, or the dry offshore wind; the
 * commonest winter wind); a southerly (ahead of a storm); or light and variable. From April to September it's
 * nearly always the westerly; from November to February the westerly comes on only a fifth to a half of days.
 */
export type WindKind = 'west' | 'north' | 'south' | 'light';
export const WIND_KINDS: WindKind[] = ['west', 'north', 'south', 'light'];
export const WIND_KIND_LABEL: Record<WindKind, string> = { west: 'Westerly', north: 'Northerly', south: 'Southerly', light: 'Light and variable' };

interface ClimCell { kt: number[]; dir: number; steady: number; gust: number }
interface ClimMonth { days: number; freq: Record<WindKind, number>; kinds: Record<WindKind, ClimCell[] | null> }
const MONTHS = (clim as unknown as { months: ClimMonth[] }).months;

/** Which kind of day of its kind: a light one, a typical one or a windy one (25th, 50th, 75th percentile). */
export type WindDay = 0 | 1 | 2;
export const WIND_DAY_LABEL = ['Light day', 'Typical day', 'Windy day'] as const;

/**
 * Open water vs the NOAA station. The station (9414290) is on the shore at Crissy Field, where the land
 * slows the wind; out on the race course it blows harder. This factor is an estimate, not a measurement:
 * with the shore slowdown below (0.8 at the beach), it makes the field agree with the station at the station.
 */
export const OPEN_WATER = 1.25;

const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', hourCycle: 'h23', month: 'numeric', hour: 'numeric', minute: 'numeric' });

export interface Breeze {
  kind: WindKind;
  from: number; // mean direction at this hour
  kt: number; // open-water speed for the chosen kind of day
  gust: number; // typical gust / mean ratio
  steady: number; // how steady the direction is (1 = always the same; light days ~0.3)
  freq: number; // how often this kind of day comes in this month (0–1)
}

/** How often each kind of day comes in a month (0 = January). */
export const windKindFreq = (month: number): Record<WindKind, number> => MONTHS[((month % 12) + 12) % 12].freq;

const hash = (s: string) => { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return (h >>> 0) / 4294967296; };
/**
 * The kind of day for a race date ('YYYY-MM-DD'): drawn from that month's records (the same date always gives the
 * same weather), or the one you chose.
 */
export function windKindFor(date: string, choice: WindKind | 'auto' = 'auto'): WindKind {
  if (choice !== 'auto') return choice;
  const f = windKindFreq(Number(date.slice(5, 7)) - 1);
  let u = hash('wx' + date);
  for (const k of WIND_KINDS) { if (u < f[k]) return k; u -= f[k]; }
  return 'west';
}

/** The wind for a time (minutes since epoch, UTC), kind of day, and light/typical/windy, interpolated between the hourly records. */
export function breezeAt(tMin: number, day: WindDay, kind: WindKind = 'west'): Breeze {
  const parts = Object.fromEntries(fmt.formatToParts(new Date(tMin * 60000)).map(p => [p.type, p.value]));
  const m = (+parts.month - 1 + 12) % 12, h = (+parts.hour % 24) + +parts.minute / 60;
  const cells = MONTHS[m].kinds[kind] ?? MONTHS[m].kinds.west!; // a kind that (almost) never comes this month: the westerly
  const h0 = Math.floor(h) % 24, h1 = (h0 + 1) % 24, f = h - Math.floor(h);
  const a = cells[h0], b = cells[h1];
  const lerp = (x: number, y: number) => x + (y - x) * f;
  return {
    kind: MONTHS[m].kinds[kind] ? kind : 'west',
    from: n360(a.dir + ((((b.dir - a.dir) % 360) + 540) % 360 - 180) * f),
    kt: lerp(a.kt[day], b.kt[day]) * OPEN_WATER,
    gust: lerp(a.gust, b.gust),
    steady: lerp(a.steady, b.steady),
    freq: MONTHS[m].freq[kind]
  };
}

/* ---------- where it blows harder: the slot, and the shore ---------- */

/** The slot: the westerly funnels in through the Golden Gate and blows hardest along a band toward Alcatraz and Angel Island. */
const GATE = LL(37.8186, -122.4783), SLOT_DIR = V(78), SLOT_WIDTH = 1300, SLOT_BOOST = 0.2;

/**
 * How much stronger or lighter the wind is here than the open-water mean, from the lie of the land:
 * up to 20% more in the slot, down to 80% at the shore (friction and shelter), full strength ~400 m off.
 */
/** How much of the slot jet is here (0..1): the air that came in through the Gate. */
export function slotWeight(p: Vec): number {
  const dx = p.x - GATE.x, dy = p.y - GATE.y;
  const along = dx * SLOT_DIR.x + dy * SLOT_DIR.y, across = dx * SLOT_DIR.y - dy * SLOT_DIR.x;
  return along < -800 ? 0 : Math.exp(-((across / SLOT_WIDTH) ** 2)) * (along > 6000 ? Math.exp(-(along - 6000) / 3000) : 1);
}

/**
 * The lee of the land (environment/shadows.ts). Where the slot jet blows, the air came in through the gap in the Gate,
 * not over the hills either side of it, so they don't shelter it there; islands in the jet (Alcatraz) still do.
 */
export function landLee(p: Vec, from: number): number {
  const lee = terrainLee(p, from);
  if (lee >= 1) return 1;
  const w = slotWeight(p) * slotFlow(from); if (w < 0.02) return lee;
  return lee + (terrainLee(p, from, true) - lee) * w; // in the jet, the hills flanking the Gate don't shelter it (islands in it still do)
}

/** How much the wind comes in through the Gate (the slot): all of a westerly, none of a northerly or southerly. */
export const slotFlow = (from: number): number => Math.max(0, Math.cos((from - 255) * Math.PI / 180)) ** 2;

export function windTerrain(p: Vec, from = 255, lattice = false): number {
  const slot = slotWeight(p) * slotFlow(from);
  // (`lattice`: the shore's distance off its 10 m lattice, geo/shore.ts anyShoreDistNear, a few metres out at most, so
  // under 0.3% of the wind here, typically 0.005% (the review's measure over the water within 420 m of a shore): for a boat's own wind every step, as for her current; the map keeps the exact one)
  const shore = 0.8 + 0.2 * clamp((lattice ? anyShoreDistNear(p) : anyShoreDist(p)) / 400, 0, 1); // (every shore: the Cityfront's, the islands', Marin's and the East Bay's)
  return (1 + SLOT_BOOST * slot) * shore;
}

/* ---------- puffs and lulls ---------- */

/** A patch of stronger (puff) or lighter (lull) wind, carried downwind with the breeze. */
export interface Puff { x: number; y: number; r: number; amp: number; age: number; life: number; /** the way it travels (unit vector, downwind): the wind where it is */ dx?: number; dy?: number; /** and how fast (m/s) */ v?: number }

/** Puffs are streaks, longer downwind than across: half-length r × PUFF_LONG, half-width r × PUFF_WIDE. */
const PUFF_LONG = 1.5, PUFF_WIDE = 0.75;

/**
 * Puffs and lulls drifting downwind across the course. A puff is up to about a third stronger and veered a
 * few degrees (in the northern hemisphere, wind brought down from aloft is veered); a lull is lighter and
 * backed slightly. Each fades in and out over a minute or three. How strong they are follows the gust factor.
 */
export class Puffs {
  readonly cells: Puff[] = [];
  /** Scales the puffs' strength from the gust factor (1 = typical). */
  gustiness = 1;
  constructor(private rng: Rng, private center: Vec, private half = 3000, n = 170) {
    for (let i = 0; i < n; i++) { const c = this.spawn(); c.age = this.rng() * c.life; this.cells.push(c); }
  }
  /** Downwind unit vector, for the puffs' shape. */
  dir: Vec = { x: 1, y: 0 };
  /** Gust factor from the records (gust / mean, typically 1.4–1.7). */
  setGust(gust: number): void { this.gustiness = clamp((gust - 1) / 0.55, 0.5, 1.5); }

  private spawn(c?: Puff): Puff {
    const r = this.rng, puff = r() < 0.5; // as many lulls as puffs, so the average wind stays the same
    const n: Puff = {
      x: this.center.x + (r() * 2 - 1) * this.half, y: this.center.y + (r() * 2 - 1) * this.half,
      r: 70 + r() * 160, amp: puff ? 0.1 + r() * 0.2 : -(0.1 + r() * 0.18), age: 0, life: 60 + r() * 150
    };
    return c ? Object.assign(c, n) : n;
  }

  private localT = 0;
  /**
   * Carry the puffs downwind, age them, and replace the ones that have died out. Each travels with the wind where it
   * is: `local` gives the wind's turn from the mean (deg) and its speed factor at a point (the day's pattern across the
   * Bay, sim/world.ts fieldAt), looked up for each puff once a second. Without it, they all go with the mean wind.
   */
  step(dt: number, mean: Wind, local?: (p: Vec) => { turn: number; k: number }): void {
    this.dir = V(mean.from + 180);
    this.localT -= dt;
    const look = local && this.localT <= 0; if (look) this.localT = 1;
    for (const c of this.cells) {
      if (look || c.dx == null) {
        const f = local ? local(c) : { turn: 0, k: 1 }, d = V(mean.from + f.turn + 180);
        c.dx = d.x; c.dy = d.y; c.v = mean.kt * KT * f.k * 0.8; // puffs travel at a bit less than the wind speed
      }
      const v = c.v ?? mean.kt * KT * 0.8;
      c.x += c.dx! * v * dt; c.y += c.dy! * v * dt; c.age += dt;
      if (c.age > c.life || Math.abs(c.x - this.center.x) > this.half + 300 || Math.abs(c.y - this.center.y) > this.half + 300) { this.spawn(c); c.dx = c.dy = c.v = undefined; }
    }
    this.steps++; bucketPuffs(this);
  }
  /** Steps taken (the buckets below are for this many: a copy of the puffs that hasn't stepped, the page's mirror, has none). */
  steps = 0;

  /** Strength of one puff at a point, 0..1: a smooth streak along the wind where it is (or `dir`), fading in and out over its life. */
  static weight(c: Puff, x: number, y: number, mean: Vec): number {
    const ux = c.dx ?? mean.x, uy = c.dy ?? mean.y; // (no object per call: this runs for every puff, for every boat, every step)
    // (a point outside the square about the streak's long radius is outside the streak: its distance is at least that
    // radius, and the streak's ellipse lies inside it, its direction a unit vector. With a margin of 1 in 10 000 the
    // answer is the 0 the full sum gives, whatever the rounding: most puffs are far from most boats)
    const R = c.r * PUFF_LONG * 1.0001, dx = x - c.x, dy = y - c.y;
    if (dx > R || dx < -R || dy > R || dy < -R) return 0;
    const a = (dx * ux + dy * uy) / (c.r * PUFF_LONG), b = (dx * uy - dy * ux) / (c.r * PUFF_WIDE);
    const d2 = a * a + b * b;
    if (d2 >= 1) return 0;
    return (1 - d2) ** 2 * Math.sin(Math.PI * c.age / c.life);
  }

  /** Speed factor (1 = mean) and direction change (deg, + veered) at a point. */
  at(p: Vec): { k: number; veer: number } {
    let k = 1, veer = 0;
    const add = (c: Puff) => {
      const w = Puffs.weight(c, p.x, p.y, this.dir);
      if (!w) return;
      const a = c.amp * this.gustiness * w;
      k += a; veer += a > 0 ? a * 30 : a * 12; // a full puff (+0.3) veers ~9°, a deep lull backs ~3°
    };
    const g = BUCKETS.get(this);
    if (g && g.steps === this.steps) { for (const i of g.near(p.x, p.y)) add(this.cells[i]); } // (only the puffs that can reach her, in their order)
    else for (const c of this.cells) add(c);
    return { k: clamp(k, 0.45, 1.7), veer: clamp(veer, -6, 12) };
  }
}

/**
 * The puffs by where they are, in squares as wide as the longest streak's radius (with weight's margin), so a puff that
 * reaches a point is in its square or one beside it: a boat's wind sums only those, in the puffs' own order, and the
 * rest give the 0 weight() would. The same sums, from a few puffs where it was all 170, for each boat every step.
 * Kept beside the puffs, not on them, so the page's mirror isn't sent them; made again each step (puffs.steps).
 */
interface PuffBuckets { steps: number; near(x: number, y: number): Int32Array }
interface Grid extends PuffBuckets { size: number; x0: number; y0: number; nx: number; ny: number; head: Int32Array; next: Int32Array; out: Int32Array }
const BUCKETS = new WeakMap<Puffs, Grid>();
function bucketPuffs(f: Puffs): void {
  let size = 1, x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of f.cells) { size = Math.max(size, c.r * PUFF_LONG * 1.0001); x0 = Math.min(x0, c.x); y0 = Math.min(y0, c.y); x1 = Math.max(x1, c.x); y1 = Math.max(y1, c.y); }
  const nx = Math.max(1, Math.floor((x1 - x0) / size) + 1), ny = Math.max(1, Math.floor((y1 - y0) / size) + 1);
  let g = BUCKETS.get(f);
  if (!g) {
    g = { steps: 0, size, x0, y0, nx, ny, head: new Int32Array(0), next: new Int32Array(0), out: new Int32Array(0), near(x, y) {
      const G = this as Grid, out = G.out; let n = 0;
      const bx = Math.floor((x - G.x0) / G.size), by = Math.floor((y - G.y0) / G.size);
      for (let j = Math.max(0, by - 1); j <= Math.min(G.ny - 1, by + 1); j++)
        for (let i = Math.max(0, bx - 1); i <= Math.min(G.nx - 1, bx + 1); i++) for (let k = G.head[j * G.nx + i]; k >= 0; k = G.next[k]) out[n++] = k;
      // (the puffs' own order, so the sums add up as they did: a typed array sorts its numbers as numbers, no comparator)
      return out.subarray(0, n).sort();
    } };
    BUCKETS.set(f, g);
  }
  // (each square's puffs a chain through next[], the arrays kept from step to step: nothing new a step)
  if (g.head.length < nx * ny) g.head = new Int32Array(nx * ny * 2);
  if (g.next.length < f.cells.length) g.next = new Int32Array(f.cells.length);
  if (g.out.length < f.cells.length) g.out = new Int32Array(f.cells.length); // (each puff once at most in near's nine squares)
  g.head.fill(-1, 0, nx * ny);
  g.steps = f.steps; g.size = size; g.x0 = x0; g.y0 = y0; g.nx = nx; g.ny = ny;
  const cells = f.cells, head = g.head, next = g.next;
  for (let i = 0; i < cells.length; i++) { const c = cells[i], b = Math.floor((c.y - y0) / size) * nx + Math.floor((c.x - x0) / size); next[i] = head[b]; head[b] = i; }
}

/** windTerrain on a precomputed 50 m grid (for drawing the wind on the water, where it's needed at thousands of points). */
/** The spacing (m) of TerrainGrid's nodes beyond its grid, as the lee's inside it. */
const FAR_CELL = 200;
export class TerrainGrid {
  private g: Float32Array;
  private readonly n: number;
  /** `from`: the wind direction, for the lee of the land (environment/shadows.ts); omitted, no lee. */
  /** Beyond the grid: the same terrain and lee on 200 m nodes, worked out as they're first needed (TerrainGrid.at). */
  private outer = new Map<number, number>();
  constructor(readonly cx: number, readonly cy: number, readonly half = 5000, readonly cell = 50, private readonly from?: number) {
    this.n = Math.round(2 * half / cell) + 1;
    this.g = new Float32Array(this.n * this.n);
    // the lee of the land changes slowly across the water: worked out every 200 m and interpolated
    const lc = 200, ln = Math.round(2 * half / lc) + 1, lee = new Float32Array(ln * ln).fill(1);
    if (from != null) for (let j = 0; j < ln; j++) for (let i = 0; i < ln; i++) lee[j * ln + i] = landLee({ x: cx - half + i * lc, y: cy - half + j * lc }, from);
    const leeAt = (x: number, y: number) => {
      const fx = Math.min(ln - 1.001, Math.max(0, (x - cx + half) / lc)), fy = Math.min(ln - 1.001, Math.max(0, (y - cy + half) / lc)), i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
      return (lee[j * ln + i] * (1 - u) + lee[j * ln + i + 1] * u) * (1 - v) + (lee[(j + 1) * ln + i] * (1 - u) + lee[(j + 1) * ln + i + 1] * u) * v;
    };
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) {
      const p = { x: cx - half + i * cell, y: cy - half + j * cell };
      this.g[j * this.n + i] = windTerrain(p, from ?? 255) * leeAt(p.x, p.y);
    }
  }
  at(x: number, y: number): number {
    const fx = (x - this.cx + this.half) / this.cell, fy = (y - this.cy + this.half) / this.cell, m = this.n - 1;
    if (fx < 0 || fy < 0 || fx >= m || fy >= m) return this.far(x, y);
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, n = this.n, g = this.g;
    const near = (g[j * n + i] * (1 - u) + g[j * n + i + 1] * u) * (1 - v) + (g[(j + 1) * n + i] * (1 - u) + g[(j + 1) * n + i + 1] * u) * v;
    // across its last 200 m, eased into the coarser nodes beyond it, so the wind drawn on the water has no edge (it
    // fell to 1 outside: up to 70% off Lands End, a straight seam west of the Gate)
    const e = Math.min(fx, fy, m - fx, m - fy) * this.cell / FAR_CELL;
    if (e >= 1) return near;
    const sm = e * e * (3 - 2 * e);
    return this.far(x, y) * (1 - sm) + near * sm;
  }
  /** The terrain and lee at (x, y) off the 200 m nodes beyond the grid (each worked out once, as it's needed). */
  private far(x: number, y: number): number {
    const fx = (x - this.cx) / FAR_CELL, fy = (y - this.cy) / FAR_CELL, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
    const node = (a: number, b: number) => {
      const key = (a + 32768) * 65536 + (b + 32768);
      let val = this.outer.get(key);
      if (val === undefined) {
        const p = { x: this.cx + a * FAR_CELL, y: this.cy + b * FAR_CELL };
        val = windTerrain(p, this.from ?? 255) * (this.from != null ? landLee(p, this.from) : 1); this.outer.set(key, val);
      }
      return val;
    };
    return (node(i, j) * (1 - u) + node(i + 1, j) * u) * (1 - v) + (node(i, j + 1) * (1 - u) + node(i + 1, j + 1) * u) * v;
  }
}
