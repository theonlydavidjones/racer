/**
 * Your boat as you've set her up: how she looks (hull, deck, sails, flags) and the things about her that change
 * how fast she goes (her bottom, her sails' age, her spars, what's aboard). Looks never change performance unless
 * noted; performance is modelled in boat/condition.ts.
 */

export type HullMaterial = 'fiberglass' | 'wood';
export type SparMaterial = 'aluminium' | 'wood';
export type SailAge = 'new' | 'mid' | 'old';

export interface BoatSpec {
  id: string; // stable, for your list of boats
  name: string; // on her quarters
  hull: { material: HullMaterial; upper: string; lower: string; stripe: string }; // colours as hex; stripe '' = none
  deck: string; // a hex colour, or 'teak-silver' / 'teak-polished' (laid teak: wooden boats, and glassfibre ones refitted)
  sails: { country: string; number: string; color: 'white' | 'black' };
  flags: { burgee: string; ensign: string; special: string }; // '' = none
  /** Her slip in West Harbor (geo/marina.ts), if she has one. */
  slip?: string;
  perf: {
    cleanedWeeks: number; // weeks since the bottom was last cleaned (0 = just cleaned)
    finish: 'race' | 'antifouling'; // the bottom paint's finish when clean: wet-sanded and burnished, or as rolled on
    mainAge: SailAge; jibAge: SailAge;
    mast: SparMaterial; boom: SparMaterial;
    mastStiffness: 'soft' | 'average' | 'stiff'; // a wooden mast's own character (aluminium masts are all alike)
    outboard: 'none' | 'stowed' | 'bracket'; // left ashore, stowed below, or on its transom bracket (lifted)
    gearKg: number; // gear and stores beyond the racing minimum
  };
}

export const DEFAULT_BOAT: BoatSpec = {
  id: 'josephine', name: 'JOSEPHINE',
  hull: { material: 'fiberglass', upper: '#f4f1e8', lower: '#2a2d33', stripe: '#24324f' },
  deck: '#8e9f7c',
  sails: { country: 'USA', number: '110', color: 'white' },
  flags: { burgee: '', ensign: '', special: '' },
  perf: { cleanedWeeks: 0, finish: 'antifouling', mainAge: 'new', jibAge: 'new', mast: 'aluminium', boom: 'aluminium', mastStiffness: 'average', outboard: 'none', gearKg: 0 }
};

/** Topsides (and boot stripe, and deck) colours: the usual gelcoat and topside-paint range. */
export const HULL_COLORS: [string, string][] = [
  ['Snow white', '#f7f7f4'], ['Pearl', '#f4f1e8'], ['Cream', '#efe6cf'], ['Buff', '#d9c49a'], ['Sand', '#c8b48a'],
  ['Light grey', '#c9ccd0'], ['Pewter', '#8d9399'], ['Charcoal', '#3b3e44'], ['Black', '#1c1d20'],
  ['Navy', '#1f2c4f'], ['Midnight', '#24324f'], ['Flag blue', '#24407a'], ['Royal blue', '#2c56a8'], ['Sky blue', '#7fb0d8'], ['Teal', '#1f7a7a'], ['Seafoam', '#a8d5c2'],
  ['Hunter green', '#2a4a33'], ['Racing green', '#1f5a3a'], ['Sage', '#8e9f7c'],
  ['Burgundy', '#6d1f2a'], ['Signal red', '#b3302a'], ['Tomato', '#d6522f'], ['Orange', '#e07a1f'], ['Yellow', '#e8c53a'], ['Pale yellow', '#f0e2a0']
];
/** Varnished planking: a wooden hull only. */
export const BRIGHT_FINISH: [string, string] = ['Bright finish (varnished)', '#9a6a36'];
/** Antifouling (bottom paint) colours. */
export const BOTTOM_COLORS: [string, string][] = [
  ['Black', '#2a2d33'], ['Dark blue', '#1f2a44'], ['Blue', '#2b4f8f'], ['Light blue', '#6a93c0'], ['Red', '#7a2420'], ['Bright red', '#a8322a'],
  ['Green', '#2f5a3a'], ['Copper', '#9a5a2e'], ['Grey', '#5d6168'], ['White', '#e8e6e0']
];
/** Laid teak decks (wooden boats, and glassfibre ones with teak laid over): weathered silver-grey, or oiled and polished. */
export const TEAK_DECKS: [string, string][] = [['Silvered teak', 'teak-silver'], ['Polished teak', 'teak-polished']];

/** World Sailing national sail letters (RRS Appendix G), for the countries that sail Folkboats and a few more. */
export const SAIL_COUNTRIES: [string, string][] = [
  ['USA', 'United States'], ['CAN', 'Canada'], ['MEX', 'Mexico'], ['GBR', 'Great Britain'], ['IRL', 'Ireland'], ['DEN', 'Denmark'],
  ['SWE', 'Sweden'], ['NOR', 'Norway'], ['FIN', 'Finland'], ['EST', 'Estonia'], ['GER', 'Germany'], ['NED', 'Netherlands'],
  ['FRA', 'France'], ['ESP', 'Spain'], ['ITA', 'Italy'], ['SUI', 'Switzerland'], ['AUS', 'Australia'], ['NZL', 'New Zealand'], ['JPN', 'Japan']
];

/** Normalise a saved spec (older saves, bad values) to a complete one. */
export function fixSpec(s: Partial<BoatSpec> | undefined): BoatSpec {
  const d = DEFAULT_BOAT, x = s ?? {};
  const spec: BoatSpec = {
    id: typeof x.id === 'string' && x.id ? x.id : newId(),
    name: typeof x.name === 'string' ? x.name.slice(0, 18) : d.name,
    hull: { ...d.hull, ...x.hull }, deck: x.deck ?? d.deck,
    sails: { ...d.sails, ...x.sails }, flags: { ...d.flags, ...x.flags }, perf: { ...d.perf, ...x.perf },
    ...(typeof x.slip === 'string' && x.slip ? { slip: x.slip } : {})
  };
  if (spec.hull.material !== 'wood') {
    if (spec.hull.upper === BRIGHT_FINISH[1]) spec.hull.upper = d.hull.upper;
  }
  spec.sails.number = String(spec.sails.number).replace(/\D/g, '').slice(0, 5) || d.sails.number;
  spec.perf.cleanedWeeks = Math.max(0, Math.min(26, Math.round(Number(spec.perf.cleanedWeeks) || 0)));
  spec.perf.gearKg = Math.max(0, Math.min(400, Number(spec.perf.gearKg) || 0));
  return spec;
}

/** The sail number as it reads on the main: national letters and the number. */
export const sailNo = (s: BoatSpec) => `${s.sails.country ? s.sails.country + ' ' : ''}${s.sails.number}`;

const newId = () => 'b' + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
/** A new boat for your list: the standard Folkboat, under a new name. */
export function newBoat(name: string, from: BoatSpec = DEFAULT_BOAT): BoatSpec {
  return fixSpec({ ...structuredClone(from), id: newId(), name: name.toUpperCase().slice(0, 18) });
}

/** A sail number none of your boats has (so a fleet doesn't race two of the same). */
export function freeNumber(boats: BoatSpec[], from = 100): string {
  const used = new Set(boats.map(b => b.sails.number)); let n = from;
  while (used.has(String(n))) n++;
  return String(n);
}
