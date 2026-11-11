import { shoreRelief } from './current';
import { KT, V, type Vec } from '../core/math';
import { LL } from '../geo/geo';
import { predict, type Constituents } from './harmonics';
import raw from './data/sf-currents.json';

/**
 * Real tidal currents around the Cityfront race area, predicted offline from NOAA station data
 * (src/environment/data/sf-currents.json, written by scripts/fetch-currents.mjs):
 *  - harmonic stations: summed from their tidal constituents (harmonics.ts);
 *  - subordinate stations: the reference station's slacks and peaks, shifted in time and scaled, joined by
 *    half-cosine curves (the way NOAA's subordinate predictions are published).
 * Across the water, station currents are blended by distance; near the shore the existing relief factor
 * eases them further (no station sits right on the Marina Green / Fort Mason shoreline).
 */

interface HarmonicDef { id: string; /** only a subordinate station's reference (its deeper bin), not in the field */ refOnly?: boolean; kind: 'harmonic'; name: string; lat: number; lon: number; flood: number; ebb: number; z0: number; hc: Constituents }
interface SubordinateDef { id: string; kind: 'subordinate'; name: string; lat: number; lon: number; flood: number; ebb: number; ref: string; dt: [number, number, number, number]; amp: [number, number] }
type StationDef = HarmonicDef | SubordinateDef;
const DEFS = (raw as unknown as { stations: StationDef[] }).stations;

/** A station's predicted speed over a time window: points (minutes since epoch UTC, kt + flood), joined by half-cosines. */
export interface TideStation {
  id: string; name: string; p: Vec; flood: number; ebb: number;
  t: number[]; v: number[];
}

const STEP = 6; // minutes between harmonic predictions

/** Times (minutes since epoch) of slack and peak events in a regular series: [t, v, kind]. kind: 0 max flood, 1 slack before ebb, 2 max ebb, 3 slack before flood. */
export function events(t: number[], v: number[]): [number, number, number][] {
  const out: [number, number, number][] = [];
  let peakI = -1;
  for (let i = 1; i < t.length; i++) {
    const a = v[i - 1], b = v[i];
    if ((a > 0 && b <= 0) || (a < 0 && b >= 0)) {
      if (peakI >= 0) out.push([t[peakI], v[peakI], v[peakI] > 0 ? 0 : 2]);
      const f = a / (a - b);
      out.push([t[i - 1] + f * (t[i] - t[i - 1]), 0, a > 0 ? 1 : 3]);
      peakI = i;
    } else if (peakI >= 0 && Math.abs(b) > Math.abs(v[peakI])) peakI = i;
  }
  return out;
}

function build(def: StationDef, from: number, to: number, cache: Map<string, TideStation>): TideStation {
  const base = { id: def.id, name: def.name, p: LL(def.lat, def.lon), flood: def.flood, ebb: def.ebb };
  if (def.kind === 'harmonic') {
    const t: number[] = [];
    for (let m = Math.floor(from / STEP) * STEP; m <= to + STEP; m += STEP) t.push(m);
    return { ...base, t, v: predict(def.z0, def.hc, t.map(m => m * 60000)) };
  }
  // subordinate: from the reference's events, widened so time offsets of a few hours stay covered
  const refDef = DEFS.find(d => d.id === def.ref)!;
  const ref = cache.get(`${def.ref}:${from - 720}:${to + 720}`) ?? build(refDef, from - 720, to + 720, cache);
  const ev = events(ref.t, ref.v).map(([tt, vv, k]) => [tt + def.dt[k], k === 0 ? vv * def.amp[0] : k === 2 ? vv * def.amp[1] : 0] as [number, number]);
  ev.sort((a, b) => a[0] - b[0]);
  return { ...base, t: ev.map(e => e[0]), v: ev.map(e => e[1]) };
}

/** All stations, predicted for a window of race time (minutes since epoch, UTC). */
export function stationsFor(from: number, to: number): TideStation[] {
  const cache = new Map<string, TideStation>();
  return DEFS.filter(d => d.kind !== 'harmonic' || !d.refOnly).map(d => build(d, from, to, cache));
}

