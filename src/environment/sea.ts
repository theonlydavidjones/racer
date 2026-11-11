import { D2R, KT, V, brg, clamp, dot, wrap, type Vec } from '../core/math';
import { LAT0, LL, LON0 } from '../geo/geo';
import { onLand } from '../geo/shore';
import { harborAt, hitsWall, inBasin } from '../geo/marina';
import mask from './data/land-mask.json';
import climate from './data/sf-swell-climate.json';
import type { Wind } from './wind';

/**
 * The sea state: what the waves are like at any point on the course, from the same wind and current the boats
 * sail in.
 *
 * - **Wind sea (chop):** grows with the wind over the water and the fetch (open water upwind, measured on the
 *   real coastline), by the standard fetch-limited growth laws from the JONSWAP experiment, up to a fully
 *   developed sea. Inside the Central Bay the fetch is short, so the westerly makes a short, steep chop.
 * - **Swell:** the ocean waves measured at the San Francisco Bar buoy (NDBC 46237, by month: a small, typical
 *   or big day), coming in through the Golden Gate and spreading and dying away inside the bay. How fast it
 *   dies is an estimate (there is no wave buoy inside the Central Bay to check it against).
 * - **Current:** waves are made by the wind blowing over the *water*, so an ebb under a westerly adds to the
 *   wind over the water and keeps the waves under the wind for longer (the waves' ground speed is slowed): a
 *   bigger, steeper sea. A flood with the wind does the opposite. Where waves run into a stronger opposing
 *   current they shorten and steepen (wave action is conserved), and at the extreme they break. That's the
 *   classic wind-against-tide chop off the Cityfront and in the Gate on a big ebb. All of it falls out of the
 *   physics; none of it is a special case.
 */

const G = 9.81;
const MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * D2R);
/** Longest fetch counted, m: beyond it the sea breeze itself runs out. */
export const MAX_FETCH = 20000;

/* ---------- the coastline, for fetch ---------- */

const M = mask as { south: number; north: number; west: number; east: number; nx: number; ny: number; rows: number[][] };
const LAND = (() => {
  const g = new Uint8Array(M.nx * M.ny);
  M.rows.forEach((runs, j) => { let i = 0, v = 0; for (const n of runs) { if (v) g.fill(1, j * M.nx + i, j * M.nx + i + n); i += n; v ^= 1; } });
  return g;
})();
/** Is there land here? `null` off the edge of the map (open ocean to the west, more bay to the east). */
export function landAt(p: Vec): boolean | null {
  const lat = LAT0 + p.y / MLAT, lon = LON0 + p.x / MLON;
  const i = Math.floor((lon - M.west) / (M.east - M.west) * M.nx), j = Math.floor((M.north - lat) / (M.north - M.south) * M.ny);
  if (i < 0 || j < 0 || i >= M.nx || j >= M.ny) return null;
  return LAND[j * M.nx + i] === 1 || onLandNear(p);
}
// the sim's own Cityfront coastline (what boats run aground on), checked only near it
const CF = { x0: LL(0, -122.48).x, x1: LL(0, -122.40).x, y0: LL(37.79, 0).y, y1: LL(37.815, 0).y };
const onLandNear = (p: Vec) => p.x > CF.x0 && p.x < CF.x1 && p.y > CF.y0 && p.y < CF.y1 && onLand(p);

/**
 * In a marina, the waves from `from` (deg) at `p`: traced finely (every 2 m) out of the basin, since its walls are only
 * metres away. `d`, m: how far to the wall or shore that stops them; or, if they come in through the entrance, how far
 * to where they're out past the harbor's walls (`out`), from where they're open water again.
 */
function basinRay(p: Vec, from: number): { d: number; out: Vec | null } {
  const u = V(from), H = harborAt(p)!;
  for (let d = 2; d < 3000; d += 2) {
    const q = { x: p.x + u.x * d, y: p.y + u.y * d };
    if (inBasin(q) ? hitsWall(q) : onLand(q)) return { d, out: null };
    if (q.x < H.reach.x0 || q.x > H.reach.x1 || q.y < H.reach.y0 || q.y > H.reach.y1) return { d, out: q };
  }
  return { d: 3000, out: null };
}

