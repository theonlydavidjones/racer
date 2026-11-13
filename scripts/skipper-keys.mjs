#!/usr/bin/env node
/**
 * Real skippers' names stay out of the game (the owner: boat names and sail numbers only). The results the app imports
 * (src/boat/data/sf-folkboat-results.json) carry an anonymous id for each skipper ("k001", "k002", …) in place of the
 * name. The ids and the names they stand for live in reference/skipper-keys.json, which nothing in src/ imports, so
 * they never reach the published page.
 *
 * One id per skipper however the scorer typed the name (the same normalisation the calibration has always grouped by,
 * scripts/analyse-folkboat-results.mjs: "Tricia D Antin" and "Tricia Dantin" are one skipper), numbered in order of
 * first appearance. A name already in the map keeps its id; a new one gets the next.
 *
 *   node scripts/skipper-keys.mjs        (anonymise the results file in place; scripts/fetch-folkboat-results.mjs does it too)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const MAP = new URL('../reference/skipper-keys.json', import.meta.url);
const RESULTS = new URL('../src/boat/data/sf-folkboat-results.json', import.meta.url);

/** An anonymous id ("k001"): already anonymous, so the calibration keys by it as it is. */
export const isSkipperId = s => typeof s === 'string' && /^k\d{3,}$/.test(s);
/** The calibration's skipper normalisation: one skipper however the name was typed. */
export const nameKey = s => s.toLowerCase().replace(/[^a-z]/g, '');

/** Replace every boat's skipper in `data` (the results file's shape) with its id, extending the map; returns the map. */
export function anonymise(data) {
  const map = existsSync(MAP) ? JSON.parse(readFileSync(MAP, 'utf8')) : { note: '', ids: {} };
  const byKey = new Map(Object.entries(map.ids).map(([id, v]) => [v.key, id]));
  let n = Math.max(0, ...Object.keys(map.ids).map(id => +id.slice(1)));
  for (const ev of data.events) for (const r of ev.races) for (const b of r.boats) {
    if (b.skipper == null || b.skipper === '' || isSkipperId(b.skipper)) continue;
    const k = nameKey(b.skipper);
    let id = byKey.get(k);
    if (!id) { id = `k${String(++n).padStart(3, '0')}`; byKey.set(k, id); map.ids[id] = { key: k, names: [] }; }
    if (!map.ids[id].names.includes(b.skipper)) map.ids[id].names.push(b.skipper);
    b.skipper = id;
  }
  map.note = 'The skippers behind the anonymous ids in src/boat/data/sf-folkboat-results.json (scripts/skipper-keys.mjs). ' +
    'Never imported by the app: real skippers\' names stay out of the game. Names as the scorers published them.';
  writeFileSync(MAP, JSON.stringify(map, null, 1) + '\n');
  return map;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const data = JSON.parse(readFileSync(RESULTS, 'utf8'));
  const map = anonymise(data);
  writeFileSync(RESULTS, JSON.stringify(data, null, 1) + '\n');
  console.log(`${Object.keys(map.ids).length} skippers, anonymised`);
}
