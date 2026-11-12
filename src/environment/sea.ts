import { D2R, KT, V, brg, clamp, dot, n360, wrap, type Vec } from '../core/math';
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

const M = mask as { south: number; north: number; west: number; east: number; nx: number; ny: number; samples: number[]; block: number; rows: number[][] };
const LAND = (() => {
  const g = new Uint8Array(M.nx * M.ny);
  M.rows.forEach((runs, j) => { let i = 0, v = 0; for (const n of runs) { if (v) g.fill(1, j * M.nx + i, j * M.nx + i + n); i += n; v ^= 1; } });
  return g;
})();
/**
 * Is there land here? `null` off the edge of the map (open ocean to the west; San Pablo Bay to the north and the South
 * Bay to the south, both open water). Each ~100 m cell is 2 × 2 of the terrain's samples, which sit at grid nodes.
 */
export function landAt(p: Vec): boolean | null {
  const lat = LAT0 + p.y / MLAT, lon = LON0 + p.x / MLON;
  const i = Math.floor(((lon - M.west) / (M.east - M.west) * (M.samples[0] - 1) + 0.5) / M.block), j = Math.floor(((M.north - lat) / (M.north - M.south) * (M.samples[1] - 1) + 0.5) / M.block);
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

/**
 * Duration-limited growth: a sea takes time to build when the wind fills in. The time for a wind U (m/s, at 10 m) to
 * make the fetch-limited sea over a fetch X (m) is t = 77.23·X^0.67 / (U^0.34·g^0.33) (Coastal Engineering Manual,
 * EM 1110-2-1100, Part II-2, eq. II-2-35, in the wind at 10 m as windSea's growth laws are: 3.4 h for 18 km in 18 kt,
 * the Berkeley Circle; 40 min for 1.4 km): a sea blowing for less than that is the one a shorter fetch would make, its
 * "equivalent fetch" (II-2-35 the other way round).
 */
export const durationFetch = (U: number, t: number): number => U < 0.3 || t <= 0 ? 0 : (t * U ** 0.34 * G ** 0.33 / 77.23) ** (1 / 0.67);
/** ... and the time it takes (s), the other way round. */
export const fetchDuration = (U: number, X: number): number => U < 0.3 || X <= 0 ? 0 : 77.23 * X ** 0.67 / (U ** 0.34 * G ** 0.33);

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

/** The swell outside the Gate: its own height (m), period (s), direction from; `total`, the buoy's total height (m, the
 * swell and the ocean's wind sea: what NDBC shows as WVHT), for saying what the buoy reads. */
export interface Swell { hs: number; tp: number; from: number; total?: number }
export type SwellDay = 0 | 1 | 2;
const CLIMATE = climate as { months: { month: number; days: Swell[] }[] };
/** The swell outside the Gate on a small, typical or big day for the month of `date` (YYYY-MM-DD). */
export function swellFor(date: string, day: SwellDay): Swell {
  const m = clamp(+date.slice(5, 7) || 1, 1, 12), d = CLIMATE.months[m - 1].days[day];
  return { ...d, hs: d.hs * swellShare(d.hs), total: d.hs }; // (the climate is of the total height: the swell's share of it)
}
/**
 * The swell's share of the total significant height NDBC 46237 reports (WVHT, which includes the ocean's own wind sea,
 * which the sim makes for itself from the wind over the water): SwH/WVHT from the buoy's spectral summary, the 476
 * half-hourly records in the afternoon window the days are averaged over (11:00–17:00 local), 2 October – 11 November
 * 2026 (scripts/fetch-swell-split.mjs): a median 0.75 below 1.5 m, 0.82 at 1.5–2.5 m, 0.85 above (big seas are mostly
 * swell); a tenth of the time under 0.62. Fitted 0.71 + 0.048·Hs. Only the autumn's: the station keeps no spectral
 * history, so for summer's wind-driven afternoons (more wind sea, a smaller share) and winter's storms it's an estimate.
 */
export const swellShare = (hs: number) => clamp(0.71 + 0.048 * hs, 0.55, 0.92);

const BRIDGE = LL(37.81972, -122.47861), OUTSIDE = LL(37.8125, -122.53);
/** The channel's direction into the bay from the bridge (toward Alcatraz and Berkeley), deg. */
const INTO_BAY = 78;
/**
 * How much of the ocean swell reaches a point (0..1), and which way it's travelling there. Outside the
 * bridge it eases off toward the Gate; inside, it fans out from the bridge (diffraction) and dies away over
 * a few kilometres, and islands and points shadow it. Unsourced: the factors (0.55 of it at the bridge, falling over
 * about 2.8 km inside) are an estimate. No measured ratio inside the Gate to the bar buoy could be found; Hanes & Erikson
 * (2013, USGS) model the mechanism, but their numbers and the BCDC/ESA 2026 hazard study's weren't reachable from here.
 */
export function swellReach(p: Vec, shadow = true, from = 270): { k: number; toward: number } {
  // the swell's own direction outside; turned into the channel as it crosses the bar. South-west swell is turned
  // furthest, "ultra-refracted" round into the strait by the ebb-tidal delta (Hanes & Erikson, Estuarine Coastal Shelf
  // Sci. 133, 2013, abstract: the Bay "is vulnerable to ultra-refracted ocean waves, particularly southwest incident
  // swell"; Hanes, Ward & Erikson, Cont. Shelf Res. 31, 2011: more open to long swell "from the south or southwest than
  // the more common ocean waves coming from the northwest"). So from the south-west round to the strait's axis (258° out
  // from the bridge) it gets in whole; from north of the axis, past Point Bonita, with height ∝ √cos of its angle off it
  // (the size of that is a judgement: neither paper's numbers could be reached)
  const own = n360(from + 180), north = clamp(wrap(from - (INTO_BAY + 180)), 0, 85), dirK = Math.sqrt(Math.cos(north * D2R));
  if (p.x < OUTSIDE.x) return { k: 1, toward: own };
  const dx = p.x - BRIDGE.x, dy = p.y - BRIDGE.y, d = Math.hypot(dx, dy);
  if (p.x < BRIDGE.x) { const t = (p.x - OUTSIDE.x) / (BRIDGE.x - OUTSIDE.x); return { k: (1 - 0.45 * t) * (1 - t + t * dirK), toward: n360(own + wrap(80 - own) * t) }; }
  if (d < 1) return { k: 0.55 * dirK, toward: INTO_BAY };
  // right by the bridge the swell is still all around; further in, it spreads out along the channel
  const toward = brg(dx, dy), spread = Math.min(90, Math.abs(wrap(toward - INTO_BAY))) * clamp(d / 1500, 0, 1);
  let k = 0.55 * dirK * Math.exp(-d / 2800) * Math.pow(Math.cos(spread * D2R), 1.5);
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

  /**
   * How long the wind has been making the sea, course-wide (s; Infinity: as if it had blown for hours). Each point's sea
   * is the one its own fetch makes, or the fetch this duration makes in its own wind (the wind's been blowing as long
   * in the lee as in the slot), whichever is less. The changing-wind method of the Coastal Engineering Manual (Part
   * II-2, §II-2-2.g): when the wind changes, the sea there is now has the duration it would have taken the new wind to
   * make it (the same height: fetch-limited Hs goes as U·√X, so the fetch that makes it goes as (U_then/U_now)²); the
   * wind blows on for dt, and the sea is the one that longer duration makes. As the wind drops the sea keeps its height,
   * up to what the lighter wind makes over each point's own fetch (a real sea lingers longer, as swell: not modelled).
   */
  duration = Infinity;
  /** The wind the duration is reckoned in (m/s). */
  private durU = 0;
  get reckonedIn(): number { return this.durU; }
  /** Take up a duration worked out elsewhere, reckoned in wind `U` (m/s). */
  restore(U: number): void { this.durU = U; }
  /** The wind sea grows for `dt` s in a wind of `U` m/s (the open water's mean, without the puffs). */
  develop(U: number, dt: number): void {
    if (!Number.isFinite(this.duration) || U < 0.3) return;
    const X = this.durU > 0 ? durationFetch(this.durU, this.duration) * (this.durU / U) ** 2 : 0;
    // (no longer than it takes to grow the longest fetch there is: beyond that it's fully grown everywhere, and a long lull
    // mustn't leave it remembering more)
    this.duration = Math.min(fetchDuration(U, X) + dt, fetchDuration(U, MAX_FETCH)); this.durU = U;
  }

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
  at(p: Vec, ww: Wind, cur: Vec, currentAt: (q: Vec) => Vec, duration = this.duration): SeaHere {
    if (!this.swell) return FLAT_SEA;
    // the wind sea, made by the wind over the water across the fetch
    const U = ww.kt * KT, to = V(ww.from + 180), Uc = dot(cur, to);
    // (the fetch stretched or shortened by the current: the waves spend longer or less under the wind crossing it; a sea
    // still growing is limited by the time the wind has blown, which the current doesn't change)
    const F = this.fetch(p, ww.from), Fd = Number.isFinite(duration) ? durationFetch(U, duration) : Infinity;
    // (the conditions adjuster: the chop × `chop` as the sea a longer fetch would make, F × chop², so its height goes ×
    // chop and its period with it (JONSWAP's fetch-limited laws, windSea: Hs ∝ F^½, Tp ∝ F^⅓), and never past the fully
    // developed sea; not its height alone at the same period, which only made it steeper until it broke)
    const k2 = this.chop * this.chop, grow = (X: number) => windSea(U, X * k2);
    let w = grow(Math.min(F, Fd));
    for (let i = 0; i < 2; i++) { const cg = groupSpeed(w.tp); w = grow(Math.min(F * cg / Math.max(0.3 * cg, cg + Uc), Fd)); }
    // ... then steepened (or eased) by the change in current since the water the waves came through, ~1 km upwind
    const up = currentAt({ x: p.x - to.x * 1000, y: p.y - to.y * 1000 });
    const wc = onCurrent(w.hs, w.tp, Uc - dot(up, to));
    let hsW = wc.H * clamp((U - 1) / 2, 0, 1); // glassy below ~2 m/s
    hsW = Math.min(hsW, 0.1 * wc.L); // steeper than this, it breaks
    // the swell, from the ocean (no current) into whatever current is running here
    // (in a marina, its own walls shelter it below, traced finely: the 50 m terrain grid's shadow can land on the wrong side of a breakwater)
    const s = this.swell, reach = swellReach(p, !inBasin(p), s.from);
    // in a marina, the swell is stopped by its walls unless it runs straight in through the entrance (then only what diffracts round them)
    if (inBasin(p) && !basinRay(p, reach.toward + 180).out) reach.k *= 0.15;
    const sc = onCurrent(s.hs * reach.k, s.tp, dot(cur, V(reach.toward)));
    const hsS = Math.min(sc.H, 0.1 * sc.L);
    // whitecaps: the fraction of the water white, W = 3.84e-6·U^3.41 (U at 10 m, m/s: Monahan & O'Muircheartaigh, J. Phys.
    // Oceanogr. 10, 2094–2099, 1980, the law most models use; quoted, the paper itself not reachable from here): 0.4% in
    // 15 kt, 1.1% in 20, 2.4% in 25, 4.3% in 30. Doubled where an opposing current blocks the chop and it breaks (a
    // judgement); and no more than about a tenth (W levels off in a gale: Brumer et al., J. Phys. Oceanogr. 47, 2017, as
    // summarized). (It was scaled by the chop's steepness too, unsourced, which halved it in a breeze.)
    const steep = hsW / Math.max(1, wc.L);
    const white = clamp(3.84e-6 * Math.pow(U, 3.41) * (wc.blocked ? 2 : 1), 0, 0.1);
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

/**
 * How foam on the water drifts (m/s, east and north): with the surface water, the current plus the wind's drift of the
 * top layer, about 3% of the wind (the drift factor oil-spill and search-and-rescue models use: NOAA's GNOME takes 1–4%
 * windage for floating things). Not with the waves' crests, and nothing like the wind's own speed.
 */
export const FOAM_DRIFT = 0.03;
export function foamDrift(windFrom: number, windKt: number, cur: Vec): Vec {
  const d = V(windFrom + 180), u = windKt * KT * FOAM_DRIFT;
  return { x: d.x * u + cur.x, y: d.y * u + cur.y };
}
