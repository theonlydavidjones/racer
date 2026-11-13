#!/usr/bin/env node
/**
 * Smoke test of the built artifact (artifact/folkboat-racing-sim.html) in headless Chromium: opens the Fleet and a boat
 * page, starts a race, and reports any page errors. three.js is served from node_modules in place of jsDelivr.
 *
 *   npm run build:artifact && node scripts/check/smoke.cjs [out-dir]   (about 2 minutes; screenshot → out-dir/smoke.png)
 */
const { chromium } = require('playwright');
const path = require('path');
const root = path.resolve(__dirname, '../..'), out = process.argv[2] || root;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  // the headless software renderer draws a frame in a second or two with the full scene, so clicks get room to settle
  page.setDefaultTimeout(120000);
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.route('https://cdn.jsdelivr.net/npm/three@*/build/**', r => {
    const f = path.basename(new URL(r.request().url()).pathname);
    r.fulfill({ path: path.join(root, 'node_modules/three/build', f), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('file://' + path.join(root, 'artifact/folkboat-racing-sim.html')); await page.waitForTimeout(1500);
  await page.click('[data-home="fleet"]'); await page.waitForTimeout(800); await page.click('.fcard'); await page.waitForTimeout(1500);
  console.log('boat page', await page.isVisible('#fleetBoat'));
  await page.click('[data-f="toList"]'); await page.waitForTimeout(300); await page.click('[data-f="back"]'); await page.waitForTimeout(800);
  await page.click('[data-home="race"]'); await page.waitForTimeout(500); await page.click('[data-home="create"]'); await page.waitForTimeout(1000);
  await page.click('#bGo'); await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, 'smoke.png') });
  console.log(await page.evaluate(() => ['clock', 'spd', 'linebox'].map(i => document.getElementById(i).textContent).join(' | ')));
  // (the race sails in its worker: sim/host.ts WorkerHost; 'local' would mean the worker didn't start)
  // (the windex names her point of sail: ROADMAP 8j)
  const pos = await page.evaluate(() => document.querySelector('#sailBand .sb-pos')?.textContent ?? ''); console.log('point of sail:', pos || '(none)');
  if (!pos) errs.push('no point of sail in the band\'s windex');
  const mode = await page.evaluate(() => document.documentElement.dataset.sim); console.log('the race sails in:', mode);
  if (mode !== 'worker') errs.push(`the race isn't in its worker (${mode})`);
  // (sailing on at 4× until the mirror has been checked against the race a few times: sim/sync.ts checkOf, every 20 frames)
  await page.evaluate(() => { document.getElementById('bFast').click(); document.getElementById('bFast').click(); });
  await page.waitForFunction(() => Number(document.documentElement.dataset.syncChecks) >= 3, null, { timeout: 240000 }).catch(() => errs.push('the mirror was never checked'));
  console.log('the mirror\'s checks made:', await page.evaluate(() => document.documentElement.dataset.syncChecks));
  const faults = await page.evaluate(() => document.documentElement.dataset.syncFaults); console.log('the mirror\'s checks failed:', faults); if (faults !== '0') errs.push(`the page's mirror differs from the race (${faults} checks failed)`);
  console.log('ERRORS:', errs.join('\n') || 'none'); await browser.close();
  if (errs.length) process.exit(1);
})();
