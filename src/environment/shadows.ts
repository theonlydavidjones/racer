import { D2R, V, clamp, type Vec } from '../core/math';
import { LAT0, LON0 } from '../geo/geo';
import heights from './data/heights.json';
import { landAt } from './sea';

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
  /** Add a flow perturbation `amt` (fraction of the true wind) along unit vector (ux, uy). */
  add(ux: number, uy: number, amt: number): void { this.x += ux * amt; this.y += uy * amt; }
  /** The wind's speed factor and direction shift, for the true wind from `from`. */
  result(from: number): Shadow {
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
    sum.add(e.x, e.y, -deficit * Math.exp(-(y * y) / (2 * sigma * sigma)) * scale * clamp(x / (0.3 * H), 0, 1));
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
  const lh = Math.max(0.3, L / H) ** (-1 / 3), A = -2 + 3.7 * lh, B = -0.15 + 0.305 * lh, wh = W / H;
  const xr = Math.max(1.5 * H, H * A * wh / (1 + B * wh)); // the recirculating cavity (Hosker 1984)
  const xx = Math.max(0, x), d = xx < xr ? 0.7 : 0.65 * (xr / xx) ** (xx < W ? 1 : pExp);
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
  if (d > 0.001) sum.add(ex, ey, -d * rel / trueKt);
}

/** The committee boat (anchored, about 12 m long and 4 m tall, lying head to wind): only the lower part of a rig is in it. */
export function addCommitteeWake(sum: WindSum, from: number, c: Vec, p: Vec): void {
  const e = V(from + 180), dx = p.x - c.x, dy = p.y - c.y, x = dx * e.x + dy * e.y, y = dx * e.y - dy * e.x;
  const d = bluffDeficit(x, y, 4, 4, 12) * 0.7;
  if (d > 0.001) sum.add(e.x, e.y, -d);
}

/* ---------- the lee of the land ---------- */

const HM = heights as { south: number; north: number; west: number; east: number; nx: number; ny: number; step: number; data: string };
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
/** Height of the ground (m) at a point; 0 over water, off the map and along the Cityfront. */
export function groundHeight(p: Vec): number {
  const lat = LAT0 + p.y / MLAT, lon = LON0 + p.x / MLON;
  if (lat > CITYFRONT.south && lat < CITYFRONT.north && lon > CITYFRONT.west && lon < CITYFRONT.east) return 0;
  const i = Math.floor((lon - HM.west) / (HM.east - HM.west) * HM.nx), j = Math.floor((HM.north - lat) / (HM.north - HM.south) * HM.ny);
  if (i < 0 || j < 0 || i >= HM.nx || j >= HM.ny) return 0;
  return HGRID[j * HM.nx + i] * HM.step;
}

/**
 * The lee of the land at p, wind from `from` (deg): looking upwind along three rays (straight up, and the wake's
 * spread either side), the strongest shelter from high ground within reach. Speed factor.
 */
export function terrainLee(p: Vec, from: number, skipGate = false): number {
  if (inCityfront(p)) return 1; // the wind records are from here: the shore's shelter is already in them
  let worst = 0;
  for (const off of [-8, 0, 8]) {
    const u = V(from + off);
    let enter = -1, top = 0; // the island (stretch of land) the ray is crossing: where it met it, and its highest point
    // the near-calm behind a low, steep island (Alcatraz: 80% less wind) eases behind high ground, where the air comes
    // down the slopes in gusts (the NWS's 2.5 km model has the lee of the Marin hills at about 60% of the open-bay wind)
    const lee = (x: number, H: number) => { const xr = 4 * H, pe = clamp(1.5 - (H - 50) / 300, 1, 1.5), cav = 0.8 - 0.35 * clamp((H - 60) / 120, 0, 1), d = x < xr ? cav : cav * (xr / x) ** pe; worst = Math.max(worst, d * (off === 0 ? 1 : 0.85)); };
    let step = 50;
    for (let d = 50; d <= 6000; d += step) {
      step = d < 1000 ? 50 : 100; // finer close in, where it matters
      // the heights are on a 200 m grid: check the 50 m land mask too, so water beside an island isn't counted as its hill
      const q = { x: p.x + u.x * d, y: p.y + u.y * d }, h = skipGate && q.x < GATE_X ? 0 : landAt(q) === false ? 0 : groundHeight(q);
      if (h > 8) { if (enter < 0) { enter = d - step / 2; top = 0; } top = Math.max(top, h); } // the shore is about half a step back
      else if (enter >= 0) { lee(enter, top); enter = -1; }
    }
    if (enter >= 0) lee(enter, top);
  }
  return 1 - worst;
}