/** Signed speed (kt, + flood) at a station at time `tMin` (minutes since epoch, UTC). */
export function stationSpeed(s: TideStation, tMin: number): number {
  const t = s.t, n = t.length;
  if (n === 0) return 0;
  if (tMin <= t[0]) return s.v[0];
  if (tMin >= t[n - 1]) return s.v[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (t[mid] <= tMin) lo = mid; else hi = mid; }
  const f = (tMin - t[lo]) / (t[hi] - t[lo]);
  return s.v[lo] + (s.v[hi] - s.v[lo]) * (1 - Math.cos(Math.PI * f)) / 2;
}

/** Current vector (m/s, the direction the water flows toward) at a station. */
export function stationVector(s: TideStation, tMin: number): Vec {
  const kt = stationSpeed(s, tMin), u = V(kt >= 0 ? s.flood : s.ebb), m = Math.abs(kt) * KT;
  return { x: u.x * m, y: u.y * m };
}

/** The current field at one moment: station currents blended across the water by inverse-distance weighting. */
export class CurrentField {
  /** Each station's current at the field's time, worked out only when a point near it is asked about (stamp: which time). */
  private vecs: Vec[] = [];
  private stamp: Int32Array;
  private sx: Float64Array;
  private sy: Float64Array;
  private tMin = 0;
  private epoch = 0;
  /**
   * Each station's smoothing length (m): 150 m, so the field is smooth round a station instead of spiking at it, but no
   * more than a quarter of the way to its nearest neighbour, so two stations close together (Richmond and Red Rock,
   * 290 m apart; the pairs off Treasure Island and Point Blunt) each still give their own prediction where they are.
   */
  private soft2: Float64Array;
  constructor(readonly stations: TideStation[]) {
    this.stamp = new Int32Array(stations.length).fill(-1);
    this.sx = Float64Array.from(stations, s => s.p.x); this.sy = Float64Array.from(stations, s => s.p.y);
    this.vecs = stations.map(() => ({ x: 0, y: 0 }));
    this.soft2 = Float64Array.from(stations, (s, i) => {
      let dn = Infinity;
      stations.forEach((o, j) => { if (j !== i) dn = Math.min(dn, Math.hypot(s.p.x - o.p.x, s.p.y - o.p.y)); });
      return Math.max(10, Math.min(150, dn / 4)) ** 2; // (10 m at least: two stations at one spot would otherwise divide by zero)
    });
  }
  setTime(tMin: number): void { if (tMin !== this.tMin || this.epoch === 0) { this.tMin = tMin; this.epoch++; } }
  /** Station i's current (m/s) at the field's time. */
  stationVec(i: number): Vec {
    if (this.stamp[i] !== this.epoch) { this.vecs[i] = stationVector(this.stations[i], this.tMin); this.stamp[i] = this.epoch; }
    return this.vecs[i];
  }
  /**
   * The stations that count in each 400 m cell, worked out the first time the cell is asked about (the weights don't
   * change with time). The weakest are left out for as long as the most they could all weigh together, anywhere in the
   * cell, is under 0.1% of the least the weights add up to there: the current changes by under 0.2% of the strongest
   * station's (under 0.01 kt).
   */
  private cells = new Map<number, Int32Array>();
  private lastKey = NaN;
  private lastList: Int32Array = new Int32Array(0);
  private near(p: Vec): Int32Array {
    const C = 400, ci = Math.floor(p.x / C), cj = Math.floor(p.y / C), key = (ci + 512) * 1024 + (cj + 512); // (a small integer: 200 km each way)
    if (key === this.lastKey) return this.lastList;
    let l = this.cells.get(key);
    if (!l) {
      const cx = (ci + 0.5) * C, cy = (cj + 0.5) * C, R = C * Math.SQRT1_2, n = this.stations.length, hi = new Float64Array(n);
      let low = 0;
      for (let i = 0; i < n; i++) {
        const s = this.stations[i].p, d = Math.hypot(cx - s.x, cy - s.y), dmin = Math.max(0, d - R), dmax = d + R;
        hi[i] = 1 / (dmin * dmin + this.soft2[i]) ** 1.5; low += 1 / (dmax * dmax + this.soft2[i]) ** 1.5;
      }
      // the weakest go, for as long as all that's gone could weigh no more than 0.1% of the rest
      const order = [...hi.keys()].sort((a, b) => hi[a] - hi[b]);
      let gone = 0, k = 0;
      while (k < n - 1 && gone + hi[order[k]] <= 1e-3 * low) gone += hi[order[k++]];
      l = Int32Array.from(order.slice(k).sort((a, b) => a - b));
      if (!(Number.isFinite(p.x) && Number.isFinite(p.y) && Math.abs(ci) < 512 && Math.abs(cj) < 512)) return l; // (far off: not filed)
      this.cells.set(key, l);
    }
    this.lastKey = key; this.lastList = l;
    return l;
  }
  at(p: Vec): Vec {
    let wx = 0, wy = 0, ws = 0;
    const list = this.near(p), sx = this.sx, sy = this.sy, soft2 = this.soft2, stamp = this.stamp, epoch = this.epoch;
    for (let k = 0; k < list.length; k++) {
      const i = list[k], dx = p.x - sx[i], dy = p.y - sy[i], q = dx * dx + dy * dy + soft2[i];
      const w = 1 / (q * Math.sqrt(q)); // 1 / (d² + soft²)^1.5: the nearest stations count most; smooth near a station instead of a spike
      const v = stamp[i] === epoch ? this.vecs[i] : this.stationVec(i);
      wx += v.x * w; wy += v.y * w; ws += w;
    }
    return ws > 0 ? { x: wx / ws, y: wy / ws } : { x: 0, y: 0 };
  }
  /**
   * The current at a point, with the slack water along the Cityfront beach: the shore relief (current.ts) applies
   * only where no station is close by to say what the water there does (a station near the shore already measures it).
   */
  atShore(p: Vec): Vec {
    let dn = Infinity;
    { const list = this.near(p); for (let k = 0; k < list.length; k++) { const i = list[k], dx = p.x - this.sx[i], dy = p.y - this.sy[i]; dn = Math.min(dn, dx * dx + dy * dy); } } // (the nearest is always among them)
    dn = Math.sqrt(dn);
    const k = 1 - (1 - shoreRelief(p)) * Math.min(1, dn / 600), c = this.at(p);
    return { x: c.x * k, y: c.y * k };
  }
}

