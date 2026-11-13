#!/usr/bin/env node
/**
 * Real past races (sim/realRaces.ts): the list in the past-race panel, a race started on its real day (course, start,
 * the real fleet by name and number), and the results against the real fleet (her finish set by hand: a race takes
 * three quarters of an hour). Needs the dev server on :5173.
 *
 *   node scripts/check/real-races.cjs <out-dir>   → real-list.png, real-start.png, real-results.png
 */
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1400, height: 860 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5173/?inproc' /* (the race in the page's thread, so the finish below can be set by hand) */); await p.waitForTimeout(5000);
  await p.evaluate(() => document.querySelector('[data-home="race"]').click()); await p.waitForTimeout(1200);
  await p.evaluate(() => document.getElementById('bPast').click()); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}/real-list.png` });
  await p.evaluate(() => document.querySelector('[data-real="GGYC_T008047221-r5"]').click()); await p.waitForTimeout(6000);
  console.log(await p.evaluate(() => { const w = sim(); return `course ${w.C.id} · day ${w.raceDate} · gun ${new Date(w.gunUtc * 60000).toISOString()} · wind ${w.wind.kt.toFixed(1)} kt from ${Math.round(w.wind.from)} · fleet ${w.boats.filter(x => !x.isUser).map(x => `${x.name} ${x.no}`).join(', ')}`; }));
  await p.screenshot({ path: `${out}/real-start.png` });
  // her finish, set by hand: 50 minutes after the gun
  await p.evaluate(() => { const w = sim(); w.user.finished = true; w.user.finishT = 3000; w.userFinishT = 3000; w.t = 3010; }); await p.waitForTimeout(3000);
  console.log('results shown:', await p.evaluate(() => !document.getElementById('results').hidden), '· real table:', await p.evaluate(() => !document.getElementById('resReal').hidden));
  await p.evaluate(() => document.getElementById('resReal').scrollIntoView()); await p.waitForTimeout(500);
  await p.screenshot({ path: `${out}/real-results.png` });
  console.log('ERRORS:', errs.join('; ') || 'none'); await b.close();
})();
