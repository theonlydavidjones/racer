#!/usr/bin/env node
/**
 * The city front from the water and from above (r296): Fort Point, Crissy Field, the Presidio shore, the Marina Green and
 * the Marina's houses; and each view's draw calls and triangles. Needs the dev server (npm run dev) on :5173 (or the port in
 * the PORT variable) and uses the dev-only free camera (window.__cam, render/scene.ts), as scenery.cjs does.
 *
 *   node scripts/check/cityfront.cjs <out-dir> [name ...]   → out-dir/<name>.png
 */
const { chromium } = require('playwright');
const LAT0 = 37.81053, LON0 = -122.44332, MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const LL = (lat, lon, z) => [(lon - LON0) * MLON, (lat - LAT0) * MLAT, z];
const VIEWS = {
  fortpoint: [LL(37.8150, -122.4725, 5), LL(37.8098, -122.4775, 20)], // Fort Point and the Presidio's shore, from the water east of the bridge's south end
  crissy: [LL(37.8138, -122.4580, 5), LL(37.8070, -122.4600, 25)], // Crissy Field and the Presidio's buildings, from the water off the airfield
  marina: [LL(37.8130, -122.4400, 5), LL(37.8040, -122.4400, 25)], // the Marina Green and the Marina's houses, from the water off the harbor mouth
  marina_low: [LL(37.8100, -122.4480, 2.5), LL(37.8050, -122.4400, 12)], // the same from a boat's deck, near the shore
  over_west: [LL(37.8080, -122.4720, 900), LL(37.8080, -122.47201, 0)], // overhead: Fort Point, the Presidio and Crissy Field
  over_marina: [LL(37.8055, -122.4400, 1000), LL(37.8055, -122.44001, 0)], // overhead: the Marina
};
(async () => {
  const out = process.argv[2] || '.', only = process.argv.slice(3), port = process.env.PORT || 5173;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://localhost:${port}/?inproc`); await p.waitForTimeout(5000);
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
