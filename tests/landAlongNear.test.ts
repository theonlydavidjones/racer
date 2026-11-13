// landAlongNear (geo/shore.ts) skips the walk along a short look only where the shore's well off and nothing built is
// near: it must give exactly landAlong's answer everywhere. Each look here is as long as the shortcut allows from where
// it starts (just under the lattice's shore distance less the margin), the worst case, in every direction; dense round
// the places where onGround's land isn't anyShoreDist's (Lime Point's coastline, the Cityfront box's edges: the review
// found the shortcut wrong there), and across the Bay.
import { describe, expect, it } from 'vitest';
import { anyShoreDistNear, landAlong, landAlongNear, limePointBox, onLand } from '../src/geo/shore';
import { LL } from '../src/geo/geo';
import { makeRng } from '../src/core/rng';

function check(area: { x0: number; x1: number; y0: number; y1: number }, points: number, seed: number) {
  const r = makeRng(seed), bad: string[] = [];
  let skipped = 0, n = 0, tries = 0;
  while (n < points && tries++ < points * 50) {
    const a = { x: area.x0 + r() * (area.x1 - area.x0), y: area.y0 + r() * (area.y1 - area.y0) };
    if (onLand(a)) continue;
    const L = Math.min(300, anyShoreDistNear(a) - 30 - 0.01);
    if (!(L > 1)) continue;
    n++;
    for (let k = 0; k < 36; k++) {
      const h = k * Math.PI / 18, b = { x: a.x + Math.sin(h) * L, y: a.y + Math.cos(h) * L };
      const want = landAlong(a, b), got = landAlongNear(a, b);
      if (got !== want) bad.push(`(${a.x.toFixed(1)}, ${a.y.toFixed(1)}) ${(k * 10)}° L ${L.toFixed(0)}: ${want} vs ${got}`);
      else if (got === Infinity) skipped++;
    }
  }
  return { bad, skipped, n };
}

describe('landAlongNear gives landAlong\'s answer', () => {
  const lp = limePointBox(), cfW = LL(37.80, -122.48), cfE = LL(37.80, -122.40), cfN = LL(37.815, -122.44), cfS = LL(37.78, -122.44);
  const around = (p: { x: number; y: number }, h: number) => ({ x0: p.x - h, x1: p.x + h, y0: p.y - h, y1: p.y + h });
  const areas: [string, { x0: number; x1: number; y0: number; y1: number }][] = [
    ['round Lime Point', { x0: lp.x0 - 300, x1: lp.x1 + 300, y0: lp.y0 - 300, y1: lp.y1 + 300 }],
    ['the Cityfront box\'s west edge (the Gate\'s south shore)', around(cfW, 600)],
    ['its east edge (the Embarcadero)', around(cfE, 600)],
    ['its north edge', { x0: LL(0, -122.48).x - 300, x1: LL(0, -122.40).x + 300, y0: cfN.y - 300, y1: cfN.y + 300 }],
    ['its south edge', { x0: LL(0, -122.48).x - 300, x1: LL(0, -122.40).x + 300, y0: cfS.y - 300, y1: cfS.y + 300 }],
    ['the Central Bay', { x0: LL(0, -122.52).x, x1: LL(0, -122.33).x, y0: LL(37.77, 0).y, y1: LL(37.90, 0).y }]
  ];
  for (const [name, area] of areas) it(name, () => {
    const { bad, skipped, n } = check(area, 600, name.length * 7919);
    expect(bad.slice(0, 5), `${bad.length} of ${n * 36} looks differ`).toEqual([]);
    if (name === 'the Central Bay') expect(skipped, 'the shortcut taken out on the water').toBeGreaterThan(1000);
  }, 300_000);
});
