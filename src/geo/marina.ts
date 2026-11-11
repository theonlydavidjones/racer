import { inPoly, segPt, type Vec } from '../core/math';
import { LL } from './geo';
import westHarbor from './data/west-harbor.json';
import gashouseCove from './data/gashouse-cove.json';
import southBeach from './data/south-beach.json';
import corinthian from './data/corinthian.json';

/**
 * The marinas your boats can call home, from OpenStreetMap (scripts/make-west-harbor.mjs, scripts/make-marinas.mjs): each
 * basin is water you can sail in; its breakwaters, docks and piers are solid.
 * - West Harbor, San Francisco Marina (by the St. Francis and Golden Gate yacht clubs). Dock letters and slip numbers are
 *   this sim's: the harbor's own aren't published anywhere we could reach.
 * - Gashouse Cove, the Marina's East Harbor (by Fort Mason). Dock letters (north to south) and slip numbers are this sim's.
 * - South Beach Harbor (by Oracle Park). Docks A to G are the harbor's own (their names in OSM); slip numbers are this sim's.
 * - Corinthian Yacht Club, Tiburon. A dock is the southernmost line, along the breakwater, as the club's visitor notes say;
 *   B and C, the fingers (not mapped) and the slip numbers are inferred.
 * Slips are worked out from the docks' fingers.
 */

type LLs = [number, number][];
interface HarborData {
  name?: string; basin: LLs; breakwaters: { area: boolean; pts: LLs; seawall?: { top: number; rail: LLs } }[]; walkways: LLs[]; fingers: LLs[]; areas: LLs[];
  beacon?: [number, number] | null; beacons?: { at: [number, number]; colour: 'red' | 'green' }[]; exits?: LLs; shore?: LLs[];
  slips: { id: string; dock: string; at: [number, number]; heading: number; finger: number }[];
}
const SOURCES: { id: string; name: string; short: string; data: HarborData }[] = [
  { id: 'west-harbor', name: 'West Harbor, San Francisco Marina', short: 'West Harbor', data: westHarbor as unknown as HarborData },
  { id: 'gashouse-cove', name: 'Gashouse Cove, San Francisco Marina East Harbor', short: 'Gashouse Cove', data: gashouseCove as unknown as HarborData },
  { id: 'south-beach', name: 'South Beach Harbor, San Francisco', short: 'South Beach Harbor', data: southBeach as unknown as HarborData },
  { id: 'corinthian', name: 'Corinthian Yacht Club, Tiburon', short: 'Corinthian YC', data: corinthian as unknown as HarborData }
];
export const WALKWAY_W = 2.4, FINGER_W = 1.0, BREAKWATER_W = 6, SHORE_W = 3;

const v = (pts: LLs) => pts.map(([la, lo]) => LL(la, lo));
/** The dock's centre line, with an end that's within a few metres of another dock's centre line moved to meet that dock's edge (trimmed back if it crossed it, run out to it if it stopped short). */
function meetEdge(pts: Vec[], others: Vec[][], otherW: number): Vec[] {
  const out = pts.map(p => ({ ...p }));
  for (const [i, j] of [[0, 1], [out.length - 1, out.length - 2]]) {
    const p = out[i], q = out[j], L = Math.hypot(p.x - q.x, p.y - q.y); if (L < 0.5) continue;
    const t = { x: (p.x - q.x) / L, y: (p.y - q.y) / L }; // pointing out of the dock, toward the end
    let best: { s: number; sin: number } | null = null;
    for (const o of others) for (let k = 1; k < o.length; k++) {
      const a = o[k - 1], b = o[k], dx = b.x - a.x, dy = b.y - a.y, den = t.x * dy - t.y * dx; if (Math.abs(den) < 1e-6) continue;
      const s = ((a.x - p.x) * dy - (a.y - p.y) * dx) / den, r = ((a.x - p.x) * t.y - (a.y - p.y) * t.x) / den; // p + t·s meets a + (b−a)·r
      if (r < -0.02 || r > 1.02 || Math.abs(s) > 4) continue;
      const sin = Math.abs(den) / Math.hypot(dx, dy);
      if (!best || Math.abs(s) < Math.abs(best.s)) best = { s, sin };
    }
    if (best) { const s = best.s - otherW / 2 / Math.max(0.3, best.sin); out[i] = { x: p.x + t.x * s, y: p.y + t.y * s }; }
  }
  return out;
}

