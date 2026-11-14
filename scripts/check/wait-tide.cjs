#!/usr/bin/env node
/**
 * Wait for the tide in the page (the owner, 14 Nov 2026): a cruise on 14 Nov 2026 at the day's low water, put aground on
 * Richardson Bay's flat off Strawberry; the pause menu offers Wait for the Tide with the time she floats; taking it, the
 * clock goes on to that time and she floats. Needs the dev server: npm run dev -- --port 5173 (?inproc).
 *   node scripts/check/wait-tide.cjs <out-dir>   (screenshots → out-dir/wait-tide-*.png; exits 1 on a failure)
 */
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
const LAT0 = 37.81053, LON0 = -122.44332, MLAT = 111320, MLON = 111320 * Math.cos(LAT0 * Math.PI / 180);
const FLAT = { x: (-122.505 - LON0) * MLON, y: (37.880 - LAT0) * MLAT };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const errs = [], fail = m => { console.log('FAIL:', m); errs.push(m); };
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } }); p.setDefaultTimeout(120000);
  p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  // (the day's low water in San Francisco, 14 Nov 2026: about 7:58 pm, tests/ground.test.ts's)
  await p.addInitScript(() => { const s = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(s, { mode: 'sail', sailFrom: 'cityfront', windKind: 'west', windKt: 6, current: 'real', tideDate: '2026-11-14', tideTime: '19:50' }); for (const b of s.boats ?? []) delete b.laidUpUntil; localStorage.setItem('fbsim-settings-v2', JSON.stringify(s)); });
  await p.goto('http://localhost:5173/?inproc'); await p.waitForTimeout(4000);
  await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(2500);
  await p.evaluate(() => document.getElementById('bGo').click()); await p.waitForTimeout(4000);
  await p.evaluate(([x, y]) => { const u = sim().user; Object.assign(u, { docked: undefined, x, y, h: 315, v: 0.3, astern: 0, sway: 0, turnRate: 0, steer: 0, tiller: 0, turnTarget: null }); u.rig = { main: 0, jib: 0, mainUp: false, jibUp: false }; }, [FLAT.x, FLAT.y]);
  await p.waitForFunction(() => sim().user.aground > 0, null, { timeout: 30000 }).catch(() => fail('she never went aground'));
  const before = await p.evaluate(() => ({ clock: sim().clockUtc, aground: sim().user.aground }));
  console.log('aground:', JSON.stringify(before));
  await p.click('#bPause'); await p.waitForTimeout(500);
  const btn = await p.evaluate(() => { const b = document.getElementById('bWaitTide'); return { hidden: b.hidden, text: b.textContent }; });
  console.log('button:', JSON.stringify(btn));
  if (btn.hidden || !/^Wait for the Tide \(afloat \d{1,2}:\d{2}/.test(btn.text)) fail(`button: ${JSON.stringify(btn)}`);
  await p.screenshot({ path: `${out}/wait-tide-menu.png` });
  await p.click('#bWaitTide'); await p.waitForTimeout(3000);
  const after = await p.evaluate(() => ({ clock: sim().clockUtc, aground: sim().user.aground ?? null, paused: sim().paused, pauseHidden: document.getElementById('pause').hidden }));
  console.log('after:', JSON.stringify(after), 'waited', ((after.clock - before.clock) / 60).toFixed(2), 'h');
  if (!(after.clock - before.clock > 30)) fail('the clock didn\'t go on');
  if (after.aground) fail('still aground after the wait');
  if (after.paused || !after.pauseHidden) fail('not sailing on after the wait');
  await p.screenshot({ path: `${out}/wait-tide-after.png` });
  // the pause menu again: afloat, no Wait for the Tide
  await p.click('#bPause'); await p.waitForTimeout(500);
  if (!(await p.evaluate(() => document.getElementById('bWaitTide').hidden))) fail('Wait for the Tide offered afloat');
  await browser.close();
  for (const e of errs.filter(e => !/^FAIL|favicon/.test(e))) console.log('page error:', e);
  const bad = errs.filter(e => !/favicon/.test(e));
  console.log(bad.length ? `wait-tide: ${bad.length} problem(s)` : 'wait-tide: ok');
  process.exit(bad.length ? 1 : 0);
})();
