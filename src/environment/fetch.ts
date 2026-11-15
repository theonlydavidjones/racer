/**
 * The shore's slowdown of the wind, by how far the air has blown over open water (its fetch). Used only in and around
 * the San Francisco Marina's harbors (West Harbor and Gashouse Cove: shoreSlowLocal), where it makes the edge a boat
 * feels leaving the cove. Everywhere else the shore's slowdown is still wind.ts's by the distance to the nearest shore.
 * Why local: the wind's calibration (wind.ts OPEN_WATER) pairs with that shore slowdown at the NOAA station, and
 * taking fetch everywhere would re-derive it by direction (+5…+12% on most courses in a westerly, about −15% in a
 * northerly). No open-water wind record inside the Bay could be found to check that against (Alcatraz and Point Blunt
 * aren't in NDBC's inventory; the shore and pier stations are ruled by their own shelter): docs/wind-fetch-check.md.
 * So here the fetch only shapes the slowdown between the same two ends, 0.8 by the land and 1.0 in open water.
 *
 * Wind off the land carries the land's slower, rougher surface layer out over the water with it. Over the smooth water a
 * new layer grows up from the surface (the internal boundary layer), and within it the wind speeds up toward what open
 * water makes. Its depth grows with the fetch: δ = 0.75·z0w·(x/z0w)^0.8 (Elliott 1958, the form Garratt 1990 reviews:
 * "The internal boundary layer — a review", Boundary-Layer Meteorology 50:171–203). Within it the wind follows the water's
 * log profile, matched to the land's at δ (Elliott's velocity model). Above it, the land's profile still holds.
 * So it isn't the distance to the nearest shore that counts but the distance upwind to the land the air last crossed:
 * a westerly along the Cityfront has come kilometers over the water and isn't slowed by the beach beside it. Behind a
 * breakwater or a marina's docks the air has crossed a few meters of stone or plank, not land: those aren't counted
 * (harborLee.ts gives their own lee).
 *
 * Estimates (no San Francisco measurement was found):
 * - Z0_LAND, the land's roughness length, 0.3 m: between scattered obstacles (0.25) and suburbs (0.5) on the
 *   Davenport–Wieringa scale. Upwind of the Cityfront are Crissy Field's grass and the Presidio's trees and houses.
 * - Z0_WATER, 0.0002 m: open water in a moderate breeze (as harborLee.ts uses).
 * - BLEND_H, 60 m: the height above which the change of surface no longer shows (the blending height). Where the new
 *   layer reaches it, the wind is the open water's. With these it does so 2.0 km downwind of the land.
 * - THIN, 40 m: land narrower than this along the wind isn't counted (breakwaters, piers, docks).
 * The researcher's IBL estimate with the same method (0.1–0.5 m land): 0.57–0.73 at 100 m, 0.78–0.84 at 400 m,
 * ~0.9 at 1 km, 1.0 by ~2–3 km.
 */
import { V, type Vec } from '../core/math';
import { onGround, PILE_PIERS, anyShoreDistNear } from '../geo/shore';
import { HARBORS } from '../geo/marina';
import { inPoly } from '../core/math';

const Z0_LAND = 0.3, Z0_WATER = 0.0002, BLEND_H = 60, THIN = 40;
/** The fetch at which the new layer reaches the blending height: open water's wind from there on. */
export const FETCH_FULL = Z0_WATER * Math.pow(BLEND_H / (0.75 * Z0_WATER), 1.25);
const ln = Math.log;

/** The wind at height z (m), fetch x (m) downwind of the land, against open water's at the same height. */
export function fetchRatioAt(z: number, x: number): number {
  const uW = ln(z / Z0_WATER) / ln(BLEND_H / Z0_WATER); // open water's (the wind at the blending height = 1)
  const d = x <= 0 ? 0 : 0.75 * Z0_WATER * Math.pow(x / Z0_WATER, 0.8);
  if (d >= BLEND_H) return 1;
  const uL = (h: number) => ln(h / Z0_LAND) / ln(BLEND_H / Z0_LAND); // the land's
  const u = z >= d ? uL(z) : uL(d) * ln(z / Z0_WATER) / ln(d / Z0_WATER);
  return u / uW;
}
/** The rig's heights and the sails' width at each (as harborLee.ts weighs its lee): what the sails feel. */
const RIG_LO = 1.6, RIG_HI = 9.5;
const ZS = Array.from({ length: 12 }, (_, i) => RIG_LO + (i + 0.5) * (RIG_HI - RIG_LO) / 12), WS = ZS.map(z => RIG_HI - z), WSUM = WS.reduce((a, b) => a + b, 0);
function rigRatio(x: number): number { let s = 0; for (let i = 0; i < ZS.length; i++) s += WS[i] * fetchRatioAt(ZS[i], x); return s / WSUM; }
/** rigRatio by fetch, every 5 m out to FETCH_FULL (read straight-line between). */
const FX = 5, FTAB = Float64Array.from({ length: Math.ceil(FETCH_FULL / FX) + 2 }, (_, i) => rigRatio(i * FX));
export function fetchRatio(x: number): number {
  const f = Math.max(0, x) / FX, i = Math.floor(f);
  if (i >= FTAB.length - 1) return 1;
  return FTAB[i] + (FTAB[i + 1] - FTAB[i]) * (f - i);
}

