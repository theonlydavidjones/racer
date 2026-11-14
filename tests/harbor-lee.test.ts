import { describe, expect, it } from 'vitest';
import { harborLeeDeficit } from '../src/environment/harborLee';
import { terrainLee } from '../src/environment/shadows';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { World } from '../src/sim/world';
import { COURSES } from '../src/courses/registry';
import { LL } from '../src/geo/geo';
import { harborAt, hitsWall, slipById } from '../src/geo/marina';
import { PILE_PIERS, inPilePier, onLand } from '../src/geo/shore';
import { KT } from '../src/core/math';

/**
 * The Gashouse Cove exit, as the owner sails it (ROADMAP 8n): sheltered inside, then the Bay's wind and stream all at once
 * outside; the current running under Fort Mason's piers while their sheds block the wind. And the land's lee without
 * seams (Charts' wind-shadow layer, #261).
 */
describe('the lee of the harbors\' walls and Fort Mason\'s sheds', () => {
  it('a westerly off Gashouse Cove\'s west seawall (a step down from the Marina Green): lighter close in, gone within about 15 step heights', () => {
    const row = Array.from({ length: 60 }, (_, i) => ({ x: 650 + i * 3, y: -359 })).filter(p => !onLand(p) && harborAt(p));
    const first = row[0], at = (d: number) => harborLeeDeficit({ x: first.x + d, y: first.y }, 270);
    expect(at(3)).toBeGreaterThan(0.15); // (the lowest third of the rig in the step's bubble)
    expect(at(60)).toBeLessThan(0.02);
  });
  it('Josephine\'s slip (572): next to nothing from the seawall 85 m upwind in a westerly; a NNW wind over the breakwater 55 m off, a little', () => {
    const s = slipById('gashouse-cove:572')!;
    expect(harborLeeDeficit(s.p, 270)).toBeLessThan(0.02);
    const nnw = harborLeeDeficit(s.p, 340);
    expect(nnw).toBeGreaterThan(0.05); expect(nnw).toBeLessThan(0.18); // (Perera's fence at 22 heights, over the rig: about 0.1)
  });
  it('the sheds on Fort Mason\'s piers (13–17 m, OSM) shelter the whole rig behind them, and nothing upwind of them', () => {
    const P1 = PILE_PIERS.find(p => p.name === 'Pier 1')!, xe = Math.max(...P1.pts.map(q => q.x)), ym = P1.pts.reduce((a, q) => a + q.y, 0) / P1.pts.length;
    const behind = harborLeeDeficit({ x: xe + 15, y: ym }, 270), before = harborLeeDeficit({ x: xe - 60, y: ym }, 270);
    expect(behind).toBeGreaterThan(0.5); // (in the shed's cavity)
    expect(before).toBeLessThan(behind / 2); // (upwind of it, in the cove: only the breakwater's east arm's lee)
  });
  it('no seams: anywhere in and round the cove and the piers, a meter apart, the lee within a few percent, whatever the wind', () => {
    let worst = 0, where = '';
    for (let from = 0; from < 360; from += 24) for (let y = -560; y < -100; y += 5) for (let x = 640; x < 1250; x += 1) for (const q of [{ x: x + 1, y }, { x, y: y + 1 }]) {
      const p = { x, y };
      const solid = (r: { x: number; y: number }) => onLand(r) || hitsWall(r), nearLand = (r: { x: number; y: number }) => solid(r) || solid({ x: r.x + 2, y: r.y }) || solid({ x: r.x - 2, y: r.y }) || solid({ x: r.x, y: r.y + 2 }) || solid({ x: r.x, y: r.y - 2 });
      if (nearLand(p) || nearLand(q) || inPilePier(p, 10) || inPilePier(q, 10)) continue; // (at a wall's own face the step is real; beside a shed's corner its wake's edge, the shear layer leaving it, is steep too)
      const d = Math.abs(harborLeeDeficit(p, from) - harborLeeDeficit(q, from));
      if (d > worst) { worst = d; where = `${x},${y} from ${from}`; }
    }
    expect(worst, where).toBeLessThan(0.12); // (the steepest left: the shear layer off a wall's end close in, a wall height wide, a continuous ramp on 0.25 m sampling; the review's steps were 0.7 in a meter)
  }, 120_000);
  it('the wind blowing down the slots between Fort Mason\'s piers isn\'t in the sheds\' lee', () => {
    // (along the piers, 351°: the slot between Piers 1 and 2 at y = −340, its middle, a dozen meters clear of each)
    for (const x of [995, 1000, 1005]) expect(harborLeeDeficit({ x, y: -340 }, 351), `${x}`).toBeLessThan(0.1);
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
});
