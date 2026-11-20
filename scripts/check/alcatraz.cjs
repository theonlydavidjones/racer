#!/usr/bin/env node
/**
 * Alcatraz from the water and from above (r254): the island broadside from both sides, about 300 m and 1 km off its
 * shore, and one overhead; and the frame's draw calls and triangles in each view. Needs the dev server (npm run dev) on
 * :5173 and uses the dev-only free camera (window.__cam, render/scene.ts), as scenery.cjs does.
 *
 *   node scripts/check/alcatraz.cjs <out-dir> [name ...]   → out-dir/<name>.png, and each view's calls and triangles
 */
const { chromium } = require('playwright');
const LAT0 = 37.81053, LON0 = -122.44332, MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const LL = (lat, lon, z) => [(lon - LON0) * MLON, (lat - LAT0) * MLAT, z];
const C = [37.8265, -122.4225]; // the island's middle
/** A point d m from the island's middle on a compass bearing, at height z. */
const off = (brg, d, z) => { const a = brg * Math.PI / 180; return LL(C[0] + d * Math.cos(a) / MLAT, C[1] + d * Math.sin(a) / MLON, z); };
const at = LL(C[0], C[1], 22);
const VIEWS = {
  sw_300: [off(230, 380, 4), at], sw_1km: [off(230, 1080, 4), at], // from the Golden Gate side, the island's broadside
  ne_300: [off(50, 380, 4), at], ne_1km: [off(50, 1080, 4), at], // from the Angel Island side
  light_150: [LL(37.82625 - 0.0016, -122.42230 - 0.0006, 4), LL(37.82645, -122.42265, 40)], // the lighthouse and the cellhouse, from the water about 200 m south-south-west of the tower
  over: [LL(C[0] - 0.0016, C[1] - 0.0008, 620), LL(C[0], C[1], 0)], // from above, a little to the south-west, looking down on the island
};
(async () => {
  const out = process.argv[2] || '.', only = process.argv.slice(3);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5173/?inproc'); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="create"]').click()); await p.waitForTimeout(1200);
  await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(4000);
  await p.addStyleTag({ content: 'body *:not(#gl) { visibility: hidden !important; } #gl { visibility: visible !important; }' });
  for (const [name, [pos, tgt]] of Object.entries(VIEWS)) {
    if (only.length && !only.includes(name)) continue;
    await p.evaluate(([pos, tgt]) => { window.__cam = { pos, at: tgt }; }, [pos, tgt]);
    await p.waitForTimeout(5000);
    const info = await p.evaluate(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => { const i = window.__renderer.info; res({ calls: i.render.calls, tris: i.render.triangles }); }))));
    await p.screenshot({ path: `${out}/${name}.png` });
    console.log(name, `${info.calls} calls, ${info.tris} triangles`);
  }
  console.log('ERRORS:', errs.join('\n') || 'none'); await b.close();
})();
