import { shoreRelief } from './current';
import { KT, V, type Vec } from '../core/math';
import { LAT0, LL, LON0 } from '../geo/geo';
import depthGrid from './data/depth-grid.json';
import bayTides from './data/bay-tides.json';
import { landBetween, onGround } from '../geo/shore';
import { predict, type Constituents } from './harmonics';
import raw from './data/sf-currents.json';
import fitted from './data/fitted-currents.json';

/**
 * Real tidal currents around the Cityfront race area, predicted offline from NOAA station data
 * (src/environment/data/sf-currents.json, written by scripts/fetch-currents.mjs):
 *  - harmonic stations: summed from their tidal constituents (harmonics.ts);
 *  - subordinate stations: the reference station's slacks and peaks, shifted in time and scaled, joined by
 *    half-cosine curves (the way NOAA's subordinate predictions are published).
 * Across the water, station currents are blended by distance; near the shore the existing relief factor
 * eases them further (no station sits right on the Marina Green / Fort Mason shoreline).
 */

interface HarmonicDef { id: string; /** only a subordinate station's reference (its deeper bin), not in the field */ refOnly?: boolean; /** only a channel's flow into a bay (its depth-averaged stream), not in the field */ flowOnly?: boolean; kind: 'harmonic'; name: string; lat: number; lon: number; flood: number; ebb: number; z0: number; hc: Constituents }
interface SubordinateDef { id: string; kind: 'subordinate'; name: string; lat: number; lon: number; flood: number; ebb: number; ref: string; dt: [number, number, number, number]; amp: [number, number] }
type StationDef = HarmonicDef | SubordinateDef;
// NOAA's stations, and those NOAA measured but publishes no constants for, fitted by the sim to NOAA's record
// (scripts/fit-current-station.mjs: Richardson Bay, the one measurement inside one of the Bay's shallow embayments)
const DEFS = [...(raw as unknown as { stations: StationDef[] }).stations, ...(fitted as unknown as { stations: StationDef[] }).stations];

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
  return DEFS.filter(d => d.kind !== 'harmonic' || (!d.refOnly && !d.flowOnly)).map(d => build(d, from, to, cache));
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

/* ---------- the bays filled and emptied by the tide ---------- */

// No current has been measured inside San Rafael Bay or San Leandro Bay, and each has (almost) nothing behind it:
// whatever water crosses a line across one is what fills or empties the bay beyond that line, less what comes in by
// another way. So its stream is the tide's rise there times the water's area beyond, divided by the line's
// cross-section (continuity), flowing in on the flood and out on the ebb, across the line. The open water's stream
// outside (the stations') hands over to it across the first stretch in.
//  - The tide: each bay's own station, San Francisco's (9414290) by NOAA's offsets for it (bay-tides.json,
//    scripts/fetch-tide-height.mjs): Point San Quentin (9414873) for San Rafael Bay, 42–50 minutes after San Francisco
//    at 0.93–0.99 of the height; San Leandro Channel (9414724) for San Leandro Bay, 42–52 minutes after at 0.98–1.16,
//    the ratio and the lag blended between high water's and low water's by the tide's level (bayTide).
//  - The water: the sim's own shoreline, and NOAA's chart's depths below MLLW (depth-grid.json, make-depth-grid.mjs),
//    the tide added to them; flats the tide has left dry carry nothing and fill nothing.
//  - Across a line the stream runs faster over the deeper water: by Manning's friction law, with the water sloping the
//    same way all across, the speed goes as depth^(2/3), shared so that the flow across the line is still the tide's.
//  - San Leandro Bay has a second way in, the Tidal Canal from the Oakland Estuary. Its flow is NOAA's measured stream in
//    it (SFB1216, Alameda Estuary SE End, 2012: all nine of the ADCP's bins averaged, fitted by
//    fit-current-station.mjs; the near-surface bin alone runs only 4% faster) times its section there (the sim's shore,
//    the chart's depths and the tide: about 290 m² at MLLW, 440 at half tide, near USGS WRI 86-4057's 83.5 m by 5.5 m);
//    the lines between the bay's mouth and the canal carry the rest. The canal carries about as much as fills the bay,
//    so the San Leandro Channel carries the difference: a weak flow through the bay, at times out on the flood, its
//    size and even its way within the uncertainty of the bay's area and its station's offsets (as USGS found, the
//    channel west of Bay Farm Island shoaled once the canal was cut).

