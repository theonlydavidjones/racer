#!/usr/bin/env node
/**
 * The crude-model audit (r296): the shoreline from the water, one still a landmark, to find the old stand-ins (boxes and cylinders)
 * that real data could replace. Needs the dev server on :5173 (or PORT).
 *
 *   node scripts/check/audit.cjs <out-dir> [name ...]   → out-dir/<name>.png, and each view's draw calls and triangles
 */
const { chromium } = require('playwright');
const LAT0 = 37.81053, LON0 = -122.44332, MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const LL = (lat, lon, z) => [(lon - LON0) * MLON, (lat - LAT0) * MLAT, z];
const FOV = { sutro: 20, coit: 22, ferry: 24, bb_west: 36, yba: 36, ti: 36, oakland: 24 };
const VIEWS = {
  bb_west: [LL(37.8020, -122.3900, 6), LL(37.7990, -122.3700, 45)], // the Bay Bridge's west span and its anchorage, from the water north of the Embarcadero
  bb_east: [LL(37.8185, -122.3480, 6), LL(37.8130, -122.3330, 45)], // the east span from Yerba Buena Island's north side
  yba: [LL(37.8130, -122.3850, 6), LL(37.8120, -122.3640, 30)], // Yerba Buena Island from the west
  ti: [LL(37.8300, -122.3950, 6), LL(37.8240, -122.3700, 15)], // Treasure Island from the west
  ti_n: [LL(37.8450, -122.3650, 6), LL(37.8260, -122.3700, 15)], // Treasure Island from the north
  ferry: [LL(37.8070, -122.3930, 5), LL(37.7955, -122.3937, 40)], // the Ferry Building and the Embarcadero's towers
  coit: [LL(37.8180, -122.4060, 5), LL(37.8024, -122.4058, 50)], // Telegraph Hill and Coit Tower
  sutro: [LL(37.8110, -122.4400, 5), LL(37.7552, -122.4528, 250)], // Sutro Tower and the hills behind the Marina
  angel_s: [LL(37.8450, -122.4350, 5), LL(37.8590, -122.4310, 60)], // Angel Island from the south
  angel_e: [LL(37.8650, -122.3950, 5), LL(37.8650, -122.4180, 50)], // Angel Island from the east
  tiburon: [LL(37.8700, -122.4500, 5), LL(37.8760, -122.4560, 40)], // Tiburon and Belvedere
  sausalito: [LL(37.8440, -122.4750, 5), LL(37.8590, -122.4800, 45)], // Sausalito's shore and Richardson Bay's mouth
  headlands: [LL(37.8230, -122.4780, 5), LL(37.8300, -122.4990, 120)], // the Marin Headlands and Fort Baker
  ggb_n: [LL(37.8450, -122.4690, 6), LL(37.8240, -122.4790, 60)], // the Golden Gate Bridge's north end and Lime Point
  oakland: [LL(37.8200, -122.3500, 5), LL(37.8000, -122.3150, 40)], // Oakland's port and skyline from the Bay Bridge's east side
  alameda: [LL(37.7900, -122.3500, 5), LL(37.7700, -122.3000, 25)], // Alameda's north shore
  berkeley: [LL(37.8700, -122.3350, 5), LL(37.8700, -122.3000, 40)], // Berkeley's shore and the marina
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
    await p.evaluate(([pos, tgt, fov]) => { window.__cam = { pos, at: tgt, fov: fov || undefined }; }, [pos, tgt, FOV[name]]);
    await p.waitForTimeout(5000);
    const info = await p.evaluate(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(() => { const i = window.__renderer.info; res({ calls: i.render.calls, tris: i.render.triangles }); }))));
    await p.screenshot({ path: `${out}/${name}.png` });
    console.log(name, `${info.calls} calls, ${info.tris} triangles`);
  }
  console.log('ERRORS:', errs.join('\n') || 'none'); await b.close();
})();
