import { describe, expect, it } from 'vitest';
import { harborLeeDeficit } from '../src/environment/harborLee';
import { groundHeight, terrainLee } from '../src/environment/shadows';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { LL } from '../src/geo/geo';
import { harborAt, slipById } from '../src/geo/marina';
import { PILE_PIERS, onLand } from '../src/geo/shore';
import { KT } from '../src/core/math';

/**
 * The Gashouse Cove exit, as the owner sails it (ROADMAP 8n): sheltered inside, then the Bay's wind and stream all at once
 * outside; the current running under Fort Mason's piers while their sheds block the wind. And the land's lee without
 * seams (Charts' wind-shadow layer, #261).
 */
describe('the lee of the harbors\' walls and Fort Mason\'s sheds', () => {
  it('a westerly behind Gashouse Cove\'s west seawall: lighter just off it, back to the whole wind within about 30 heights', () => {
    const row = Array.from({ length: 60 }, (_, i) => ({ x: 650 + i * 3, y: -359 })).filter(p => !onLand(p) && harborAt(p));
    const first = row[0], at = (d: number) => harborLeeDeficit({ x: first.x + d, y: first.y }, 270);
    expect(at(5)).toBeGreaterThan(0.15); // (a third of the rig in the wall's cavity, 70% slower there)
    expect(at(40)).toBeLessThan(at(5));
    expect(harborLeeDeficit({ x: first.x + 150, y: first.y }, 270)).toBeLessThan(0.01);
  });
  it('the sheds on Fort Mason\'s piers (13–17 m, OSM) shelter the whole rig behind them; a wind along the shore of the cove, none', () => {
    const P1 = PILE_PIERS.find(p => p.name === 'Pier 1')!, xe = Math.max(...P1.pts.map(q => q.x)), ym = P1.pts.reduce((a, q) => a + q.y, 0) / P1.pts.length;
    expect(harborLeeDeficit({ x: xe + 20, y: ym }, 270)).toBeGreaterThan(0.5); // (in the shed's cavity)
    expect(harborLeeDeficit({ x: xe - 60, y: ym }, 270)).toBeLessThan(0.2); // (upwind of it, in the cove: only the low walls' lee)
  });
  it('Josephine\'s slip (572), 85 m in from the west seawall, has a lee of a few percent in the westerly', () => {
    const s = slipById('gashouse-cove:572')!;
    expect(harborLeeDeficit(s.p, 270)).toBeGreaterThan(0.02);
    expect(harborLeeDeficit(s.p, 270)).toBeLessThan(0.2);
  });
  it('the current runs under Fort Mason\'s piers, and comes back within a few boat lengths of the cove\'s mouth', () => {
    const w = new World(COURSES[0], { ...DEFAULT_SETTINGS, tideDate: '2026-11-14', tideTime: '16:00', current: 'bigebb' } as Settings, 1);
    const kt = (p: { x: number; y: number }) => Math.hypot(w.currentAt(p).x, w.currentAt(p).y) / KT;
    for (const P of PILE_PIERS) {
      const c = P.pts.reduce((a, q) => ({ x: a.x + q.x / P.pts.length, y: a.y + q.y / P.pts.length }), { x: 0, y: 0 });
      expect(kt(c), `under ${P.name}`).toBeGreaterThan(0.5); // (was 0: the pier's outline was shore to the water)
    }
    const e = LL(37.80795, -122.43272), at = (d: number) => kt({ x: e.x, y: e.y - d }); // (south of the mouth: into the cove)
    expect(at(-20)).toBeGreaterThan(1); // 20 m outside: the Bay's stream (2.5 kt preset, eased by the shore)
    expect(at(40)).toBeLessThan(0.35); // five boat lengths in: sheltered
    expect(at(150)).toBeLessThan(0.15);
  });
});

describe('the land\'s lee without seams', () => {
  it('no straight edge where the Cityfront\'s box begins: the lee fades in across it', () => {
    // the box's north edge in the water off the Cityfront (37.815 N), crossed at a few places and winds
    for (const lon of [-122.46, -122.44, -122.42]) for (const from of [0, 30, 300, 330]) {
      const a = terrainLee(LL(37.8150 + 0.00002, lon), from), b = terrainLee(LL(37.8150 - 0.00002, lon), from);
      expect(Math.abs(a - b), `${lon} from ${from}`).toBeLessThan(0.02);
    }
  });
  it('the hills\' heights change smoothly, not in 200 m steps', () => {
    let worst = 0;
    for (let i = 0; i < 400; i++) { const p = LL(37.84 + (i % 20) * 0.002, -122.50 + Math.floor(i / 20) * 0.002), q = { x: p.x + 5, y: p.y }; worst = Math.max(worst, Math.abs(groundHeight(p) - groundHeight(q))); }
    expect(worst).toBeLessThan(15); // (5 m apart: a 200 m cell's step was up to its whole height difference)
  });
});
