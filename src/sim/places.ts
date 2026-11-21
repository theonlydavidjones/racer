import { LL, toLL } from '../geo/geo';
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
  P('m-8', '8 · North Channel R "4"', 37.84704, -122.39647, { shape: 'lighted', look: 'R' }),

  // the East Bay and the north reach (November 2026). Spots: off the harbors and landmarks. Marks: the YRA's and the
  // clubs', at the positions in nkiesel's YRA-Marks list (github.com/nkiesel/YRA-Marks, from the official YRA mark list of
  // 2024-12-23; the same source as the courses). Checked: XOC and FOC against the YRA's own Central Bay list (yra.org,
  // "CentralBay.pdf" of 6 May 2025: the same to the digit; it lists GOC as off station, so it's left out); BK, KG and the
  // Richmond Harbor buoys against Richmond YC's 2025 intraclub SIs ("Description of Marks"), within 25 m. RYC A comes
  // only from the YRA-Marks list ("former Olympic Circle A"): none of the club's 2025 documents has it. The Estuary's
  // Oakland YC and Island YC balls come only from the YRA-Marks list too: the clubs publish no positions. Berkeley YC's
  // Friday night and Chowder marks are on its 2026–27 course sheet (below, with its start mark); its Midwinters use the
  // YRA's marks and temporary buoys near XOC, with no positions published; Encinal YC sails
  // its Midwinters off YRA mark 10 (a temporary buoy, no published position) and its twilight series in the Estuary.
  // The government buoys and lights are at NOAA's ENC positions (src/geo/data/enc-chart.json), within 5 m of the list
  // (DOC, the Berkeley Marina channel's light 3, within 100 m of the YRA's 0.1′-rounded figure). The clubs' inflatables
  // are set near their positions (RYC: "or a temporary set within .25 nm").
  P('berkeley', 'Off the Berkeley Marina', 37.8640, -122.3330),
  P('circle', 'The Berkeley Circle', 37.8700, -122.3600),
  P('emeryville', 'Off Emeryville', 37.8380, -122.3220),
  P('estuary', 'Oakland Estuary, off Jack London Square', 37.7936, -122.2812),
  P('alameda', 'Off Alameda Point', 37.7720, -122.3400),
  P('richmond', 'Off Point Richmond', 37.9050, -122.4120),
  P('redrock', 'Off Red Rock', 37.9260, -122.4380),
  P('brothers', 'Off the Brothers', 37.9590, -122.4300),
  // Berkeley YC's starting mark for its Friday nights and Chowders, "approximately 1/4 mile outside the Berkeley
  // breakwater" (BYC's 2026–27 Friday Night / Chowder courses, Attachment 1: 37°52.07′ N 122°19.56′ W, "for guidance
  // only"). Its sheet also gives D (the Berkeley Marina light "3", the sim's DOC, within 6 m), and X and F about 220 m
  // from the YRA's XOC and FOC: derived from D on a nominal circle, so the YRA's own positions are kept.
  P('m-BYC', 'BYC · Berkeley YC start mark', 37.86783, -122.32600, { shape: 'column', look: 'Y' }),
  P('m-XOC', 'XOC · Berkeley Circle "Bobbi Tosse"', 37.873333, -122.358333, { shape: 'cylinder' }),
  P('m-FOC', 'FOC · Berkeley Circle', 37.865, -122.376667, { shape: 'cylinder' }),
  P('m-DOC', 'DOC · Berkeley Marina G "3"', 37.85767, -122.34943, { shape: 'beacon', look: 'G' }),
  P('m-24', '24 · North Channel R "6"', 37.86087, -122.39645, { shape: 'lighted', look: 'R' }),
  P('m-19', '19 · North Channel R "8"', 37.87967, -122.41497, { shape: 'lighted', look: 'R' }),
  P('m-NC10', 'North Channel R "10"', 37.90074, -122.43620, { shape: 'lighted', look: 'R' }),
  P('m-NC12', 'North Channel R "12"', 37.91359, -122.44514, { shape: 'lighted', look: 'R' }),
  P('m-RYCA', 'RYC A · Richmond YC', 37.89745, -122.389783, { shape: 'cylinder' }),
  P('m-BK', 'BK · "Bob Klein" (Richmond YC)', 37.886117, -122.402367, { shape: 'sphere' }),
  P('m-28', '28 · Southampton Shoal R "2"', 37.89057, -122.41764, { shape: 'lighted', look: 'R' }),
  P('m-29', '29 · Southampton Shoal R "4"', 37.90390, -122.42014, { shape: 'lighted', look: 'R' }),
  P('m-SS6', 'Southampton Shoal R "6"', 37.91624, -122.42233, { shape: 'lighted', look: 'R' }),
  P('m-RHC2', 'Richmond Harbor R "2"', 37.91819, -122.41749, { shape: 'lighted', look: 'R' }),
  P('m-RHC5', 'Richmond Harbor G "5"', 37.90844, -122.40014, { shape: 'lighted', look: 'G' }),
  P('m-RHC6', 'Richmond Harbor R "6"', 37.90567, -122.39409, { shape: 'lighted', look: 'R' }),
  P('m-RHC5A', 'Richmond Harbor G "5A"', 37.90738, -122.39183, { shape: 'lighted', look: 'G' }),
  P('m-KG', 'KG · Richmond Harbor G "7" ("Killer Green")', 37.90659, -122.38622, { shape: 'lighted', look: 'G' }),
  P('m-RHC8', 'Richmond Harbor light R "8"', 37.90444, -122.38499, { shape: 'beacon', look: 'R' }),
  P('m-2CR', 'Castro Rocks R "2CR"', 37.93166, -122.42087, { shape: 'lighted', look: 'R' }),
  P('m-CM2', 'Corte Madera Channel light R "2"', 37.92827, -122.46832, { shape: 'beacon', look: 'R' }),
  P('m-33', '33 · Oakland Inner Harbor R "4"', 37.80098, -122.34776, { shape: 'lighted', look: 'R' }),
  P('m-NAS1', 'Alameda NAS Channel G "1"', 37.77726, -122.34131, { shape: 'lighted', look: 'G' }),
  P('m-NAS2', 'Alameda NAS Channel R "2"', 37.77419, -122.34105, { shape: 'lighted', look: 'R' }),
  P('m-35', '35 · Alameda NAS Channel light G "3"', 37.77679, -122.33106, { shape: 'beacon', look: 'G' }),
  P('m-36', '36 · Alameda NAS Channel light R "4"', 37.77336, -122.33015, { shape: 'beacon', look: 'R' }),
  P('m-SC', 'SC · Preferred Channel "SC"', 37.77556, -122.36583, { shape: 'lighted', look: 'GRG' }),
  // the Estuary's racing marks: Oakland YC's red balls and Island YC's red and orange ones
  P('m-OYCDR', 'OYC DR · "Debby Ratto" (Jack London Sq)', 37.792363, -122.277332, { shape: 'sphere', look: 'R' }),
  P('m-OYC2', 'OYC 2', 37.789632, -122.270968, { shape: 'sphere', look: 'R' }),
  P('m-OYC6', 'OYC 6', 37.786055, -122.265329, { shape: 'sphere', look: 'R' }),
  P('m-OYCX', 'OYC X', 37.785304, -122.263493, { shape: 'sphere', look: 'R' }),
  P('m-OYC5', 'OYC 5 · Encinal Basin', 37.781967, -122.260063, { shape: 'sphere', look: 'R' }),
  P('m-IYC1', 'Island YC 1', 37.793289, -122.278976, { shape: 'sphere', look: 'O' }),
  P('m-IYC2', 'Island YC 2', 37.787647, -122.266652, { shape: 'sphere', look: 'O' }),
  P('m-IYC3', 'Island YC 3', 37.783585, -122.257527, { shape: 'sphere', look: 'O' })
];

