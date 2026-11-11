#!/usr/bin/env node
/**
 * Renders your first boat in the Fleet showroom on both tacks, from both sides (four screenshots), to check the sails
 * (seams square to the leech and sloping down to the mast, battens at the leech, the starboard numbers higher) and
 * anything else that must look the same from either side. Needs the dev server (npm run dev) on :5173.
 *
 *   node scripts/check/sail-views.cjs <out-dir>   → out-dir/view_{P,S}_{a,b}.png (each tack seen from
 *   opposite sides)
 */
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '.', b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 760 } });
  await p.goto('http://localhost:5173/'); await p.waitForTimeout(5000);
  // (clicked from inside the page: Playwright's own click waits on the busy WebGL page and times out)
  await p.evaluate(() => document.querySelector('[data-home="fleet"]').click()); await p.waitForTimeout(800); await p.evaluate(() => document.querySelector('.fcard').click()); await p.waitForTimeout(1500);
  for (const twa of [55, -55]) {
    await p.evaluate(a => window.__twa(a), twa); await p.waitForTimeout(2500);
    const h = await p.evaluate(() => window.sim().user.h * Math.PI / 180);
    for (const side of ['a', 'b']) {
      // the camera's yaw is in the world: abeam of her, one side then the other
      await p.evaluate(y => { window.__view.showroomA = 0; window.__look(y, 0.15, 3); }, h - 1.4 + (side === 'b' ? Math.PI : 0));
      await p.waitForTimeout(900);
      await p.screenshot({ path: `${out}/view_${twa > 0 ? 'P' : 'S'}_${side}.png`, clip: { x: 440, y: 0, width: 760, height: 640 } });
    }
  }
  await b.close();
})();
