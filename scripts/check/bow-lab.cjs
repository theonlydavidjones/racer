#!/usr/bin/env node
/** The bare hull's bow from abeam (orthographic profile), bow-on, low and three-quarter both sides, for the bow rework (ROADMAP 9a).
 *  Needs the dev server on :5173.  node scripts/check/bow-lab.cjs <out-dir> <prefix> */
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '.', pre = process.argv[3] || 'bow';
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 900, height: 600 } });
  p.on('pageerror', e => console.error('PAGE', e.message));
  await p.goto('http://localhost:5173/scripts/check/bow-lab.html'); await p.waitForFunction(() => window.ready, null, { timeout: 60000 });
  for (const k of ['profile', 'bowon', 'q_S', 'q_P', 'low']) {
    await p.evaluate(k => window.shoot(k), k); await p.locator('#c').screenshot({ path: `${out}/${pre}_${k}.png` });
  }
  await b.close();
})();