const BT = bayTides as unknown as { refMsl: number; refMhhw: number; hc: Constituents; stations: Record<string, { dtHigh: number; dtLow: number; kHigh: number; kLow: number; msl: number }> };
/** San Francisco's high and low waters (ms UTC, m above its MLLW), found a day at a time (every 6 minutes, then the parabola through the three round each). */
const EXTREMES = new Map<number, { t: number; h: number; high: boolean }[]>();
function refExtremes(ms: number): { t: number; h: number; high: boolean }[] {
  const day = Math.floor(ms / 864e5);
  let ev = EXTREMES.get(day);
  if (!ev) {
    const t0 = day * 864e5 - 864e5 / 2, ts = Array.from({ length: 2 * 240 + 1 }, (_, i) => t0 + i * 360e3), v = predict(BT.refMsl, BT.hc, ts);
    ev = [];
    for (let i = 1; i < v.length - 1; i++) if ((v[i] - v[i - 1]) * (v[i + 1] - v[i]) <= 0 && v[i] !== v[i - 1]) {
      const den = v[i - 1] - 2 * v[i] + v[i + 1], o = den !== 0 ? 0.5 * (v[i - 1] - v[i + 1]) / den : 0;
      ev.push({ t: ts[i] + o * 360e3, h: v[i] - 0.25 * (v[i - 1] - v[i + 1]) * o, high: v[i] > v[i - 1] });
    }
    if (EXTREMES.size > 64) EXTREMES.clear();
    EXTREMES.set(day, ev);
  }
  return ev;
}
/**
 * The tide's height (m above MLLW) at a bay's station at a time (ms UTC), and how fast it rises (m/s): NOAA's way with a
 * subordinate station, San Francisco's height above its MLLW times the station's ratio and later by its offset, at high
 * water the high-water ratio and lag, at low water the low-water ones, and between, blended by where the tide stands
 * between the low and the high water either side.
 */
export function bayTide(station: string, ms: number): { h: number; rise: number } {
  const S = BT.stations[station];
  const at = (t: number) => {
    let ref = 0, f = 0.5;
    for (let i = 0, dt = (S.dtHigh + S.dtLow) / 2 * 60e3; i < 3; i++) { // (the lag depends on the stage, the stage on the lag: round three times)
      const tr = t - dt, ev = refExtremes(tr);
      ref = predict(BT.refMsl, BT.hc, [tr])[0];
      const k = ev.findIndex(e => e.t > tr), a = ev[k - 1], b = ev[k];
      if (a && b) { const lo = a.high ? b : a, hi = a.high ? a : b; f = Math.min(1, Math.max(0, (ref - lo.h) / Math.max(1e-6, hi.h - lo.h))); }
      dt = (S.dtLow + (S.dtHigh - S.dtLow) * f) * 60e3;
    }
    return ref * (S.kLow + (S.kHigh - S.kLow) * f);
  };
  const a = at(ms - 300e3), b = at(ms), c = at(ms + 300e3);
  return { h: b, rise: (c - a) / 600 };
}
/** Point San Quentin's tide (San Rafael Bay's). */
export const sanQuentinTide = (ms: number) => bayTide('9414873', ms);

const DGJ = depthGrid as { step: number; offset: number; grids: { name: string; south: number; north: number; west: number; east: number; nx: number; ny: number; data: string }[] };
const DGRIDS = DGJ.grids.map(G => { const s = atob(G.data), g = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) g[i] = s.charCodeAt(i); return { ...G, g }; });
const D_MLAT = 111320, D_MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
/** The water's depth below MLLW (m) in the bays, from NOAA's chart on a 50 m grid (negative: a flat drying that high; 0 off the chart). */
export function depthAt(p: Vec): number {
  const lat = LAT0 + p.y / D_MLAT, lon = LON0 + p.x / D_MLON;
  for (const G of DGRIDS) {
    const i = Math.floor((lon - G.west) / (G.east - G.west) * G.nx), j = Math.floor((G.north - lat) / (G.north - G.south) * G.ny);
    if (i < 0 || j < 0 || i >= G.nx || j >= G.ny) continue;
    const b = G.g[j * G.nx + i];
    return b ? b * DGJ.step + DGJ.offset : 0;
  }
  return 0;
}

