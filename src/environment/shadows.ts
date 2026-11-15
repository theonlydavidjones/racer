import { D2R, V, clamp, type Vec } from '../core/math';
import { LAT0, LON0 } from '../geo/geo';
import heights from './data/heights.json';
import { landGrid } from '../geo/shore';

/**
 * Wind shadows: what the wind field from the NOAA records doesn't know about. Anything standing in the wind leaves a
 * wake downwind: slower air that mixes back out with distance, and the flow bent round it. Each is a small change to
 * the true-wind vector, scaled by the wind the obstacle feels (for a moving boat or ship, the apparent wind).
 *
 * - **Boats' sails.** The wake lies along the caster's apparent wind (the air she disturbed τ seconds ago is now
 *   V_apparent·τ from her: Dellenbaugh, "look at the masthead fly"), and drifts with the true wind.
 *   - Speed deficit: a Gaussian momentum wake (Bastankhah & Porté-Agel 2014) with the sails' drag coefficient (about
 *     0.2 close-hauled, 0.4 reaching, 1.1 running): upwind about 15–19% at one mast height behind, 8–12% at two,
 *     4–6% at four; much more downwind. Consistent with the practitioners' 4 (heavy air) to 8+ (light air) mast heights
 *     and with RANS/wind-tunnel comparisons (Boehm & Graf 2016; Richards et al. 2013).
 *   - Direction: the sails turn the air (a horseshoe vortex): a header of up to ~7° just behind her for a boat on the
 *     same tack, ~3° in the "safe leeward" spot (a length behind and half a mast height to windward), a ~1.7° lift
 *     just ahead, and a little more wind abeam to leeward, less to windward (fits to a lifting-line model of a
 *     Folkboat rig; Spenkuch et al. report >8° and >60% very close).
 *   - Magnitudes ±50% (wind tunnel and RANS disagree by about 2 at one span).
 * - **Ships and the committee boat:** bluff bodies. A recirculating cavity (length from Hosker 1984), then a deficit
 *   fading as (cavity/x)^1.5, fitted to solid-windbreak data (~73% of the wind at 10 heights, 86% at 15, 90% at 20).
 *   A ship's wake follows her own relative wind; a fast ferry leaves a narrow strip along her track.
 * - **The lee of the land** (islands and headlands the sea breeze blows over): the same shape, the cavity about four
 *   hill heights long; on summer afternoons the marine layer is shallow and the air goes round the high islands,
 *   leaving long lees: Angel Island's reaches about 3–5 km downwind, Alcatraz's about half a kilometre (Bay sailors:
 *   "nearly calm behind Angel Island", "the cone east of Alcatraz", the Sausalito lee). Within a factor of two.
 *   The Cityfront shore is left to the shore effect in the wind model (the station is on it).
 */

export interface Shadow { k: number; shift: number } // wind-speed factor (1 = untouched), direction shift (deg, + veer)
export const NO_SHADOW: Shadow = { k: 1, shift: 0 };

