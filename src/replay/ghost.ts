import type { Tack } from '../boat/boat';
import type { RaceSetup } from '../boat/logbook';
import type { Frame } from './recorder';

/**
 * Ghost races: your own earlier run of the same race, sailed again beside you as a translucent boat on its recorded
 * track, in step with the race clock. A pacing reference only: it isn't in the race (no collisions, no rules, not in the
 * results), and it's only offered for the very same race (the same course, seed, start time and conditions: what "Sail it
 * again" reproduces), so the ghost sailed the wind and tide you're sailing.
 *
 * Each logged race of yours keeps your boat's track (the race's once-a-second track, which the page mirrors from the sim's
 * worker), packed small, in its own store in this browser (not the logbook, which is saved to the cloud).
 */

/** One second of her track: time (s from the gun), position (m), heading (deg), boom (deg), tack. */
export interface GhostPoint { t: number; x: number; y: number; h: number; boom: number; tack: Tack }
export interface Ghost {
  /** the logbook entry's time (its key) */
  at: string;
  /** the race's setup, as matched (setupKey) */
  key: string;
  /** her elapsed time and place, for the menu */
  elapsed?: number; place?: number; of?: number; code?: string;
  pts: GhostPoint[];
}

const KEY = 'fbsim-ghosts-v1', KEEP = 20;

/** The race, as a key: two runs with the same key are the same race (course, seed and every setting it was sailed in). */
export function setupKey(s: RaceSetup | undefined): string {
  if (!s) return '';
  const o = s.s, keys = Object.keys(o).sort();
  return JSON.stringify([s.course, s.seed, keys.map(k => [k, o[k]])]);
}

/** Her points from the race's track (boat `id`'s column). */
export function trackOf(frames: Frame[], id: number): GhostPoint[] {
  const out: GhostPoint[] = [];
  // (from half a minute before the gun: her start too)
  for (const f of frames) { const b = f.b[id]; if (!b) continue; out.push({ t: f.t, x: b[0], y: b[1], h: b[2], boom: b[4], tack: b[3] }); }
  return out;
}

/**
 * Packed, small: each point's change from the last, at 0.1 s, 0.1 m, 1° of heading and boom; the tack as the sign of a
 * flag. About 30 KB an hour, kept (thin) every other second.
 */
export function pack(pts: GhostPoint[]): string {
  const out: number[] = []; let p = { t: 0, x: 0, y: 0, h: 0, boom: 0 };
  for (const q of pts) {
    const r = { t: Math.round(q.t * 10), x: Math.round(q.x * 10), y: Math.round(q.y * 10), h: Math.round(q.h), boom: Math.round(q.boom) };
    out.push(r.t - p.t, r.x - p.x, r.y - p.y, r.h - p.h, r.boom - p.boom, q.tack === 'S' ? 1 : 0);
    p = r;
  }
  return out.join(',');
}
export function unpack(s: string): GhostPoint[] {
  if (!s) return [];
  const n = s.split(',').map(Number), out: GhostPoint[] = []; let t = 0, x = 0, y = 0, h = 0, boom = 0;
  for (let i = 0; i + 5 < n.length; i += 6) {
    t += n[i]; x += n[i + 1]; y += n[i + 2]; h += n[i + 3]; boom += n[i + 4];
    out.push({ t: t / 10, x: x / 10, y: y / 10, h: ((h % 360) + 360) % 360, boom, tack: n[i + 5] ? 'S' : 'P' });
  }
  return out;
}

interface Stored { at: string; key: string; elapsed?: number; place?: number; of?: number; code?: string; d: string }
function load(): Stored[] { try { return JSON.parse(localStorage.getItem(KEY) || '[]') as Stored[]; } catch { return []; } }
function save(all: Stored[]): void {
  // the most recent KEEP, and each race's best (the fastest finish) whatever its age
  const best = new Map<string, Stored>();
  for (const g of all) if (g.elapsed != null && !g.code && (!best.has(g.key) || g.elapsed < best.get(g.key)!.elapsed!)) best.set(g.key, g);
  const recent = all.slice().sort((a, b) => b.at.localeCompare(a.at)).slice(0, KEEP), keep = new Set([...recent, ...best.values()]);
  try { localStorage.setItem(KEY, JSON.stringify(all.filter(g => keep.has(g)))); } catch { /* full or private: no ghost kept */ }
}

/**
 * Every other second, but every second round a tack, a gybe or a sharp turn (her heading changing more than 8° a second),
 * so the ghost's manoeuvres stay where they were: about half the size, and plenty for pacing.
 */
export function thin(pts: GhostPoint[]): GhostPoint[] {
  const turn = (i: number) => i > 0 && i < pts.length && (pts[i].tack !== pts[i - 1].tack || Math.abs(((pts[i].h - pts[i - 1].h + 540) % 360) - 180) > 8);
  return pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1 || turn(i) || turn(i + 1));
}
/** Keep her track from a race just logged. */
export function keepGhost(g: Ghost): void {
  if (g.pts.length < 10 || !g.key) return;
  const all = load().filter(x => x.at !== g.at);
  all.push({ at: g.at, key: g.key, elapsed: g.elapsed, place: g.place, of: g.of, code: g.code, d: pack(thin(g.pts)) });
  save(all);
}
/** The runs saved for this race, the fastest finish first, then the most recent. */
export function ghostsFor(key: string): Omit<Ghost, 'pts'>[] {
  if (!key) return [];
  return load().filter(g => g.key === key).map(({ d: _d, ...g }) => g)
    .sort((a, b) => (a.code || a.elapsed == null ? 1e9 : a.elapsed) - (b.code || b.elapsed == null ? 1e9 : b.elapsed) || b.at.localeCompare(a.at));
}
export function loadGhost(at: string): Ghost | null {
  const g = load().find(x => x.at === at); if (!g) return null;
  const { d, ...rest } = g; return { ...rest, pts: unpack(d) };
}

/** Where the ghost is at race time t (s from the gun): between its two nearest points; null before its first or after its last. */
export function ghostAt(pts: GhostPoint[], t: number): GhostPoint | null {
  if (!pts.length || t < pts[0].t || t > pts[pts.length - 1].t) return null;
  let lo = 0, hi = pts.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m].t <= t) lo = m; else hi = m; }
  const a = pts[lo], b = pts[hi], f = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0, dh = ((b.h - a.h + 540) % 360) - 180;
  return { t, x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, h: (a.h + dh * f + 360) % 360, boom: a.boom + (b.boom - a.boom) * f, tack: f < 0.5 ? a.tack : b.tack };
}

/**
 * How far ahead of you the ghost is, in time (s; − behind): when its run passed the spot you're at now, against the clock
 * now. The spot is its point nearest you within a quarter of an hour of now either way (so a mark you both round twice isn't
 * mistaken), and only if that's within 80 m of you (off its line altogether, there's no saying).
 */
export function ghostGap(pts: GhostPoint[], you: { x: number; y: number }, t: number): number | null {
  let best: GhostPoint | null = null, bd = 80;
  for (const p of pts) { if (Math.abs(p.t - t) > 900) continue; const d = Math.hypot(p.x - you.x, p.y - you.y); if (d < bd) { bd = d; best = p; } }
  return best ? t - best.t : null;
}