interface Bay {
  name: string; station: string;
  /** Its outline (its other sides over land), and its mouth: the line from q to m, the way in to the bay's side. */
  poly: Vec[]; q: Vec; m: Vec; into: Vec;
  /** How far in (m) the open water's stream hands over to the bay's own. */
  hand: number;
  /**
   * Other ways in: a channel whose measured stream (a station's, depth-averaged, + its flood into the bay) runs through
   * its section across the line through `c` along `across` (the sim's shore, the chart's depths, the tide), joining the
   * bay this far in (m).
   */
  inflows: { station: string; c: Vec; across: Vec; at: number }[];
}
const bay = (name: string, station: string, poly: Vec[], q: Vec, m: Vec, hand: number, inflows: Bay['inflows'] = []): Bay => {
  const L = Math.hypot(m.x - q.x, m.y - q.y); let into = { x: -(m.y - q.y) / L, y: (m.x - q.x) / L };
  const cx = poly.reduce((t, p) => t + p.x, 0) / poly.length, cy = poly.reduce((t, p) => t + p.y, 0) / poly.length;
  if ((cx - q.x) * into.x + (cy - q.y) * into.y < 0) into = { x: -into.x, y: -into.y };
  return { name, station, poly, q, m, into, hand, inflows };
};
// San Rafael Bay: inside the line from Point San Quentin toward Point San Pedro (its mouth on San Pablo Strait), to the
// chart's and the world's north edge (37.985° N; Point San Pedro itself, at 37.993°, lies just beyond it); its
// south-western side across the San Quentin peninsula's land (Corte Madera Creek, beyond it, drains the other way)
const SR_Q = LL(37.9445, -122.4870), SR_M = LL(37.985, -122.4870 + (37.985 - 37.9445) / (37.9930 - 37.9445) * (-122.4520 + 122.4870));
// San Leandro Bay: east of the San Leandro Channel's mouth past Bay Farm Island (122.2445 W), south of the Tidal
// Canal's mouth (37.7608 N: the canal north of it is the Estuary's, with its own station), to the world's east edge
const SL_Q = LL(37.7455, -122.2445), SL_M = LL(37.7545, -122.2445), SL_CANAL = LL(37.7605, -122.2238);
export const BAYS: Bay[] = [
  bay('San Rafael Bay', '9414873', [SR_Q, SR_M, LL(37.985, -122.5450), LL(37.9700, -122.5400)], SR_Q, SR_M, 1000),
  bay('San Leandro Bay', '9414724', [SL_Q, SL_M, LL(37.7608, -122.2445), LL(37.7608, -122.1887), LL(37.7352, -122.1887), LL(37.7352, -122.2445)], SL_Q, SL_M, 500,
    [{ station: 'SFB1216-mean', c: LL(37.76146, -122.22391), across: { x: 1, y: 0 }, at: SL_CANAL.x - SL_Q.x }])
];
/** How far into a bay a point is (m) from its mouth. */
const bayIn = (B: Bay, p: Vec): number => (p.x - B.q.x) * B.into.x + (p.y - B.q.y) * B.into.y;
const inPolyV = (P: Vec[], p: Vec): boolean => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; };
const bayAt = (p: Vec): Bay | null => { for (const B of BAYS) if (inPolyV(B.poly, p)) return B; return null; };
/** A flow-only station's stream (kt, + its flood) at a time (minutes UTC), from its harmonic constants. */
function inflowSpeed(id: string, tMin: number): number {
  const d = DEFS.find(x => x.id === id) as HarmonicDef | undefined;
  return d ? predict(d.z0, d.hc, [tMin * 60e3])[0] : 0;
}
/** A channel's wetted section (m²) across the line through `c` along `across`, every 2 m out to 150 m either side, with the tide `h` m above MLLW. */
const SECTIONS = new Map<string, { w: number; d: number }[]>();
function channelSection(c: Vec, across: Vec, h: number): number {
  const key = `${c.x},${c.y}`;
  let cells = SECTIONS.get(key);
  if (!cells) {
    cells = [];
    for (let s = -150; s <= 150; s += 2) { const p = { x: c.x + across.x * s, y: c.y + across.y * s }; if (!onGround(p)) cells.push({ w: 2, d: depthAt(p) }); }
    SECTIONS.set(key, cells);
  }
  return cells.reduce((t, k) => t + k.w * Math.max(0, k.d + h), 0);
}
const BAY_BIN = 50, BAY_CELL = 25; // (lines across a bay every 50 m; the water sampled every 25 m)
/** A bay's water, sampled once: each sample's line (how far in, in 50 m steps) and charted depth. */
const WATER = new Map<Bay, { bin: Int32Array; depth: Float64Array; bins: number }>();
function bayWater(B: Bay) {
  let w = WATER.get(B);
  if (w) return w;
  const xs = B.poly.map(q => q.x), ys = B.poly.map(q => q.y), bin: number[] = [], depth: number[] = [];
  for (let y = Math.min(...ys) + BAY_CELL / 2; y < Math.max(...ys); y += BAY_CELL) for (let x = Math.min(...xs) + BAY_CELL / 2; x < Math.max(...xs); x += BAY_CELL) {
    const q = { x, y }; if (!inPolyV(B.poly, q) || onGround(q)) continue;
    bin.push(Math.max(0, Math.floor(bayIn(B, q) / BAY_BIN))); depth.push(depthAt(q));
  }
  w = { bin: Int32Array.from(bin), depth: Float64Array.from(depth), bins: Math.max(0, ...bin) + 1 };
  WATER.set(B, w);
  return w;
}

