import { describe, expect, it } from 'vitest';
import { terrainLee } from '../src/environment/shadows';
import { LL } from '../src/geo/geo';
import { anyShoreDist, onLand } from '../src/geo/shore';

/**
 * The land's lee has no seams (ROADMAP: wind-shadow seams). Read cell by cell, the 200 m blocks' heights and the shore's
 * 50 m steps made the lee step in plateaus: 0.20 → 0.46 in 9 m off Yellow Bluff, and the passage planner wandered
 * between them. Across the lees of Yellow Bluff, Alcatraz and Angel Island, in five winds, the wind factor changes by
 * little between points 10 m apart once a boat is clear of the shore. (Close under a bluff the lee does change quickly:
 * that's where the shelter begins.)
 */
const LINES: [string, [number, number], [number, number]][] = [
  ['Yellow Bluff', [37.8345, -122.4790], [37.8345, -122.4620]],
  ['Yellow Bluff, farther off', [37.8320, -122.4760], [37.8320, -122.4600]],
  ['Alcatraz', [37.8270, -122.4180], [37.8270, -122.3950]],
  ['Angel Island', [37.8600, -122.4150], [37.8600, -122.3900]],
];
const worstStep = (a0: [number, number], b0: [number, number], every: number) => {
  const a = LL(a0[0], a0[1]), b = LL(b0[0], b0[1]), n = Math.round(Math.hypot(b.x - a.x, b.y - a.y) / every);
  let worst = 0;
  for (const from of [235, 250, 265, 280, 300]) {
    let prev = NaN;
    for (let k = 0; k <= n; k++) {
      const p = { x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n };
      if (onLand(p) || anyShoreDist(p) < 150) { prev = NaN; continue; }
      const v = terrainLee(p, from);
      if (prev === prev) worst = Math.max(worst, Math.abs(v - prev));
      prev = v;
    }
  }
  return worst;
};
describe('the land\'s lee, without seams', () => {
  // continuity: between points 1 m apart a seam is a jump (main: 30% off Yellow Bluff); the lee's own steepest slope is
  // just past a low shore hill's near-calm (4H off), 1.5 × 0.8 / 4H a meter: 1.5% for a 20 m hill
  for (const [name, a0, b0] of LINES) it(`${name}: under 2% between points 1 m apart, 150 m or more off the shore`, () => {
    expect(worstStep(a0, b0, 1)).toBeLessThan(0.02);
  }, 60_000);
  // slope: over 10 m the most is 6–7%, 200–360 m off Yellow Bluff at 265–300°, where a ~50 m shore hill's near-calm ends
  // and its lee falls off as (4H/x)^1.5: the model's own shape, not a seam
  for (const [name, a0, b0] of LINES) it(`${name}: under 7.5% between points 10 m apart, 150 m or more off the shore`, () => {
    expect(worstStep(a0, b0, 10)).toBeLessThan(0.075);
  });
});

/**
 * The lee where it was calibrated (Deep Physics' review, #15), so the next change to how the ground is read shows up here.
 * Main read Alcatraz's shore off the sea's 100 m mask, 150 m out from the coast: 0.52; from the coast, a 41 m island
 * 357 m upwind, 0.72. Angel's is the spread across the wind meeting its coast beside the ray (main 0.51).
 */
describe('the land\'s lee where it was calibrated', () => {
  const at = (la: number, lo: number, from: number) => terrainLee(LL(la, lo), from);
  it('off Sausalito (270°) and off Yellow Bluff (250°): about 0.55, the Marin hills\' lee', () => {
    expect(Math.abs(at(37.8500, -122.4700, 270) - 0.55)).toBeLessThan(0.04);
    expect(Math.abs(at(37.8345, -122.4700, 250) - 0.55)).toBeLessThan(0.04);
  });
  it('Alcatraz\'s lee 440 m east of it in a westerly: 0.72 ± 0.05', () => { expect(Math.abs(at(37.8270, -122.4180, 270) - 0.72)).toBeLessThan(0.05); });
  it('Angel Island\'s lee off its east side (250°): 0.46 ± 0.05', () => { expect(Math.abs(at(37.8600, -122.4150, 250) - 0.46)).toBeLessThan(0.05); });
});
