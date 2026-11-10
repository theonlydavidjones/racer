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
  /** The cabin top, painted or teak, if not like the deck ('' or absent: like the deck; on a teak deck, painted canvas). */
  cabinTop?: string;
  /** Which side deck the whisker pole is stowed on, alongside the toe rail. */
  poleSide?: 'port' | 'starboard';
  /** The forehatch: a varnished teak cover on a wooden frame, or a smoked acrylic lid in an aluminium frame (the usual
   * modern production hatch, as Lewmar's). */
  hatch?: 'teak' | 'acrylic';
  /** Her national sail letters: her home country, which also gives her ensign (ensignFor). */
  sails: { country: string; number: string; color: 'white' | 'black' };
  /** (Older saves: chosen flags. Now her club gives the burgee and her country the ensign; officers' flags go with skippers.) */
  flags?: { burgee?: string; ensign?: string; special?: string };
  // her particulars: who she belongs to and where she lives (they rarely change)
  /** Her yacht club (a burgee id, render/burgees.ts): she flies its burgee. '' = none. */
  club: string;
  /** Who skippers her: you, or (until the Yacht Club has skippers) a generic AI skipper. */
  skipper: 'you' | 'ai';
  /** Her home marina (geo/marina.ts MARINAS), and her slip in it. */
  marina?: string;
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
  club: 'stfyc', skipper: 'you',
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

/**
 * Her home country, by World Sailing national sail letters (RRS Appendix G): the countries with a national Nordic
 * Folkboat association, and those with smaller fleets (Nordic Folkboat International Association, folkboat.com/worldwide).
 */
export const SAIL_COUNTRIES: [string, string][] = [
  ['USA', 'United States'], ['CAN', 'Canada'], ['DEN', 'Denmark'], ['EST', 'Estonia'], ['FIN', 'Finland'], ['GER', 'Germany'],
  ['HUN', 'Hungary'], ['NED', 'Netherlands'], ['ESP', 'Spain'], ['SWE', 'Sweden'], ['GBR', 'Great Britain'],
  ['LAT', 'Latvia'], ['ITA', 'Italy'], ['TUR', 'Türkiye'], ['AUS', 'Australia'], ['RSA', 'South Africa']
];
export const countryName = (c: string) => SAIL_COUNTRIES.find(x => x[0] === c)?.[1] ?? c;

/** Normalise a saved spec (older saves, bad values) to a complete one. */
export function fixSpec(s: Partial<BoatSpec> | undefined): BoatSpec {
  const d = DEFAULT_BOAT, x = s ?? {};
  const spec: BoatSpec = {
    id: typeof x.id === 'string' && x.id ? x.id : newId(),
    name: typeof x.name === 'string' ? x.name.slice(0, 18) : d.name,
    hull: { ...d.hull, ...x.hull }, deck: x.deck ?? d.deck,
    sails: { ...d.sails, ...x.sails }, perf: { ...d.perf, ...x.perf },
    club: typeof x.club === 'string' ? x.club : x.flags?.burgee ?? '', // older saves: her burgee was her club
    ...(typeof x.cabinTop === 'string' && x.cabinTop ? { cabinTop: x.cabinTop } : {}),
    poleSide: x.poleSide === 'starboard' ? 'starboard' : 'port',
    hatch: x.hatch === 'acrylic' ? 'acrylic' : 'teak',
    skipper: x.skipper === 'ai' ? 'ai' : x.skipper === 'you' ? 'you' : 'ai',
    ...(typeof x.slip === 'string' && x.slip ? { marina: x.marina || 'west-harbor', slip: x.slip } : typeof x.marina === 'string' && x.marina ? { marina: x.marina } : {})
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

/**
 * The ensign she wears, from her home country (render/flagArt.ts ENSIGNS). Her country's yacht ensign where any
 * private yacht may wear one: the US yacht ensign (custom since the 1848 yacht signal; for US waters only), Denmark's
 * yacht flag with "Y.F." (any Danish pleasure craft, since 1866), Spain's crowned yacht ensign. Elsewhere yacht ensigns
 * are only for members of particular clubs, by warrant or permit (British, Finnish, Dutch, Australian), or there are
 * none: she wears her country's civil ensign (the Red Ensign for a British or Australian yacht). Sources: FOTW
 * (crwflags.com/fotw/flags: us~yte, dk-yacht, es~yacht, fi-jakt, and each country's page), Wikipedia "Yacht ensign".
 */
const ENSIGN_OF: Record<string, string> = {
  USA: 'us-yacht', DEN: 'den-yacht', ESP: 'esp-yacht',
  CAN: 'can', EST: 'est', FIN: 'fin', GER: 'ger', HUN: 'hun', NED: 'ned', SWE: 'swe', GBR: 'gbr', LAT: 'lat', ITA: 'ita', TUR: 'tur', AUS: 'aus', RSA: 'rsa',
  NOR: 'nor', FRA: 'fra', NZL: 'nzl', JPN: 'jpn'
};
export const ensignFor = (country: string): string | undefined => ENSIGN_OF[country];
