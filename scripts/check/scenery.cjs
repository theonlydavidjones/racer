#!/usr/bin/env node
/**
 * The Bay's scenery from fixed viewpoints on the water and from overhead: the bridges' shore ends, Angel Island,
 * Telegraph Hill and the skyline, puffs on the water, the waves, and the wildlife near the boat. Needs the dev server
 * (npm run dev) on :5173. Uses the dev-only free camera (window.__cam, render/scene.ts).
 *
 *   node scripts/check/scenery.cjs <out-dir> [name ...]   → out-dir/<name>.png, and the frame time of each view
 */
const { chromium } = require('playwright');
const LAT0 = 37.81053, LON0 = -122.44332, MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const LL = (lat, lon, z) => [(lon - LON0) * MLON, (lat - LAT0) * MLAT, z];
// name: [camera lat, lon, height], [target lat, lon, height]
const VIEWS = {
  gg_south: [LL(37.8150, -122.4630, 4), LL(37.8090, -122.4775, 40)], // the bridge's south end and Fort Point, from the water off Crissy Field
  gg_fort: [LL(37.8135, -122.4735, 5), LL(37.8098, -122.4785, 35)], // Fort Point, the arch and the south pylons, close
  gg_whole: [LL(37.8130, -122.4440, 4), LL(37.8197, -122.4786, 90)], // the whole Golden Gate from the start line
  baybridge: [LL(37.8070, -122.3950, 4), LL(37.7960, -122.3780, 50)], // the Bay Bridge's west span, Rincon Hill to Yerba Buena Island
  angel: [LL(37.8450, -122.4400, 4), LL(37.8620, -122.4320, 80)], // Angel Island from Raccoon Strait's south side
  ayala: [LL(37.8610, -122.4480, 4), LL(37.8685, -122.4355, 30)], // Ayala Cove from the west
  skyline: [LL(37.8120, -122.4200, 4), LL(37.7960, -122.4000, 90)], // Telegraph Hill, Coit Tower and the towers from off Aquatic Park
  coit: [LL(37.8095, -122.4045, 3), LL(37.8024, -122.40584, 110)], // Coit Tower close, from off Pier 33
  water: [LL(37.8118, -122.4510, 9), LL(37.8240, -122.4510, 0)], // the water near the start line: puffs and waves
  water_low: [LL(37.8118, -122.4510, 2.2), LL(37.8200, -122.4500, 0)], // the water from a boat's deck
  lime_point: [LL(37.8200, -122.4700, 4), LL(37.8255, -122.4790, 20)], // Lime Point and the north tower's base, from the water southeast of it
  horseshoe: [LL(37.8270, -122.4700, 4), LL(37.8325, -122.4765, 20)], // Horseshoe Bay and Fort Baker, from the water off its mouth
  marin_shore: [LL(37.8180, -122.4880, 5), LL(37.8290, -122.4800, 30)], // the Marin shore inside the Gate, from the water west of the bridge
  over_limebox: [LL(37.8265, -122.4805, 450), LL(37.8265, -122.48051, 0)], // overhead, close: Lime Point's OSM box (its west edge at 122.4845° W)
  lime_west: [LL(37.8215, -122.4830, 25), LL(37.8262, -122.4845, 10)], // the west edge of Lime Point's box, from the water south of it
  over_horseshoe_w: [LL(37.8328, -122.4778, 260), LL(37.8328, -122.47781, 0)], // overhead, close: Horseshoe Bay's west shore (OSM's beaches there)
  over_blacksands: [LL(37.8245, -122.5090, 320), LL(37.8245, -122.50901, 0)], // overhead, close: Black Sands Beach under the Headlands' cliffs
  over_lime: [LL(37.8285, -122.4775, 1200), LL(37.8285, -122.47751, 0)], // overhead: Lime Point and Horseshoe Bay
  over_gate: [LL(37.8150, -122.4700, 3200), LL(37.8150, -122.47001, 0)], // overhead: the Golden Gate
  over_bay: [LL(37.8250, -122.4200, 9000), LL(37.8250, -122.42001, 0)], // overhead: the Central Bay
  over_angel: [LL(37.8620, -122.4320, 3500), LL(37.8620, -122.43201, 0)], // overhead: Angel Island
  over_city: [LL(37.7980, -122.4000, 3000), LL(37.7980, -122.40001, 0)], // overhead: the Cityfront and Rincon Hill
  over_water: [LL(37.8150, -122.4450, 900), LL(37.8150, -122.44501, 0)], // overhead: puffs near the line
  wharf: [LL(37.8128, -122.4075, 25), LL(37.8098, -122.4120, 0)], // Pier 39 and its marina, Pier 41, from above the water off Pier 35
  aquatic: [LL(37.8118, -122.4285, 20), LL(37.8095, -122.4225, 0)], // Municipal Pier round Aquatic Park, Hyde Street Pier, from above the water to the west
  over_wharf: [LL(37.8095, -122.4160, 1400), LL(37.8095, -122.41601, 0)], // overhead: Aquatic Park to Pier 35
  // the East Bay and the north reach (extended November 2026)
  over_east: [LL(37.8300, -122.3000, 14000), LL(37.8300, -122.30001, 0)], // overhead: Oakland, Alameda, Emeryville and Berkeley
  over_north: [LL(37.9300, -122.4000, 12000), LL(37.9300, -122.40001, 0)], // overhead: Richmond, Red Rock, Point San Pablo and the Brothers
  berkeley: [LL(37.8650, -122.3600, 5), LL(37.8700, -122.2900, 120)], // the Berkeley shore and hills from the Berkeley Circle
  oakland: [LL(37.8100, -122.3550, 5), LL(37.8000, -122.3100, 60)], // the Port of Oakland from off Yerba Buena Island
  alameda: [LL(37.7800, -122.3600, 5), LL(37.7750, -122.3000, 40)], // Alameda Point and the Estuary's mouth from the south of the Bay Bridge
  richmond: [LL(37.8950, -122.4250, 5), LL(37.9250, -122.3900, 60)], // Point Richmond and the Long Wharf from Southampton Shoal
  sanpablo: [LL(37.9200, -122.4350, 5), LL(37.9620, -122.4330, 30)], // Red Rock, the Richmond–San Rafael Bridge and the Brothers from the south
  rsr: [LL(37.9250, -122.4520, 5), LL(37.9350, -122.4460, 50)], // the Richmond–San Rafael Bridge's west channel span, from the south
  rsr_side: [LL(37.9150, -122.4300, 300), LL(37.9350, -122.4400, 30)], // the whole bridge's roller coaster, from above Red Rock's south
  brothers_close: [LL(37.9600, -122.4300, 6), LL(37.9632, -122.4336, 12)], // East Brother Light Station
  cranes: [LL(37.8040, -122.3300, 8), LL(37.8090, -122.3240, 40)], // the Port of Oakland's cranes from the Outer Harbor channel
  bpier: [LL(37.8560, -122.3400, 8), LL(37.8600, -122.3250, 2)], // the Berkeley Pier and its ruined outer part
  longwharf: [LL(37.9150, -122.4180, 8), LL(37.9240, -122.4080, 5)], // Chevron's Long Wharf at Richmond
  over_bmarina: [LL(37.8665, -122.3180, 900), LL(37.8665, -122.31801, 0)], // overhead: the Berkeley Marina, its breakwaters and three ways in
  bmarina: [LL(37.8660, -122.3240, 6), LL(37.8665, -122.3170, 4)], // the Berkeley Marina's middle entrance and BYC beyond it
  over_ryc: [LL(37.9085, -122.3830, 500), LL(37.9085, -122.38301, 0)], // overhead: Brickyard Cove, Richmond YC's harbor
  over_encinal: [LL(37.7830, -122.2625, 400), LL(37.7830, -122.26251, 0)], // overhead: Encinal YC on the Estuary
  over_estuary: [LL(37.7820, -122.2600, 1800), LL(37.7820, -122.26001, 0)], // overhead: the Estuary's harbors, Marina Village to Alameda Marina
  // Fort Mason's piers on their piles and the Gashouse Cove entrance (8n, November 2026)
  fm_piles: [LL(37.8082, -122.4335, 2.2), LL(37.8078, -122.4318, 1.5)], // in the Gashouse entrance, under Pier 3's deck from a boat's deck
  fm_entrance: [LL(37.8090, -122.4300, 6), LL(37.8079, -122.4329, 2)], // the entrance from the Bay: Light 2 and its sign, Pier 3's end
  fm_sign: [LL(37.80812, -122.43270, 2.2), LL(37.80798, -122.43291, 3.4)], // the sign close, from the entrance channel
  over_fm: [LL(37.8082, -122.4315, 260), LL(37.8082, -122.43151, 0)], // overhead: the three piers and Gashouse Cove
  // the Ferry Building (November 2026)
  ferry_bay: [LL(37.7990, -122.3890, 6), LL(37.7955, -122.3937, 30)], // the Bay face, the gates and the sign, from off Pier 7
  ferry_street: [LL(37.7940, -122.3968, 120), LL(37.7954, -122.3936, 20)], // the tower and the Embarcadero arcade from above Market Street
  ferry_close: [LL(37.7938, -122.3905, 10), LL(37.7954, -122.3936, 40)], // the tower and the dials over the Bay face, from off the south gates
  ferry_sign: [LL(37.7968, -122.3918, 14), LL(37.7952, -122.3934, 14)], // the Bay face and the PORT OF SAN FRANCISCO sign, square on
  over_ferry: [LL(37.7955, -122.3930, 500), LL(37.7955, -122.39301, 0)], // overhead: the outline and gates B–G
};
(async () => {
  const out = process.argv[2] || '.', only = process.argv.slice(3);
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5173/?inproc'); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="create"]').click()); await p.waitForTimeout(1200);
  await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(4000);
  // the scenery only: hide the instruments and panels
  await p.addStyleTag({ content: 'body *:not(#gl) { visibility: hidden !important; } #gl { visibility: visible !important; }' });
  // a typical gusty afternoon (gust factor 1.55), so the puffs on the water can be judged
  await p.evaluate(() => window.sim().puffs.setGust(1.55));
  for (const [name, [pos, at]] of Object.entries(VIEWS)) {
    if (only.length && !only.includes(name)) continue;
    await p.evaluate(([pos, at]) => { window.__cam = { pos, at }; }, [pos, at]);
    await p.waitForTimeout(6000);
    const ms = await p.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => (++n < 5 ? requestAnimationFrame(f) : res((performance.now() - t0) / 5)); requestAnimationFrame(f); }));
    await p.screenshot({ path: `${out}/${name}.png` });
    console.log(name, `${ms.toFixed(0)} ms/frame`);
  }
  // the wildlife, close: each kind of bird, a seal and a porpoise, the camera a few metres off (sim time keeps running)
  if (!only.length || only.includes('animals')) {
    await p.evaluate(() => { window.sim().paused = true; }); // hold them still for the camera
    for (const [name, pick] of [['gull', "b.kind === 'gull' && !b.sit"], ['gull_sitting', "b.kind === 'gull' && b.sit"], ['pelican', "b.kind === 'pelican'"], ['cormorant', "b.kind === 'cormorant'"], ['seal', 'seal'], ['porpoise', 'porpoise']]) {
      for (let tries = 0; tries < 12; tries++) {
        const at = await p.evaluate(pick => {
          const W = window.__wild; let o;
          if (pick === 'seal') { W.seals.forEach(s => { s.t = 0; }); o = W.seals[0].g; }
          else if (pick === 'porpoise') { const a = W.porpoises.find(a => a.g.visible); o = a && a.g; }
          else { const b = W.birds.find(b => b.g.visible && eval(pick)); o = b && b.g; }
          if (!o) return null; const v = o.position; return [v.x, -v.z, v.y];
        }, pick);
        if (!at) { await p.evaluate(() => { window.sim().paused = false; }); await p.waitForTimeout(3000); await p.evaluate(() => { window.sim().paused = true; }); continue; }
        const d = name.startsWith('pelican') ? 7 : name === 'seal' || name === 'porpoise' ? 3 : 4;
        await p.evaluate(([x, y, z, d]) => { window.__cam = { pos: [x + d * 0.8, y - d * 0.6, z + d * 0.25], at: [x, y, z] }; }, [...at, d]);
        await p.waitForTimeout(400); await p.screenshot({ path: `${out}/animal_${name}.png` }); console.log('animal', name); break;
      }
    }
  }
  // wildlife near the boat: the chase view, looking round
  if (!only.length || only.includes('chase')) {
    await p.evaluate(() => { window.sim().paused = false; });
    await p.evaluate(() => { window.__cam = undefined; }); await p.evaluate(() => document.getElementById('bView').click()); await p.waitForTimeout(500);
    for (const yaw of [0, 1.6, 3.1]) { await p.evaluate(y => window.__look(y, 0.1, 30), yaw); await p.waitForTimeout(2500); await p.screenshot({ path: `${out}/chase_${yaw}.png` }); }
  }
  console.log('ERRORS:', errs.join('\n') || 'none'); await b.close();
})();
