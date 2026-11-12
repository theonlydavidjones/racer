import { inPoly, segPt, type Vec } from '../core/math';
import { LL } from './geo';
import westHarbor from './data/west-harbor.json';
import gashouseCove from './data/gashouse-cove.json';
import southBeach from './data/south-beach.json';
import corinthian from './data/corinthian.json';
import horseshoeBay from './data/horseshoe-bay.json';
import berkeley from './data/berkeley.json';
import richmondYc from './data/richmond-yc.json';
import encinal from './data/encinal.json';

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
  beacon?: [number, number] | null; beacons?: { at: [number, number]; colour: 'red' | 'green' }[]; exits?: LLs; shore?: LLs[]; piles?: 'white'; paths?: LLs[];
  slips: { id: string; dock: string; at: [number, number]; heading: number; finger: number; kind?: 'bow-in' | 'alongside' }[];
}
const SOURCES: { id: string; name: string; short: string; data: HarborData }[] = [
  { id: 'west-harbor', name: 'West Harbor, San Francisco Marina', short: 'West Harbor', data: westHarbor as unknown as HarborData },
  { id: 'gashouse-cove', name: 'Gashouse Cove, San Francisco Marina East Harbor', short: 'Gashouse Cove', data: gashouseCove as unknown as HarborData },
  { id: 'south-beach', name: 'South Beach Harbor, San Francisco', short: 'South Beach Harbor', data: southBeach as unknown as HarborData },
  { id: 'corinthian', name: 'Corinthian Yacht Club, Tiburon', short: 'Corinthian YC', data: corinthian as unknown as HarborData },
  { id: 'horseshoe-bay', name: 'Travis Marina, Horseshoe Bay (Fort Baker)', short: 'Horseshoe Bay', data: horseshoeBay as unknown as HarborData },
  // the East Bay's racing harbors (Bay East, November 2026): docks and breakwaters from OSM and NOAA's chart. Few fingers
  // are mapped and the slips aren't published where we could reach, so no slips of their own yet; Berkeley has a berth
  // alongside Berkeley Yacht Club's guest dock
  { id: 'berkeley', name: 'Berkeley Marina (Berkeley Yacht Club)', short: 'Berkeley Marina', data: berkeley as unknown as HarborData },
  { id: 'richmond-yc', name: 'Richmond Yacht Club, Brickyard Cove', short: 'Richmond YC', data: richmondYc as unknown as HarborData },
  { id: 'encinal', name: 'Encinal Yacht Club, Alameda', short: 'Encinal YC', data: encinal as unknown as HarborData }
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
  /** A slip between fingers she lies in bow first, or an end tie she lies alongside, bow out along the dock's end. */
  kind: 'bow-in' | 'alongside';
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
  /** The dock pilings' colour (white: plastic-sleeved, as at Horseshoe Bay; else timber), and paved paths along the breakwaters' tops. */
  piles: 'white' | 'timber'; paths: Vec[][];
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
    id, name, short, basin, breakwaters, shore: (D.shore ?? []).map(v), walkways, fingers: fingers.map(f => meetEdge(f, walks, WALKWAY_W)), areas, beacons, exits, piles: D.piles ?? 'timber', paths: (D.paths ?? []).map(v),
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
/**
 * Everything solid in a harbor, filed in 10 m cells, so a question about one place (or one line) looks only at the
 * docks near it, not at all of West Harbor's hundreds of fingers: boats finish beside its jetty, and the AI's
 * look-ahead asks about the water there every step.
 */
export interface HarborSolid { poly: boolean; pts: Vec[]; half: number; seen: number }
export interface HarborIndex { x0: number; y0: number; C: number; nx: number; ny: number; cells: HarborSolid[][] }
const INDEX = new Map<Harbor, HarborIndex>();
export function harborIndex(H: Harbor): HarborIndex {
  let ix = INDEX.get(H);
  if (ix) return ix;
  const C = 10, x0 = H.reach.x0, y0 = H.reach.y0, nx = Math.ceil((H.reach.x1 - x0) / C) + 1, ny = Math.ceil((H.reach.y1 - y0) / C) + 1;
  const cells: HarborSolid[][] = Array.from({ length: nx * ny }, () => []);
  const file = (pts: Vec[], poly: boolean, half: number) => {
    const s: HarborSolid = { poly, pts, half, seen: 0 }, b = boxOf(pts, half + 0.01);
    for (let j = Math.max(0, Math.floor((b.y0 - y0) / C)); j <= Math.min(ny - 1, Math.floor((b.y1 - y0) / C)); j++)
      for (let i = Math.max(0, Math.floor((b.x0 - x0) / C)); i <= Math.min(nx - 1, Math.floor((b.x1 - x0) / C)); i++) cells[j * nx + i].push(s);
  };
  for (const b of H.breakwaters) file(b.pts, b.area, b.area ? 0 : BREAKWATER_W / 2);
  for (const a of H.areas) file(a, true, 0);
  for (const l of H.shore) file(l, false, SHORE_W / 2);
  for (const w of H.walkways) file(w, false, WALKWAY_W / 2);
  for (const f of H.fingers) file(f, false, FINGER_W / 2);
  ix = { x0, y0, C, nx, ny, cells };
  INDEX.set(H, ix);
  return ix;
}
/** A dock, a pier or a breakwater here (solid: a boat stops against it)? Only meaningful in or by a harbor. */
export function hitsHarbor(p: Vec): boolean {
  for (const H of HARBORS) {
    if (!inBox(p, H.reach)) continue;
    const ix = harborIndex(H), i = Math.floor((p.x - ix.x0) / ix.C), j = Math.floor((p.y - ix.y0) / ix.C);
    if (i < 0 || j < 0 || i >= ix.nx || j >= ix.ny) continue;
    for (const s of ix.cells[j * ix.nx + i]) if (s.poly ? inPoly(p, s.pts) : nearLine(p, s.pts, s.half)) return true;
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

const ALL_SLIPS: Slip[] = SOURCES.flatMap(({ id, data }) => data.slips.map(s => ({ id: `${id}:${s.id}`, label: s.id, dock: s.dock, marina: id, p: LL(s.at[0], s.at[1]), heading: s.heading, finger: s.finger, kind: s.kind ?? 'bow-in' as const })));

/** The slips a Folkboat fits in: her length (7.6 m) along it and her beam (2.2 m) across it, clear of every dock. */
export const SLIPS: Slip[] = ALL_SLIPS.filter(s => {
  const u = { x: Math.sin(s.heading * Math.PI / 180), y: Math.cos(s.heading * Math.PI / 180) }, n = { x: u.y, y: -u.x };
  for (const a of [-3.6, -1.8, 0, 1.8, 3.6]) for (const b of [-1.05, 0, 1.05]) {
    const q = { x: s.p.x + u.x * a + n.x * b, y: s.p.y + u.y * a + n.y * b };
    if (!inBasin(q) || hitsHarbor(q)) return false;
  }
  return true;
});
/**
 * End ties: a berth alongside the free end of each main dock (the last few metres of a walkway that doesn't run into
 * another), where a boat lies parallel to the dock, bow out toward its end, as most marinas let a visitor or a boat
 * without a slip lie. Only where a Folkboat fits clear of every dock, finger and slip, with open water ahead.
 */
const END_TIES: Slip[] = HARBORS.flatMap(H => {
  const out: Slip[] = [], mine = SLIPS.filter(s => s.marina === H.id), count = new Map<string, number>();
  for (const w of H.walkways) for (const [i, j] of [[w.length - 1, w.length - 2], [0, 1]]) {
    const e = w[i], f = w[j], L = Math.hypot(e.x - f.x, e.y - f.y); if (L < 8) continue;
    const u = { x: (e.x - f.x) / L, y: (e.y - f.y) / L }; // along the dock, out toward its end
    if (H.walkways.some(o => o !== w && o.some((q, k) => k > 0 && segPt(e, o[k - 1], q) < 3))) continue; // it runs into another dock: not a free end
    const near = mine.filter(s => Math.hypot(s.p.x - e.x, s.p.y - e.y) < 40).sort((a, b) => Math.hypot(a.p.x - e.x, a.p.y - e.y) - Math.hypot(b.p.x - e.x, b.p.y - e.y))[0];
    if (!near) continue;
    for (const side of [1, -1]) {
      const n = { x: u.y * side, y: -u.x * side }, c = { x: e.x - u.x * 4.6 + n.x * (WALKWAY_W / 2 + 1.1 + 0.3), y: e.y - u.y * 4.6 + n.y * (WALKWAY_W / 2 + 1.1 + 0.3) };
      const h = (Math.atan2(u.x, u.y) * 180 / Math.PI + 360) % 360;
      if (!hullClear(c, h) || mine.some(s => Math.hypot(s.p.x - c.x, s.p.y - c.y) < 4.5) || out.some(s => Math.hypot(s.p.x - c.x, s.p.y - c.y) < 4.5)) continue;
      let run = 0; while (run < 12 && hullClear({ x: c.x + u.x * (run + 2), y: c.y + u.y * (run + 2) }, h)) run += 2;
      if (run < 12) continue; // no open water ahead to leave by
      const k = (count.get(near.dock) ?? 0) + 1; count.set(near.dock, k);
      out.push({ id: `${H.id}:${near.dock} end ${k}`, label: `${near.dock} end ${k}`, dock: near.dock, marina: H.id, p: c, heading: Math.round(h), finger: 0, kind: 'alongside' });
    }
  }
  return out;
});
SLIPS.push(...END_TIES);
const BY_ID = new Map(SLIPS.map(s => [s.id, s]));
/** A slip by its id (a bare label is one of West Harbor's: saves from before the other marinas). */
export const slipById = (id: string | undefined): Slip | null => !id ? null : BY_ID.get(id.includes(':') ? id : `west-harbor:${id}`) ?? null;
/** The slips in this marina. */
export const slipsIn = (marina: string | undefined): Slip[] => SLIPS.filter(s => s.marina === marina);

/** The marinas a boat can call home: those with berths (Richmond YC and Encinal YC have none yet: water and docks only). */
export const MARINAS: { id: string; name: string; short: string }[] = SOURCES.filter(({ data }) => data.slips.length).map(({ id, name, short }) => ({ id, name, short }));
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

/** Where the boat in another slip lies (a little under the length of its finger, as drawn: render/marina.ts), for keeping clear of her. */
const boatIn = (o: Slip) => { const len = o.kind === 'alongside' ? 7 : Math.min(13, Math.max(7, o.finger * 1.05)); return { half: len / 2, beam: 0.17 * len }; }; // (as drawn, at their longest: render/marina.ts)
/** The slips filed in 10 m cells, per harbor, each in its own cell and the eight round it (no boat reaches more than 7 m from her slip's middle). */
const byHarbor = new Map<string, Map<string, Slip[]>>();
const CELL = 10, cellKey = (x: number, y: number) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
function slipsNear(q: Vec, marina: string): Slip[] {
  let g = byHarbor.get(marina);
  if (!g) {
    g = new Map();
    for (const s of SLIPS) if (s.marina === marina) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const k = cellKey(s.p.x + dx * CELL, s.p.y + dy * CELL); let l = g.get(k); if (!l) g.set(k, l = []); l.push(s); }
    byHarbor.set(marina, g);
  }
  return g.get(cellKey(q.x, q.y)) ?? [];
}
/** The docks' corners and ends (their centre lines' points), filed in the same 10 m cells, per harbor. */
const corners = new Map<string, Map<string, Vec[]>>();
function cornersNear(q: Vec, marina: string): Vec[] {
  let g = corners.get(marina);
  if (!g) {
    g = new Map(); const H = harborOf(marina);
    if (H) for (const L of [H.walkways, H.fingers]) for (const w of L) for (const p of w) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) { const k = cellKey(p.x + dx * CELL, p.y + dy * CELL); let l = g.get(k); if (!l) g.set(k, l = []); l.push(p); }
    corners.set(marina, g);
  }
  return g.get(cellKey(q.x, q.y)) ?? [];
}
/** Clear of the boats lying in the other slips (all of them: most have a boat in them)? */
function clearOfBoats(q: Vec, except: Slip): boolean {
  for (const o of slipsNear(q, except.marina)) {
    if (o === except) continue;
    const dx = q.x - o.p.x, dy = q.y - o.p.y; if (dx * dx + dy * dy > 64) continue; // (no moored boat reaches 8 m from her slip's middle)
    const u = { x: Math.sin(o.heading * Math.PI / 180), y: Math.cos(o.heading * Math.PI / 180) }, b = boatIn(o);
    if (Math.abs(dx * u.x + dy * u.y) < b.half && Math.abs(dx * u.y - dy * u.x) < b.beam) return false;
  }
  return true;
}
/** Her hull: 7.6 m long, 2.2 m in the beam. */
const HALF_L = 3.8, HALF_B = 1.1;
/**
 * Her whole hull here, at this heading, clear of every dock and of the boats in the other slips? Sampled closer than a
 * finger is wide (0.95 m along her, 0.55 m across), and the other way round too: no corner of a dock or of a moored boat
 * inside her outline.
 */
export function berthClear(c: Vec, h: number, except: Slip): boolean {
  const u = { x: Math.sin(h * Math.PI / 180), y: Math.cos(h * Math.PI / 180) }, n = { x: u.y, y: -u.x };
  for (let a = -3.7; a <= 3.71; a += 0.925) for (let b = -1.05; b <= 1.06; b += 0.525) {
    const q = { x: c.x + u.x * a + n.x * b, y: c.y + u.y * a + n.y * b };
    if (!inBasin(q) || hitsHarbor(q) || !clearOfBoats(q, except)) return false;
  }
  const inside = (q: Vec) => { const dx = q.x - c.x, dy = q.y - c.y; return Math.abs(dx * u.x + dy * u.y) < HALF_L && Math.abs(dx * n.x + dy * n.y) < HALF_B; };
  for (const q of cornersNear(c, except.marina)) if (inside(q)) return false; // (a finger's end, a dock's corner)
  for (const o of slipsNear(c, except.marina)) {
    if (o === except) continue;
    const v = { x: Math.sin(o.heading * Math.PI / 180), y: Math.cos(o.heading * Math.PI / 180) }, m = { x: v.y, y: -v.x }, b = boatIn(o);
    for (const [sa, sb] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) if (inside({ x: o.p.x + v.x * b.half * sa + m.x * b.beam * sb, y: o.p.y + v.y * b.half * sa + m.y * b.beam * sb })) return false; // (a moored boat's corner)
  }
  return true;
}

/**
 * Leaving her berth under no engine, as it's done. The wind has the say (`windFrom`, deg, and `windKt`).
 * - **Swinging her out of a bow-in slip** (`swing`): a crew member walks her back along the finger by the shroud and steps
 *   aboard at its end with a bow line led round the cleat there and back aboard, which holds her bow just past the finger's
 *   end (`back`: how far her middle goes back, m; half a metre to two and a half past it, as little as clears the boats either
 *   side) while her
 *   stern swings out across the fairway about it (`turn`, deg, + to starboard; to heading `h`). In a breeze across her
 *   (4 kt and more: WIND_SWINGS) the wind swings the stern, downwind: she ends up pointing toward the wind, and if
 *   that's head to wind (`hold`) the crew holds her there, bow to the wind, while you hoist the main; then they push her
 *   bow off until the main fills (`off`: 60 deg from head to wind, or as far as there's clear water for, toward the way out) and let her go. In light air they walk the
 *   bow round whichever way points her down the fairway toward the way out. Then they slip the line and push her off
 *   forward with the boathook against the finger's end.
 * - **Shoving her off astern** (`astern`), where the fairway's too narrow to swing her: walked back until her bow is at the
 *   finger's end, then given a shove astern as the crew steps aboard, enough to coast her `coast` m on into the fairway on
 *   the water's drag (physics.ts asternCoast), steered stern first.
 * - **Pushing her off an end tie** (`off`): the crew pushes her off the dock (`out`: where her middle's pushed to) and, if
 *   she'd otherwise be left head to wind, her bow off the wind (`h`), her stern quarter against the dock as the pivot.
 * `headToWind`: she'll be pointing within 45 degrees of the wind when let go (get the main up first).
 */
export type PushOff = ({ kind: 'swing'; back: number; turn: number; hold?: { off: number } } | { kind: 'astern'; back: number; coast: number } | { kind: 'off'; out: Vec }) & { h: number; headToWind?: boolean };
/** Her bow is 3.8 m ahead of her middle. */
const BOW = 3.8;
/**
 * A breeze this strong (kt) and the wind swings her stern about the bow line, whatever the crew would like: she weathervanes
 * toward head to wind from any angle (only dead downwind is a balance, and an unstable one). At 4 kt the turning force about
 * her bow is about 50 N·m, which a crew member could still hold; but by then they're aboard, holding the line, not pushing.
 */
export const WIND_SWINGS = 4;
const plans = new Map<string, PushOff>();
export function pushOffPlan(s: Slip, windFrom?: number, windKt = 0): PushOff {
  const from = windFrom == null ? undefined : Math.round(windFrom / 10) * 10, kt = from == null ? 0 : Math.round(windKt / 2) * 2; // (the wind to 10 degrees, 2 knots)
  const k = `${s.id}:${from ?? ''}:${kt}`;
  let p = plans.get(k); if (!p) { p = planPushOff(s, from, kt); plans.set(k, p); }
  return p;
}
const dirOf = (h: number) => ({ x: Math.sin(h * Math.PI / 180), y: Math.cos(h * Math.PI / 180) });
const wrap180 = (a: number) => ((a + 540) % 360) - 180;
/** Pointing within 45 degrees of where the wind's coming from: she can't keep way on there with no sail up. */
const headUp = (h: number, windFrom: number | undefined) => windFrom != null && Math.abs(wrap180(windFrom - h)) < 45;
/**
 * Let go off the wind with only the main up, she doesn't hold her heading to the degree: the wind wanders a few degrees
 * either way in its gusts (environment/gusts.ts: about ±4 at 14 kt) and the main alone gives her weather helm, so she
 * rounds up a few degrees more in the seconds it takes to gather way. The clear water ahead she's let go into has to be
 * there that much nearer the wind than she's pointed, not just dead ahead.
 */
const WANDER = 8;
/** How much clear fairway lies ahead of her middle at `c` on heading `h`, m (up to 14: enough to know there's the 12 m she needs). */
function runAhead(c: Vec, h: number, s: Slip): number {
  const v = dirOf(h); let d = 0;
  while (d < 14 && berthClear({ x: c.x + v.x * (d + 2), y: c.y + v.y * (d + 2) }, h, s)) d += 2;
  return d;
}
/** Turning her about a point on her centreline `pivot` m ahead of her middle (her bow: 3.8; her stern: −3.8), from (c0, h0) by `a` deg. */
const about = (c0: Vec, h0: number, pivot: number, a: number) => {
  const u0 = dirOf(h0), P = { x: c0.x + u0.x * pivot, y: c0.y + u0.y * pivot }, u = dirOf(h0 + a);
  return { c: { x: P.x - u.x * pivot, y: P.y - u.y * pivot }, h: h0 + a };
};
/**
 * Every pose she passes through as she's handled off her berth, in order (her middle and heading): walked back, swung
 * (24 steps), pushed off; shoved off astern, to where her coast ends. For checking it's all clear.
 */
export function pushOffPoses(s: Slip, p: PushOff): { c: Vec; h: number }[] {
  const u = dirOf(s.heading), at = (back: number) => ({ x: s.p.x - u.x * back, y: s.p.y - u.y * back }), out: { c: Vec; h: number }[] = [];
  if (p.kind === 'off') {
    for (let k = 1; k <= 6; k++) out.push({ c: { x: s.p.x + (p.out.x - s.p.x) * k / 6, y: s.p.y + (p.out.y - s.p.y) * k / 6 }, h: s.heading });
    const a = wrap180(p.h - s.heading); for (let k = 1; k <= 12 && a; k++) out.push(about(p.out, s.heading, -BOW, a * k / 12)); // (the bow pushed off about her stern quarter)
    return out;
  }
  for (let d = 0.5; d < p.back; d += 0.5) out.push({ c: at(d), h: s.heading });
  out.push({ c: at(p.back), h: s.heading });
  if (p.kind === 'astern') { for (let d = p.back + 0.5; d < p.back + p.coast; d += 0.5) out.push({ c: at(d), h: s.heading }); out.push({ c: at(p.back + p.coast), h: s.heading }); }
  if (p.kind === 'swing') {
    for (let k = 1; k <= 24; k++) out.push(about(at(p.back), s.heading, BOW, p.turn * k / 24));
    if (p.hold) { const last = out[out.length - 1]; for (let k = 1; k <= 8; k++) out.push(about(last.c, last.h, BOW, p.hold.off * k / 8)); }
  }
  return out;
}
/**
 * How far it is to the way out of the harbor from here, along the water (m, in 1.5 m steps; Infinity off the water): a flood
 * over the basin from its water nearest each entrance, worked out once per harbor (each step checked at its middle too, so
 * it can't hop a finger or a dock, and with room for her beam). In a long harbor the way out can lie
 * the other way round the docks from where the entrance is as the crow flies.
 */
const ways = new Map<string, (q: Vec) => number>();
export function toExit(H: Harbor): (q: Vec) => number {
  let f = ways.get(H.id); if (f) return f;
  const G = 1.5, key = (x: number, y: number) => `${Math.round(x / G)},${Math.round(y / G)}`, d = new Map<string, number>();
  let fr: Vec[] = [];
  for (const e of H.exits) {
    let best: Vec | null = null, bd = Infinity;
    for (let x = Math.floor(H.box.x0 / G) * G; x <= H.box.x1; x += G) for (let y = Math.floor(H.box.y0 / G) * G; y <= H.box.y1; y += G) {
      const q = { x, y }, dd = Math.hypot(q.x - e.x, q.y - e.y);
      if (dd < bd && harborAt(q) === H && ![[0, 0], [1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1]].some(([ex, ey]) => hitsHarbor({ x: q.x + ex, y: q.y + ey }))) { bd = dd; best = q; }
    }
    if (best && !d.has(key(best.x, best.y))) { d.set(key(best.x, best.y), bd); fr.push(best); }
  }
  while (fr.length) {
    const nx: Vec[] = [];
    for (const p of fr) for (const [dx, dy] of [[G, 0], [-G, 0], [0, G], [0, -G]]) {
      const q = { x: p.x + dx, y: p.y + dy }, k = key(q.x, q.y);
      // (over the basin's water, with room for her beam: no squeezing through a gap narrower than she is)
      if (d.has(k) || harborAt(q) !== H || hitsHarbor({ x: p.x + dx / 2, y: p.y + dy / 2 }) || [[0, 0], [1.1, 0], [-1.1, 0], [0, 1.1], [0, -1.1]].some(([ex, ey]) => hitsHarbor({ x: q.x + ex, y: q.y + ey }))) continue;
      d.set(k, d.get(key(p.x, p.y))! + G); nx.push(q);
    }
    fr = nx;
  }
  f = q => Math.min(...[[0, 0], [G, 0], [-G, 0], [0, G], [0, -G]].map(([dx, dy]) => d.get(key(q.x + dx, q.y + dy)) ?? Infinity));
  ways.set(H.id, f);
  return f;
}
function planPushOff(s: Slip, windFrom: number | undefined, windKt: number): PushOff {
  const H = harborOf(s.marina)!, togo = toExit(H), u = dirOf(s.heading), n = { x: u.y, y: -u.x };
  if (s.kind === 'alongside') {
    // pushed off sideways from the dock (away from the nearest walkway), and forward along it
    let side = 1, best = Infinity;
    for (const w of H.walkways) for (let k = 1; k < w.length; k++) { const d = segPt(s.p, w[k - 1], w[k]); if (d < best) { best = d; const m = { x: (w[k - 1].x + w[k].x) / 2 - s.p.x, y: (w[k - 1].y + w[k].y) / 2 - s.p.y }; side = m.x * n.x + m.y * n.y > 0 ? -1 : 1; } }
    const out = { x: s.p.x + n.x * side * 1.5, y: s.p.y + n.y * side * 1.5 };
    if (!headUp(s.heading, windFrom)) return { kind: 'off', out, h: s.heading };
    // head to wind: the crew pushes her bow off, away from the dock, about her stern quarter, as far as there's room for (60
    // degrees off the wind, where a sail would fill, if it fits)
    for (const a of [60, 50, 40, 30, 20]) {
      const h = (s.heading + a * side + 360) % 360, p: PushOff = { kind: 'off', out, h };
      if (pushOffPoses(s, p).every(q => berthClear(q.c, q.h, s)) && runAhead(about(out, s.heading, -BOW, a * side).c, h, s) >= 8) return { ...p, ...(headUp(h, windFrom) ? { headToWind: true } : {}) };
    }
    return { kind: 'off', out, h: s.heading, headToWind: true };
  }
  const at = (back: number) => ({ x: s.p.x - u.x * back, y: s.p.y - u.y * back });
  const tip = 0.45 * s.finger; // her middle to the end of her finger
  let reach = 0; while (reach < tip + 40 && berthClear(at(reach + 0.5), s.heading, s)) reach += 0.5;
  // which way the wind swings her stern: downwind, so her bow comes round toward the wind
  const fromBow = windFrom == null ? 0 : Math.abs(wrap180(windFrom - s.heading)); // (0: the wind blowing straight out of the slip, already on her bow)
  const windTurn = windFrom == null ? 0 : Math.sign(wrap180(windFrom - s.heading)) || 1;
  const swings = windFrom != null && windKt >= WIND_SWINGS && fromBow < 165; // (the wind has the say; blowing straight into the slip from astern, it could swing her either way: the crew's choice)
  // her bow held on a short bow line by a crew member on the finger's end, half a metre to two and a half past it (the boats
  // in the slips either side overhang their fingers' ends: her bow has to clear their sterns as she swings)
  type Way = { back: number; turn: number; h: number; gain: number; run: number; hold?: { off: number } };
  const ways: Way[] = [];
  // (the turns searched in 12 steps; the one taken, checked in 24, and its push off the wind if she's held head to wind)
  const fine = (w: Way) => { for (let k = 1; k <= 24; k++) { const q = about(at(w.back), s.heading, BOW, w.turn * k / 24); if (!berthClear(q.c, q.h, s)) return false; } if (w.hold) { const c0 = about(at(w.back), s.heading, BOW, w.turn); for (let k = 1; k <= 16; k++) { const q = about(c0.c, c0.h, BOW, w.hold.off * k / 16); if (!berthClear(q.c, q.h, s)) return false; } } return true; };
  for (const gap of [0.5, 1, 1.5, 2, 2.5]) {
    const back = tip + BOW + gap; if (back > reach) break;
    const sweepClear = (turn: number, steps = 12) => { for (let k = 1; k <= steps; k++) { const q = about(at(back), s.heading, BOW, turn * k / steps); if (!berthClear(q.c, q.h, s)) return false; } return true; };
    for (const sign of swings ? [windTurn] : [1, -1]) for (const sq of [90, 75, 105, 60, 120, 45, 135]) {
      let turn = sign * sq;
      // the wind swinging her: she comes round no further than head to wind (where she lies to the bow line)
      let hold: { off: number } | undefined;
      if (swings) {
        const toWind = wrap180(windFrom! - s.heading) * sign; // (degrees to come round to point at the wind, the way she's swinging)
        if (toWind >= 0 && toWind <= sq + 10) { // (0: already head to wind, the wind straight out of the slip: no swing to speak of, held there for the main)
          turn = sign * toWind;
          // held head to wind while the main goes up; then the crew pushes her bow off until the main fills (60 degrees off the
          // wind; less, if that would point her into the docks, but never under 40: nearer the wind than that the main won't fill
          // and she falls back; and with the room ahead to gather way, allowing for her rounding up a little, WANDER)
          const c0 = about(at(back), s.heading, BOW, turn);
          const offs = [60, -60, 50, -50, 40, -40].filter(o => { for (let k = 1; k <= 8; k++) { const q = about(c0.c, c0.h, BOW, o * k / 8); if (!berthClear(q.c, q.h, s)) return false; } const e = about(c0.c, c0.h, BOW, o); return runAhead(e.c, e.h, s) >= 10 && runAhead(e.c, e.h - Math.sign(o) * WANDER, s) >= 8; });
          if (!offs.length) continue;
          const score = (o: number) => { const q = about(c0.c, c0.h, BOW, o), v = dirOf(q.h); return togo({ x: q.c.x - v.x * 12, y: q.c.y - v.y * 12 }) - togo({ x: q.c.x + v.x * 12, y: q.c.y + v.y * 12 }); };
          hold = { off: offs.sort((a, b) => Math.abs(b) - Math.abs(a) || Math.round(score(b) / 3) - Math.round(score(a) / 3))[0] }; // (as far off the wind as there's room; toward the way out)
        }
        if (sq !== 90 && !hold) continue; // (the wind takes her a quarter-turn round: no choosing the angle)
      }
      if (!sweepClear(turn)) continue;
      const end = about(at(back), s.heading, BOW, turn + (hold?.off ?? 0)), h = (end.h + 720) % 360;
      const v = dirOf(h), run = runAhead(end.c, h, s);
      const gain = togo({ x: end.c.x - v.x * 12, y: end.c.y - v.y * 12 }) - togo({ x: end.c.x + v.x * 12, y: end.c.y + v.y * 12 }); // (how much nearer the way out, along the water, she's pointed)
      if (run >= (hold ? 8 : 12)) ways.push({ back, turn, h, gain: Number.isFinite(gain) ? gain : 0, run, hold });
      if (swings) break; // (one way round, by the wind)
    }
    if (ways.some(w => w.gain > 15 && fine(w))) break; // (pointed well toward the way out: no need to hold her any further off)
  }
  // the best: pointed most toward the way out (to within a couple of metres); then the shortest bow line and squarest turn (found first)
  const best = [...ways].sort((a, b) => Math.round(b.gain / 3) - Math.round(a.gain / 3)).find(fine);
  if (best) return { kind: 'swing', back: best.back, turn: best.turn, h: best.h, ...(best.hold ? { hold: best.hold } : {}), ...(headUp(best.h, windFrom) ? { headToWind: true } : {}) };
  // no room to swing her (or the wind would swing her into something): walked back until her bow's at the finger's end,
  // then shoved off astern into the fairway, to the middle of it (8 m past the finger where it's open water)
  let far = tip + 1; while (far < tip + 40) { const q = at(far); if (!inBasin(q) || hitsHarbor(q) || !clearOfBoats(q, s)) break; far += 0.5; }
  const mid = far >= tip + 24 ? tip + 8 : (tip + far) / 2, b0 = Math.min(reach, tip + BOW);
  const coast = Math.max(0, Math.min(reach, Math.max(mid, tip + BOW + 1)) - b0);
  return { kind: 'astern', back: b0, coast, h: s.heading };
}

/**
 * Only the slips she can be got out of by hand: walked straight back past her finger's end (her whole hull out of it)
 * without touching a dock or the boats either side or across (a few mapped slips face a dock or another row too closely).
 */
for (let i = SLIPS.length - 1; i >= 0; i--) {
  const s = SLIPS[i]; if (s.kind !== 'bow-in') continue;
  const u = dirOf(s.heading), tip = 0.45 * s.finger;
  let ok = true;
  for (let d = Math.max(1, tip - 3); d <= tip + 4 && ok; d += 1.5) ok = berthClear({ x: s.p.x - u.x * d, y: s.p.y - u.y * d }, s.heading, s); // (from where her stern comes to the finger's end)
  if (!ok) SLIPS.splice(i, 1);
}
/**
 * And not the few she'd be shoved out of astern into a corner with no room to turn her (the first slips on four of Gashouse
 * Cove's docks, by the seawall and the shore; two by Horseshoe Bay's L dock): with no engine there's no getting out. Kept
 * up to date by tests/pushoff-all.test.ts.
 */
export const NO_WAY_OUT = ['gashouse-cove:D1', 'gashouse-cove:E1', 'gashouse-cove:F1', 'gashouse-cove:F2', 'gashouse-cove:G1', 'horseshoe-bay:B1', 'horseshoe-bay:B2'];
for (let i = SLIPS.length - 1; i >= 0; i--) if (NO_WAY_OUT.includes(SLIPS[i].id)) SLIPS.splice(i, 1);
BY_ID.clear(); for (const s of SLIPS) BY_ID.set(s.id, s);
byHarbor.clear();