/** Open water straight upwind of `p` for wind from `from` (deg), m: to the first land, or MAX_FETCH. */
export function fetchRay(p: Vec, from: number, inHarbor = inBasin(p)): number {
  // in a marina: the breakwaters and the shore stop the chop within metres; through the entrance it comes in from the Bay
  // (`inHarbor` false: open water's fetch, measured coarsely as it always was, even from a point that's in a basin)
  if (inHarbor) { const r = basinRay(p, from); return r.out ? Math.min(MAX_FETCH, r.d + fetchRay(r.out, from)) : Math.max(2, r.d); }
  const u = V(from);
  for (let d = 50; d < MAX_FETCH; d += 100) {
    const l = landAt({ x: p.x + u.x * d, y: p.y + u.y * d });
    if (l === null) return MAX_FETCH; // out past the map: open water
    if (l) return Math.max(50, d - 50);
  }
  return MAX_FETCH;
}
/**
 * Effective fetch (m): the waves at a point are made over the open water across a spread of directions
 * around the wind, so the fetch is averaged over radials ±42° either side, weighted toward the wind (the
 * standard Saville method, as in the Shore Protection Manual). A narrow gap upwind counts for less than
 * open water all round.
 */
export function fetchAt(p: Vec, from: number, inHarbor = inBasin(p)): number {
  let num = 0, den = 0;
  for (let a = -42; a <= 42; a += 6) { const c = Math.cos(a * D2R); num += fetchRay(p, from + a, inHarbor) * c * c; den += c; }
  return num / den;
}

/* ---------- wave growth and wave–current interaction ---------- */

/** Fetch-limited wind sea (JONSWAP growth laws, deep water), capped at a fully developed sea: Hs (m), Tp (s). */
export function windSea(U: number, F: number): { hs: number; tp: number } {
  if (U < 0.5 || F <= 0) return { hs: 0, tp: 1 };
  const x = G * F / (U * U);
  const hs = Math.min(0.0016 * Math.sqrt(x), 0.243) * U * U / G;
  const tp = Math.min(0.286 * Math.cbrt(x), 8.13) * U / G;
  return { hs, tp: Math.max(1, tp) };
}

/** Deep-water group speed (m/s) for a wave period (s). */
export const groupSpeed = (T: number) => G * T / (4 * Math.PI);
/** Deep-water wavelength (m). */
export const wavelength = (T: number) => G * T * T / (2 * Math.PI);

/**
 * A wave train of height H and period T (measured where the current along it is zero) running into a current
 * U (m/s, + with the waves, − against them). The absolute frequency is conserved and so is wave action
 * (energy over intrinsic frequency, times the speed it travels at). Against the current the waves get
 * shorter and higher; if the current is stronger than the waves can make headway against, they're blocked
 * and break. Returns the new height and wavelength.
 */
export function onCurrent(H: number, T: number, U: number): { H: number; L: number; blocked: boolean } {
  const w0 = 2 * Math.PI / T, L0 = wavelength(T);
  if (Math.abs(U) < 1e-4 || H <= 0) return { H, L: L0, blocked: false };
  const disc = G + 4 * U * w0;
  if (disc <= 0) return { H: H * 1.6, L: L0 / 4, blocked: true }; // blocked: the waves pile up and break
  const s = (-Math.sqrt(G) + Math.sqrt(disc)) / (2 * U), k = s * s; // solves √(gk) + kU = ω0
  const sigma = Math.sqrt(G * k), cg = sigma / (2 * k), cg0 = G / (2 * w0);
  const ratio = (sigma / w0) * cg0 / Math.max(0.05 * cg0, cg + U); // E/E0
  return { H: H * Math.sqrt(ratio), L: 2 * Math.PI / k, blocked: false };
}

