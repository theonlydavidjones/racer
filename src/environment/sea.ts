import { D2R, KT, V, brg, clamp, dot, wrap, type Vec } from '../core/math';
import { LAT0, LL, LON0 } from '../geo/geo';
import { onLand } from '../geo/shore';
import { harborAt, harborNear, hitsWall, inBasin, type Harbor } from '../geo/marina';
import mask from './data/land-mask.json';
import gapTable from './data/gap-diffraction.json';
import enc from '../geo/data/enc-chart.json';
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
 * In or by a marina, the waves from `from` (deg) at `p`: traced finely (every 2 m) out past its works, since its walls
 * are only metres away. `d`, m: how far to the wall or shore that stops them; or, if they come in through the entrance
 * (or past the breakwaters, outside), how far to where they're out past the harbor's walls (`out`), from where they're
 * open water again.
 */
function basinRay(p: Vec, from: number, H = harborAt(p) ?? harborNear(p)!): { d: number; out: Vec | null } {
  const u = V(from);
  for (let d = 2; d < 3000; d += 2) {
    const q = { x: p.x + u.x * d, y: p.y + u.y * d };
    if (inBasin(q) ? hitsWall(q) : onLand(q)) return { d, out: null };
    if (q.x < H.reach.x0 || q.x > H.reach.x1 || q.y < H.reach.y0 || q.y > H.reach.y1) return { d, out: q };
  }
  return { d: 3000, out: null };
}

/** Where the fetch is traced finely: in a marina's basin, or by its works outside (its breakwaters, its shore). */
export const fineFetch = (p: Vec): boolean => inBasin(p) || harborNear(p) !== null;
/** Open water straight upwind of `p` for wind from `from` (deg), m: to the first land, or MAX_FETCH. */
export function fetchRay(p: Vec, from: number, fine = fineFetch(p)): number {
  // in or by a marina: the breakwaters and the shore stop the chop within metres; through the entrance it comes in from
  // the Bay. Just outside the entrance is traced the same fine way as just inside, so the two agree (the coarse ~100 m
  // land cells, and their 50 m least fetch, would make the water outside a breakwater calmer than the water inside it).
  // (`fine` false: open water's fetch, measured coarsely as it always was, even from a point that's in a basin)
  if (fine) { const r = basinRay(p, from); return r.out ? Math.min(MAX_FETCH, r.d + fetchRay(r.out, from)) : Math.max(2, r.d); }
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
export function fetchAt(p: Vec, from: number, fine = fineFetch(p)): number {
  // (by a marina, every 2°: a 20–40 m entrance 100 m off spans only about 15°, so 6° steps let one ray more or less
  // through it swing the fetch threefold from one point to the next)
  let num = 0, den = 0;
  const step = fine ? 2 : 6;
  for (let a = -42; a <= 42; a += step) { const c = Math.cos(a * D2R); num += fetchRay(p, from + a, fine) * c * c; den += c; }
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

/* ---------- the swell through a marina's entrance ---------- */

/** The wavelength (m) of a wave of period T (s) in water h m deep: linear dispersion, ω² = g·k·tanh(k·h). */
export function waveLength(T: number, h: number): number {
  const w2 = (2 * Math.PI / T) ** 2;
  let k = w2 / G; // (deep water's, then Newton's method)
  for (let i = 0; i < 30; i++) { const t = Math.tanh(k * h), f = G * k * t - w2, df = G * t + G * k * h * (1 - t * t); const dk = f / df; k -= dk; if (Math.abs(dk) < 1e-9 * k) break; }
  return 2 * Math.PI / k;
}

/** The water's depth below MLLW (m) at a point on NOAA's chart: the middle of its depth area's band; failing that, the nearest sounding within 200 m. */
export function chartDepth(p: Vec): number | null {
  const E = enc as unknown as { depth: { d: number; p: number[][][] }[]; soundings: number[] };
  const bands = E.depth.map(b => b.d).filter((d, i, a) => a.indexOf(d) === i).sort((a, b) => a - b);
  for (const band of E.depth) {
    for (const poly of band.p) {
      let inside = false;
      for (const enc1 of poly) {
        let x = 0, y = 0; const ring: Vec[] = [];
        for (let i = 0; i < enc1.length; i += 2) { x += enc1[i]; y += enc1[i + 1]; ring.push(LL(y / 1e5, x / 1e5)); }
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const a = ring[i], b = ring[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x) inside = !inside; }
      }
      if (inside) { const next = bands.find(d => d > band.d) ?? band.d + 10; return Math.max(0, (band.d + next) / 2); }
    }
  }
  let best: number | null = null, bd = 200;
  for (let i = 0; i < E.soundings.length; i += 3) { const q = LL(E.soundings[i + 1] / 1e5, E.soundings[i] / 1e5), d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = E.soundings[i + 2] / 10; } }
  return best;
}

