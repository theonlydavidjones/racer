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
 *   15 solid face wharf, 16 open face wharf (on piles).
 * - COALNE CATCOA, the coastline: 1 steep coast, 2 flat coast, 3 sandy shore, 4 stony shore, 5 shingly shore, 6 glacier,
 *   7 mangrove, 8 marshy shore, 9 coral reef, 10 ice coast, 11 shelly shore.
 * Read as: a wall, quay, pier, mole, step, ramp or slipway is concrete; rubble (rip rap, revetment, a breakwater's or a
 * groyne's or training wall's stone mound), a steep or stony coast, or coral is rock; sand, mud, shingle, marsh or shells
 * is mud (aground, no damage: boat/damage.ts); a fender is fendered, a dock. Shingle (pebbles) is read as mud: an ESTIMATE,
 * since a grounding on pebbles at a walk chafes rather than holes her.
 *
 * A construction stands in place of the coastline along its stretch (S-57 draws one or the other, not both), and much of the
 * charted coastline has no category at all: natural coast of unknown kind. So every charted edge competes, and the nearest
 * to her contact is what she hit; where that's coastline with no category the chart doesn't say (null: physics.ts reads it
 * as mud for now; rocky natural shore, Angel Island's or the Headlands', is mostly uncategorized: a known gap). A
 * construction always under water (WATLEV 3) isn't the edge but the bottom, a hazard for grounding (Bay East's); a ruined
 * one (CONDTN 2) is named as ruins.
 */
const SLC: Record<number, [Struck, string]> = { // (15 and 16: wharves)
  1: ['rock', 'the breakwater'], 2: ['rock', 'the groyne'], 3: ['concrete', 'the mole'], 4: ['concrete', 'the pier'],
  5: ['concrete', 'the pier'], 6: ['concrete', 'the wharf'], 7: ['rock', 'the training wall'], 8: ['rock', 'the riprap'],
  9: ['rock', 'the revetment'], 10: ['concrete', 'the seawall'], 11: ['concrete', 'the landing steps'], 12: ['concrete', 'the ramp'],
  13: ['concrete', 'the slipway'], 14: ['dock', 'the fenders'], 15: ['concrete', 'the wharf'], 16: ['concrete', 'the wharf']
};
const COA: Record<number, [Struck, string]> = {
  1: ['rock', 'the rocky shore'], 2: ['mud', 'the shore'], 3: ['mud', 'the beach'], 4: ['rock', 'the stony shore'],
  5: ['mud', 'the shingle beach'], 8: ['mud', 'the marsh'], 9: ['rock', 'the reef'], 11: ['mud', 'the shell beach']
};
export interface ShoreKind { kind: Struck; name: string }
type Seg = { a: Vec; b: Vec; k: ShoreKind | null; built: boolean };

/** enc-chart.json's delta-coded line (integer 1e-5 degrees, [lon, lat]) to the sim's points. */
function decode(l: number[]): Vec[] {
  const out: Vec[] = []; let x = 0, y = 0;
  for (let i = 0; i + 1 < l.length; i += 2) { x += l[i]; y += l[i + 1]; out.push(LL(y / 1e5, x / 1e5)); }
  return out;
}
const CELL = 50, MARGIN = 25; // (each segment filed in every cell within MARGIN m of it: a search to MARGIN finds them all)
let grid: Map<number, Seg[]> | null = null;
const key = (i: number, j: number) => i * 100003 + j;
function build(): Map<number, Seg[]> {
  const g = new Map<number, Seg[]>();
  const add = (pts: Vec[], k: ShoreKind | null, built: boolean, closed: boolean) => {
    const n = pts.length, m = closed ? n : n - 1;
    for (let s = 0; s < m; s++) {
      const a = pts[s], b = pts[(s + 1) % n], seg: Seg = { a, b, k, built };
      const i0 = Math.floor((Math.min(a.x, b.x) - MARGIN) / CELL), i1 = Math.floor((Math.max(a.x, b.x) + MARGIN) / CELL);
      const j0 = Math.floor((Math.min(a.y, b.y) - MARGIN) / CELL), j1 = Math.floor((Math.max(a.y, b.y) + MARGIN) / CELL);
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const c = key(i, j); let l = g.get(c); if (!l) g.set(c, l = []); l.push(seg); }
    }
  };
  type Entry = { coa?: number[]; slc?: number[]; o?: number[][]; f?: number[][][]; wl?: number; cd?: number };
  for (const e of (enc as unknown as { shoreKinds: Entry[] }).shoreKinds) {
    const built = !!e.slc, code = (e.slc ?? e.coa ?? [])[0], k = code != null ? (built ? SLC : COA)[code] : undefined;
    if (built && e.wl === 3) continue; // (always under water: the bottom, not the edge)
    if (built && !k) continue; // (a construction of no category: not filed)
    // (a coastline of no category stays in: it's the edge, of unknown kind, and nearer than a construction it beats it)
    const sk: ShoreKind | null = k ? { kind: k[0], name: e.cd === 2 ? k[1].replace(/^the /, 'the ruined ') : k[1] } : null;
    for (const l of e.o ?? []) add(decode(l), sk, built, false);
    for (const poly of e.f ?? []) for (const ring of poly) add(decode(ring), sk, built, true);
  }
  return g;
}

/**
 * What the charted shore is made of at `p` (her contact point): the nearest charted edge within `r` m (no more than MARGIN:
 * the sim's coastline, OpenStreetMap's, and NOAA's differ by a few metres on the Cityfront), a construction preferred only
 * in a near tie (within a metre); null where that nearest edge is coastline the chart gives no category, or nothing's near.
 */
export function shoreKind(p: Vec, r = MARGIN): ShoreKind | null {
  const g = grid ??= build(), R = Math.min(r, MARGIN);
  const list = g.get(key(Math.floor(p.x / CELL), Math.floor(p.y / CELL))); if (!list) return null;
  let best: Seg | null = null, bd = Infinity;
  for (const s of list) {
    const d = segPt(p, s.a, s.b) - (s.built ? 1 : 0);
    if (d < bd) { bd = d; best = s; }
  }
  return best && bd <= R ? best.k : null;
}