/* ---------- the swell ---------- */

export interface Swell { hs: number; tp: number; from: number }
export type SwellDay = 0 | 1 | 2;
const CLIMATE = climate as { months: { month: number; days: Swell[] }[] };
/** The swell outside the Gate on a small, typical or big day for the month of `date` (YYYY-MM-DD). */
export function swellFor(date: string, day: SwellDay): Swell {
  const m = clamp(+date.slice(5, 7) || 1, 1, 12);
  return { ...CLIMATE.months[m - 1].days[day] };
}

const BRIDGE = LL(37.81972, -122.47861), OUTSIDE = LL(37.8125, -122.53);
/** The channel's direction into the bay from the bridge (toward Alcatraz and Berkeley), deg. */
const INTO_BAY = 78;
/**
 * How much of the ocean swell reaches a point (0..1), and which way it's travelling there. Outside the
 * bridge it eases off toward the Gate; inside, it fans out from the bridge (diffraction) and dies away over
 * a few kilometres, and islands and points shadow it. An estimate.
 */
export function swellReach(p: Vec, shadow = true): { k: number; toward: number } {
  if (p.x < OUTSIDE.x) return { k: 1, toward: 85 };
  const dx = p.x - BRIDGE.x, dy = p.y - BRIDGE.y, d = Math.hypot(dx, dy);
  if (p.x < BRIDGE.x) { const t = (p.x - OUTSIDE.x) / (BRIDGE.x - OUTSIDE.x); return { k: 1 - 0.45 * t, toward: 80 }; }
  if (d < 1) return { k: 0.55, toward: INTO_BAY };
  // right by the bridge the swell is still all around; further in, it spreads out along the channel
  const toward = brg(dx, dy), off = Math.min(90, Math.abs(wrap(toward - INTO_BAY))) * clamp(d / 1500, 0, 1);
  let k = 0.55 * Math.exp(-d / 2800) * Math.pow(Math.cos(off * D2R), 1.5);
  // shadowed if land lies between the bridge and here
  for (let f = 0.1; f < 0.95 && k > 0 && shadow; f += 0.1) if (landAt({ x: BRIDGE.x + dx * f, y: BRIDGE.y + dy * f })) { k *= 0.15; break; }
  return { k, toward };
}

/* ---------- the sea at a point ---------- */

export interface SeaHere {
  /** Wind sea (chop): significant height (m), peak period (s), direction it comes from (deg). */
  hsW: number; tpW: number; fromW: number;
  /** Swell: the same. */
  hsS: number; tpS: number; fromS: number;
  /** Steepness of the chop (height / length); above about 0.07 it's short and steep. */
  steep: number;
  /** Whitecaps: fraction of the surface breaking (0..1, a few percent in a strong breeze). */
  white: number;
  /** Fetch upwind, m. */
  fetch: number;
  /** A passing vessel's wake, if one is under her now: height (m), period (s), the direction it comes from (deg). */
  wake?: { h: number; t: number; from: number };
}
export const FLAT_SEA: SeaHere = { hsW: 0, tpW: 1, fromW: 0, hsS: 0, tpS: 10, fromS: 270, steep: 0, white: 0, fetch: 0 };

export class SeaField {
  private cache = new Map<string, number>();
  /** `swell` outside the Gate; null for flat water (no waves at all). `chop`: the wind sea × this (the conditions adjuster). */
  constructor(readonly swell: Swell | null, readonly chop = 1) {}

  get flat(): boolean { return !this.swell; }

