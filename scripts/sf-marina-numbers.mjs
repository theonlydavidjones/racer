#!/usr/bin/env node
/**
 * The San Francisco Marina's own slip numbers, for West Harbor and Gashouse Cove (its East Harbor), on the berths the
 * generators work out from OSM's fingers (scripts/make-west-harbor.mjs, scripts/make-marinas.mjs), which letter the docks
 * themselves (the sim's letters, A, B, C …, in the order each script finds them).
 *
 * The marina doesn't letter most of its docks: a berth is a bare number. From San Francisco Recreation and Parks' maps:
 * - the wayfinding map (sfrecpark.org/DocumentCenter/View/30418/SF-Marina-Wayfinding-Map): the range of numbers on each
 *   dock, in both harbors;
 * - the colour-coded map (sfrecpark.org/DocumentCenter/View/30417/SF-Marina-Color-Coded-Map): West Harbor's slips one by
 *   one, and its Docks E, F and G by name.
 * West Harbor's numbers are odd, Gashouse Cove's even. Where the colour map shows the order (West Harbor's Dock E and its
 * short north–south docks), a dock's numbers run out from its shore end along one side and back along the other; the
 * single-sided docks run end to end. Gashouse Cove's order within each dock isn't shown on either map: it's inferred here
 * the same way, out from the gate at the Marina Green (west) end along the north side and back along the south. Which
 * side comes first on West Harbor's north–south docks and in the block north of the Marina Green is inferred too.
 *
 * A dock with more berths mapped than numbers in its range (the sim's slips are a Folkboat's width; the marina's run up
 * to 90 ft) keeps the first ones in the order above, and the rest are dropped rather than given numbers it doesn't have.
 *
 *   node scripts/sf-marina-numbers.mjs   (renumbers src/geo/data/west-harbor.json and gashouse-cove.json in place, and
 *                                         writes the old ids' new ones to src/geo/data/slip-renames.json)
 */
import { readFile, writeFile } from 'node:fs/promises';

/**
 * Per harbor: each of the marina's docks (or blocks of numbers), the sim's docks it's made of, its numbers (lo … hi, every
 * other one), the end it's numbered from (N, S, E or W) and how: 'run' (end to end, both sides as they come) or 'u'
 * (out along the `first` side, N S E or W of the dock, and back along the other).
 */
export const SF_DOCKS = {
  'west-harbor': [
    { name: '651–685', sim: ['A'], lo: 651, hi: 685, from: 'S', how: 'run' }, // the west dock, by St. Francis YC
    { name: 'G', sim: ['B', 'E'], lo: 689, hi: 733, from: 'W', how: 'run' }, // along the breakwater (the colour map's Dock G)
    { name: 'E', sim: ['F', 'L'], lo: 357, hi: 503, from: 'E', how: 'u', first: 'N' }, // the middle dock (Dock E: 357 at its east end, 359–401 west along its north side, 405–503 back east)
    { name: 'F', sim: ['G'], lo: 505, hi: 649, from: 'E', how: 'run' }, // along Marina Boulevard (Dock F: 505 at the east end)
    { name: '305–355', sim: ['H'], lo: 305, hi: 355, from: 'S', how: 'u', first: 'E' },
    { name: '263–303', sim: ['I'], lo: 263, hi: 303, from: 'S', how: 'u', first: 'E' }, // (265–275 up its east side, 281–303 down the west)
    { name: '223–261', sim: ['M'], lo: 223, hi: 261, from: 'S', how: 'u', first: 'E' }, // (225–239 up its east side, 245–259 down the west)
    { name: '735–771', sim: ['J', 'K'], lo: 735, hi: 771, from: 'S', how: 'u', first: 'E' }, // by the Golden Gate YC
    { name: '773–863', sim: ['P', 'R'], lo: 773, hi: 863, from: 'W', how: 'run' }, // north of the harbor office, by the Golden Gate YC
    // north of the Marina Green, numbered from the east: 101 on the easternmost dock
    { name: '203–221', sim: ['O'], lo: 203, hi: 221, from: 'S', how: 'u', first: 'E' },
    { name: '163–201', sim: ['S', 'T'], lo: 163, hi: 201, from: 'S', how: 'u', first: 'E' },
    { name: '125–161', sim: ['U'], lo: 125, hi: 161, from: 'S', how: 'u', first: 'E' },
    { name: '101–123', sim: ['V'], lo: 101, hi: 123, from: 'S', how: 'u', first: 'E' }
  ],
  // the seven docks north to south (the sim's A to G), each from its gate at the Marina Green end
  'gashouse-cove': [
    { name: '596–658', sim: ['A'], lo: 596, hi: 658, from: 'W', how: 'run' },
    { name: '448–594', sim: ['B'], lo: 448, hi: 594, from: 'W', how: 'u', first: 'N' },
    { name: '332–446', sim: ['C'], lo: 332, hi: 446, from: 'W', how: 'u', first: 'N' },
    { name: '258–330', sim: ['D'], lo: 258, hi: 330, from: 'W', how: 'u', first: 'N' },
    { name: '170–256', sim: ['E'], lo: 170, hi: 256, from: 'W', how: 'u', first: 'N' },
    { name: '82–168', sim: ['F'], lo: 82, hi: 168, from: 'W', how: 'u', first: 'N' },
    { name: '2–80', sim: ['G'], lo: 2, hi: 80, from: 'W', how: 'u', first: 'N' }
  ]
};

export const SOURCE_NOTE = '; slip numbers the marina\'s own (SF Recreation and Parks\' wayfinding and colour-coded maps: scripts/sf-marina-numbers.mjs), their order within a dock inferred where the maps don\'t show it.';

