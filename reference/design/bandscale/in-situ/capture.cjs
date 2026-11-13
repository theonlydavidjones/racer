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
  for (const [name, twa] of (process.env.ONLY ? [['3-run', 162]] : [['1-close-hauled', 0], ['2-beam-reach', 95], ['3-run', 162]])) {
    await page.evaluate((twa) => { const w = window.sim(), u = w.user; const a = twa || 42; u.h = (u.ww.from - a + 360) % 360; }, twa);
    // the crew trims for the new heading: wait till the boom has settled (and on the run, the pole's set), up to 3 minutes
    let last = null, still = 0;
    for (let k = 0; k < 90; k++) {
      await page.waitForTimeout(2000);
      const b = await page.evaluate(() => { const u = window.sim().user; return { boom: u.boom, pole: u.pole }; });
      still = last != null && Math.abs(b.boom - last) < 0.4 ? still + 1 : 0; last = b.boom;
      if (k >= 10 && still >= 4 && (twa < 155 || b.pole === 'set')) break;
    }
    const st = await page.evaluate(() => { const u = window.sim().user; return { tws: +u.ww.kt.toFixed(1), twa: Math.round(((u.ww.from - u.h) % 360 + 540) % 360 - 180), boom: +u.boom.toFixed(1), pole: u.pole, out: document.querySelector('.sb-rin')?.textContent }; });
    console.log(name, JSON.stringify(st));
    await page.screenshot({ path: `${out}/${name}.png` });
    if (name === '1-close-hauled') { const el = await page.$('#sailBand'); await el.screenshot({ path: `${out}/4-band-close-up.png` }); }
  }
  console.log('ERR', errs.join('\n') || 'none'); await browser.close();
})();