  /** Fetch, cached on a 150 m grid by wind direction (to 2°). */
  fetch(p: Vec, from: number): number {
    // by where `p` is: open water on a 150 m grid, a marina on a 10 m one (its walls shelter it within metres); always worked
    // out at the grid node, so it's the same whichever point asks first (the same seed, the same race). A cell whose node
    // is on the other side of a basin's edge (a few, by the marinas) isn't cached: worked out at `p` itself, each time.
    const harbor = inBasin(p), g = harbor ? 10 : 150, w = Math.round(from / 2) * 2;
    const c = { x: Math.round(p.x / g) * g, y: Math.round(p.y / g) * g };
    if (inBasin(c) !== harbor) return fetchAt(p, w, harbor);
    const key = `${w}:${g}:${Math.round(p.x / g)}:${Math.round(p.y / g)}`;
    let f = this.cache.get(key);
    if (f === undefined) {
      if (this.cache.size > 60000) this.cache.clear();
      f = fetchAt(c, w, harbor);
      this.cache.set(key, f);
    }
    return f;
  }

  /**
   * The sea at `p`, for the wind over the water there (`ww`, i.e. relative to the current) and the current
   * (`cur`, m/s). `currentAt` gives the current elsewhere (to see what the waves have come through).
   */
  at(p: Vec, ww: Wind, cur: Vec, currentAt: (q: Vec) => Vec): SeaHere {
    if (!this.swell) return FLAT_SEA;
    // the wind sea, made by the wind over the water across the fetch
    const U = ww.kt * KT, to = V(ww.from + 180), Uc = dot(cur, to);
    const F = this.fetch(p, ww.from);
    let w = windSea(U, F);
    for (let i = 0; i < 2; i++) { const cg = groupSpeed(w.tp); w = windSea(U, F * cg / Math.max(0.3 * cg, cg + Uc)); }
    // ... then steepened (or eased) by the change in current since the water the waves came through, ~1 km upwind
    const up = currentAt({ x: p.x - to.x * 1000, y: p.y - to.y * 1000 });
    const wc = onCurrent(w.hs, w.tp, Uc - dot(up, to));
    let hsW = wc.H * clamp((U - 1) / 2, 0, 1) * this.chop; // glassy below ~2 m/s
    hsW = Math.min(hsW, 0.1 * wc.L); // steeper than this, it breaks
    // the swell, from the ocean (no current) into whatever current is running here
    // (in a marina, its own walls shelter it below, traced finely: the 50 m terrain grid's shadow can land on the wrong side of a breakwater)
    const s = this.swell, reach = swellReach(p, !inBasin(p));
    // in a marina, the swell is stopped by its walls unless it runs straight in through the entrance (then only what diffracts round them)
    if (inBasin(p) && !basinRay(p, reach.toward + 180).out) reach.k *= 0.15;
    const sc = onCurrent(s.hs * reach.k, s.tp, dot(cur, V(reach.toward)));
    const hsS = Math.min(sc.H, 0.1 * sc.L);
    // whitecaps: the classic fraction-vs-wind law (Monahan), more where the chop is steep or blocked
    const steep = hsW / Math.max(1, wc.L);
    const white = clamp(3.84e-6 * Math.pow(U, 3.41) * clamp(steep / 0.05, 0.5, 3) * (wc.blocked ? 2 : 1), 0, 0.2);
    return { hsW, tpW: w.tp, fromW: ww.from, hsS, tpS: s.tp, fromS: (reach.toward + 180) % 360, steep, white, fetch: F };
  }
}

/** Plain words for the sea, e.g. "0.6 m chop, short and steep · 0.2 m swell". */
export function describeSea(s: SeaHere): string {
  if (s.hsW < 0.05 && s.hsS < 0.05) return 'flat water';
  const ft = (m: number) => `${(m / 0.3048).toFixed(m < 0.6 ? 1 : 0)} ft`;
  const chop = s.hsW < 0.05 ? 'glassy' : `${ft(s.hsW)} chop${s.steep > 0.075 ? ', short and steep' : s.hsW > 0.3 && s.steep < 0.05 ? ', long and smooth' : ''}`;
  return s.hsS >= 0.05 ? `${chop} · ${ft(s.hsS)} swell, ${Math.round(s.tpS)} s` : chop;
}
