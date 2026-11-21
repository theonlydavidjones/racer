#!/usr/bin/env node
/**
 * The city front from the water and from above (r296): Fort Point, Crissy Field, the Presidio shore, the Marina Green and
 * the Marina's houses, then Fort Mason, Aquatic Park and Hyde Street Pier; and each view's draw calls and triangles. Needs the dev server (npm run dev) on :5173 (or the port in
 * the PORT variable) and uses the dev-only free camera (window.__cam, render/scene.ts), as scenery.cjs does.
 *
 *   node scripts/check/cityfront.cjs <out-dir> [name ...]   → out-dir/<name>.png
 */
const { chromium } = require('playwright');
const LAT0 = 37.81053, LON0 = -122.44332, MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const LL = (lat, lon, z) => [(lon - LON0) * MLON, (lat - LAT0) * MLAT, z];
const FOV = { fp_300: 14, fp_under: 24, fp_mid: 28 }; // a narrower lens for the fort's two stills (the fort is 50 m wide at 300 m)
const VIEWS = {
  fortpoint: [LL(37.8150, -122.4725, 5), LL(37.8098, -122.4775, 20)], // Fort Point and the Presidio's shore, from the water east of the bridge's south end
  crissy: [LL(37.8138, -122.4580, 5), LL(37.8070, -122.4600, 25)], // Crissy Field and the Presidio's buildings, from the water off the airfield
  marina: [LL(37.8130, -122.4400, 5), LL(37.8040, -122.4400, 25)], // the Marina Green and the Marina's houses, from the water off the harbor mouth
  marina_low: [LL(37.8100, -122.4480, 2.5), LL(37.8050, -122.4400, 12)], // the same from a boat's deck, near the shore
  fortmason: [LL(37.8150, -122.4300, 5), LL(37.8070, -122.4300, 20)], // Fort Mason's piers and the Great Meadow, from the water off Gashouse Cove
  aquatic: [LL(37.8140, -122.4255, 5), LL(37.8070, -122.4230, 25)], // Aquatic Park, Hyde Street Pier and Ghirardelli, from the water north of Municipal Pier
  hyde: [LL(37.8125, -122.4215, 6), LL(37.8097, -122.4225, 12)], // Hyde Street Pier and the ships, from the north-east
  hyde_w: [LL(37.8110, -122.4262, 5), LL(37.8097, -122.4225, 12)], // the same from the west, across Aquatic Park
  fp_sea: [LL(37.8115, -122.4755, 5), LL(37.8105, -122.4771, 9)], // Fort Point close, from the water to the north-east
  fp_south: [LL(37.8100, -122.4762, 6), LL(37.8105, -122.4771, 9)], // the same from the south-east
  fp_300: [LL(37.8122, -122.4745, 3), LL(37.8107, -122.4773, 9)], // Fort Point's bay face and the arch, from the water 300 m north-east, at sail height (SCALE=3 then crop: the fort is small at that range)
  fp_under: [LL(37.8150, -122.4735, 2.6), LL(37.8125, -122.4767, 16)], // from a boat close-hauled on port tack heading out under the bridge (about 225°), the fort on the port bow
  pier39: [LL(37.8150, -122.4125, 6), LL(37.8070, -122.4110, 25)], // Pier 39 and Telegraph Hill's west slope, from the water north of the pier
  over_ne: [LL(37.8030, -122.4150, 1100), LL(37.8030, -122.41501, 0)], // overhead: North Beach, Telegraph Hill, Cow Hollow's east end: the strip's east and south edges
  fp_mid: [LL(37.8200, -122.4690, 3), LL(37.8105, -122.4772, 24)], // mid-channel, north of the bridge's south end, looking at the pylons, the arch and the fort
  shoal_crissy: [LL(37.8100, -122.4590, 2.6), LL(37.8072, -122.4610, 0)], // the sea floor (render/bathy.ts): the shallows off Crissy Field, from a boat close to the beach
  shoal_aquatic: [LL(37.8128, -122.4262, 2.6), LL(37.8098, -122.4240, 0)], // the shallows off Aquatic Park's beach
  shoal_midbay: [LL(37.8330, -122.4400, 3), LL(37.8330, -122.4300, 0)], // mid-Bay: deep water, no floor
  over_shoal_crissy: [LL(37.8083, -122.4620, 300), LL(37.80831, -122.46201, 0)], // overhead: Crissy Field's shallows
  over_shoal_aq: [LL(37.8100, -122.4240, 300), LL(37.81001, -122.42401, 0)], // overhead: Aquatic Park's shallows
  shoal_aq_low: [LL(37.8105, -122.4252, 2.6), LL(37.8098, -122.4240, -1)], // from a boat in the cove, looking down at the water ahead
  palace_w: [LL(37.8070, -122.4506, 4), LL(37.8029, -122.4484, 22)], // the Palace of Fine Arts from the Marina's water west of it
  palace_n: [LL(37.8085, -122.4470, 4), LL(37.8029, -122.4484, 20)], // the same from the north, the rotunda and the colonnades
  palace_over: [LL(37.8029, -122.4484, 260), LL(37.80291, -122.44841, 0)], // overhead: the rotunda, the colonnades and the lagoon
  palace_c: [LL(37.8037, -122.4500, 14), LL(37.8030, -122.4484, 28)], // the Palace from a point beside its lagoon, the rotunda and a colonnade
  fp_over: [LL(37.8105, -122.4771, 90), LL(37.81051, -122.47710, 0)], // overhead: the fort's roof, courtyard and light
  over_hyde: [LL(37.8097, -122.4225, 160), LL(37.8097, -122.42251, 0)], // overhead: the ships at their berths
  over_east: [LL(37.8070, -122.4260, 1000), LL(37.8070, -122.42601, 0)], // overhead: Fort Mason, Aquatic Park, Russian Hill
  over_west: [LL(37.8080, -122.4720, 900), LL(37.8080, -122.47201, 0)], // overhead: Fort Point, the Presidio and Crissy Field
  over_marina: [LL(37.8055, -122.4400, 1000), LL(37.8055, -122.44001, 0)], // overhead: the Marina
};
(async () => {
  const out = process.argv[2] || '.', only = process.argv.slice(3), port = process.env.PORT || 5173;
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: +process.env.SCALE || 1 });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://localhost:${port}/?inproc`); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="create"]').click()); await p.waitForTimeout(1200);
  await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(4000);
  if (process.env.NIGHT) await p.evaluate(() => { const w = window.sim(), d = new Date(w.gunUtc * 60000), loc = new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })), off = d.getTime() - loc.getTime();
    loc.setHours(20, 30, 0, 0); w.gunUtc = (loc.getTime() + off) / 60000 - w.t / 60; }); // (NIGHT=1: the clock at 20:30, as perf.cjs's night views)
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
