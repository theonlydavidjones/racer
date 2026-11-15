// The rose in the water's shader: stills over the real page (dev server, ?inproc), lesson 4, the near part included.
const { chromium } = require('playwright');
const out = process.argv[2], url = 'http://localhost:5197/?inproc';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 });
  page.setDefaultTimeout(180000);
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url); await page.waitForTimeout(4000);
  await page.click('[data-home="drill"]'); await page.waitForTimeout(800); await page.click('#bLessons'); await page.waitForTimeout(1000);
  await page.click('[data-lesson="points"]'); await page.waitForTimeout(3000);
  await page.keyboard.press('y'); await page.waitForTimeout(400);
  await page.evaluate(() => window.__rose({ target: 'close' }));
  const sail = (sec, course) => page.evaluate(([n, c]) => { const w = window.sim(); for (let i = 0; i < n; i++) { if (c != null) w.pilot.course = c; w.step(1 / 60); } const u = w.user; return { h: +u.h.toFixed(0), from: +u.ww.from.toFixed(0), twa: +u.twa.toFixed(0) }; }, [Math.round(sec * 60), course]);
  const shot = async (name) => { await page.waitForTimeout(1500); await page.screenshot({ path: `${out}/${name}.jpg`, quality: 85 }); };
  const from0 = await page.evaluate(() => { const w = window.sim(); w.settings.windDir = w.windModel.base; w.windModel.shifted = true; return w.windModel.base; });
  const c = (from0 + 92) % 360;
  console.log('before', await sail(25, c)); await shot('d1-chase-before');
  await page.keyboard.press('1'); await sail(1, c); await shot('d2-helm-before'); await page.keyboard.press('2');
  await page.keyboard.press('3'); await page.keyboard.press('+'); await page.keyboard.press('+'); await page.waitForTimeout(3000); await sail(1, c); await shot('d3-above-before'); await page.keyboard.press('2');
  await page.evaluate(() => { const w = window.sim(); w.settings.windDir = (w.windModel.base + 345) % 360; w.windModel.base = w.settings.windDir; w.windModel.shifted = true; });
  console.log('after', await sail(15, c)); await shot('d4-chase-after');
  await page.keyboard.press('3'); await page.waitForTimeout(2500); await sail(1, c); await shot('d5-above-after'); await page.keyboard.press('2');
  // the names only on hers and the target (the owner's other choice), and a smaller rose
  await page.evaluate(() => window.__rose({ target: 'close', labels: 'key', r0: 7, r1: 20, rm: 14 })); await sail(1, c); await shot('d6-chase-key-small');
  console.log('errors', errs);
  await browser.close();
})();