/**
 * A place by its id: one of the PLACES, or a spot picked on the chart, 'at:<lat>,<lon>' (named by its latitude and
 * longitude, as on a chart).
 */
export const place = (id: string | undefined): Place | null => {
  const m = id ? /^at:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(id) : null;
  if (m) { const lat = Number(m[1]), lon = Number(m[2]); return { id: id!, name: latLon(LL(lat, lon)), group: 'Spots', p: LL(lat, lon) }; }
  return PLACES.find(p => p.id === id) ?? null;
};
/** A spot picked on the chart, as a place id (to about a metre). */
export const spotId = (p: Vec): string => { const { lat, lon } = toLL(p); return `at:${lat.toFixed(5)},${lon.toFixed(5)}`; };
/** A spot by its latitude and longitude, as on a chart (degrees and decimal minutes). */
export function latLon(q: Vec): string {
  const { lat, lon } = toLL(q), dm = (v: number) => `${Math.floor(Math.abs(v))}°${((Math.abs(v) % 1) * 60).toFixed(2)}′`;
  return `${dm(lat)}N ${dm(lon)}W`;
}

/** A place as the thing you're sailing to: the dials (compass bearing, laylines, range) treat it like a mark. */
export function destMark(pl: Place | null): CourseMark | null {
  if (!pl) return null;
  return {
    key: 'dest', name: pl.name, p: pl.p, type: 'round', side: 'p', shape: pl.buoy?.shape ?? 'cylinder', look: pl.buoy?.look ?? 'Y',
    beat: false, leg: 'reach', prev: pl.p, next: pl.p, dir: { x: 0, y: 1 }, sv: { x: 0, y: 0 }, r: { x: 0, y: 1 }
  };
}