/** Perturbations to the true wind, in units of the true wind speed, accumulated and then turned into k and shift. */
export class WindSum {
  x = 0; y = 0; // the perturbation (flow direction, east and north)
  // the wakes' deficits (addDeficit), split along the true wind's flow and across it: along, the signed sum of their
  // squares; across, their plain sum
  private along2 = 0; private across = 0;
  private readonly fx: number; private readonly fy: number;
  /** For the true wind from `from` (deg). */
  constructor(from: number) { const f = V(from + 180); this.fx = f.x; this.fy = f.y; }
  /** Add a flow perturbation `amt` (fraction of the true wind) along unit vector (ux, uy). */
  add(ux: number, uy: number, amt: number): void { this.x += ux * amt; this.y += uy * amt; }
  /**
   * Add a wake's deficit `d` (fraction of the true wind, slower air) along her wake's direction (ux, uy). Overlapping
   * wakes don't take their deficits out of the wind one after another: the air already slowed by one has less to lose
   * to the next. They combine as the root of the sum of their squares (Katić, Højstrup & Jensen 1986, "A simple model
   * for cluster efficiency", EWEC), not their sum, which took a bunched fleet running in line down to a fifth of the
   * wind (three Folkboats 11–30 m ahead: 0.47 summed, about 0.64 so). (Katić's rule comes from wind turbines' wakes;
   * there are no measurements for sails' and hulls' wakes, and we assume it carries over. Each boat's deficit is taken
   * against the wind she herself sails in, already slowed by any wake she is in.)
   * The root-sum-square is taken of their parts along the true wind, signed (a ferry running faster than the wind
   * carries the air forward in her wake: the opposite sign, and cancelling as it would added); their parts across it,
   * which turn the wind rather than slow it, add. So one wake is as before, wakes in line combine as Katić's, and a
   * second wake at any angle only ever deepens the shadow along the wind.
   */
  addDeficit(ux: number, uy: number, d: number): void {
    const a = d * (ux * this.fx + uy * this.fy), c = d * (ux * this.fy - uy * this.fx);
    this.along2 += a * Math.abs(a); this.across += c;
  }
  /** The wind's speed factor and direction shift, for the true wind from `from`. */
  result(from: number): Shadow {
    if (this.along2 !== 0 || this.across !== 0) {
      // (back from along and across the flow f to east and north: along f, and across it f⊥ = (fy, −fx))
      const a = Math.sign(this.along2) * Math.sqrt(Math.abs(this.along2)), c = this.across;
      this.x -= a * this.fx + c * this.fy; this.y -= a * this.fy - c * this.fx; this.along2 = this.across = 0;
    }
    if (this.x === 0 && this.y === 0) return NO_SHADOW;
    const f = V(from + 180), fx = f.x + this.x, fy = f.y + this.y, k = Math.hypot(fx, fy);
    const flowNow = Math.atan2(fx, fy) / D2R, flowWas = from + 180;
    let shift = flowNow - flowWas; shift = ((shift + 540) % 360) - 180;
    return { k: Math.max(0.05, k), shift };
  }
}

/** A Folkboat's rig: mast height above the water (m), the wake's starting diameter (from the sail area, m). */
export const BOAT_WAKE = { mast: 9.5, d0: 5.9 };

export interface Caster { x: number; y: number; h: number; arel: number; awa: number; aws: number; ww: { kt: number }; luff?: boolean }

/** The sails' drag (wake) and lift coefficients by apparent wind angle. */
const cdFor = (awa: number) => awa <= 35 ? 0.2 : awa <= 90 ? 0.2 + 0.2 * (awa - 35) / 55 : Math.min(1.1, 0.4 + 0.7 * (awa - 90) / 60);
const clFor = (awa: number) => awa <= 60 ? 1.2 : Math.max(0.4, 1.2 - 0.8 * (awa - 60) / 90);

