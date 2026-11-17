#!/usr/bin/env node
/**
 * The start-line drill in the dev server (npm run dev -- --port 5199; ?inproc for the dev handles): three attempts from
 * 2 min, alone, the boat left to her own devices (she reaches along the line), each debrief screenshotted, the third with
 * the run of attempts. On the practice area's course (open water), in slack water and a 12 kt westerly, set before the
 * page loads: on the club's line and a real day's tide, the drifting boat can be carried onto the West Harbor breakwater
 * before the third gun (an ebb, 15 Nov 2026), and the wreck's dialog stops the run. In through the Drill card (the start
 * page's way in). node scripts/check/start-drill.cjs <out-dir>
 */
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(180000);
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.addInitScript(() => { try { localStorage.setItem('fbsim-settings-v2', JSON.stringify({ course: 'train', current: 'slack', windKind: 'west', windKt: 12, drillSolo: true, drillFrom: 120 })); } catch { /* */ } });
  await page.goto('http://localhost:5199/?inproc'); await page.waitForTimeout(3000);
  await page.click('[data-home="drill"]'); await page.waitForTimeout(1000);
  await page.click('#bDrill'); await page.waitForTimeout(2000);
  for (let n = 1; n <= 3; n++) {
    // head to wind for a few seconds near the line on the 2nd attempt (the line check), then on to the gun
    await page.evaluate(n => { const w = sim(); w.paused = true; while (w.t < 16) { w.step(1 / 60); } w.paused = false; }, n);
    await page.waitForTimeout(2500);
    console.log(`attempt ${n}:`, await page.evaluate(() => document.getElementById('dTitle').textContent + ' | ' + [...document.querySelectorAll('#dFacts li, #dTips li')].map(l => l.textContent).join(' | ')));
    await page.screenshot({ path: `${out}/drill-${n}.png` });
    if (n < 3) { await page.click('#bDNew'); await page.waitForTimeout(2000); }
  }
  await page.evaluate(() => document.getElementById('dRuns').scrollIntoView());
  await page.screenshot({ path: `${out}/drill-runs.png` });
  console.log('ERRORS:', errs.join('\n') || 'none'); await browser.close();
  if (errs.length) process.exit(1);
})();