const COMPASS = { N: { x: 0, y: 1 }, S: { x: 0, y: -1 }, E: { x: 1, y: 0 }, W: { x: -1, y: 0 } };

/**
 * The marina's numbers on a harbor's slips (with the sim's dock letters, as a generator makes them): the slips kept, as
 * `{ id: '651', dock: '651–685', … }`, and each sim id's new one (null: dropped, past the dock's range).
 */
export function sfNumbers(harbor, slips) {
  const docks = SF_DOCKS[harbor]; if (!docks) return { slips, renames: {} };
  const lat0 = slips.reduce((a, s) => a + s.at[0], 0) / slips.length, k = Math.cos(lat0 * Math.PI / 180);
  const xy = s => ({ x: s.at[1] * 111320 * k, y: s.at[0] * 110540 });
  const out = [], renames = {};
  for (const D of docks) {
    const mine = slips.filter(s => D.sim.includes(s.dock)); if (!mine.length) throw new Error(`${harbor}: no slips on ${D.sim}`);
    // the dock's line: the slips' principal axis, pointing away from the end it's numbered from
    const P = mine.map(xy), c = P.reduce((a, p) => ({ x: a.x + p.x / P.length, y: a.y + p.y / P.length }), { x: 0, y: 0 });
    let sxx = 0, sxy = 0, syy = 0; for (const p of P) { sxx += (p.x - c.x) ** 2; sxy += (p.x - c.x) * (p.y - c.y); syy += (p.y - c.y) ** 2; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy); let u = { x: Math.cos(th), y: Math.sin(th) };
    const f = COMPASS[D.from]; if (u.x * f.x + u.y * f.y > 0) u = { x: -u.x, y: -u.y }; // (from the `from` end outward)
    const along = p => (p.x - c.x) * u.x + (p.y - c.y) * u.y, across = p => (p.x - c.x) * -u.y + (p.y - c.y) * u.x; // (+: left of the way out)
    const items = mine.map((s, i) => ({ s, a: along(P[i]), b: across(P[i]) }));
    let order;
    if (D.how === 'run') order = items.sort((p, q) => p.a - q.a);
    else {
      const g = COMPASS[D.first], firstLeft = -u.y * g.x + u.x * g.y > 0; // (is the `first` side on the left, looking out along the dock?)
      const one = items.filter(p => (p.b > 0) === firstLeft).sort((p, q) => p.a - q.a), two = items.filter(p => (p.b > 0) !== firstLeft).sort((p, q) => q.a - p.a);
      order = [...one, ...two];
    }
    order.forEach(({ s }, i) => {
      const n = D.lo + 2 * i;
      if (n > D.hi) { renames[s.id] = null; return; } // (moved to a neighbour below)
      renames[s.id] = String(n); out.push({ ...s, id: String(n), dock: D.name });
    });
  }
  // a berth dropped (past its dock's range): a boat saved in it moves to the nearest numbered slip on the same dock
  for (const s of slips) if (renames[s.id] === null) {
    const D = docks.find(D => D.sim.includes(s.dock)), p = xy(s);
    const near = out.filter(o => o.dock === D.name).sort((a, b) => Math.hypot(xy(a).x - p.x, xy(a).y - p.y) - Math.hypot(xy(b).x - p.x, xy(b).y - p.y))[0];
    renames[s.id] = { moved: near.id };
  }
  // an end tie (worked out where the harbor's loaded, geo/marina.ts: '<dock> end <k>'): its dock's new name
  // (not where the old letter is a dock's name now, as West Harbor's E, F and G are: 'G end 1' is the real Dock G's end tie
  // today, not the old G's, and it mustn't be sent elsewhere)
  const names = new Set(docks.map(D => D.name));
  for (const D of docks) for (const L of D.sim) if (!names.has(L)) for (let k = 1; k <= 6; k++) renames[`${L} end ${k}`] = `${D.name} end ${k}`;
  const left = slips.filter(s => !(s.id in renames)); if (left.length) throw new Error(`${harbor}: slips on docks not in SF_DOCKS: ${[...new Set(left.map(s => s.dock))]}`);
  return { slips: out.sort((a, b) => Number(a.id) - Number(b.id)), renames };
}

/** The old ids (the sim's letters) and their new numbers, for every harbor renumbered: saved slips follow them (a dropped
 * berth's to its nearest neighbour on the dock). */
export async function writeRenames(harbor, renames) {
  const url = new URL('../src/geo/data/slip-renames.json', import.meta.url);
  let all = {}; try { all = JSON.parse(await readFile(url, 'utf8')); } catch { /* none yet */ }
  for (const k of Object.keys(all)) if (k.startsWith(harbor + ':')) delete all[k];
  for (const [k, v] of Object.entries(renames)) all[`${harbor}:${k}`] = `${harbor}:${typeof v === 'string' ? v : v.moved}`;
  await writeFile(url, JSON.stringify(all, null, 0) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const h of Object.keys(SF_DOCKS)) {
    const url = new URL(`../src/geo/data/${h}.json`, import.meta.url), d = JSON.parse(await readFile(url, 'utf8'));
    if (d.slips.every(s => /^\d+$/.test(s.id))) { console.log(`${h}: already numbered`); continue; }
    const { slips, renames } = sfNumbers(h, d.slips);
    d.slips = slips; d.source = d.source.replace(/[.;] ?[Dd]ock letters and slip numbers are this sim's, not the harbor's\./, '') + SOURCE_NOTE;
    await writeFile(url, JSON.stringify(d) + '\n'); await writeRenames(h, renames);
    console.log(`${h}: ${slips.length} slips numbered, ${Object.values(renames).filter(v => typeof v === 'object').length} dropped (past their dock's range)`);
  }
}
