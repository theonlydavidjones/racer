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
const RAW_WALKS = D.walkways.map(v), RAW_FINGERS = D.fingers.map(v);
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

export const HARBOR = {
  name: 'West Harbor',
  basin: v(D.basin),
  breakwaters: D.breakwaters.map(b => ({ area: b.area, pts: v(b.pts) })),
  /** Main walkways (2.4 m wide) and slip fingers (1.0 m), as centre lines; and solid pier areas. */
  // (an end that stops short of a walkway, or runs on over it, is made to meet its edge: as drawn, and as solid)
  walkways: RAW_WALKS.map(w => meetEdge(w, RAW_WALKS.filter(o => o !== w), 2.4)), fingers: RAW_FINGERS.map(f => meetEdge(f, RAW_WALKS, 2.4)), areas: D.areas.map(v),
  beacon: D.beacon ? LL(D.beacon[0], D.beacon[1]) : null
};
export const WALKWAY_W = 2.4, FINGER_W = 1.0, BREAKWATER_W = 6;

export interface Slip { id: string; dock: string; p: Vec; /** bow-in heading (toward the walkway), deg */ heading: number; finger: number }
const ALL_SLIPS: Slip[] = D.slips.map(s => ({ id: s.id, dock: s.dock, p: LL(s.at[0], s.at[1]), heading: s.heading, finger: s.finger }));
export const slipById = (id: string | undefined): Slip | null => SLIPS.find(s => s.id === id) ?? null; // (SLIPS: below)

const box = (() => { const xs = HARBOR.basin.map(p => p.x), ys = HARBOR.basin.map(p => p.y); return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) }; })();
/** In the harbor's basin (the water inside the breakwaters)? */
export const inBasin = (p: Vec): boolean => p.x > box.x0 && p.x < box.x1 && p.y > box.y0 && p.y < box.y1 && inPoly(p, HARBOR.basin);

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

/** The marinas your boats can call home (only West Harbor is built so far). */
export const MARINAS: { id: string; name: string }[] = [{ id: 'west-harbor', name: 'West Harbor, San Francisco Marina' }];
export const marinaName = (id: string | undefined) => MARINAS.find(m => m.id === id)?.name ?? '';

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
  const exit = HARBOR.beacon ?? s.p;
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