/** The wake of a boat's sails (`c`) felt at p, added to `sum`; `trueKt` the true wind speed there. */
export function addBoatWake(sum: WindSum, c: Caster, p: Vec, trueKt: number): void {
  const H = BOAT_WAKE.mast, d0 = BOAT_WAKE.d0, vaKt = c.aws / 0.5144;
  if (vaKt < 0.5 || trueKt < 0.5) return;
  // (out of reach, 12 mast heights off, before any of her frame's trig: every boat asks it of every other, every step.
  // The distance is the same in her frame as here; a micrometer over, so the test after it still decides at the edge)
  { const ddx = p.x - c.x, ddy = p.y - c.y, R = 12 * H + 1e-6; if (ddx * ddx + ddy * ddy > R * R) return; }
  const e = V(c.h + c.arel + 180); // downstream, along her apparent wind
  const lw0 = c.arel >= 0 ? V(c.h - 90) : V(c.h + 90), dot = lw0.x * e.x + lw0.y * e.y; // to her leeward side, square to the wake
  let lx = lw0.x - dot * e.x, ly = lw0.y - dot * e.y; const ln = Math.hypot(lx, ly) || 1; lx /= ln; ly /= ln;
  const dx = p.x - c.x, dy = p.y - c.y, x = dx * e.x + dy * e.y, y = dx * lx + dy * ly; // y > 0 to her leeward
  const r = Math.hypot(x, y); if (r > 12 * H) return;
  // luffing (sails eased right out to kill time before a start): hardly any lift, a little flogging drag
  const scale = vaKt / trueKt, breeze = clamp((c.ww.kt - 8) / 8, 0, 1), cl = c.luff ? 0.1 : clFor(c.awa) / 1.2;
  if (x > 0) {
    // the momentum wake: slower air
    const ks = 0.04 + 0.02 * breeze, sigma = ks * x + 0.22 * d0, cd = c.luff ? 0.12 : cdFor(c.awa), q = cd / (8 * (sigma / d0) ** 2);
    const deficit = q >= 1 ? 0.65 : Math.min(0.65, 1 - Math.sqrt(1 - q));
    sum.addDeficit(e.x, e.y, deficit * Math.exp(-(y * y) / (2 * sigma * sigma)) * scale * clamp(x / (0.3 * H), 0, 1));
    // the downwash: turned toward her windward side (a header for a boat on her tack)
    const Lv = H * (4 - 1.5 * breeze), ang = -7.5 * cl * Math.exp(-x / Lv) / (1 + (y / (0.5 * H)) ** 2);
    sum.add(lx, ly, ang * D2R * scale);
  } else {
    // upwash ahead: turned toward her leeward side (a lift)
    const rr = Math.max(0.5 * H, r), ang = 1.7 * cl * (0.5 * H / rr) ** 2;
    sum.add(lx, ly, ang * D2R * scale);
  }
  // abeam: a little more wind to leeward, a little less to windward
  const rr = Math.max(0.5 * H, r), side = y >= 0 ? 1 : -1, abeam = Math.abs(y) / rr;
  sum.add(e.x, e.y, side * 0.011 * cl * (H / rr) ** 2 * abeam * scale);
}

/**
 * A bluff body's wake (a ship, the committee boat, an island) at (x along the wind it feels, y across it): height H,
 * width across that wind W, depth along it L. The deficit as a fraction of that wind. `p` the decay exponent.
 */
export function bluffDeficit(x: number, y: number, H: number, W: number, L: number, pExp = 1.5): number {
  if (x <= -L / 2) return 0;
  // (Hosker's fit, as Hanna, Briggs & Hosker 1982 quote it, eqs. 3.5–3.6: one form for a body short along the wind,
  // L/H < 1; for L/H ≥ 1, A = 1.75 and B = 0.25. The short form taken past L/H = 1 turns negative and runs away)
  const lH = Math.max(0.3, L / H), lh = Math.min(1, lH) ** (-1 / 3), A = lH >= 1 ? 1.75 : -2 + 3.7 * lh, B = lH >= 1 ? 0.25 : -0.15 + 0.305 * lh, wh = W / H;
  const xr = Math.max(1.5 * H, H * A * wh / (1 + B * wh)); // the recirculating cavity (Hosker 1984)
  // (in the cavity 0.65, as just past it; past x = W the decay steepens from 1/x, a 2-D wake's, to pExp, a 3-D one's,
  // carried on from its value at W, so neither change is a step)
  const xx = Math.max(0, x), d = xx < xr ? 0.65 : xx < W || W <= xr ? 0.65 * (xr / xx) ** (xx < W ? 1 : pExp) : 0.65 * (xr / W) * (W / xx) ** pExp;
  const s = 0.25 * H + 0.1 * xx, out = Math.max(0, Math.abs(y) - W / 2);
  return d * Math.exp(-(out * out) / (2 * s * s));
}

