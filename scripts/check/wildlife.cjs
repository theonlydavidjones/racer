#!/usr/bin/env node
/**
 * The Bay's wildlife, each animal from both sides close to (a few metres) and from a boat's chase-camera distance
 * (about 25 m), and the sea lions on Pier 39's floats near and far. Needs the dev server (npm run dev) on :5173; uses
 * the dev-only free camera (window.__cam) and the wildlife handle (window.__wild, render/scene.ts). The sim is paused
 * so the animals hold still; each is set in a characteristic moment (a pelican gliding, a gull flapping, a porpoise
 * mid-roll, a seal's head up).
 *
 *   node scripts/check/wildlife.cjs <out-dir>   → out-dir/wild_<animal>_<view>.png, and the triangles drawn
 */
const { chromium } = require('playwright');
const LAT0 = 37.81053, LON0 = -122.44332, MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const LL = (lat, lon) => [(lon - LON0) * MLON, (lat - LAT0) * MLAT];
(async () => {
  const out = process.argv[2] || '.';
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 760 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5173/'); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="race"]').click()); await p.waitForTimeout(600);
  await p.evaluate(() => document.querySelector('[data-home="create"]').click()); await p.waitForTimeout(1200);
  await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(5000);
  await p.addStyleTag({ content: 'body *:not(#gl) { visibility: hidden !important; } #gl { visibility: visible !important; }' });
  await p.evaluate(() => { window.sim().paused = true; });
  // open water off the Marina Green, clear of the boats: where each animal is put to be photographed
  const [sx, sy] = LL(37.8135, -122.4400);
  const shots = [['near_a', 1, 0.35, 0.25], ['near_b', -1, 0.35, 0.25], ['chase', 1, 5, 0.3]]; // side, distance factor, height factor
  const animals = [
    ['gull_flying', 4, "b.kind === 'gull' && !b.sit"], ['gull_sitting', 5, "b.kind === 'gull' && b.sit"], ['pelican', 6, "b.kind === 'pelican'"],
    ['cormorant', 4, "b.kind === 'cormorant'"], ['seal', 6, 'seal'], ['porpoise', 7, 'porpoise'], ['sealion_swimming', 9, 'swimmer']
  ];
  // (the animals' own update stopped, so each stays where it's put; birds posed directly)
  await p.evaluate(() => { const W = window.__wild; W.setMonth(10); W.update = (dt, t, focus, boats, sea) => { W._sea = sea; }; W.root.children.forEach(o => { o.visible = false; }); W.lions.visible = true; });
  for (const [name, d, pick] of animals) {
    const at = await p.evaluate(([pick, sx, sy]) => {
      const W = window.__wild, h0 = W._sea ? W._sea(sx, sy) : 0;
      W.root.children.forEach(o => { if (o !== W.lions) o.visible = false; });
      if (pick === 'seal') { const s = W.seals[0]; s.g.visible = true; s.g.position.set(sx, h0 + 0.02, -sy); s.g.rotation.set(0, 0, 0); s.g.userData.tilt.rotation.x = 0.1; return [sx, sy, h0 + 0.1]; }
      if (pick === 'porpoise') { const a = W.porpoises[0]; a.g.visible = true; a.g.position.set(sx, h0 - 0.05, -sy); a.g.rotation.set(0, -Math.PI / 2, 0); return [sx, sy, h0 + 0.1]; }
      if (pick === 'swimmer') { const s = (W.swimmers || [])[0]; if (!s) return null; s.g.visible = true; s.g.position.set(sx, h0 - 0.06, -sy); s.g.rotation.set(0, -Math.PI / 2, 0); return [sx, sy, h0 + 0.1]; }
      const want = pick.split("'")[1], sit = pick.includes('b.sit') && !pick.includes('!b.sit');
      const bird = W.birds.find(b => b.kind === want && (want !== 'gull' || b.sit === sit)) || W.birds.find(b => b.kind === want);
      if (!bird) return null;
      bird.g.visible = true; bird.p.set(sx, sit ? h0 + 0.02 : h0 + 3, -sy); bird.v.set(8, 0, 0); bird.flap = want === 'pelican' ? 0 : 1.2;
      W.pose(bird, bird.v.clone(), 0.016, sit ? 'sit' : want === 'pelican' ? -0.03 : Math.sin(bird.flap) * 0.6);
      return [sx, sy, sit ? h0 + 0.1 : h0 + 3];
    }, [pick, sx, sy]);
    if (!at) { console.log('no', name); continue; }
    for (const [view, side, df, hf] of shots) {
      const D = d * df;
      await p.evaluate(([x, y, z, D, side, hf]) => { window.__cam = { pos: [x + D * 0.55, y - side * D * 0.83, z + D * hf], at: [x, y, z] }; }, [...at, D, side, hf]);
      await p.waitForTimeout(500);
      await p.screenshot({ path: `${out}/wild_${name}_${view}.png` }); console.log(name, view);
    }
  }
  // the sea lions on Pier 39's floats
  const [px, py] = LL(37.80945, -122.41145);
  for (const [view, dx, dy, h] of [['near', 9, -11, 4], ['far', 30, -38, 9]]) {
    await p.evaluate(([x, y, dx, dy, h]) => { window.__cam = { pos: [x + dx, y + dy, h], at: [x, y, 0.3] }; }, [px, py, dx, dy, h]);
    await p.waitForTimeout(1500); await p.screenshot({ path: `${out}/wild_sealions_${view}.png` }); console.log('sealions', view);
  }
  const tris = await p.evaluate(() => { let n = 0; window.__wild.root.traverse(o => { if (o.isMesh) { const g = o.geometry; n += (g.index ? g.index.count : g.attributes.position.count) / 3; } }); return n; });
  console.log('wildlife triangles:', Math.round(tris));
  console.log('ERRORS:', errs.join('\n') || 'none'); await b.close();
})();
