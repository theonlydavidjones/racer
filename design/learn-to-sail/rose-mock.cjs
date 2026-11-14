// The points-of-sail rose on the water: stills over the real page (dev server, ?inproc), with a wind-shift pair.
const { chromium } = require('playwright');
const out = process.argv[2], url = 'http://localhost:5197/?inproc';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(180000);
  await page.goto(url); await page.waitForTimeout(4000);
  await page.click('[data-home="drill"]'); await page.waitForTimeout(800); await page.click('#bLessons'); await page.waitForTimeout(1000);
  await page.click('[data-lesson="points"]'); await page.waitForTimeout(3000);
  await page.keyboard.press('y'); await page.waitForTimeout(400);
  await page.evaluate(async () => {
    const { WindRose } = await import('/src/render/windRose.ts'), { beatFor } = await import('/src/boat/seaway.ts');
    const rose = new WindRose(window.__view.scene); window.__rose = { target: 'close' };
    const tick = () => { const w = window.sim(), u = w.user; rose.update(u.x, u.y, u.ww.from, u.h, beatFor(u), window.__rose.target); requestAnimationFrame(tick); };
    tick();
  });
  const sail = (sec, course) => page.evaluate(([n, c]) => { const w = window.sim(); for (let i = 0; i < n; i++) { if (c != null) w.pilot.course = c; w.step(1 / 60); } const u = w.user; return { h: u.h, from: u.ww.from, twa: u.twa }; }, [Math.round(sec * 60), course]);
  const from0 = await page.evaluate(() => window.sim().windModel.base);
  // she on port, a beam reach
  const c = (from0 + 95) % 360;
  await page.evaluate(() => window.__look(0, -0.5, 24)); await page.waitForTimeout(800);
  let s = await sail(20, c); console.log('before', s);
  await page.waitForTimeout(800); await page.screenshot({ path: out + '/1-rose-beam.jpg', quality: 85 });
  // a 20° shift (the wind backs), she holds her compass course: the sectors swing, she's now on a different point
  await page.evaluate(() => { const w = window.sim(); w.settings.windDir = (w.windModel.base + 340) % 360; w.windModel.base = w.settings.windDir; });
  s = await sail(12, c); console.log('after', s);
  await page.waitForTimeout(800); await page.screenshot({ path: out + '/2-rose-shift.jpg', quality: 85 });
  // from above and behind, the whole rose

  await browser.close();
})();