/** Height above the water of each kind of vessel (m): superstructure, stacks of containers. */
export const SHIP_AIR: Record<string, number> = { container: 45, tanker: 30, ferry: 10, alcatraz: 9, tour: 10, coastguard: 4 };

/** A moving ship's wind shadow at p, added to `sum`. Her wake follows her own relative wind. */
export function addShipWake(sum: WindSum, from: number, trueKt: number, v: { x: number; y: number; h: number; v: number }, air: number, len: number, beam: number, p: Vec): void {
  const wf = V(from + 180), vs = V(v.h), kt = 1 / 0.5144;
  const rx = wf.x * trueKt - vs.x * v.v * kt, ry = wf.y * trueKt - vs.y * v.v * kt, rel = Math.hypot(rx, ry); // her relative wind (kt)
  if (rel < 0.5 || trueKt < 0.5) return;
  const ex = rx / rel, ey = ry / rel, dx = p.x - v.x, dy = p.y - v.y, x = dx * ex + dy * ey, y = dx * ey - dy * ex;
  const sinA = Math.abs(vs.x * ey - vs.y * ex), cosA = Math.abs(vs.x * ex + vs.y * ey);
  const W = sinA * len + cosA * beam, L = cosA * len + sinA * beam;
  const d = bluffDeficit(x, y, air, W, L);
  if (d > 0.001) sum.addDeficit(ex, ey, d * rel / trueKt);
}

/** The committee boat (anchored, about 12 m long and 4 m tall, lying head to wind): only the lower part of a rig is in it. */
export function addCommitteeWake(sum: WindSum, from: number, c: Vec, p: Vec): void {
  const e = V(from + 180), dx = p.x - c.x, dy = p.y - c.y, x = dx * e.x + dy * e.y, y = dx * e.y - dy * e.x;
  const d = bluffDeficit(x, y, 4, 4, 12) * 0.7;
  if (d > 0.001) sum.addDeficit(e.x, e.y, d);
}

/* ---------- the lee of the land ---------- */

const HM = heights as { south: number; north: number; west: number; east: number; nx: number; ny: number; step: number; samples: number[]; block: number; data: string };
const HGRID = (() => {
  const s = atob(HM.data), g = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) g[i] = s.charCodeAt(i);
  return g;
})();
const MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * D2R);
/** The Cityfront, whose shore the wind model already handles (the NOAA station is on it). */
const CITYFRONT = { south: 37.78, north: 37.8125, west: -122.49, east: -122.40 }; // with Fort Point and the Presidio bluffs
const inCityfront = (p: Vec) => { const lat = LAT0 + p.y / MLAT, lon = LON0 + p.x / MLON; return lat > CITYFRONT.south && lat < CITYFRONT.north + 0.0025 && lon > CITYFRONT.west && lon < CITYFRONT.east; };
/** East–west position of the Golden Gate (the bridge): the hills either side of the gap are west of it. */
const GATE_X = (-122.474 - LON0) * MLON;
/** How far inside the Cityfront box p is (m, 0 or less outside it). */
function cityfrontDepth(p: Vec): number {
  const lat = LAT0 + p.y / MLAT, lon = LON0 + p.x / MLON;
  return Math.min((lat - CITYFRONT.south) * MLAT, (CITYFRONT.north + 0.0025 - lat) * MLAT, (lon - CITYFRONT.west) * MLON, (CITYFRONT.east - lon) * MLON);
}
/** Across this much of the Cityfront box's edge (m), the land's lee fades out, rather than stopping at a straight line. */
const CF_FADE = 250;
/**
 * Fill the ground's lattice (groundHeightSmooth) within `half` m of each point now, at the race's set-up: a tile filled
 * the first time a boat's rays reach it costs about a millisecond, which would otherwise land inside a step.
 */
