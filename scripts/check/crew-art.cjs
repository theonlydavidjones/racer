#!/usr/bin/env node
/**
 * The crew's three reference kits (src/render/crewBody.ts KITS) as sheets: close-ups of the head from the front, three-quarter and
 * side, the upper body, and the whole figure in front and behind, in the sim's daylight. Needs the dev server on :5173.
 *   node scripts/check/crew-art.cjs <out-dir>   → out-dir/<A|B|C>-sheet.png, lineup.png
 */
const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2] || '.', b = await chromium.launch(), p = await b.newPage({ viewport: { width: 1800, height: 1200 } });
  let errors = 0; p.on('pageerror', e => { errors++; console.log('page error:', e.message); }); p.on('console', m => { if (m.type() === 'error') console.log('console:', m.text()); });
  await p.goto('http://localhost:5173/scripts/check/crewart/'); await p.waitForFunction(() => window.art, null, { timeout: 60000 });
  for (const [i, n] of ['A', 'B', 'C'].entries()) { await p.evaluate(k => art.sheet(k), i); await p.screenshot({ path: `${out}/${n}-sheet.png` }); }
  await p.evaluate(() => art.lineup()); await p.screenshot({ path: `${out}/lineup.png` });
  await b.close(); if (errors) process.exit(1);
})();
