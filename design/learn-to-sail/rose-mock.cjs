// The points of sail and the wind on the water: stills over the real page (dev server, ?inproc), lesson 4.
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
    // (the mock only: the water writes no depth, so the rose shows over it right up to her hull while her own hull still
    // hides it, as the build gets by drawing the rose in the water's own shader)
    window.__view.scene.traverse(o => { if (o.isMesh && o.renderOrder === 2 && !o.material.transparent) { o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox; if (b.max.x - b.min.x > 500) o.material.depthWrite = false; } });
    const tick = () => { const w = window.sim(), u = w.user; rose.update(u.x, u.y, u.ww.from, u.h, beatFor(u), window.__rose.target); requestAnimationFrame(tick); };
    tick();
  });
  const sail = (sec, course) => page.evaluate(([n, c]) => { const w = window.sim(); for (let i = 0; i < n; i++) { if (c != null) w.pilot.course = c; w.step(1 / 60); } const u = w.user; return { h: +u.h.toFixed(0), from: +u.ww.from.toFixed(0), twa: +u.twa.toFixed(0) }; }, [Math.round(sec * 60), course]);
  const shot = async (name) => { await page.waitForTimeout(1200); await page.screenshot({ path: `${out}/${name}.jpg`, quality: 85 }); };
  const from0 = await page.evaluate(() => { const w = window.sim(); w.settings.windDir = w.windModel.base; w.windModel.shifted = true; return w.windModel.base; });
  const c = (from0 + 92) % 360; // (port tack, a beam reach)
  await page.evaluate(() => window.__look(0, -0.55, 24));
  // overhead (3), a little closer in: the shift pair
  await page.keyboard.press('3'); await page.keyboard.press('+'); await page.keyboard.press('+'); await page.waitForTimeout(3000);
  console.log('before', await sail(25, c)); await shot('r1-before');
  await page.evaluate(() => { const w = window.sim(); w.settings.windDir = (w.windModel.base + 345) % 360; w.windModel.base = w.settings.windDir; w.windModel.shifted = true; });
  console.log('after', await sail(15, c)); await shot('r2-after-shift');
  // from the helm, and the chase view
  await page.keyboard.press('1'); console.log(await sail(1, c)); await shot('r3-helm');
  await page.keyboard.press('2'); console.log(await sail(1, c)); await shot('r4-chase');
  await browser.close();
})();
