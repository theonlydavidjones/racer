#!/usr/bin/env node
/**
 * The Bay Bridge and the city by day, at dusk and at night, from the water near the bridge and from the Cityfront,
 * with the renderer's draw calls and triangles and the frame time for each view. Needs the dev server (npm run dev)
 * on :5173; uses the dev-only free camera (window.__cam) and renderer handle (window.__renderer).
 *
 *   node scripts/check/night.cjs <out-dir> [day|dusk|night ...]   → out-dir/<time>_<view>.png, and the counts
 */
const { chromium } = require('playwright');
const LAT0 = 37.81053, LON0 = -122.44332, MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const LL = (lat, lon, z) => [(lon - LON0) * MLON, (lat - LAT0) * MLAT, z];
const VIEWS = {
  bridge_water: [LL(37.8030, -122.3800, 4), LL(37.7960, -122.3780, 60)], // under the West Span's north side, looking south along it
  bridge_whole: [LL(37.8140, -122.3990, 5), LL(37.7980, -122.3740, 70)], // the whole West Span, Rincon Hill to the island, from off Pier 35
  east_span: [LL(37.8160, -122.3500, 5), LL(37.8150, -122.3300, 60)], // the East Span's tower from north of Yerba Buena
  cityfront: [LL(37.8090, -122.4300, 3), LL(37.7960, -122.3950, 90)], // the skyline and the bridge from the Cityfront, off Aquatic Park
  ferry: [LL(37.8000, -122.3870, 3), LL(37.7930, -122.3960, 60)], // the Ferry Building and the towers from the water off Pier 14
  start: [LL(37.8118, -122.4510, 2.5), LL(37.7980, -122.3900, 60)], // from a boat on the start line, looking east
};
// the times, local (Pacific) on a November day: afternoon, real dusk (sun about 4° down) and night
const TIMES = { day: '14:00', dusk: '17:20', night: '20:30' };
(async () => {
  const out = process.argv[2] || '.', only = process.argv.slice(3);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5173/'); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="create"]').click()); await p.waitForTimeout(1200);
  await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(4000);
  await p.addStyleTag({ content: 'body *:not(#gl) { visibility: hidden !important; } #gl { visibility: visible !important; }' });
  await p.evaluate(() => { window.sim().paused = true; });
  const day0 = await p.evaluate(() => window.sim().gunUtc - window.sim().t / 60);
  for (const [tn, hm] of Object.entries(TIMES)) {
    if (only.length && !only.includes(tn)) continue;
    // move the clock: the gun's local time to hm (the sim's clock is the gun plus the race time)
    await p.evaluate(([hm]) => { const w = window.sim(), d = new Date(w.gunUtc * 60000), [h, m] = hm.split(':').map(Number);
      const loc = new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })), off = d.getTime() - loc.getTime();
      loc.setHours(h, m, 0, 0); w.gunUtc = (loc.getTime() + off) / 60000 - w.t / 60; }, [hm]);
    for (const [name, [pos, at]] of Object.entries(VIEWS)) {
      await p.evaluate(([pos, at]) => { window.__cam = { pos, at }; }, [pos, at]);
      await p.waitForTimeout(3500);
      const r = await p.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => (++n < 5 ? requestAnimationFrame(f) : res({ ms: (performance.now() - t0) / 5, ...window.__renderer.info.render })); requestAnimationFrame(f); }));
      await p.screenshot({ path: `${out}/${tn}_${name}.png` });
      console.log(`${tn.padEnd(5)} ${name.padEnd(13)} ${String(r.calls).padStart(5)} calls ${String(r.triangles).padStart(9)} tris  ${r.ms.toFixed(0)} ms/frame`);
    }
  }
  const mem = await p.evaluate(() => window.__renderer.info.memory);
  console.log('geometries', mem.geometries, 'textures', mem.textures);
  void day0;
  console.log('ERRORS:', errs.join('\n') || 'none'); await b.close();
})();