export function prepareLee(pts: Vec[], half: number): void {
  for (const c of pts) for (let y = c.y - half; y <= c.y + half; y += GL * GT) for (let x = c.x - half; x <= c.x + half; x += GL * GT) groundHeightSmooth({ x, y });
}
/** A dip between two stretches of land narrower than this (m) doesn't part them for the lee (terrainLeeRaw). */
const DIP_GAP = 200;
/** The mask's share of land (0..1, read bilinearly) from which the ground counts: its cells' own edge. */
const LAND_FROM = 0.5;

/**
 * The lee of the land at p, wind from `from` (deg): looking upwind along three rays (straight up, and the wake's
 * spread either side), the strongest shelter from high ground within reach. Speed factor.
 */
export function terrainLee(p: Vec, from: number, skipGate = false): number {
  // the wind records are from the Cityfront: the shore's shelter there is already in them, so inside the box the land's lee
  // isn't added again; across its edge it fades in over CF_FADE, so the field has no straight seam (Charts' layer, #261)
  const inside = inCityfront(p) ? cityfrontDepth(p) : 0;
  if (inside >= CF_FADE) return 1;
  const raw = terrainLeeRaw(p, from, skipGate);
  return inside > 0 ? 1 - (1 - raw) * (1 - inside / CF_FADE) : raw;
}
/**
 * The ground's height (m) read bilinearly between the 200 m blocks' centers, times the 50 m mask's share of land (so the
 * water beside an island isn't its hill), and eased out over the first 100 m inside the Cityfront box (whose shore's
 * shelter is in the wind records): continuous everywhere. (Bilinear heights alone filled the water between two islands
 * and the ray took them as one hill, from the nearer shore: the review, bay-east-16. The land's share keeps the water
 * between them at nothing.)
 */
/**
 * The share of land at p (0 water … 1 land), from the coastline's 50 m terrain cells (geo/shore.ts, what a boat runs
 * aground on) read bilinearly between the cells' nodes: continuous, and the coast where it is a half. (The sea's land
 * mask is 100 m cells: on Alcatraz, 180 m wide, it put the shore 150 m out.)
 */
const LG = landGrid(), LG_CW = (LG.east - LG.west) / (LG.nx - 1), LG_CH = (LG.north - LG.south) / (LG.ny - 1);
function landShareAt(p: Vec): number {
  const ci = (LON0 + p.x / MLON - LG.west) / LG_CW, cj = (LG.north - (LAT0 + p.y / MLAT)) / LG_CH;
  const i = Math.floor(ci), j = Math.floor(cj), u = ci - i, v = cj - j;
  const at = (a: number, b: number) => a < 0 || b < 0 || a >= LG.nx || b >= LG.ny ? 0 : LG.grid[b * LG.nx + a];
  return (at(i, j) * (1 - u) + at(i + 1, j) * u) * (1 - v) + (at(i, j + 1) * (1 - u) + at(i + 1, j + 1) * u) * v;
}
function groundHeightAt(p: Vec): number {
  const lat = LAT0 + p.y / MLAT, lon = LON0 + p.x / MLON;
  const inCf = Math.min((lat - CITYFRONT.south) * MLAT, (CITYFRONT.north - lat) * MLAT, (lon - CITYFRONT.west) * MLON, (CITYFRONT.east - lon) * MLON);
  const cf = inCf <= 0 ? 1 : Math.max(0, 1 - inCf / 100); if (cf === 0) return 0;
  const ci = ((lon - HM.west) / (HM.east - HM.west) * (HM.samples[0] - 1) + 0.5) / HM.block - 0.5, cj = ((HM.north - lat) / (HM.north - HM.south) * (HM.samples[1] - 1) + 0.5) / HM.block - 0.5;
  const i = Math.floor(ci), j = Math.floor(cj), u = ci - i, v = cj - j;
  const at = (a: number, b: number) => a < 0 || b < 0 || a >= HM.nx || b >= HM.ny ? 0 : HGRID[b * HM.nx + a] * HM.step;
  // the height among the land blocks only (Deep Physics): the water blocks round an island don't pull it down, so a
  // one-block, flat-topped island (Alcatraz: cliffs, about 41 m) reads its height wherever it's land, as the block has it,
  // not a tent full height at one point; inland it's plain bilinear. The land's share alone makes the edge
  const h00 = at(i, j), h10 = at(i + 1, j), h01 = at(i, j + 1), h11 = at(i + 1, j + 1);
  const w00 = (1 - u) * (1 - v), w10 = u * (1 - v), w01 = (1 - u) * v, w11 = u * v;
  const wl = (h00 > 0 ? w00 : 0) + (h10 > 0 ? w10 : 0) + (h01 > 0 ? w01 : 0) + (h11 > 0 ? w11 : 0);
  if (wl < 0.02) return 0; // (all but out of the land blocks: the share is next to nothing there too)
  const h = (h00 * w00 + h10 * w10 + h01 * w01 + h11 * w11) / wl;
  // (the land counted from where the mask's share passes a half: a cell half land is the best estimate of where the coast
  // is. From nothing, the ground began 20–30 m out from the mask's edge under high ground, 80 m before the coast on Angel)
  return h * Math.min(1, Math.max(0, (landShareAt(p) - LAND_FROM) / (1 - LAND_FROM))) * cf;
}
/**
 * groundHeightAt off a 50 m lattice, read bilinearly (continuous like it, and one read where it is eight): every boat's
 * lee looks at some 600 points twice a second, and the planner's grids at thousands. Filled in tiles of 64 × 64 points
 * (3.2 km) as the rays first reach them, each a few milliseconds.
 */