export interface Slip {
  /** Unique across the marinas: `<marina>:<label>` (West Harbor's older saves have the bare label: slipById takes those too). */
  id: string; label: string; dock: string; marina: string; p: Vec;
  /** bow-in heading (toward the walkway), deg */ heading: number; finger: number;
}
export interface Harbor {
  id: string; name: string; short: string;
  /** Breakwaters: rubble mounds, or a vertical concrete seawall (its top above the water, m, and the railing along its outer edge). */
  basin: Vec[]; breakwaters: { area: boolean; pts: Vec[]; seawall?: { top: number; rail: Vec[] } }[];
  /** Main walkways (2.4 m wide) and slip fingers (1.0 m), as centre lines; and solid pier areas. */
  walkways: Vec[][]; fingers: Vec[][]; areas: Vec[][];
  /** Stretches of the basin's edge that are the shore itself, solid (where the terrain grid is too coarse to stop a boat). */
  shore: Vec[][];
  /** Entrance beacons (lateral marks), and the ways out of the harbor (the middle of each entrance). */
  beacons: { p: Vec; colour: 'red' | 'green' }[]; exits: Vec[];
  /** The basin's bounding box, and a box round everything solid that belongs to the harbor. */
  box: Box; reach: Box;
}
interface Box { x0: number; x1: number; y0: number; y1: number }
const boxOf = (ps: Vec[], pad = 0): Box => ({ x0: Math.min(...ps.map(p => p.x)) - pad, x1: Math.max(...ps.map(p => p.x)) + pad, y0: Math.min(...ps.map(p => p.y)) - pad, y1: Math.max(...ps.map(p => p.y)) + pad });
const inBox = (p: Vec, b: Box) => p.x > b.x0 && p.x < b.x1 && p.y > b.y0 && p.y < b.y1;

export const HARBORS: Harbor[] = SOURCES.map(({ id, name, short, data: D }) => {
  const walks = D.walkways.map(v), fingers = D.fingers.map(v);
  const basin = v(D.basin), breakwaters = D.breakwaters.map(b => ({ area: b.area, pts: v(b.pts), ...(b.seawall ? { seawall: { top: b.seawall.top, rail: v(b.seawall.rail) } } : {}) }));
  const beacons = D.beacons ? D.beacons.map(b => ({ p: LL(b.at[0], b.at[1]), colour: b.colour })) : D.beacon ? [{ p: LL(D.beacon[0], D.beacon[1]), colour: 'red' as const }] : [];
  const exits = D.exits ? v(D.exits) : beacons.map(b => b.p);
  // (an end that stops short of a walkway, or runs on over it, is made to meet its edge: as drawn, and as solid)
  const walkways = walks.map(w => meetEdge(w, walks.filter(o => o !== w), WALKWAY_W)), areas = D.areas.map(v);
  return {
    id, name, short, basin, breakwaters, shore: (D.shore ?? []).map(v), walkways, fingers: fingers.map(f => meetEdge(f, walks, WALKWAY_W)), areas, beacons, exits,
    box: boxOf(basin), reach: boxOf([...basin, ...breakwaters.flatMap(b => b.pts), ...walkways.flat(), ...areas.flat()], BREAKWATER_W)
  };
});
/** West Harbor (the first of the marinas). */
export const HARBOR = HARBORS[0];
export const harborOf = (id: string | undefined): Harbor | null => HARBORS.find(h => h.id === id) ?? null;

