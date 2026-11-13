#!/usr/bin/env node
/**
 * The page never writes to the race (docs/CAPACITY.md, step 2; sim/host.ts): runs the dev page with ?simguard, where
 * the page's view of the World throws on any write, and works the controls a sailor would (a race at 4×: the tiller,
 * the sheets, the sail controls band, the crew's place, the pole, a hail, the chart, pause; then a cruise: the motor,
 * the halyards, the pilot, a destination). Fails on any page error. Needs the dev server (npm run dev) on :5173.
 *
 *   node scripts/check/simguard.cjs [out-dir]
 */
const { chromium } = require('playwright');
const out = process.argv[2] || '.';
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 760 } }); p.setDefaultTimeout(180000);
  const errs = []; p.on('pageerror', e => errs.push(e.stack || e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.addInitScript(() => { if (!localStorage.getItem('fbsim-settings-v2')) localStorage.setItem('fbsim-settings-v2', JSON.stringify({ opponents: ['stock:1', 'stock:2', 'stock:3'], windDay: 2, traffic: 1 })); });
  const step = async (what, f) => { try { await f(); } catch (e) { errs.push(`(${what}) ${e.message}`); } await p.waitForTimeout(400); };
  const key = async (k, ms = 0) => { await p.keyboard.down(k); if (ms) await p.waitForTimeout(ms); await p.keyboard.up(k); };
  const click = sel => p.evaluate(s => { const e = document.querySelector(s); if (e && !e.closest('[hidden]')) e.click(); return !!e; }, sel);
  await p.goto('http://localhost:5173/?simguard'); await p.waitForTimeout(5000);
  // the guard itself: a write through the page's view must throw (else this check checks nothing)
  const selfTest = async () => p.evaluate(() => { try { window.__w().user.tiller = 0.5; return 'wrote'; } catch (e) { return /simguard/.test(e.message) ? 'refused' : e.message; } });
  // a race
  await p.evaluate(() => document.querySelector('[data-home="race"]').click()); await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelector('[data-home="create"]').click()); await p.waitForTimeout(1500);
  await click('#bGo'); await p.waitForTimeout(3000);
  const st = await selfTest(); console.log('guard self-test:', st); if (st !== 'refused') errs.push('the guard is off: ' + st);
  await step('speed', async () => { await click('#bFast'); await click('#bFast'); });
  await step('steer', async () => { await key('a', 600); await key('d', 600); });
  await step('sheets', async () => { for (const k of ['z', 'x', ',', '.', 's', ';', "'", ']', ';']) await key(k, 300); });
  await step('tiller', async () => { await key('t'); await p.mouse.move(800, 400); await p.waitForTimeout(300); await p.mouse.move(500, 400); await key('t'); });
  await step('lash', async () => { await key('i'); await p.waitForTimeout(300); await key('c'); await key('i'); await key('a', 200); });
  await step('band', async () => {
    for (const s of ['[data-act="pull"]', '[data-act="ease"]']) for (let i = 0; i < 3; i++) await p.locator(s).nth(i).click({ timeout: 3000 }).catch(() => {});
    await p.locator('[data-act="pull"]').first().dblclick({ timeout: 3000 }).catch(() => {});
    await p.locator('[data-act="ease"]').first().click({ delay: 900, timeout: 3000 }).catch(() => {}); // (held: it keeps going)
    await p.evaluate(() => { document.querySelectorAll('[data-act="name"]').forEach((e, i) => { if (i < 3) e.click(); }); });
    await p.evaluate(() => document.querySelector('[data-act="jmore"]')?.click());
    await p.locator('.sb-hole').nth(5).click({ timeout: 3000 }).catch(() => {});
    await p.evaluate(() => document.querySelector('[data-act="all"]')?.click());
  });
  await step('crew', async () => { await p.evaluate(() => { document.querySelector('#tpCrewRow [data-ca="hike"]')?.click(); document.querySelector('#tpForeRow [data-cf="fwd"]')?.click(); document.querySelector('#tpForeRow [data-cf="fwd"]')?.click(); }); for (const k of ['7', '8', '9', '0']) await key(k); });
  await step('who', async () => { await p.evaluate(() => document.querySelectorAll('.who [data-who]').forEach((e, i) => { if (i < 4) e.click(); })); });
  await step('pole', async () => { await key('o'); await p.waitForTimeout(300); await key('o'); });
  await step('hail', async () => { await key('h'); });
  await step('views', async () => { for (const k of ['1', '2', '3', '2']) { await key(k); await p.waitForTimeout(500); } });
  await step('map', async () => { await click('#map'); await p.waitForTimeout(1500); await p.keyboard.press('Escape'); });
  await step('course', async () => { await click('#nextCard'); await p.waitForTimeout(1500); await p.keyboard.press('Escape'); });
  await step('pause', async () => { await click('#bPause'); await p.waitForTimeout(800); await click('#bResume'); });
  await p.waitForTimeout(8000); // (racing on, at 4×)
  await p.screenshot({ path: `${out}/simguard_race.png` });
  // a cruise
  await step('to cruise', async () => { await click('#bPause'); await p.waitForTimeout(500); await click('#bSettings'); await p.waitForTimeout(800); });
  await p.goto('http://localhost:5173/?simguard'); await p.waitForTimeout(4000);
  await p.evaluate(() => document.querySelector('[data-home="cruise"]').click()); await p.waitForTimeout(1500);
  await click('#bGo'); await p.waitForTimeout(3000);
  await step('motor', async () => { await click('#bMotor'); await click('[data-mo="tilt"]'); await click('[data-mo="start"]'); await p.waitForTimeout(3000); await click('[data-mg="F"]');
    await p.evaluate(() => { const t = document.getElementById('moThrottle'); t.value = '40'; t.dispatchEvent(new Event('input')); }); await click('[data-mo="castoff"]'); await p.waitForTimeout(2000); });
  await step('pushoff', async () => { await click('#bPushOff'); await p.waitForTimeout(3000); });
  await step('halyards', async () => { await p.evaluate(() => { for (const id of ['bJib', 'bMain']) document.getElementById(id)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); }); await p.waitForTimeout(2000); });
  await step('lights/ensign', async () => { await key('5'); await click('#bEnsign'); });
  await step('pilot', async () => { await click('#bPilot'); await p.waitForTimeout(500); await click('[data-pa="10"]'); await click('[data-pa="tack"]'); await click('[data-pm="wind"]'); await key('d', 300); await click('[data-pa="off"]'); });
  await step('chart dest', async () => { await click('#map'); await p.waitForTimeout(1500); const c = await p.$('#chart canvas'); if (c) { const bb = await c.boundingBox(); await p.mouse.click(bb.x + bb.width * 0.6, bb.y + bb.height * 0.4); } await click('#bChartGo'); await p.waitForTimeout(500); });
  await step('home', async () => { await click('#bHome'); await p.waitForTimeout(500); });
  await p.waitForTimeout(5000);
  await p.screenshot({ path: `${out}/simguard_cruise.png` });
  console.log('ERRORS:', errs.join('\n---\n') || 'none'); await b.close();
  process.exit(errs.length ? 1 : 0);
})();
