import { brg, cross, dist, sub, unit, type Vec } from '../core/math';
import { compass } from '../environment/sun';
import { shoreDist } from '../geo/shore';
import { PLACES } from './places';

/**
 * A briefing: the strategist's before a race (sim/strategist.ts) or the navigator's before a passage (sim/navigator.ts).
 * Every point says where it comes from, so you can tell what's measured from what's a rule of thumb:
 *  - 'data': the day's records, forecast or tide predictions (NOAA, NWS);
 *  - 'model': worked out from them with the sim's boat and sea physics (it's what the boats here will do);
 *  - 'practice': general racing or seamanship practice, true anywhere, not computed for today;
 *  - 'rule': the Racing Rules of Sailing or the collision regulations.
 */
export type Source = 'data' | 'model' | 'practice' | 'rule';
export interface BriefItem { head?: string; text: string; src: Source }
export interface BriefSection { id: string; title: string; lede?: string; table?: { cols: string[]; rows: string[][] }; items: BriefItem[] }
export interface Brief { title: string; sub: string; sections: BriefSection[] }

export const SOURCE_LABEL: Record<Source, string> = { data: 'NOAA / NWS data', model: 'worked out (sim physics)', practice: 'general practice', rule: 'rules' };

export const kt1 = (x: number) => x.toFixed(1);
export const deg3 = (x: number) => String(Math.round(((x % 360) + 360) % 360)).padStart(3, '0') + '°';
export const mins = (m: number) => { if (m < 1) return `${Math.round(m * 60)} s`; const r = Math.round(m); return r < 90 ? `${r} min` : `${Math.floor(r / 60)} h ${String(r % 60).padStart(2, '0')}`; };
export const ft = (m: number) => `${(m / 0.3048).toFixed(m < 0.6 ? 1 : 0)} ft`;

/** Features to name a side of the course or a stretch of a route by (the places you can sail to, by their short names). */
const FEATURES: { name: string; p: Vec }[] = [
  ['cityfront', 'the yacht clubs'], ['crissy', 'Crissy Field'], ['gate', 'the Golden Gate'], ['sausalito', 'Sausalito'],
  ['belvedere', 'Belvedere Point'], ['raccoon', 'Raccoon Strait'], ['ayala', 'Angel Island'], ['alcatraz', 'Alcatraz'],
  ['pier39', 'Pier 39'], ['baybridge', 'the Bay Bridge'], ['clipper', 'Treasure Island'], ['ti-north', 'Treasure Island'],
  ['m-16', 'Blackaller'], ['m-15', 'Yellow Bluff'], ['m-17', 'Harding Rock'], ['m-4', 'Angel Island'], ['m-18', 'Blossom Rock'], ['m-6', 'Fort Mason']
].flatMap(([id, name]) => { const pl = PLACES.find(p => p.id === id); return pl ? [{ name, p: pl.p }] : []; });

/** The nearest named feature to a point, within `within` m (leaving out any within 600 m of the points in `not`). */
export function nearFeature(p: Vec, within = 1800, not: Vec[] = []): string | null {
  let best: { name: string; d: number } | null = null;
  for (const f of FEATURES) { if (not.some(q => dist(q, f.p) < 600)) continue; const d = dist(f.p, p); if (d < within && (!best || d < best.d)) best = { name: f.name, d }; }
  return best?.name ?? null;
}

/**
 * Which way a track goes from the straight line a→b, in words: the compass side, and toward what ("north, toward
 * Alcatraz"; "south, along the Cityfront shore"). `left`: the side left of a→b.
 */
export function sideWords(a: Vec, b: Vec, track: Vec[], left: boolean): string {
  const u = unit(sub(b, a)), n = left ? { x: -u.y, y: u.x } : { x: u.y, y: -u.x };
  let far = track[0], farD = -Infinity;
  for (const q of track) { const d = cross(u, sub(q, a)) * (left ? 1 : -1); if (d > farD) { farD = d; far = q; } }
  const dir = compass(brg(n.x, n.y)), f = nearFeature(far, 1500, [a, b]), shore = shoreDist(far) < 350;
  const toward = shore ? `in along the shore${f ? ` by ${f}` : ''}` : f ? `toward ${f}` : '';
  return `${dir.length === 1 ? { N: 'north', S: 'south', E: 'east', W: 'west' }[dir] : dir}${toward ? `, ${toward}` : ''}`;
}

/** A control's setting (0 … 1) in the words a crew uses. */
export function amount(x: number, words: [string, string, string, string, string] = ['off', 'just on', 'half on', 'well on', 'hard on']): string {
  return words[x < 0.12 ? 0 : x < 0.38 ? 1 : x < 0.62 ? 2 : x < 0.88 ? 3 : 4];
}
