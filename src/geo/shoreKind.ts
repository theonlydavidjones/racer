import enc from './data/enc-chart.json';
import { LL } from './geo';
import { segPt, type Vec } from '../core/math';
import type { Struck } from '../boat/damage';

/**
 * What the water's edge is made of, where a boat's bow or side strikes it (boat/physics.ts whatHit): from NOAA's chart
 * (ENC, S-57; scripts/fetch-charts.mjs → enc-chart.json `shoreKinds`), the coastline's category and the shoreline
 * constructions', read into the kinds the shared damage measure grades (boat/damage.ts). The split with Bay East: this is
 * the edge; the bottom and its hazards (rocks, obstructions, wrecks, grounding on depth) are theirs.
 *
 * The codes (IHO S-57 Edition 3.1, Appendix A, Object Catalogue):
 * - SLCONS CATSLC, a shoreline construction: 1 breakwater, 2 groyne, 3 mole, 4 pier (jetty), 5 promenade pier, 6 wharf
 *   (quay), 7 training wall, 8 rip rap, 9 revetment, 10 sea wall, 11 landing steps, 12 ramp, 13 slipway, 14 fender,
 *   15 solid face wall, 16 open face wall.
 * - COALNE CATCOA, the coastline: 1 steep coast, 2 flat coast, 3 sandy shore, 4 stony shore, 5 shingly shore, 6 glacier,
 *   7 mangrove, 8 marshy shore, 9 coral reef, 10 ice coast, 11 shelly shore.
 * Read as: a wall, quay, pier, mole, step, ramp or slipway is concrete; rubble (rip rap, revetment, a breakwater's or a
 * groyne's or training wall's stone mound), a steep or stony coast, or coral is rock; sand, mud, shingle, marsh or shells
 * is mud (aground, no damage: boat/damage.ts); a fender is fendered, a dock. Shingle (pebbles) is read as mud: an ESTIMATE,
 * since a grounding on pebbles at a walk chafes rather than holes her.
 */
const SLC: Record<number, [Struck, string]> = {
  1: ['rock', 'the breakwater'], 2: ['rock', 'the groyne'], 3: ['concrete', 'the mole'], 4: ['concrete', 'the pier'],
  5: ['concrete', 'the pier'], 6: ['concrete', 'the wharf'], 7: ['rock', 'the training wall'], 8: ['rock', 'the riprap'],
  9: ['rock', 'the revetment'], 10: ['concrete', 'the seawall'], 11: ['concrete', 'the landing steps'], 12: ['concrete', 'the ramp'],
  13: ['concrete', 'the slipway'], 14: ['dock', 'the fenders'], 15: ['concrete', 'the wall'], 16: ['concrete', 'the wall']
};
const COA: Record<number, [Struck, string]> = {
  1: ['rock', 'the rocky shore'], 2: ['mud', 'the shore'], 3: ['mud', 'the beach'], 4: ['rock', 'the stony shore'],
  5: ['mud', 'the shingle beach'], 8: ['mud', 'the marsh'], 9: ['rock', 'the reef'], 11: ['mud', 'the shell beach']
};
export interface ShoreKind { kind: Struck; name: string }
type Seg = { a: Vec; b: Vec; k: ShoreKind; built: boolean };

/** enc-chart.json's delta-coded line (integer 1e-5 degrees, [lon, lat]) to the sim's points. */
function decode(l: number[]): Vec[] {
  const out: Vec[] = []; let x = 0, y = 0;
  for (let i = 0; i + 1 < l.length; i += 2) { x += l[i]; y += l[i + 1]; out.push(LL(y / 1e5, x / 1e5)); }
  return out;
}
const CELL = 50;
let grid: Map<number, Seg[]> | null = null;
const key = (i: number, j: number) => i * 100003 + j;
function build(): Map<number, Seg[]> {
  const g = new Map<number, Seg[]>();
  const add = (pts: Vec[], k: ShoreKind, built: boolean, closed: boolean) => {
    const n = pts.length, m = closed ? n : n - 1;
    for (let s = 0; s < m; s++) {
      const a = pts[s], b = pts[(s + 1) % n], seg: Seg = { a, b, k, built };
      const i0 = Math.floor((Math.min(a.x, b.x) - 25) / CELL), i1 = Math.floor((Math.max(a.x, b.x) + 25) / CELL);
      const j0 = Math.floor((Math.min(a.y, b.y) - 25) / CELL), j1 = Math.floor((Math.max(a.y, b.y) + 25) / CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const c = key(i, j); let l = g.get(c); if (!l) g.set(c, l = []); l.push(seg); }
    }
  };
  type Entry = { coa?: number[]; slc?: number[]; o?: number[][]; f?: number[][][] };
  for (const e of (enc as unknown as { shoreKinds: Entry[] }).shoreKinds) {
    const built = !!e.slc, code = (e.slc ?? e.coa ?? [])[0], k = code != null ? (built ? SLC : COA)[code] : undefined;
    if (!k) continue; // (no category given: the chart doesn't say what it is)
    const sk: ShoreKind = { kind: k[0], name: k[1] };
    for (const l of e.o ?? []) add(decode(l), sk, built, false);
    for (const poly of e.f ?? []) for (const ring of poly) add(decode(ring), sk, built, true);
  }
  return g;
}

/**
 * What the charted shore is made of at `p` (her contact point): the nearest charted edge within `r` m (the sim's coastline,
 * OpenStreetMap's, and NOAA's differ by a few metres), a construction preferred to the coastline it stands on (within 3 m
 * of each other); null where the chart says nothing near.
 */
export function shoreKind(p: Vec, r = 25): ShoreKind | null {
  const g = grid ??= build();
  const list = g.get(key(Math.floor(p.x / CELL), Math.floor(p.y / CELL))); if (!list) return null;
  let best: Seg | null = null, bd = Infinity;
  for (const s of list) {
    const d = segPt(p, s.a, s.b) - (s.built ? 3 : 0); // (a seawall on the shore: the wall is what she hits)
    if (d < bd) { bd = d; best = s; }
  }
  return best && bd <= r ? best.k : null;
}
