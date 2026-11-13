const { chromium } = require('playwright');
const out = process.argv[2];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { const k = 'fbsim-settings-v2', s = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(s, { windKt: 12, windKind: 'west', current: 'slack', sea: 'flat', traffic: 0 }); localStorage.setItem(k, JSON.stringify(s)); } catch {} });
  const page = await ctx.newPage(); page.setDefaultTimeout(180000);
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto('http://localhost:5181/?inproc'); await page.waitForTimeout(3000);
  await page.click('[data-home="race"]'); await page.waitForTimeout(400); await page.click('[data-home="create"]'); await page.waitForTimeout(1500);
  await page.click('#bManoeuvres'); await page.waitForTimeout(3000);
  for (const [name, twa] of (process.env.ONLY ? [['3-run', 165]] : [['1-close-hauled', 0], ['2-beam-reach', 95], ['3-run', 165]])) {
    await page.evaluate((twa) => { const w = window.sim(), u = w.user; const a = twa || 42; u.h = (u.ww.from - a + 360) % 360; w.pilot.mode = 'auto'; w.pilot.course = u.h; }, twa); // (the tiller pilot holds the heading while the crew trims: nobody's steering in a script)
    // the crew trims for the new heading: 60 s of sim time (the race stepped in the page; headless frames are too slow
    // to sail it in wall time), and on a run on until the pole's set (up to 60 s more)
    for (let c = 0; c < 120; c++) { // (in 1 s chunks, so no one call runs long)
      const done = await page.evaluate((args) => { const [twa, c] = args, w = window.sim(); for (let i = 0; i < 60; i++) w.step(1 / 60); return c >= 59 && (twa <= 150 || w.user.pole === 'set'); }, [twa, c]);
      if (done) break;
    }
    await page.waitForTimeout(4000); // (a few frames drawn)
    const st = await page.evaluate(() => { const u = window.sim().user; return { t: Math.round(window.sim().t), tws: +u.ww.kt.toFixed(1), twa: Math.round(((u.ww.from - u.h) % 360 + 540) % 360 - 180), boom: +u.boom.toFixed(1), pole: u.pole, out: document.querySelector('.sb-rin')?.textContent }; });
    console.log(name, JSON.stringify(st));
    await page.screenshot({ path: `${out}/${name}.png` });
    if (name === '1-close-hauled') { const el = await page.$('#sailBand'); await el.screenshot({ path: `${out}/4-band-close-up.png` }); }
  }
  console.log('ERR', errs.join('\n') || 'none'); await browser.close();
})();