/** A harbor's entrance: its middle, its width (m), the way into the harbor (unit), and the water's depth there (m). */
export interface Gap { c: Vec; B: number; n: Vec; depth: number | null }
const GAPS = new Map<Harbor, Gap[]>();
/** How far from `p` along `u` to a wall or the shore (m, every metre up to `max`). */
function toWall(p: Vec, u: Vec, max: number): number {
  for (let d = 1; d <= max; d++) { const q = { x: p.x + u.x * d, y: p.y + u.y * d }; if (inBasin(q) ? hitsWall(q) : onLand(q)) return d; }
  return max;
}
/** An entrance across a marked way out: the narrowest span between walls through it (null if it isn't between two). */
function spanGap(e: Vec): Gap | null {
  let best = { span: Infinity, a: 0, d1: 0, d2: 0 };
  for (let a = 0; a < 180; a += 2) { const u = V(a), d1 = toWall(e, u, 150), d2 = toWall(e, { x: -u.x, y: -u.y }, 150); if (d1 + d2 < best.span) best = { span: d1 + d2, a, d1, d2 }; }
  if (best.d1 >= 150 || best.d2 >= 150) return null; // (no wall on one side: not between two)
  const u = V(best.a), c = { x: e.x + u.x * (best.d1 - best.d2) / 2, y: e.y + u.y * (best.d1 - best.d2) / 2 };
  let n = { x: -u.y, y: u.x };
  // (the way in: the side the basin is nearer on; the exits are marked at the entrance, in or just out of the basin)
  const into = (s: number) => { for (let d = 0; d <= 200; d += 5) if (inBasin({ x: c.x + n.x * d * s, y: c.y + n.y * d * s })) return d; return Infinity; };
  const fwd = into(1), back = into(-1);
  if (!Number.isFinite(fwd) && !Number.isFinite(back)) return null;
  if (back < fwd) n = { x: -n.x, y: -n.y };
  return { c, B: best.span, n, depth: chartDepth(c) };
}
/** The stretches of a basin's edge where the water outside is open (not a breakwater, a pier or the shore), as gaps. */
function outlineGaps(H: Harbor): Gap[] {
  const ring = H.basin, n = ring.length, open: { p: Vec; out: Vec }[][] = [], gaps: Gap[] = [];
  let run: { p: Vec; out: Vec }[] = [];
  for (let i = 0; i < n; i++) {
    const a = ring[i], b = ring[(i + 1) % n], len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-6) continue;
    const t = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    for (let s = 0; s < len; s += 2) {
      const p = { x: a.x + t.x * s, y: a.y + t.y * s };
      let out = { x: t.y, y: -t.x };
      if (inBasin({ x: p.x + out.x * 3, y: p.y + out.y * 3 })) out = { x: -out.x, y: -out.y }; // (outward: the side the basin isn't on)
      const q = { x: p.x + out.x * 4, y: p.y + out.y * 4 }, q2 = { x: p.x + out.x * 8, y: p.y + out.y * 8 };
      if (!inBasin(q) && !hitsWall(q) && !onLand(q) && !hitsWall(q2) && !onLand(q2)) run.push({ p, out });
      else if (run.length) { open.push(run); run = []; }
    }
  }
  if (run.length) open.push(run);
  for (const r of open) {
    const a = r[0].p, b = r[r.length - 1].p, B = Math.hypot(b.x - a.x, b.y - a.y);
    if (r.length < 3 || B < 4) continue; // (a crack of a few metres between rocks: none to speak of)
    let nx = 0, ny = 0; for (const s of r) { nx -= s.out.x; ny -= s.out.y; }
    const m = Math.hypot(nx, ny) || 1, c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, u = { x: nx / m, y: ny / m };
    // (and a clear way through its middle: a stretch of edge with a breakwater just beyond it is no entrance)
    let clear = true;
    for (let d = -10; d <= 10 && clear; d++) { const q = { x: c.x + u.x * d, y: c.y + u.y * d }; if (inBasin(q) ? hitsWall(q) : onLand(q)) clear = false; }
    // (and its chord's middle on the edge, the water just outside it out of the basin: a long stretch round a corner,
    // its chord cutting across the basin, is the basin's side beside a channel, not a way in)
    const outside = { x: c.x - u.x * 6, y: c.y - u.y * 6 };
    if (clear && !inBasin(outside) && !inBasin({ x: c.x - u.x * 2, y: c.y - u.y * 2 })) gaps.push({ c, B, n: u, depth: chartDepth(c) });
  }
  return gaps;
}
/**
 * A harbor's entrances, measured once: at each of its marked ways out, the span between the walls either side; where a
 * way out is marked past a breakwater's end instead (no wall beyond it), the nearest stretch of the basin's edge that
 * opens on the water outside.
 */
