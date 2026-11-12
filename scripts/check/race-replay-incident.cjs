#!/usr/bin/env node
/**
 * The race replay at 1280×800 with a rule incident on it (dev server: npm run dev -- --port 5199). Sails 15 minutes of a
 * race with boat 0 on the AI skipper, raises a Rule 10 incident against her rival part-way (as the sim's own incident
 * event), then opens the replay: the whole course, the incident picked, and its close-up.
 *   node scripts/check/race-replay-incident.cjs <out-dir>
 */
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.setDefaultTimeout(180000);
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:5199/'); await page.waitForTimeout(3000);
  await page.click('[data-home="race"]'); await page.waitForTimeout(500); await page.click('[data-home="create"]'); await page.waitForTimeout(1000);
  await page.click('#bGo'); await page.waitForTimeout(2500);
  await page.evaluate(() => { const w = sim(); w.paused = true; const u = w.boats[0]; u.ai = structuredClone(w.boats[1].ai); u.isUser = false; });
  const sail = to => page.evaluate(to => { const w = sim(); while (w.t < to) { w.step(1 / 60); w.paused = true; } return w.t; }, to);
  await sail(300);
  // a Rule 10 incident: the rival on port fouls you, as the sim reports one (app.ts shows it and logs it for the replay)
  await page.evaluate(() => {
    const w = sim(), u = w.boats[0], o = w.boats[1]; u.isUser = true;
    w.events.push({ type: 'incident', a: u, b: o, incident: { kind: 'contact', fouler: o, rule: '10', byWhy: null, verdict: { kc: o, rule: '10' } },
      frames: w.rec.slice(-100), wind: w.wind.from });
    w.paused = false;
  });
  await page.waitForTimeout(3000);
  console.log('incident shown', await page.isVisible('#replay'));
  await page.click('#bCont'); await page.waitForTimeout(500);
  await page.evaluate(() => { const w = sim(); w.paused = true; w.boats[0].isUser = false; });
  await sail(900);
  await page.evaluate(() => { const w = sim(); w.boats[0].isUser = true; w.boats[0].ai = null; document.getElementById('bPause').click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.getElementById('bWatch2').click());
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out + '/rri-whole.png' });
  await page.evaluate(() => { const li = document.querySelector('#raceReplay li[data-at]'); li.scrollIntoView(); li.click(); });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out + '/rri-pick.png' });
  await page.click('[data-rr="clip"]'); await page.waitForTimeout(1500);
  await page.screenshot({ path: out + '/rri-clip.png' });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: out + '/rri-clip-end.png' });
  await page.click('[data-rr="play"]'); await page.waitForTimeout(1500);
  await page.screenshot({ path: out + '/rri-after.png' });
  console.log('ERRORS:', errs.join('\n') || 'none'); await browser.close();
  if (errs.length) process.exit(1);
})();
