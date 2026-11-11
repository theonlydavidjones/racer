#!/usr/bin/env node
/**
 * Your boat's own lights at dusk and at night (navLights.ts), from all round her and from far off: the bicolour's
 * green and red each only on its own side, the sternlight only from astern, the cabin glowing through its ports, the
 * reflections on the water. Needs the dev server (npm run dev) on :5173; uses the dev-only free camera (window.__cam).
 *
 *   node scripts/check/boat-lights.cjs <out-dir> [dusk|night]   → out-dir/<time>_<view>.png
 */
const { chromium } = require('playwright');
// views: [name, bearing from her bow (deg, + to starboard), distance (m), camera height (m)]
const VIEWS = [['ahead', 0, 40, 2], ['bow_stbd', 2.5, 40, 2], ['stbd', 90, 40, 2], ['stbd_quarter', 125, 40, 2], ['astern', 180, 40, 2],
  ['port', -90, 40, 2], ['close', -135, 11, 3.5], ['far', 60, 1200, 2.5]];
const TIMES = { dusk: '17:25', night: '20:30' };
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
  for (const [tn, hm] of Object.entries(TIMES)) {
    if (only.length && !only.includes(tn)) continue;
    await p.evaluate(([hm]) => { const w = window.sim(), d = new Date(w.gunUtc * 60000), [h, m] = hm.split(':').map(Number);
      const loc = new Date(d.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })), off = d.getTime() - loc.getTime();
      loc.setHours(h, m, 0, 0); w.gunUtc = (loc.getTime() + off) / 60000 - w.t / 60; }, [hm]);
    for (const [name, rel, dist, hgt] of VIEWS) {
      await p.evaluate(([rel, dist, hgt]) => { const u = window.sim().user, a = (u.h + rel) * Math.PI / 180;
        window.__cam = { pos: [u.x + Math.sin(a) * dist, u.y + Math.cos(a) * dist, hgt], at: [u.x, u.y, 1.2] }; }, [rel, dist, hgt]);
      await p.waitForTimeout(2500);
      await p.screenshot({ path: `${out}/${tn}_${name}.png` });
    }
  }
  if (errs.length) { console.error(errs.join('\n')); process.exitCode = 1; }
  await b.close();
})();
