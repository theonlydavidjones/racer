const { chromium } = require('playwright');
/**
 * The race replay in the dev server (npm run dev -- --port 5199): sails a whole race with boat 0 on the AI skipper, then
 * opens "Watch your race so far" and screenshots the whole course, a picked finding and the next moment.
 *   node scripts/check/race-replay.cjs <out-dir>
 */
const out = process.argv[2];
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(180000);
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://localhost:5199/'); await page.waitForTimeout(3000);
  await page.click('[data-home="race"]'); await page.waitForTimeout(500); await page.click('[data-home="create"]'); await page.waitForTimeout(1000);
  await page.click('#bGo'); await page.waitForTimeout(2500);
  // let boat 0 sail herself (the AI's skipper), so a whole race gets logged
  await page.evaluate(() => { const w = sim(); w.paused = true; const u = w.boats[0]; u.ai = structuredClone(w.boats[1].ai); u.isUser = false; });
  for (let k = 0; k < 60; k++) {
    const r = await page.evaluate(() => { const w = sim(); for (let i = 0; i < 60 * 60; i++) { w.step(1 / 60); w.paused = true; if (w.boats[0].finished) break; } return [w.t, w.boats[0].finished, w.boats[0].leg]; });
    if (r[1] || r[0] > 3600) { console.log('race', r); break; }
  }
  await page.evaluate(() => { const w = sim(); w.boats[0].isUser = true; w.boats[0].ai = null; });
  const info = await page.evaluate(() => { const w = sim(); return { n: w.track.length, moments: w.log.moments(w).map(m => [m.key, Math.round(m.t0), Math.round(m.t1), +m.lost.toFixed(1), m.text]) }; });
  console.log(JSON.stringify(info, null, 1));
  await page.evaluate(() => { document.getElementById('bPause').click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { document.getElementById('bWatch2')?.click(); });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: out + '/rr-whole.png' });
  await page.click('#raceReplay li.rrPick'); await page.waitForTimeout(2500);
  await page.screenshot({ path: out + '/rr-pick.png' });
  await page.click('[data-rr="next"]'); await page.waitForTimeout(2500);
  await page.screenshot({ path: out + '/rr-next.png' });
  console.log('ERRORS:', errs.join('\n') || 'none'); await browser.close();
})();