/** The harbor whose basin (the water inside its breakwaters) this is in, if any. */
export const harborAt = (p: Vec): Harbor | null => HARBORS.find(h => inBox(p, h.box) && inPoly(p, h.basin)) ?? null;
/** In a harbor's basin? */
export const inBasin = (p: Vec): boolean => harborAt(p) !== null;

/** Within `half` of a dock's centre line, square at its ends (as the docks are built), and round only at its bends. */
const nearLine = (p: Vec, pts: Vec[], half: number) => {
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy; if (l2 < 1e-9) continue;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2;
    if (t >= 0 && t <= 1 && Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / Math.sqrt(l2) < half) return true;
    if (i > 1 && segPt(p, a, a) < half) return true; // the bend
  }
  return false;
};
/** A dock, a pier or a breakwater here (solid: a boat stops against it)? Only meaningful in or by a harbor. */
export function hitsHarbor(p: Vec): boolean {
  for (const H of HARBORS) {
    if (!inBox(p, H.reach)) continue;
    for (const b of H.breakwaters) if (b.area ? inPoly(p, b.pts) : nearLine(p, b.pts, BREAKWATER_W / 2)) return true;
    for (const a of H.areas) if (inPoly(p, a)) return true;
    for (const l of H.shore) if (nearLine(p, l, SHORE_W / 2)) return true;
    for (const w of H.walkways) if (nearLine(p, w, WALKWAY_W / 2)) return true;
    for (const f of H.fingers) if (nearLine(p, f, FINGER_W / 2)) return true;
  }
  return false;
}

/** A wall that stops the waves here: a breakwater, a solid pier or the shore (not the floating docks, which ride on them). */
export function hitsWall(p: Vec): boolean {
  for (const H of HARBORS) {
    if (!inBox(p, H.reach)) continue;
    for (const b of H.breakwaters) if (b.area ? inPoly(p, b.pts) : nearLine(p, b.pts, BREAKWATER_W / 2)) return true;
    for (const a of H.areas) if (inPoly(p, a)) return true;
    for (const l of H.shore) if (nearLine(p, l, SHORE_W / 2)) return true;
  }
  return false;
}

const ALL_SLIPS: Slip[] = SOURCES.flatMap(({ id, data }) => data.slips.map(s => ({ id: `${id}:${s.id}`, label: s.id, dock: s.dock, marina: id, p: LL(s.at[0], s.at[1]), heading: s.heading, finger: s.finger })));

/** The slips a Folkboat fits in: her length (7.6 m) along it and her beam (2.2 m) across it, clear of every dock. */
export const SLIPS: Slip[] = ALL_SLIPS.filter(s => {
  const u = { x: Math.sin(s.heading * Math.PI / 180), y: Math.cos(s.heading * Math.PI / 180) }, n = { x: u.y, y: -u.x };
  for (const a of [-3.6, -1.8, 0, 1.8, 3.6]) for (const b of [-1.05, 0, 1.05]) {
    const q = { x: s.p.x + u.x * a + n.x * b, y: s.p.y + u.y * a + n.y * b };
    if (!inBasin(q) || hitsHarbor(q)) return false;
  }
  return true;
});
const BY_ID = new Map(SLIPS.map(s => [s.id, s]));
/** A slip by its id (a bare label is one of West Harbor's: saves from before the other marinas). */
export const slipById = (id: string | undefined): Slip | null => !id ? null : BY_ID.get(id.includes(':') ? id : `west-harbor:${id}`) ?? null;
/** The slips in this marina. */
export const slipsIn = (marina: string | undefined): Slip[] => SLIPS.filter(s => s.marina === marina);

/** The marinas your boats can call home. */
export const MARINAS: { id: string; name: string; short: string }[] = SOURCES.map(({ id, name, short }) => ({ id, name, short }));
export const marinaName = (id: string | undefined) => MARINAS.find(m => m.id === id)?.name ?? '';
/** Where a slip is, for people: "A12, West Harbor". */
export const slipPlace = (s: Slip) => `${s.label}, ${harborOf(s.marina)?.short ?? ''}`;

