import { KT, V, clamp, n360, type Vec } from '../core/math';
import type { Rng } from '../core/rng';
import { LL } from '../geo/geo';
import { shoreDist } from '../geo/shore';
import clim from './data/sf-wind-climate.json';

/** True wind over the ground. `from` is a compass direction, `kt` is speed in knots. */
export interface Wind { from: number; kt: number }

/**
 * The course-wide wind: a mean direction and speed with oscillating shifts on top (a 120 s and a 41 s direction
 * oscillation and a 63 s pressure pulse). With the sea breeze, `base` and `kt` follow the time of day.
 */
export interface WindModel { base: number; kt: number; phase: [number, number, number] }

export function windAt(m: WindModel, t: number): Wind {
  const p = m.phase;
  const from = m.base + 6 * Math.sin(2 * Math.PI * t / 120 + p[0]) + 2.5 * Math.sin(2 * Math.PI * t / 41 + p[1]);
  return { from: n360(from), kt: m.kt * (1 + 0.08 * Math.sin(2 * Math.PI * t / 63 + p[2])) };
}

/* ---------- the afternoon westerly, from five years of NOAA records ---------- */

interface ClimCell { kt: number[]; ktW: number[]; dir: number; west: number; gust: number }
const MONTHS = (clim as unknown as { months: ClimCell[][] }).months;

/** Which kind of westerly day: a light one, a typical one or a windy one (25th, 50th, 75th percentile). */
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
  from: number; // mean direction of the westerly at this hour
  kt: number; // open-water speed for the chosen kind of day
  gust: number; // typical gust / mean ratio
  west: number; // how often it's a westerly at this hour of this month (0–1)
}

/** The westerly for a time (minutes since epoch, UTC) and kind of day, interpolated between the hourly records. */
export function breezeAt(tMin: number, day: WindDay): Breeze {
  const parts = Object.fromEntries(fmt.formatToParts(new Date(tMin * 60000)).map(p => [p.type, p.value]));
  const m = (+parts.month - 1 + 12) % 12, h = (+parts.hour % 24) + +parts.minute / 60;
  const h0 = Math.floor(h) % 24, h1 = (h0 + 1) % 24, f = h - Math.floor(h);
  const a = MONTHS[m][h0], b = MONTHS[m][h1];
  const lerp = (x: number, y: number) => x + (y - x) * f;
  const dirA = a.dir || 255, dirB = b.dir || dirA;
  return {
    from: n360(dirA + ((((dirB - dirA) % 360) + 540) % 360 - 180) * f),
    kt: lerp(a.ktW[day], b.ktW[day]) * OPEN_WATER,
    gust: lerp(a.gust, b.gust),
    west: lerp(a.west, b.west)
  };
}

/* ---------- where it blows harder: the slot, and the shore ---------- */

/** The slot: the westerly funnels in through the Golden Gate and blows hardest along a band toward Alcatraz and Angel Island. */
const GATE = LL(37.8186, -122.4783), SLOT_DIR = V(78), SLOT_WIDTH = 1300, SLOT_BOOST = 0.2;

/**
 * How much stronger or lighter the wind is here than the open-water mean, from the lie of the land:
 * up to 20% more in the slot, down to 80% at the shore (friction and shelter), full strength ~400 m off.
 */
export function windTerrain(p: Vec): number {
  const dx = p.x - GATE.x, dy = p.y - GATE.y;
  const along = dx * SLOT_DIR.x + dy * SLOT_DIR.y, across = dx * SLOT_DIR.y - dy * SLOT_DIR.x;
  const slot = along < -800 ? 0 : Math.exp(-((across / SLOT_WIDTH) ** 2)) * (along > 6000 ? Math.exp(-(along - 6000) / 3000) : 1);
  const shore = 0.8 + 0.2 * clamp(shoreDist(p) / 400, 0, 1);
  return (1 + SLOT_BOOST * slot) * shore;
}

/* ---------- puffs and lulls ---------- */

/** A patch of stronger (puff) or lighter (lull) wind, carried downwind with the breeze. */
export interface Puff { x: number; y: number; r: number; amp: number; age: number; life: number }

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

  /** Carry the puffs downwind with the mean wind, age them, and replace the ones that have died out. */
  step(dt: number, mean: Wind): void {
    const go = this.dir = V(mean.from + 180), v = mean.kt * KT * 0.8; // puffs travel at a bit less than the wind speed
    for (const c of this.cells) {
      c.x += go.x * v * dt; c.y += go.y * v * dt; c.age += dt;
      if (c.age > c.life || Math.abs(c.x - this.center.x) > this.half + 300 || Math.abs(c.y - this.center.y) > this.half + 300) this.spawn(c);
    }
  }

  /** Strength of one puff at a point, 0..1: a smooth streak along the wind (`dir`), fading in and out over its life. */
  static weight(c: Puff, x: number, y: number, dir: Vec): number {
    const dx = x - c.x, dy = y - c.y, a = (dx * dir.x + dy * dir.y) / (c.r * PUFF_LONG), b = (dx * dir.y - dy * dir.x) / (c.r * PUFF_WIDE);
    const d2 = a * a + b * b;
    if (d2 >= 1) return 0;
    return (1 - d2) ** 2 * Math.sin(Math.PI * c.age / c.life);
  }

  /** Speed factor (1 = mean) and direction change (deg, + veered) at a point. */
  at(p: Vec): { k: number; veer: number } {
    let k = 1, veer = 0;
    for (const c of this.cells) {
      const w = Puffs.weight(c, p.x, p.y, this.dir);
      if (!w) continue;
      const a = c.amp * this.gustiness * w;
      k += a; veer += a > 0 ? a * 30 : a * 12; // a full puff (+0.3) veers ~9°, a deep lull backs ~3°
    }
    return { k: clamp(k, 0.45, 1.7), veer: clamp(veer, -6, 12) };
  }
}

/** windTerrain on a precomputed 50 m grid (for drawing the wind on the water, where it's needed at thousands of points). */
export class TerrainGrid {
  private g: Float32Array;
  private readonly n: number;
  constructor(readonly cx: number, readonly cy: number, readonly half = 5000, readonly cell = 50) {
    this.n = Math.round(2 * half / cell) + 1;
    this.g = new Float32Array(this.n * this.n);
    for (let j = 0; j < this.n; j++) for (let i = 0; i < this.n; i++) this.g[j * this.n + i] = windTerrain({ x: cx - half + i * cell, y: cy - half + j * cell });
  }
  at(x: number, y: number): number {
    const fx = (x - this.cx + this.half) / this.cell, fy = (y - this.cy + this.half) / this.cell;
    if (fx < 0 || fy < 0 || fx >= this.n - 1 || fy >= this.n - 1) return 1;
    const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, n = this.n, g = this.g;
    return (g[j * n + i] * (1 - u) + g[j * n + i + 1] * u) * (1 - v) + (g[(j + 1) * n + i] * (1 - u) + g[(j + 1) * n + i + 1] * u) * v;
  }
}
