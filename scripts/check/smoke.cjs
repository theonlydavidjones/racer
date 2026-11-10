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
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.route('https://cdn.jsdelivr.net/npm/three@*/build/**', r => {
    const f = path.basename(new URL(r.request().url()).pathname);
    r.fulfill({ path: path.join(root, 'node_modules/three/build', f), contentType: 'application/javascript', headers: { 'access-control-allow-origin': '*' } });
  });
  await page.goto('file://' + path.join(root, 'artifact/folkboat-racing-sim.html')); await page.waitForTimeout(1500);
  await page.click('[data-home="fleet"]'); await page.waitForTimeout(800); await page.click('.fcard'); await page.waitForTimeout(1500);
  console.log('boat page', await page.isVisible('#fleetBoat'));
  await page.click('[data-f="toList"]'); await page.waitForTimeout(300); await page.click('[data-f="back"]'); await page.waitForTimeout(800);
  await page.click('[data-home="race"]'); await page.waitForTimeout(1000);
  await page.click('#bGo'); await page.waitForTimeout(2500);
  await page.screenshot({ path: path.join(out, 'smoke.png') });
  console.log(await page.evaluate(() => ['clock', 'spd', 'linebox'].map(i => document.getElementById(i).textContent).join(' | ')));
  console.log('ERRORS:', errs.join('\n') || 'none'); await browser.close();
  if (errs.length) process.exit(1);
})();