/** Does a Folkboat (7.6 m by 2.2 m, a little to spare) fit here, at this heading, clear of every dock? */
export function hullClear(c: Vec, h: number): boolean {
  const u = { x: Math.sin(h * Math.PI / 180), y: Math.cos(h * Math.PI / 180) }, n = { x: u.y, y: -u.x };
  for (const a of [-3.7, -1.85, 0, 1.85, 3.7]) for (const b of [-1.05, 0, 1.05]) {
    const q = { x: c.x + u.x * a + n.x * b, y: c.y + u.y * a + n.y * b };
    if (!inBasin(q) || hitsHarbor(q)) return false;
  }
  return true;
}

/**
 * Leaving a slip she lies in bow first (boats nose in here, never back in): the crew walks her back along the finger
 * until her bow is about at its end, then swings her bow round toward the way out of the harbor and steps aboard
 * with a shove. `back` is how far she's walked astern (m), `turn` the swing (deg, + to starboard), `h` her heading
 * after it. If there isn't room to swing where she'd usually be, she's walked back a little further first.
 */
export interface PushOff { back: number; turn: number; h: number }
const plans = new Map<string, PushOff>();
export function pushOffPlan(s: Slip): PushOff {
  let p = plans.get(s.id); if (!p) { p = planPushOff(s); plans.set(s.id, p); }
  return p;
}
function planPushOff(s: Slip): PushOff {
  const u = { x: Math.sin(s.heading * Math.PI / 180), y: Math.cos(s.heading * Math.PI / 180) };
  const exits = harborOf(s.marina)?.exits ?? [], exit = exits.length ? exits.reduce((a, b) => Math.hypot(b.x - s.p.x, b.y - s.p.y) < Math.hypot(a.x - s.p.x, a.y - s.p.y) ? b : a) : s.p; // the nearer way out
  const base = 0.45 * s.finger + 4.1; // her bow (3.8 m ahead of her middle) level with the end of the finger
  const at = (back: number) => ({ x: s.p.x - u.x * back, y: s.p.y - u.y * back });
  const toward = (d: number) => { const c = at(base), v = { x: Math.sin((s.heading + d) * Math.PI / 180), y: Math.cos((s.heading + d) * Math.PI / 180) }; return v.x * (exit.x - c.x) + v.y * (exit.y - c.y); };
  const dirs = toward(90) >= toward(-90) ? [90, -90] : [-90, 90];
  for (const extra of [0, 1.5, 3, 4.5, 6]) {
    const back = base + extra;
    let ok = true;
    for (let d = 1; d <= back && ok; d += 1) ok = hullClear(at(d), s.heading);
    if (!ok) break; // walking her back any further runs her into something
    // of the ways she can swing, the one with the most clear fairway ahead (not a dead end); about even, toward the entrance
    const c = at(back), runs = dirs.map(turn => {
      for (let k = 1; k <= 6; k++) if (!hullClear(c, s.heading + turn * k / 6)) return -1;
      const h = s.heading + turn, v = { x: Math.sin(h * Math.PI / 180), y: Math.cos(h * Math.PI / 180) };
      let d = 0; while (d < 40 && hullClear({ x: c.x + v.x * (d + 2), y: c.y + v.y * (d + 2) }, h)) d += 2;
      return d;
    });
    if (runs.some(r => r >= 0)) {
      const i = runs[0] >= 0 && runs[0] >= runs[1] - 5 ? 0 : 1;
      return { back, turn: dirs[i], h: (s.heading + dirs[i] + 360) % 360 };
    }
  }
  return { back: base, turn: dirs[0], h: (s.heading + dirs[0] + 360) % 360 }; // tight: she'll bump on the way round
}
