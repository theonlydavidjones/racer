import { brg, dist, wrap, type Vec } from '../core/math';
import { LL } from '../geo/geo';

/**
 * Transits: two objects in line. Racers use them to know where the start line is (from the committee end, the pin
 * lines up with something ashore beyond it; when that pair is in line, you're on the line) and when they're on a
 * layline (the mark in line with something behind it). The landmarks are the real ones, at their surveyed
 * positions (see landscape.ts).
 */

export interface Landmark { name: string; p: Vec }
export const LANDMARKS: Landmark[] = ([
  ['Mt Livermore (Angel Island)', 37.8615, -122.4310], ['Coit Tower', 37.80242, -122.40583], ['Transamerica Pyramid', 37.79517, -122.40276],
  ['Alcatraz light', 37.82623, -122.42214], ['the bridge\'s north tower', 37.8254, -122.4788], ['the bridge\'s south tower', 37.8140, -122.4777],
  ['Fort Point', 37.81055, -122.47710], ['Lime Point', 37.82545, -122.47832], ['Point Bonita light', 37.81561, -122.52958],
  ['Mt Tamalpais', 37.9291, -122.5778], ['Sutro Tower', 37.75523, -122.45284], ['Salesforce Tower', 37.7899, -122.3969],
  ['the Palace of Fine Arts dome', 37.80292, -122.44840], ['Belvedere Point', 37.8690, -122.4590], ['Sausalito', 37.8590, -122.4850],
  ['Yerba Buena Island', 37.8100, -122.3640],
  // the East Bay's two marks for a bearing across the Bay (the owner): the Campanile (OSM way 24024507) and the
  // Claremont Hotel's tower (OSM way 41745855; the tower's place in it read off photographs)
  ['the Campanile (Sather Tower)', 37.87208, -122.25784], ['the Claremont Hotel', 37.85945, -122.24185]
] as [string, number, number][]).map(([name, la, lo]) => ({ name, p: LL(la, lo) }));

/** The landmark most nearly in line with `from` → `through` (beyond `through`), within `tol` degrees; null if none. */
export function transitBeyond(from: Vec, through: Vec, tol = 4): { mark: Landmark; off: number } | null {
  const b = brg(through.x - from.x, through.y - from.y);
  let best: { mark: Landmark; off: number } | null = null;
  for (const l of LANDMARKS) {
    if (dist(l.p, through) < 600 || dist(l.p, from) < dist(through, from)) continue;
    const off = wrap(brg(l.p.x - through.x, l.p.y - through.y) - b);
    if (Math.abs(off) <= tol && (!best || Math.abs(off) < Math.abs(best.off))) best = { mark: l, off };
  }
  return best;
}

/**
 * Where a boat is relative to a transit: how far (deg) the near object is from the far one as she sees them. 0: in
 * line. Positive: the near object appears to the right of the far one.
 */
export const transitOffset = (eye: Vec, near: Vec, far: Vec) => wrap(brg(near.x - eye.x, near.y - eye.y) - brg(far.x - eye.x, far.y - eye.y));

/** The landmass a point on the far shore belongs to, in plain words. */
export function shoreName(lat: number, lon: number): string {
  if (lat > 37.85 && lat < 37.875 && lon > -122.447 && lon < -122.415) return 'Angel Island';
  if (lat > 37.823 && lat < 37.83 && lon > -122.427 && lon < -122.418) return 'Alcatraz';
  if (lat > 37.86 && lon > -122.47 && lon < -122.44) return 'Belvedere and Tiburon';
  if (lat > 37.845 && lon < -122.47 && lon > -122.51) return 'Sausalito';
  if (lat > 37.82 && lon < -122.47) return 'the Marin Headlands';
  if (lat > 37.80 && lat < 37.835 && lon > -122.375) return 'Yerba Buena and Treasure Island';
  if (lat < 37.812 && lon < -122.447) return 'the Presidio shore';
  if (lat < 37.812) return 'the San Francisco shore';
  return 'the far shore';
}

/**
 * A transit for a line from `from` through `through`: a named landmark in line beyond it if there is one, otherwise
 * the point where the extended line runs onto the far shore. `isLand` tells land from water (null: off the map).
 */
export function lineTransit(from: Vec, through: Vec, isLand: (p: Vec) => boolean | null, toLatLon: (p: Vec) => { lat: number; lon: number }): { name: string; p: Vec; landmark: boolean } | null {
  const lm = transitBeyond(from, through, 2.5);
  if (lm) return { name: lm.mark.name, p: lm.mark.p, landmark: true };
  const d = dist(from, through), ux = (through.x - from.x) / d, uy = (through.y - from.y) / d;
  for (let s = 200; s < 15000; s += 25) {
    const p = { x: through.x + ux * s, y: through.y + uy * s }, l = isLand(p);
    if (l === null) return null;
    if (l) { const ll = toLatLon(p), n = shoreName(ll.lat, ll.lon); return { name: n.includes('shore') ? n : `the shore of ${n}`, p, landmark: false }; }
  }
  return null;
}