export function harborGaps(H: Harbor): Gap[] {
  let g = GAPS.get(H);
  if (g) return g;
  g = [];
  let outline: Gap[] | null = null;
  for (const e of H.exits) {
    let gap = spanGap(e);
    if (!gap) {
      outline ??= outlineGaps(H);
      let bd = 150;
      for (const o of outline) { const d = Math.hypot(o.c.x - e.x, o.c.y - e.y) - o.B / 2; if (d < bd) { bd = d; gap = o; } }
    }
    if (gap && !g.some(x => Math.hypot(x.c.x - gap!.c.x, x.c.y - gap!.c.y) < 20)) g.push(gap);
  }
  GAPS.set(H, g);
  return g;
}

const GT = gapTable as { bl: number[]; rl: number[]; deg: number[]; kd: number[][][] };
/** Where `v` falls in the ascending list `a`: the index below it and how far to the next (clamped to the ends). */
const bracket = (a: number[], v: number): [number, number] => {
  if (v <= a[0]) return [0, 0];
  for (let i = 0; i < a.length - 1; i++) if (v <= a[i + 1]) return [i, (v - a[i]) / (a[i + 1] - a[i])];
  return [a.length - 2, 1];
};
/**
 * The diffraction coefficient behind a gap `bl` wavelengths wide, `rl` wavelengths in, `deg` off the waves' way
 * (gap-diffraction.json, scripts/make-gap-diffraction.py): interpolated in log B/L, log r/L and the angle; past the
 * table's 20 wavelengths it falls as 1/√r, as a wave spreading from a gap does.
 */