/* ---------- local time in San Francisco ---------- */

const TZ = 'America/Los_Angeles';

/** UTC offset (minutes, negative west of Greenwich) in San Francisco at a UTC instant. */
// (the formatters made once: building one is slow, and the clock is shown every frame)
const OFFSET_FMT = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
const CLOCK_FMT = new Intl.DateTimeFormat('en-US', { timeZone: TZ, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' });
function sfOffsetMin(utcMs: number): number {
  const parts = OFFSET_FMT
    .formatToParts(new Date(utcMs)).reduce<Record<string, string>>((a, p) => { a[p.type] = p.value; return a; }, {});
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  return Math.round((asUtc - Math.floor(utcMs / 60000) * 60000) / 60000);
}

/** "2026-11-14", "12:30" in San Francisco local time → minutes since epoch, UTC. */
export function sfLocalToUtcMin(date: string, time: string): number {
  const [y, mo, d] = date.split('-').map(Number), [h, mi] = time.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let off = sfOffsetMin(guess - 8 * 3600e3);
  off = sfOffsetMin(guess - off * 60e3); // settle across a daylight-saving change
  return (guess - off * 60e3) / 60e3;
}

/** Minutes since epoch, UTC → "14:05", San Francisco local time. */
export function sfClock(tMin: number): string {
  return CLOCK_FMT.format(new Date(tMin * 60e3));
}

/** Next Saturday (or today if it is one), as YYYY-MM-DD in San Francisco: club racing day. */
export function nextSaturday(now = Date.now()): string {
  const fmt = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
  for (let d = 0; d < 7; d++) {
    const ms = now + d * 86400e3, wd = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(new Date(ms));
    if (wd === 'Sat') return fmt(ms);
  }
  return fmt(now);
}