/** The current field at one moment: station currents blended across the water by inverse-distance weighting. */
export class CurrentField {
  /** Each station's current at the field's time, worked out only when a point near it is asked about (stamp: which time). */
  private vecs: Vec[] = [];
  private stamp: Int32Array;
  private sx: Float64Array;
  /** Each bay's stream at the field's time: each line's speed factor (m/s per m^(2/3) of depth, + in), and the tide's height. */
  private bayFlow = new Map<Bay, { epoch: number; u: Float64Array; h: number }>();
  private sy: Float64Array;
  private tMin = 0;
  private epoch = 0;
  /**
   * Each station's smoothing length (m): 150 m, so the field is smooth round a station instead of spiking at it, but no
   * more than a quarter of the way to its nearest neighbour, so two stations close together (Richmond and Red Rock,
   * 290 m apart; the pairs off Treasure Island and Point Blunt) each still give their own prediction where they are.
   */
  private soft2: Float64Array;
  /** The span every station is predicted over (minutes since epoch, UTC): the latest of their starts to the earliest of their ends. */
  from = 0; to = 0;
  private span(): void {
    this.from = -Infinity; this.to = Infinity;
    for (const s of this.stations) if (s.t.length) { this.from = Math.max(this.from, s.t[0]); this.to = Math.min(this.to, s.t[s.t.length - 1]); }
  }
  constructor(readonly stations: TideStation[]) {
    this.span();
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
  /**
   * Keep the stations' predictions running for as long as she sails: each is predicted over a window (stationsFor),
   * and past its end it would hold its last value, every station frozen at a different point of its own tide (mid-flood
   * at one, mid-ebb at the next). Whenever less than 8¼ hours are left ahead (the tide's description looks 8 hours ahead
   * for the turn), or the clock is before the window, the stations are predicted afresh from the same harmonic constants,
   * from 4 hours back (the conditions graph and the strategist look back) to 14 hours on.
   */
  cover(tMin: number): void {
    if (!this.stations.length || (tMin >= this.from && tMin + 8 * 60 + 15 <= this.to)) return;
    const fresh = new Map(stationsFor(tMin - 4 * 60, tMin + 14 * 60).map(x => [x.id, x]));
    for (const st of this.stations) { const n = fresh.get(st.id); if (n) { st.t = n.t; st.v = n.v; } }
    this.span(); this.epoch++;
  }
  /** Station i's current (m/s) at the field's time. */
  stationVec(i: number): Vec {
    if (this.stamp[i] !== this.epoch) { this.vecs[i] = stationVector(this.stations[i], this.tMin); this.stamp[i] = this.epoch; }
    return this.vecs[i];
  }
  /**
   * The stations that count in each 400 m cell, worked out the first time the cell is asked about (the weights don't
   * change with time): those in sight over the water, less the weakest. The weakest are left out for as long as the most they could all weigh together, anywhere in the
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
      // only the stations in sight over the water: a station's stream doesn't reach through an island or a point of land
      // (Clipper Cove isn't driven by the stream west of Treasure Island). Seen from the cell's middle, or the first spot
      // in the cell that's water; a cell that sees none of them (a basin's corner) takes them all, eased by the shore.
      const from = [[0, 0], [150, 0], [-150, 0], [0, 150], [0, -150], [150, 150], [-150, 150], [150, -150], [-150, -150]].map(([dx, dy]) => ({ x: cx + dx, y: cy + dy })).find(q => !onGround(q));
      const sees = (i: number) => !from || !landBetween(from, this.stations[i].p);
      let seen = Array.from({ length: n }, (_, i) => sees(i));
      if (!seen.some(Boolean)) seen = seen.map(() => true);
      let low = 0;
      for (let i = 0; i < n; i++) {
        if (!seen[i]) continue;
        const s = this.stations[i].p, d = Math.hypot(cx - s.x, cy - s.y), dmin = Math.max(0, d - R), dmax = d + R;
        hi[i] = 1 / (dmin * dmin + this.soft2[i]) ** 1.5; low += 1 / (dmax * dmax + this.soft2[i]) ** 1.5;
      }
      // the weakest go, for as long as all that's gone could weigh no more than 0.1% of the rest
      const order = [...hi.keys()].filter(i => seen[i]).sort((a, b) => hi[a] - hi[b]), m = order.length;
      let gone = 0, k = 0;
      while (k < m - 1 && gone + hi[order[k]] <= 1e-3 * low) gone += hi[order[k++]];
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
    const c = ws > 0 ? { x: wx / ws, y: wy / ws } : { x: 0, y: 0 };
    const B = bayAt(p);
    if (!B) return c;
    const f = Math.min(1, Math.max(0, bayIn(B, p) / B.hand)), u = this.bayStream(B, p);
    return { x: c.x * (1 - f) + B.into.x * u * f, y: c.y * (1 - f) + B.into.y * u * f };
  }
  /** A bay's stream at a point inside it (m/s, + into the bay), by continuity (see above). */
  private bayStream(B: Bay, p: Vec): number {
    let F = this.bayFlow.get(B);
    if (!F || F.epoch !== this.epoch) {
      const W = bayWater(B), n = W.bins, area = new Float64Array(n), s53 = new Float64Array(n);
      const { h, rise } = bayTide(B.station, this.tMin * 60e3), a = BAY_CELL * BAY_CELL;
      for (let k = 0; k < W.bin.length; k++) { const d = W.depth[k] + h; if (d > 0.05) { area[W.bin[k]] += a; s53[W.bin[k]] += a / BAY_BIN * d ** (5 / 3); } }
      // (the other ways in: their measured flow, m³/s, + into the bay)
      const flows = B.inflows.map(f => ({ at: f.at, q: inflowSpeed(f.station, this.tMin) * KT * channelSection(f.c, f.across, h) }));
      const u = new Float64Array(n);
      for (let b = n - 1, beyond = 0; b >= 0; b--) {
        beyond += area[b] / 2; // (the water beyond the line through the middle of these 50 m)
        const mid = (b + 0.5) * BAY_BIN, other = flows.reduce((t, f) => t + (f.at > mid ? f.q : 0), 0);
        u[b] = s53[b] > 0 ? (beyond * rise - other) / s53[b] : 0; // (speed = u · depth^(2/3): Σ speed · depth · width = the flow across the line)
        beyond += area[b] / 2;
      }
      F = { epoch: this.epoch, u, h };
      this.bayFlow.set(B, F);
    }
    const b = Math.min(F.u.length - 1, Math.max(0, Math.floor(bayIn(B, p) / BAY_BIN))), d = depthAt(p) + F.h;
    return d > 0.05 ? F.u[b] * d ** (2 / 3) : 0;
  }
  /**
   * The current at a point, with the slack water along the Cityfront beach: the shore relief (current.ts) applies
   * only where no station is close by to say what the water there does (a station near the shore already measures it).
   */
  atShore(p: Vec): Vec {
    let dn = Infinity;
    { const list = this.near(p); for (let k = 0; k < list.length; k++) { const i = list[k], dx = p.x - this.sx[i], dy = p.y - this.sy[i]; dn = Math.min(dn, dx * dx + dy * dy); } } // (the nearest in sight is always among them)
    dn = Math.sqrt(dn);
    // (not in the bays filled by continuity, whose stream already runs slower over their shallower edges)
    const B = bayAt(p), bay = B ? Math.min(1, Math.max(0, bayIn(B, p) / B.hand)) : 0;
    const k = 1 - (1 - shoreRelief(p)) * Math.min(1, dn / 600) * (1 - bay), c = this.at(p);
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
