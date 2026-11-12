#!/usr/bin/env node
/**
 * The crew-art candidates (render/crewArt.ts) aboard, in the crew lab (?crewArt: helm A, crew B and C), sailing in a
 * 12 kt breeze on both tacks: from the chase camera's distance and nearer, from both sides. Needs the dev server.
 *   node scripts/check/crew-art-cockpit.cjs <out-dir>   → out-dir/cockpit_<S|P>_<view>.png
 */
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '.', b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  let errors = 0; p.on('pageerror', e => { errors++; console.log('page error:', e.message); });
  await p.goto('http://localhost:5173/scripts/check/crewlab/?crewArt'); await p.waitForFunction(() => window.lab, null, { timeout: 60000 }); await p.addStyleTag({ content: '#i{display:none}' });
  for (const tack of ['S', 'P']) {
    await p.evaluate(tk => { lab.setup({ windKt: 12, tack: tk }); lab.sail(25); }, tack);
    const w = tack === 'S' ? 1 : -1;
    // (the chase camera: 24 m back, its height 9/24 of that, 60° field: render/scene.ts)
    for (const [view, yaw, pitch, dist, fov, at] of [['chase', -20 * w, 20.5, 24, 60, [0, 1.2, 0]], ['quarter-windward', 55 * w, 16, 6.5, 40, [0, 0.8, 1.6]], ['quarter-leeward', -60 * w, 22, 6.5, 40, [0, 0.8, 1.6]], ['close', 35 * w, 10, 3.2, 40, [0, 0.9, 1.7]]]) {
      await p.evaluate(([y, pi, d, f, a]) => { lab.fov(f); lab.cam(y, pi, d, a); }, [yaw, pitch, dist, fov, at]);
      await p.screenshot({ path: `${out}/cockpit_${tack}_${view}.png` });
    }
  }
  await b.close(); if (errors) process.exit(1);
})();