/* ---------- the land, in 10 m cells ---------- */
/** Land the air crosses: the ground without Fort Mason's pile piers (sheds on open piles: harborLee's bluff bodies). */
const C = 10, TILE = 64; // (cells of 10 m, filled in tiles of 640 m as rays first reach them)
const tiles = new Map<number, Uint8Array>();
const PILE_BOX = PILE_PIERS.map(P => { const xs = P.pts.map(q => q.x), ys = P.pts.map(q => q.y); return { P, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; });
function landCell(x: number, y: number): boolean {
  const p = { x, y };
  for (const b of PILE_BOX) if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 && inPoly(p, b.P.pts)) return false;
  return onGround(p);
}
function isLand(x: number, y: number): boolean {
  const i = Math.floor(x / C), j = Math.floor(y / C), ti = Math.floor(i / TILE), tj = Math.floor(j / TILE), key = (ti + 32768) * 65536 + (tj + 32768);
  let t = tiles.get(key);
  if (!t) {
    t = new Uint8Array(TILE * TILE);
    for (let b = 0; b < TILE; b++) for (let a = 0; a < TILE; a++) t[b * TILE + a] = landCell(((ti * TILE + a) + 0.5) * C, ((tj * TILE + b) + 0.5) * C) ? 1 : 0;
    tiles.set(key, t);
  }
  return t[(j - tj * TILE) * TILE + (i - ti * TILE)] === 1;
}

/** How far upwind (m) from p the air last crossed land at least THIN wide, along the bearing `up` (the way the wind comes from), up to FETCH_FULL. */
export function fetchAlong(p: Vec, up: number): number {
  const e = V(up), step = C / 2;
  let run = 0, start = 0;
  for (let d = 0; d <= FETCH_FULL; d += step) {
    if (isLand(p.x + e.x * d, p.y + e.y * d)) { if (run === 0) start = d; run += step; if (run >= THIN) return start; }
    else run = 0;
  }
  return FETCH_FULL;
}
/** The rays either side of the wind's own (deg): the edge of the land's slower air spreads as it goes, so the slowdown
 * comes in over a fan, not on one line. */
const FAN = [-5, 0, 5];
/** The slowdown at p, the wind from `from`: the rig's wind against open water's (0.6–1). */
export function shoreFetchFactor(p: Vec, from: number): number {
  if (anyShoreDistNear(p) > FETCH_FULL) return 1;
  let s = 0; for (const a of FAN) s += fetchRatio(fetchAlong(p, from + a)); return s / FAN.length;
}

/* ---------- in and around the Marina's harbors ---------- */
/** The SF Marina's harbors (West Harbor, Gashouse Cove), their basins, breakwaters and docks, and NEAR m round them. */
const NEAR = 150, BLEND = 150;
const MARINA = (() => {
  const hs = HARBORS.filter(h => h.id === 'west-harbor' || h.id === 'gashouse-cove');
  return { x0: Math.min(...hs.map(h => h.reach.x0)) - NEAR, x1: Math.max(...hs.map(h => h.reach.x1)) + NEAR, y0: Math.min(...hs.map(h => h.reach.y0)) - NEAR, y1: Math.max(...hs.map(h => h.reach.y1)) + NEAR };
})();
/** How much the fetch shapes the slowdown at p: 1 within NEAR m of the harbors, easing (smoothstep) to 0 over BLEND m beyond. */
export function marinaWeight(p: Vec): number {
  const dx = Math.max(MARINA.x0 - p.x, 0, p.x - MARINA.x1), dy = Math.max(MARINA.y0 - p.y, 0, p.y - MARINA.y1);
  if (dx === 0 && dy === 0) return 1;
  const d = Math.hypot(dx, dy); if (d >= BLEND) return 0;
  const t = 1 - d / BLEND; return t * t * (3 - 2 * t);
}
/** The fetch's share of the way from the land's air to open water's here (0..1): shoreFetchFactor between its two ends. */
const R0 = fetchRatio(0);
const shape = (p: Vec, from: number) => (shoreFetchFactor(p, from) - R0) / (1 - R0);
/**
 * shape off a 10 m lattice and whole degrees of the wind, kept as worked out (every boat in the harbor asks every step;
 * a look is three rays of up to 400 cells): bilinear between the lattice's points, straight-line between degrees. The
 * slowdown changes by under 2% over 10 m except right at a breakwater's end, where the fan of rays spreads it.
 */
const LAT = 10, cache = new Map<number, number>();
function node(i: number, j: number, d: number): number {
  const dd = ((d % 360) + 360) % 360, key = ((i + 40000) * 80000 + (j + 40000)) * 360 + dd;
  let v = cache.get(key);
  if (v === undefined) { if (cache.size > 200000) cache.clear(); v = shape({ x: i * LAT, y: j * LAT }, dd); cache.set(key, v); }
  return v;
}
function shapeNear(p: Vec, from: number): number {
  const fx = p.x / LAT, fy = p.y / LAT, i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j;
  const d0 = Math.floor(from), g = from - d0;
  const at = (d: number) => (node(i, j, d) * (1 - u) + node(i + 1, j, d) * u) * (1 - v) + (node(i, j + 1, d) * (1 - u) + node(i + 1, j + 1, d) * u) * v;
  return g === 0 ? at(d0) : at(d0) * (1 - g) + at(d0 + 1) * g;
}
/**
 * The shore's slowdown at p, given `byDist`, wind.ts's by the distance to the nearest shore: in and around the Marina's
 * harbors, by the fetch instead (between the same ends, 0.8 and 1); blended into byDist over BLEND m beyond them.
 */
export function shoreSlowLocal(p: Vec, from: number, byDist: number): number {
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(from)) return byDist;
  const w = marinaWeight(p); if (w === 0) return byDist;
  const f = 0.8 + 0.2 * shapeNear(p, from);
  return byDist + (f - byDist) * w;
}
