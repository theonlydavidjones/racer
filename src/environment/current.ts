import { KT, V, brg, clamp, type Vec } from '../core/math';
import { anyShoreDist, anyShoreDistNear, onLand, wharfDist, wharfShelter } from '../geo/shore';
import { harborAt, hitsWall, inBasin, type Harbor } from '../geo/marina';
import { harborGaps } from './sea';
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
 * the mouth also stirs a slow eddy (gyre) inside, driven by the shear across the mouth (USACE Coastal Engineering Manual,
 * EM 1110-2-1100, Part II ch. 7; Nece, Falconer & Tsutsumi 1976 on the exchange; Booij 1986 and Langendoen, Booij &
 * Kranenburg 1994 on harbors beside a stream).
 * The stream fades in from the basin's open edges (its mouths, and the whole side of a marina whose docks lie open to an
 * estuary), BASIN_MOUTH meters in, to BASIN_EDDY of itself behind breakwaters, or BASIN_OPEN among docks open to the
 * stream along a long side (more of it gets in among their piles and hulls). All three are estimates: no measured figure
 * was found for these harbors, or in general. (The distance is a straight line, through a breakwater's head.)
 */
export const BASIN_EDDY = 0.1, BASIN_OPEN = 0.3, BASIN_MOUTH = 30;
type Edge = { a: Vec; b: Vec };
const EDGES = new Map<string, { segs: Edge[]; open: number; floor: number }>();
/** A breakwater basin opens on the stream along under this fraction of its outline; more, and it's docks open to the stream. */
const OPEN_SHARE = 0.15;
/**
 * A basin's open edges, worked out once: every stretch of its outline (2 m steps) where the water outside is free from
 * 1 m out to 30 m (no wall, breakwater, land or other basin), and, for a harbor with breakwaters, the entrances between
 * them (sea.ts harborGaps: the span between the walls at each way out) as segments across the mouth.
 */
function openEdges(h: Harbor): { segs: Edge[]; open: number; floor: number } {
  let e = EDGES.get(h.id); if (e) return e;
  const segs: Edge[] = [], B = h.basin, free = (q: Vec) => !inBasin(q) && !hitsWall(q) && !onLand(q);
  if (h.breakwaters.length) for (const g of harborGaps(h)) { const t = { x: g.n.y, y: -g.n.x }; segs.push({ a: { x: g.c.x - t.x * g.B / 2, y: g.c.y - t.y * g.B / 2 }, b: { x: g.c.x + t.x * g.B / 2, y: g.c.y + t.y * g.B / 2 } }); }
  let open = 0, round = 0;
  for (let i = 0; i < B.length; i++) {
    const a = B[i], b = B[(i + 1) % B.length], L = Math.hypot(b.x - a.x, b.y - a.y); if (L < 0.5) continue;
    round += L; const t = { x: (b.x - a.x) / L, y: (b.y - a.y) / L };
    for (let s = 0; s < L; s += 2) {
      const p = { x: a.x + t.x * s, y: a.y + t.y * s }, q = { x: a.x + t.x * Math.min(L, s + 2), y: a.y + t.y * Math.min(L, s + 2) }, m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      let n = { x: t.y, y: -t.x }; if (inBasin({ x: m.x + n.x * 0.5, y: m.y + n.y * 0.5 })) n = { x: -n.x, y: -n.y }; // (outward)
      if ([1, 2, 3, 4, 6, 8, 15, 30].every(d => free({ x: m.x + n.x * d, y: m.y + n.y * d }))) { segs.push({ a: p, b: q }); open += Math.hypot(q.x - p.x, q.y - p.y); }
    }
  }
  const mouths = h.breakwaters.length ? harborGaps(h).reduce((s, g) => s + g.B, 0) : 0;
  e = { segs, open: Math.max(open, mouths), floor: !h.breakwaters.length || Math.max(open, mouths) > OPEN_SHARE * round ? BASIN_OPEN : BASIN_EDDY }; EDGES.set(h.id, e); return e;
}
export function basinCalm(p: Vec): number {
  const h = harborAt(p); if (!h) return 1;
  const e = openEdges(h); let d2 = Infinity;
  for (const { a, b } of e.segs) {
    const dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy, u = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
    const ex = p.x - a.x - u * dx, ey = p.y - a.y - u * dy; d2 = Math.min(d2, ex * ex + ey * ey);
  }
  return e.floor + (1 - e.floor) * Math.exp(-Math.sqrt(d2) / BASIN_MOUTH);
}
/** (for the tests) How much open edge a basin has, m, and the fraction of the stream left deep inside it. */
export const basinOpening = (h: Harbor) => { const e = openEdges(h); return { m: e.open, floor: e.floor }; };

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
