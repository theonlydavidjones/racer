import { KT, V, brg, clamp, type Vec } from '../core/math';
import { anyShoreDist, anyShoreDistNear, wharfDist, wharfShelter } from '../geo/shore';
import { harborAt } from '../geo/marina';
import type { Wind } from './wind';

export interface CurrentPreset { id: string; set: number; kt: number; label: string; button: string }

/** Uniform current presets (for practice), and 'real' for NOAA predictions (tide.ts). `set` is the direction the water flows toward. */
export const CURRENTS: Record<string, CurrentPreset> = {
  real: { id: 'real', set: 0, kt: 0, label: 'Real tide', button: 'Real tide' },
  slack: { id: 'slack', set: 0, kt: 0, label: 'Slack', button: 'Slack' },
  flood: { id: 'flood', set: 95, kt: 1.0, label: 'Flood 1.0 kt', button: 'Flood 1.0' },
  ebb: { id: 'ebb', set: 280, kt: 1.5, label: 'Ebb 1.5 kt', button: 'Ebb 1.5' },
  bigebb: { id: 'bigebb', set: 280, kt: 2.5, label: 'Ebb 2.5 kt', button: 'Ebb 2.5' }
};

/** Open-water current vector in m/s. */
export function currentVector(c: CurrentPreset): Vec {
  const v = V(c.set);
  return { x: v.x * c.kt * KT, y: v.y * c.kt * KT };
}

/**
 * Current relief near the shore: 25% of the open-water current at the beach, full strength 350 m out. In water the
 * Wharf's piers and breakwaters enclose (Aquatic Park, inside Municipal Pier and the Wharf's breakwater; the Pier 39
 * marina) they count as shore too; off a pier head, where the stream runs past, they don't.
 * The 25% and the 350 m are unsourced; no published profile of speed against distance from the shore along the
 * Cityfront was found (constants audit, docs/CONSTANTS.md). The nearest check is NOAA's Fort Point 0.5 nmi E (PCT0286,
 * off Crissy Field, 16.8 m deep): its factors against Golden Gate Bridge 0.88 nmi NE (SFB1202) are 0.2 on the flood
 * and 0.8 on the ebb (the 2027 mean peaks against PCT0281 in the Gate channel: 0.22 and 0.57). So the flood's relief
 * here fits, and the ebb's is stronger than the water does. Near a station the station's own prediction wins
 * (tide.ts atShore fades this out within 600 m of one), so PCT0286 already carries that asymmetry off Crissy Field.
 */
export const shoreRelief = (p: Vec, lattice = false): number => {
  const k = clamp(0.25 + 0.75 * (lattice ? anyShoreDistNear(p) : anyShoreDist(p)) / 350, 0.25, 1), w = wharfShelter(p); // (`lattice`: off the 10 m lattice, geo/shore.ts, for a boat's own current each step)
  return w > 0 ? Math.min(k, 1 - w * (1 - clamp(0.25 + 0.75 * wharfDist(p, 350) / 350, 0.25, 1))) : k;
};

/**
 * How much of the stream outside reaches a point inside a harbor's basin (1 outside any basin). A basin behind a
 * breakwater doesn't carry the tidal stream: water enters and leaves only through its mouth, at the rate the tide fills
 * and empties it (its tidal prism). A 300 × 300 m basin 3 m deep, with the tide's 0.9 m amplitude over 12.42 h, takes in
 * at most about 11 m³/s: about 1 cm/s across the basin, a few tenths of a knot in a 30 m mouth. The stream running past
 * the mouth also stirs a slow eddy (gyre) inside (USACE Coastal Engineering Manual, EM 1110-2-1100, Part II ch. 7;
 * Nece, Falconer & Tsutsumi 1976 on the exchange). BASIN_EDDY (that eddy as a fraction of the stream outside) and
 * BASIN_MOUTH (how far the stream reaches in past the mouth, m) are estimates: no measured figure for either was found,
 * for these harbors or in general.
 */
export const BASIN_EDDY = 0.1, BASIN_MOUTH = 30;
export function basinCalm(p: Vec): number {
  const h = harborAt(p); if (!h) return 1;
  let d = Infinity; for (const e of h.exits) d = Math.min(d, Math.hypot(p.x - e.x, p.y - e.y));
  return BASIN_EDDY + (1 - BASIN_EDDY) * Math.exp(-d / BASIN_MOUTH);
}

/** Current at a point, in m/s, from the open-water current, eased near the shore. */
export function currentAt(p: Vec, open: Vec, lattice = false): Vec {
  const k = shoreRelief(p, lattice);
  return { x: open.x * k, y: open.y * k };
}

/** Wind felt on the water = air motion minus water motion. `c` is the current in m/s. */
export function windOnWater(w: Wind, c: Vec): Wind {
  const a = V(w.from);
  const wx = -a.x * w.kt - c.x / KT, wy = -a.y * w.kt - c.y / KT;
  return { from: brg(-wx, -wy), kt: Math.hypot(wx, wy) };
}