export function gapKd(bl: number, rl: number, deg: number): number {
  const lg = (a: number[]) => a.map(Math.log);
  const [i, fi] = bracket(lg(GT.bl), Math.log(Math.max(1e-3, bl))), r = Math.min(rl, GT.rl[GT.rl.length - 1]);
  const [j, fj] = bracket(lg(GT.rl), Math.log(Math.max(1e-3, r))), [k, fk] = bracket(GT.deg, Math.min(89, Math.abs(deg)));
  let v = 0;
  for (const [a, wa] of [[i, 1 - fi], [i + 1, fi]] as const) for (const [b, wb] of [[j, 1 - fj], [j + 1, fj]] as const) for (const [c, wc] of [[k, 1 - fk], [k + 1, fk]] as const)
    if (wa * wb * wc > 0) v += GT.kd[a][b][c] * wa * wb * wc;
  // (narrower than the table's narrowest gap, 0.05 L: a narrow slit passes a wave height in proportion to its width, roughly)
  if (bl < GT.bl[0]) v *= bl / GT.bl[0];
  return rl > r ? v * Math.sqrt(r / rl) : v;
}

/**
 * The swell inside a marina (0..1 of the ocean's, and the way it travels): what reaches each entrance from outside,
 * spread through it by diffraction (gapKd). A swell meeting the entrance at an angle goes through as if through a gap
 * as wide as the entrance looks from its way (the Shore Protection Manual's method for oblique waves, after Johnson
 * 1952), the pattern turned to its way. Swell through two entrances adds as energy.
 */
export function harborSwell(p: Vec, T: number): { k: number; toward: number } {
  const H = harborAt(p), gaps = H ? harborGaps(H) : [];
  if (!gaps.length) return swellReach(p); // (a harbor open along its side, with no entrance to go through: the open water's)
  let e2 = 0, best = 0, toward = 0;
  for (const g of gaps) {
    const out = { x: g.c.x - g.n.x * (g.B / 2 + 10), y: g.c.y - g.n.y * (g.B / 2 + 10) }, r = swellReach(out, true);
    const t = V(r.toward), cosA = t.x * g.n.x + t.y * g.n.y;
    if (r.k <= 0 || cosA <= 0.05) continue; // (swell running along the shore, or out of the harbor: none goes in)
    const L = waveLength(T, g.depth ?? 1e3), dx = p.x - g.c.x, dy = p.y - g.c.y, d = Math.hypot(dx, dy);
    const off = d > 0 ? Math.acos(clamp((dx * t.x + dy * t.y) / d, -1, 1)) / D2R : 0;
    const k = r.k * gapKd(g.B * cosA / L, d / L, off);
    e2 += k * k;
    if (k > best) { best = k; toward = d > 1 ? brg(dx, dy) : r.toward; }
  }
  return { k: Math.sqrt(e2), toward };
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
    const fine = fineFetch(p), basin = inBasin(p), g = fine ? 10 : 150, w = Math.round(from / 2) * 2;
    const node = (i: number, j: number): number | null => {
      const c = { x: i * g, y: j * g };
      if (fineFetch(c) !== fine || inBasin(c) !== basin) return null;
      const key = `${w}:${g}:${i}:${j}`;
      let f = this.cache.get(key);
      if (f === undefined) {
        if (this.cache.size > 60000) this.cache.clear();
        f = fetchAt(c, w, fine);
        this.cache.set(key, f);
      }
      return f;
    };
    if (!fine) { const f = node(Math.round(p.x / g), Math.round(p.y / g)); return f ?? fetchAt(p, w, fine); }
    // by a marina, blended between the four nodes round `p` (no step from one 10 m cell to the next); where one of
    // them is across the basin's edge, worked out at `p` itself
    const i = Math.floor(p.x / g), j = Math.floor(p.y / g), fx = p.x / g - i, fy = p.y / g - j;
    const a = node(i, j), b = node(i + 1, j), c = node(i, j + 1), d = node(i + 1, j + 1);
    if (a === null || b === null || c === null || d === null) return fetchAt(p, w, fine);
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
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
    // (in a marina: what comes in through its entrances, spreading from them; its walls stop the rest)
    const s = this.swell, reach = inBasin(p) ? harborSwell(p, s.tp) : swellReach(p);
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