const GL = 50, GT = 64, glTiles = new Map<number, Float32Array>();
let glKey = NaN, glTile: Float32Array | null = null; // (the last tile read: a ray's points mostly fall in the one before)
function groundHeightSmooth(p: Vec): number {
  const fx = p.x / GL, fy = p.y / GL;
  if (!Number.isFinite(fx) || !Number.isFinite(fy)) return 0;
  const i = Math.floor(fx), j = Math.floor(fy), u = fx - i, v = fy - j, ti = Math.floor(i / GT), tj = Math.floor(j / GT), key = (ti + 4096) * 8192 + (tj + 4096);
  let t = key === glKey ? glTile : glTiles.get(key);
  if (!t) {
    t = new Float32Array((GT + 1) * (GT + 1));
    for (let b = 0; b <= GT; b++) for (let a = 0; a <= GT; a++) t[b * (GT + 1) + a] = groundHeightAt({ x: (ti * GT + a) * GL, y: (tj * GT + b) * GL });
    glTiles.set(key, t);
  }
  glKey = key; glTile = t;
  const a = i - ti * GT, b = j - tj * GT, k = b * (GT + 1) + a, n = GT + 1;
  return (t[k] * (1 - u) + t[k + 1] * u) * (1 - v) + (t[k + n] * (1 - u) + t[k + n + 1] * u) * v;
}
/**
 * Along each ray, every stretch of land shelters by its highest point, from where the ray meets it. Its inputs are
 * continuous, so the lee has no seams: the heights read smoothly (groundHeightSmooth), the shore found between samples
 * where the height crosses 8 m (not at the sample past it), and land only just over 8 m eased in. Read cell by cell, the
 * 200 m blocks' heights and the 50 m steps of the shore made the lee step in plateaus a few hundred meters wide (1.1 →
 * 1.8 → 3.1 kt in Yellow Bluff's lee), and the passage planner wandered between them.
 */
