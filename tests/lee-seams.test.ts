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
describe('the land\'s lee, without seams', () => {
  for (const [name, a0, b0] of LINES) it(`${name}: under 4% between points 10 m apart, 150 m or more off the shore`, () => {
    const a = LL(a0[0], a0[1]), b = LL(b0[0], b0[1]), L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.round(L / 10);
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
    expect(worst).toBeLessThan(0.04);
  });
});
