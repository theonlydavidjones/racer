#!/usr/bin/env node
/**
 * The bow from abeam, bow-on and three-quarter, both sides (the bow rework, ROADMAP 9a). Needs the dev server on :5173.
 *   node scripts/check/bow-views.cjs <out-dir> [prefix]   → out-dir/<prefix>_{abeam_P,abeam_S,bowon,q_P,q_S}.png
 */
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '.', pre = process.argv[3] || 'bow';
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1200, height: 760 } });
  await p.goto('http://localhost:5173/?inproc'); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="fleet"]').click()); await p.waitForTimeout(800);
  await p.evaluate(() => document.querySelector('.fcard').click()); await p.waitForTimeout(1500);
  await p.evaluate(() => window.__twa(55)); await p.waitForTimeout(2500);
  const h = await p.evaluate(() => window.sim().user.h * Math.PI / 180);
  const views = { abeam_P: [h - 1.4, 0.05, 5.5], abeam_S: [h - 1.4 + Math.PI, 0.05, 5.5], bowon: [h + Math.PI, 0.1, 5], q_P: [h - 1.4 - 0.8, 0.2, 4.5], q_S: [h + 1.4 + 0.8 - 0, 0.2, 4.5] };
  for (const [name, [y, pit, d]] of Object.entries(views)) {
    await p.evaluate(([y, pit, d]) => { window.__view.showroomA = 0; window.__look(y, pit, d); }, [y, pit, d]);
    await p.waitForTimeout(900);
    await p.screenshot({ path: `${out}/${pre}_${name}.png` });
  }
  await b.close();
})();
