const { chromium } = require('playwright');
const out = process.argv[2];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  for (const opt of (process.argv[3] || 'A,B,C').split(',')) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => { try { const k = 'fbsim-settings-v2', s = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(s, { windKt: 12, windKind: 'west', current: 'slack', sea: 'flat', traffic: 0 }); localStorage.setItem(k, JSON.stringify(s)); } catch {} });
    const page = await ctx.newPage(); page.setDefaultTimeout(180000);
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.goto(`http://localhost:5182/?inproc&own=${opt}`); await page.waitForTimeout(3000);
    await page.click('[data-home="race"]'); await page.waitForTimeout(400); await page.click('[data-home="create"]'); await page.waitForTimeout(1500);
    await page.click('#bManoeuvres'); await page.waitForTimeout(2500);
    await page.evaluate(() => { const w = window.sim(), u = w.user; u.h = (u.ww.from - 42 + 360) % 360; w.pilot.mode = 'auto'; w.pilot.course = u.h; });
    for (let c = 0; c < 40; c++) await page.evaluate(() => { const w = window.sim(); for (let i = 0; i < 60; i++) w.step(1 / 60); });
    const states = { none: {}, some: { mainsheet: true, jibsheet: true, vang: true }, all: Object.fromEntries(['mainsheet', 'traveller', 'jibsheet', 'vang', 'outhaul', 'cunningham', 'downhaul', 'jibCunningham', 'jibHalyard', 'backstay', 'car'].map(k => [k, true])) };
    for (const [name, hand] of Object.entries(states)) {
      await page.evaluate(([hand, all]) => { const u = window.sim().user; u.hand = { ...hand }; u.poleMine = all; }, [hand, name === 'all']);
      await page.waitForTimeout(2500);
      const bb = await (await page.$('#sailBand')).boundingBox(); await page.screenshot({ path: `${out}/${opt}-${name}.png`, clip: { x: bb.x, y: bb.y - 34, width: bb.width, height: bb.height + 34 } }); // (the tabs sit above the band's box)
      if (name === 'some') await page.screenshot({ path: `${out}/${opt}-full.png` });
    }
    console.log(opt, 'ERR', errs.join('|') || 'none'); await ctx.close();
  }
  await browser.close();
})();
