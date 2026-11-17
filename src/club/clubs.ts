/**
 * The game's yacht clubs: the one table every screen reads (the owner's parody names, 17 November 2026: gentle
 * parodies of the Bay's real clubs, so no real club's name or trademark ships). Keys are the INTERNAL ids that boat saves,
 * logbooks and ghosts already hold (spec.club, the burgee ids): they never change, only what the player reads does.
 * The real clubs' names live only in tests/clubNames.test.ts, which fails if one reaches a player-facing string.
 *
 * `burgee` is the id of the pennant drawn in render/burgees.ts, or null where the club has none yet: the burgees are
 * being redrawn as parodies by another agent (a club without one flies none). `tier` is the owner's: 1 = a racing
 * club (joinable), 2 = cruising/social (a label on the chart for now). `base` is the club's own harbor or clubhouse,
 * as [lat, lon] with a source in the comment; where a harbor of ours exists, `harbor` names it (geo/marina.ts).
 */
export interface ClubInfo {
  id: string;
  /** The full name: always shown in full. */
  name: string;
  /** The short form (new, derived from the name; never a real club's abbreviation). */
  short: string;
  burgee: string | null;
  tier: 1 | 2;
  /** Where the club sits, [lat, lon], for the chart's label; absent until sourced. */
  base?: [number, number];
  harbor?: string;
}

const C = (id: string, name: string, short: string, burgee: string | null, tier: 1 | 2 = 1, extra: Partial<ClubInfo> = {}): ClubInfo =>
  ({ id, name, short, burgee, tier, ...extra });

export const CLUB_TABLE: ClubInfo[] = [
  // Tier 1 · San Francisco city front
  C('stfyc', 'St. Bartholomew Yacht Club', 'StBYC', 'stfyc'), // always in full; never "St. Bart's" (the owner)
  C('ggyc', 'Dorado Yacht Club', 'DYC', 'ggyc'),
  C('sbyc', 'China Basin Yacht Club', 'CBYC', 'sbyc'),
  C('bvbc', 'Dry Dock Boat Club', 'DDBC', 'bvbc'),
  C('mhpyc', 'Monarch Point Yacht Club', 'MPYC', 'mhpyc'),
  C('tiyc', 'Clipper Cove Yacht Club', 'CCYC', 'tiyc'),
  // Tier 1 · Marin
  C('sfyc', 'Belvedere Cove Yacht Club', 'BCYC', 'sfyc'),
  C('cyc', 'Olympian Yacht Club', 'OlYC', 'cyc', 1, { harbor: 'corinthian' }),
  C('tyc', 'Shark Point Yacht Club', 'ShPYC', 'tyc'),
  C('pyc', 'Horseshoe Cove Yacht Club', 'HCYC', 'pyc', 1, { base: [37.83400, -122.47455], harbor: 'horseshoe-bay' }), // base: OSM nodes 1974693051 and 1974693718, clubhouse, about 20 m
  C('ssyc', 'Willow Grove Yacht Club', 'WGYC', 'ssyc'),
  C('myc', 'Tamalpais Yacht Club', 'TamYC', 'myc'),
  C('sryc', 'Mission Canal Yacht Club', 'MCYC', 'sryc'),
  // Tier 1 · East Bay
  C('ryc', 'Brickyard Racing Club', 'BRC', 'ryc', 1, { harbor: 'richmond-yc' }),
  C('byc', "Bishop's Yacht Club", 'BpYC', 'byc', 1, { harbor: 'berkeley' }),
  C('csc', "People's Sailing Club", 'PSC', 'csc', 1, { base: [37.86307, -122.31383] }), // base: OSM way 454025334, building footprint
  C('emyc', 'Mudflat Yacht Club', 'MfYC', 'emyc'),
  C('eyc', 'Live Oak Yacht Club', 'LOYC', 'eyc', 1, { harbor: 'encinal' }),
  C('oyc', 'Oaktown Yacht Club', 'OtYC', 'oyc', 1, { harbor: 'oakland-yc' }),
  C('iyc', 'Sandbar Yacht Club', 'SdbYC', 'iyc', 1, { harbor: 'alameda-marina' }),
  C('aeyc', 'Zephyr Yacht Club', 'ZYC', 'aeyc', 1, { base: [37.75068, -122.23545] }), // base: OSM way 235080253, building matched by the club's address (CA Division of Boating and Waterways)
  C('bbyc', 'Orca Bay Yacht Club', 'OBYC', 'bbyc', 1, { base: [37.76743, -122.28755] }), // base: OSM building matched by the club's address, about 15 m
  // Tier 1 · North Bay / Carquinez
  C('vyc', 'Mare Island Strait Yacht Club', 'MISYC', 'vyc'),
  C('bnyc', 'Carquinez Yacht Club', 'CqYC', 'bnyc', 1, { base: [38.04649, -122.15769] }), // base: OSM way 362299099, building footprint
  // Tier 1 · Peninsula / South Bay
  C('seqyc', 'Evergreen Yacht Club', 'EgYC', 'seqyc'),
  C('cpyc', 'Wolf Point Yacht Club', 'WPYC', 'cpyc'),
  C('spyc', 'Cordillera Point Yacht Club', 'CoPYC', 'spyc'),
  // Tier 2 · cruising and social (labels only; not joinable)
  C('mbyc', 'Riveter Bay Yacht Club', 'RBYC', 'mbyc', 2),
  C('slyc', 'Cherry Harbor Yacht Club', 'CHYC', 'slyc', 2),
  C('alyc', 'Island City Yacht Club', 'ICYC', null, 2),
  C('mtyc', 'Cosmopolitan Yacht Club', 'CosYC', null, 2),
  C('psyc', 'Point Saint Paul Yacht Club', 'PSPYC', null, 2),
  C('opyc', 'Mussel Point Yacht Club', 'MuPYC', null, 2),
  C('pnyc', 'Promontory Yacht Club', 'PrYC', null, 2),
  C('sbayc', 'Salt Pond Yacht Club', 'SPdYC', null, 2),
  C('llyc', 'Bonnie Banks Yacht Club', 'BBkYC', null, 2),
  C('bmkyc', 'Bel Lago Keys Yacht Club', 'BLKYC', null, 2),
  C('pylc', 'Hen House Yacht Club', 'HHYC', null, 2),
  C('nvyc', 'Vineyard Reach Yacht Club', 'VRYC', null, 2),
  C('gcyc', 'Hollow Cove Yacht Club', 'HoCYC', null, 2),
  C('mzyc', 'Martini Point Yacht Club', 'MaPYC', null, 2),
  C('pbyc', 'Carbonado Yacht Club', 'CarYC', null, 2),
  C('scc', 'Houseboat Cruising Club', 'HCC', null, 2)
];

const BY_ID = new Map(CLUB_TABLE.map(c => [c.id, c]));
export const clubInfo = (id: string | undefined): ClubInfo | undefined => (id ? BY_ID.get(id) : undefined);
/** A club's full display name, '' for none or an id we don't know (so a stray code is never shown). */
export const clubFullName = (id: string | undefined): string => clubInfo(id)?.name ?? '';
export const clubShortName = (id: string | undefined): string => clubInfo(id)?.short ?? '';

import realCodes from './data/real-club-codes.json';
/** A club id from a code in the published results (any case), or '' where the game has no parody for it: shown as nothing. */
export const clubIdFromResultCode = (code: string | undefined): string => {
  const k = (code ?? '').trim().toLowerCase();
  const id = (realCodes as Record<string, string>)[k];
  return k && k[0] !== '_' && id ? id : '';
};
