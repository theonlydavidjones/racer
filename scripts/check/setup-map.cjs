#!/usr/bin/env node
/**
 * The cruise setup's chart draws the chart (the owner, 14 Nov 2026: "map is no longer showing in cruise config"): opens
 * Cruise from the start page, and counts the setup chart's pixels that aren't its blank background; then the same on
 * "Plan on the big chart", and on the cruise's chart opened after a race's setup. Fails (exit 1) if either draws no chart. Needs the dev server (default :5173).
 *
 *   node scripts/check/setup-map.cjs [<url>] [<out-dir>]   → screenshots in <out-dir> when given
 */
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:5173/', OUT = process.argv[3];
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 860 } });
  const errs = [], bad = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL); await p.waitForTimeout(6000);
  await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(3000);
  // (the share of the canvas's pixels that differ from its corner, which is the empty background)
  const inked = id => p.evaluate(id => {
    const c = document.getElementById(id), r = c.getBoundingClientRect();
    if (!r.width || !c.width) return { w: r.width, cw: c.width, share: 0 };
    const g = document.createElement('canvas'); g.width = c.width; g.height = c.height; const x = g.getContext('2d'); x.drawImage(c, 0, 0);
    const d = x.getImageData(0, 0, g.width, g.height).data, bg = [d[0], d[1], d[2]]; let n = 0;
    for (let i = 0; i < d.length; i += 16) if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 30) n++;
    return { w: Math.round(r.width), cw: c.width, share: +(n / (d.length / 16)).toFixed(3) };
  }, id);
  const check = async (label, id) => {
    const s = await inked(id), ok = s.share > 0.05;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}: ${JSON.stringify(s)}`); if (!ok) bad.push(label);
    if (OUT) await p.locator('#' + id).screenshot({ path: `${OUT}/${id}.png` }).catch(() => {});
  };
  await check('the cruise setup\'s chart', 'setupChartC');
  await p.evaluate(() => document.getElementById('bPlanOpen').click()); await p.waitForTimeout(1500);
  await check('plan on the big chart', 'planC');
  // and by way of a race's setup first: back to the start page, Race, Create a race, back and back, then Cruise
  await p.evaluate(() => document.getElementById('planDone')?.click()); await p.keyboard.press('Escape'); await p.waitForTimeout(800);
  const click = async sel => { await p.evaluate(sel => { const e = [...document.querySelectorAll(sel)].find(e => e.offsetParent); if (e) e.click(); }, sel); await p.waitForTimeout(2000); };
  await p.goto(URL); await p.waitForTimeout(6000);
  await click('[data-home="race"]'); await click('[data-home="create"]'); await click('#setupBack'); await click('#raceBack'); await click('[data-home="cruise"]');
  await check('the cruise setup\'s chart, after a race\'s setup', 'setupChartC');
  console.log('ERRORS:', [...new Set(errs)].join('; ') || 'none');
  await b.close();
  if (bad.length || errs.length) { console.log(`FAILED: ${bad.join('; ')}`); process.exit(1); }
  console.log('all good');
})();
