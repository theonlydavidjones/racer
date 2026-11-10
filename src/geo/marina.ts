import { inPoly, segPt, type Vec } from '../core/math';
import { LL } from './geo';
import data from './data/west-harbor.json';

/**
 * San Francisco Marina's West Harbor, by the St. Francis and Golden Gate yacht clubs (OpenStreetMap, via
 * scripts/make-west-harbor.mjs): the basin is water you can sail in; the breakwaters and the docks are solid.
 * Slips are worked out from the docks' fingers; their letters and numbers are this sim's, not the harbor's.
 */

type LLs = [number, number][];
const D = data as unknown as {
  basin: LLs; breakwaters: { area: boolean; pts: LLs }[]; walkways: LLs[]; fingers: LLs[]; areas: LLs[];
  beacon: [number, number] | null; slips: { id: string; dock: string; at: [number, number]; heading: number; finger: number }[];
};
const v = (pts: LLs) => pts.map(([la, lo]) => LL(la, lo));

export const HARBOR = {
  name: 'West Harbor',
  basin: v(D.basin),
  breakwaters: D.breakwaters.map(b => ({ area: b.area, pts: v(b.pts) })),
  /** Main walkways (2.4 m wide) and slip fingers (1.0 m), as centre lines; and solid pier areas. */
  walkways: D.walkways.map(v), fingers: D.fingers.map(v), areas: D.areas.map(v),
  beacon: D.beacon ? LL(D.beacon[0], D.beacon[1]) : null
};
export const WALKWAY_W = 2.4, FINGER_W = 1.0, BREAKWATER_W = 6;

export interface Slip { id: string; dock: string; p: Vec; /** bow-in heading (toward the walkway), deg */ heading: number; finger: number }
const ALL_SLIPS: Slip[] = D.slips.map(s => ({ id: s.id, dock: s.dock, p: LL(s.at[0], s.at[1]), heading: s.heading, finger: s.finger }));
export const slipById = (id: string | undefined): Slip | null => SLIPS.find(s => s.id === id) ?? null; // (SLIPS: below)

const box = (() => { const xs = HARBOR.basin.map(p => p.x), ys = HARBOR.basin.map(p => p.y); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; })();
/** In the harbor's basin (the water inside the breakwaters)? */
export const inBasin = (p: Vec): boolean => p.x > box.x0 && p.x < box.x1 && p.y > box.y0 && p.y < box.y1 && inPoly(p, HARBOR.basin);

const nearLine = (p: Vec, pts: Vec[], half: number) => { for (let i = 1; i < pts.length; i++) if (segPt(p, pts[i - 1], pts[i]) < half) return true; return false; };
/** A dock, a pier or a breakwater here (solid: a boat stops against it)? Only meaningful in or by the basin. */
export function hitsHarbor(p: Vec): boolean {
  for (const b of HARBOR.breakwaters) if (b.area ? inPoly(p, b.pts) : nearLine(p, b.pts, BREAKWATER_W / 2)) return true;
  for (const a of HARBOR.areas) if (inPoly(p, a)) return true;
  for (const w of HARBOR.walkways) if (nearLine(p, w, WALKWAY_W / 2)) return true;
  for (const f of HARBOR.fingers) if (nearLine(p, f, FINGER_W / 2)) return true;
  return false;
}

/** The slips a Folkboat fits in: her length (7.6 m) along it and her beam (2.2 m) across it, clear of every dock. */
export const SLIPS: Slip[] = ALL_SLIPS.filter(s => {
  const u = { x: Math.sin(s.heading * Math.PI / 180), y: Math.cos(s.heading * Math.PI / 180) }, n = { x: u.y, y: -u.x };
  for (const a of [-3.6, -1.8, 0, 1.8, 3.6]) for (const b of [-1.05, 0, 1.05]) {
    const q = { x: s.p.x + u.x * a + n.x * b, y: s.p.y + u.y * a + n.y * b };
    if (!inBasin(q) || hitsHarbor(q)) return false;
  }
  return true;
});
