// The tack-drill mock-up's stills, from the real page (the dev server on :5173, the race in the page's thread).
// Usage: node design/tack-drill/shoot.cjs
const pw = require('playwright'), fs = require('fs'), path = require('path');
(async () => {
  const dir = __dirname, b = await pw.chromium.launch({ args: ['--use-gl=swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }); p.setDefaultTimeout(300000);
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://localhost:5173/?inproc'); await p.waitForTimeout(5000);
  await p.click('[data-home="drill"]'); await p.waitForTimeout(3000);
  await p.click('#bManoeuvres'); await p.waitForTimeout(9000);
  await p.mouse.move(5, 5);
  await p.screenshot({ path: path.join(dir, '0-today.png') });
  await p.evaluate(src => (0, eval)(src), fs.readFileSync(path.join(dir, 'mock.js'), 'utf8'));
  // 1: the approach: hold your lane, build speed; the turn point ahead
  await p.evaluate(() => { const w = sim(); w.paused = true; });
  await p.evaluate(() => __mock.approach('Build speed', '', 'Tack 3 of 10', 45)); await p.waitForTimeout(2500);
  await p.screenshot({ path: path.join(dir, '1-approach.png') });
  // 2: at the turn point
  await p.evaluate(() => __mock.cue('Tack now', 'go', 'Tack 3 of 10')); await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(dir, '2-tack-now.png') });
  // 3: after the rep: her track against the ideal turn, the score by the boat (a sample within the good crew's range)
  await p.keyboard.press('3'); await p.waitForTimeout(3000); // (overhead: her turn against the ideal one reads from above)
  await p.keyboard.down('='); await p.waitForTimeout(1500); await p.keyboard.up('='); await p.waitForTimeout(1500);
  await p.evaluate(() => __mock.score({ title: 'Tack 3', lost: 9, good: 6, turn: 5.8, min: 62, back: 11, tip: 'Turned too slowly through the wind: push the tiller further, sooner' })); await p.waitForTimeout(2500);
  await p.screenshot({ path: path.join(dir, '3-after-rep.png') });
  await p.keyboard.press('2'); await p.waitForTimeout(2000);
  // 4: the set done: every rep, the best
  await p.evaluate(() => __mock.best([12, 10, 9, 7, 8, 6, 7, 5, 6, 6], 6)); await p.waitForTimeout(1500);
  await p.screenshot({ path: path.join(dir, '4-best-of.png') });
  console.log('errors:', errs.join(' | ') || 'none'); await b.close();
})();
