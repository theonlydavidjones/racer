#!/usr/bin/env node
/** The whole hull, keel and rudder, on white: profile from starboard and port, and the plan from below, main's hull (src/render/hull_main.ts,
 *  made from `git show origin/main:src/render/hull.ts`) against the tree's. Needs the dev server.  node scripts/check/bow-full.cjs <out-dir> */
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '.', b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1600, height: 560 } });
  p.on('pageerror', e => console.error('PAGE', e.message));
  for (const v of ['main', 'draft']) {
    await p.goto(`http://localhost:5173/scripts/check/bow-lab.html?light&v=${v}`); await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
    await p.evaluate(() => window.setSize(1600, 560));
    for (const k of ['full', 'fullP', 'below']) { await p.evaluate(k => window.shoot(k), k); await p.locator('#c').screenshot({ path: `${out}/${v}_${k}.png` }); }
  }
  await b.close();
})();
