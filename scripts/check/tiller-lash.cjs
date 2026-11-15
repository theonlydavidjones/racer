#!/usr/bin/env node
/**
 * Lashing the tiller at small angles, with the real mouse: the owner (15 Nov 2026), "tiller lashing is glitching when I
 * try to lash it less than 13ish degrees off centerline. it just lashes it amidships." For 5°, 10° and 15° of rudder
 * each way, by right-click and by double-click, in the default worker mode and with ?inproc: take the tiller at that
 * angle (a click where the cursor puts it there), lash it, wait, and read where the lashing holds it. Needs the dev
 * server on :5173. Exits 1 if any lashing is more than 1.5° off.
 *
 *   node scripts/check/tiller-lash.cjs
 */
const { chromium } = require('playwright');
const W = 1400, H = 860, SPAN = 0.35, FULL = 30; // (app.ts TILLER_SPAN; balance.ts FULL_RUDDER, deg)
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const rows = [], errs = [];
  for (const mode of ['', '?inproc']) {
    const p = await b.newPage({ viewport: { width: W, height: H } }); p.on('pageerror', e => errs.push(`${mode}: ${e.message}`));
    await p.addInitScript(() => { const o = JSON.parse(localStorage.getItem('fbsim-settings-v2') || '{}'); Object.assign(o, { mode: 'race', seq: 3 }); localStorage.setItem('fbsim-settings-v2', JSON.stringify(o)); });
    await p.goto('http://localhost:5173/' + mode); await p.waitForTimeout(6000);
    const ck = q => p.evaluate(s => document.querySelector(s).click(), q);
    await ck('[data-home="race"]'); await p.waitForTimeout(800); await ck('[data-home="create"]'); await p.waitForTimeout(3000); await ck('#bGo');
    await p.waitForFunction(() => sim().running && !sim().paused, null, { timeout: 60000 }); await p.waitForTimeout(2000);
    const y = H * 0.45; // (over the water, clear of the panels)
    const lashed = () => p.evaluate(() => sim().user.lashed);
    for (const how of ['right-click', 'double-click']) for (const deg of [5, 10, 15, -5, -10, -15]) {
      // start clear: no lashing, the tiller let go (a click takes it and the lashing comes off; another lets it go; not
      // Esc, which pauses when the tiller isn't held)
      if (await lashed() != null) { await p.mouse.click(W / 2, y); await p.waitForTimeout(300); }
      if (await p.evaluate(() => document.body.classList.contains('tiller-held'))) { await p.mouse.click(W / 2, y); await p.waitForTimeout(300); }
      const x = W / 2 + (deg / FULL) * W * SPAN;
      await p.mouse.click(x, y); await p.waitForTimeout(400); // (takes the tiller there, and holds it)
      if (how === 'right-click') await p.mouse.click(x, y, { button: 'right' });
      else await p.mouse.dblclick(x, y);
      // (in worker mode a command goes out with the page's next frame, and headless frames here take a second or more:
      // wait for the lashing to show, then a moment more, then read where it holds)
      await p.waitForFunction(() => sim().user.lashed != null, null, { timeout: 10000 }).catch(() => {}); await p.waitForTimeout(1500);
      const l = await lashed(), got = l == null ? null : l * FULL, ok = got != null && Math.abs(got - deg) <= 1.5;
      const why = ok ? '' : JSON.stringify(await p.evaluate(() => ({ running: sim().running, paused: sim().paused, held: document.body.classList.contains('tiller-held'), tiller: +sim().user.tiller.toFixed(3) })));
      rows.push({ mode: mode || 'worker', how, deg, got: got == null ? 'not lashed' : +got.toFixed(1), ok, why });
    }
    await p.close();
  }
  for (const r of rows) console.log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.mode.padEnd(8)} ${r.how.padEnd(12)} ${String(r.deg).padStart(3)}° → ${r.got}${typeof r.got === 'number' ? '°' : ''} ${r.why}`);
  console.log('ERRORS:', errs.join('; ') || 'none'); await b.close();
  process.exit(rows.every(r => r.ok) && !errs.length ? 0 : 1);
})();