function terrainLeeRaw(p: Vec, from: number, skipGate = false): number {
  let worst = 0;
  for (const off of [-8, 0, 8]) {
    const u = V(from + off), side = off === 0 ? 1 : 0.85;
    // the stretch being crossed: where the ray met it, its highest point so far; and the chain of stretches before it,
    // parted only by dips: the chain's first shore, and how much the dips between have parted it (chainW: 1 one hill …
    // 0 apart). A stretch ends where the ground falls below half its height so far (8 m at least): low flats between a
    // spit and the ridge behind it (the marsh behind Strawberry Point) part them as water would, eased by how deep and
    // wide the dip is
    let enter = -1, top = 0, prevD = 0, prevH = 0, exit = -1, chain = -1, chainW = 0, exitChain = -1, dip = 0, exitLevel = 8;
    const lee = (x: number, H: number) => { const xr = 4 * H, pe = clamp(1.5 - (H - 50) / 300, 1, 1.5), cav = 0.8 - 0.35 * clamp((H - 60) / 120, 0, 1); return (x < xr ? cav : cav * (xr / x) ** pe) * Math.min(1, (H - 8) / 8); };
    const close = () => { worst = Math.max(worst, side * Math.max(lee(enter, top), chain >= 0 ? chainW * lee(chain, top) : 0)); };
    const at = (L: number, d: number, h: number) => prevH === h ? prevD : prevD + (d - prevD) * (L - prevH) / (h - prevH); // (where the height passes L, between the samples)
    let step = 50;
    for (let d = 50; d <= 6000; d += step) {
      step = d < 1000 ? 50 : 100;
      // the ground the air comes over, averaged across the wind over a width that grows with the distance run (a lee's
      // edge spreads as it goes: wakes mix at roughly 1 in 5 to 1 in 10 of the distance; the spread here, d/8 either
      // side weighted ¼ ½ ¼, is an estimate, no figure measured for these shores). Close in it's under the coast's own
      // 50 m cells and changes nothing; far off a narrow gap opens gradually, averaged with the land beside it
      const q = { x: p.x + u.x * d, y: p.y + u.y * d }, a = d / 8, nx = u.y * a, ny = -u.x * a;
      const g = (r: Vec) => skipGate && r.x < GATE_X ? 0 : groundHeightSmooth(r);
      const h = 0.5 * g(q) + 0.25 * (g({ x: q.x + nx, y: q.y + ny }) + g({ x: q.x - nx, y: q.y - ny }));
      if (enter >= 0) {
        const L = Math.max(8, 0.5 * top);
        if (h >= L) { top = Math.max(top, h); close(); } // (scored as the stretch rises, not only at its top: low ground
        // at the shore joined to high ground behind still makes a low hill's near-calm close in; a high hill's is gustier)
        else { close(); exit = at(L, d, h); exitLevel = L; exitChain = chain >= 0 && chainW > 0 ? chain : enter; enter = -1; dip = h; }
      } else {
        if (exit >= 0) dip = Math.min(dip, h);
        // the level that starts the next stretch: the last one's own, eased down to 8 m as the dip goes down to the water
        const L = exit >= 0 ? 8 + (exitLevel - 8) * clamp(dip / 8, 0, 1) : 8;
        if (h > L) {
          enter = prevH >= L ? prevD : at(L, d, h); top = h;
          if (exit >= 0) {
            // a dip parts the land by its width (DIP_GAP) and its depth under the level it fell from: a creek or a low neck
            // hardly does, a wide deep one entirely (squared: Deep Physics); the hill beyond still shelters from the first
            // shore by what's left
            const part = Math.min(1, (enter - exit) / DIP_GAP) * clamp(1 - dip / exitLevel, 0, 1), w = (1 - part) ** 2;
            if (chain < 0 || chainW === 0) chain = exitChain;
            chainW = w * (chainW > 0 ? chainW : 1); if (chainW < 1e-3) { chain = -1; chainW = 0; }
          }
          close();
        }
      }
      prevD = d; prevH = h;
    }
    if (enter >= 0) close();
  }
  return 1 - worst;
}
