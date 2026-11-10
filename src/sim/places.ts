import { LL } from '../geo/geo';
import type { Vec } from '../core/math';
import type { CourseMark, MarkShape } from '../courses/course';

/**
 * Places on the water around the Central Bay, for Just Sail: where to start, and where to sail to. Spots off the
 * landmarks people sail to, and the racing marks and navigation buoys the clubs use (YRA positions, the same as
 * the courses). All on open water.
 */
export interface Place {
  id: string; name: string; group: 'Spots' | 'Marks and buoys';
  p: Vec;
  /** A buoy that's really there: drawn on the water when you're just sailing. */
  buoy?: { shape: MarkShape; look?: string };
}

const P = (id: string, name: string, lat: number, lon: number, buoy?: Place['buoy']): Place =>
  ({ id, name, group: buoy ? 'Marks and buoys' : 'Spots', p: LL(lat, lon), ...(buoy ? { buoy } : {}) });

export const PLACES: Place[] = [
  P('cityfront', 'Cityfront, off the yacht clubs', 37.8128, -122.4440),
  P('crissy', 'Off Crissy Field', 37.8115, -122.4590),
  P('gate', 'Under the Golden Gate Bridge', 37.8180, -122.4780),
  P('sausalito', 'Off Sausalito', 37.8530, -122.4720),
  P('belvedere', 'Off Belvedere Point', 37.8655, -122.4560),
  P('raccoon', 'Raccoon Strait', 37.8640, -122.4470),
  P('ayala', 'Off Ayala Cove, Angel Island', 37.8710, -122.4350),
  P('alcatraz', 'Off Alcatraz (south side)', 37.8225, -122.4220),
  P('pier39', 'Off Pier 39', 37.8125, -122.4100),
  P('baybridge', 'Bay Bridge, west span', 37.8000, -122.3800),
  P('clipper', 'Clipper Cove, Treasure Island', 37.8150, -122.3700),
  P('ti-north', 'North of Treasure Island', 37.8350, -122.3750),
  P('m-A', 'A · St Francis outer buoy', 37.810767, -122.446817, { shape: 'sphere' }),
  P('m-X', 'X · off Golden Gate YC', 37.811667, -122.443333, { shape: 'cylinder' }),
  P('m-6', '6 · Fort Mason "M"', 37.811667, -122.43, { shape: 'cylinder' }),
  P('m-16', '16 · Blackaller', 37.81, -122.465, { shape: 'column', look: 'Y' }),
  P('m-15', '15 · Hank Easom (Yellow Bluff)', 37.84, -122.468333, { shape: 'column', look: 'Y' }),
  P('m-17', '17 · Harding Rock', 37.83824, -122.44599, { shape: 'lighted', look: 'RGR' }),
  P('m-4', '4 · Knox (Angel Island)', 37.853333, -122.441667, { shape: 'lighted', look: 'R' }),
  P('m-18', '18 · Blossom Rock', 37.81838, -122.40345, { shape: 'lighted', look: 'GRG' }),
  P('m-21', '21 · North Channel G "1"', 37.83202, -122.40865, { shape: 'lighted', look: 'G' }),
  P('m-7', '7 · North Channel R "2"', 37.83332, -122.39644, { shape: 'lighted', look: 'R' }),
  P('m-8', '8 · North Channel R "4"', 37.84704, -122.39647, { shape: 'lighted', look: 'R' })
];

export const place = (id: string | undefined): Place | null => PLACES.find(p => p.id === id) ?? null;

/** A place as the thing you're sailing to: the dials (compass bearing, laylines, range) treat it like a mark. */
export function destMark(pl: Place | null): CourseMark | null {
  if (!pl) return null;
  return {
    key: 'dest', name: pl.name, p: pl.p, type: 'round', side: 'p', shape: pl.buoy?.shape ?? 'cylinder', look: pl.buoy?.look ?? 'Y',
    beat: false, leg: 'reach', prev: pl.p, next: pl.p, dir: { x: 0, y: 1 }, sv: { x: 0, y: 0 }, r: { x: 0, y: 1 }
  };
}
